// Verifies plan-page visibility rules end-to-end:
//   - platform user            -> entitlements (their own plan), org-sub endpoint = 403 (no perm)
//   - institution MEMBER       -> org-sub endpoint = 403 (no subscription:read) => UI shows text-only card
//   - institution ADMIN        -> org-sub endpoint = 200 with their org's chosen plan + seats
//   - super admin (no org)     -> org-sub endpoint = 200 null
// Run:  node scripts/plan-visibility-check.cjs
const BASE = 'http://localhost:4000/api/v1';
const SUPER = { email: 'admin@pharmacy-mcq.local', password: 'ChangeMe_Admin1' };
const stamp = Date.now().toString(36);

async function api(method, p, body, token) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}
const login = async (c) => (await api('POST', '/auth/login', c)).data.accessToken;

let pass = 0, fail = 0;
const ok = (m) => { console.log('PASS: ' + m); pass++; };
const bad = (m) => { console.log('FAIL: ' + m); fail++; };

async function main() {
  const superTok = await login(SUPER);
  console.log('=== plan visibility check ===');

  // 1) Set up an institution with an institutional (seat) plan.
  const org = (await api('POST', '/admin/organizations',
    { name: `Viz Institute ${stamp}`, slug: `viz-inst-${stamp}` }, superTok)).data;
  const roles = (await api('GET', '/admin/roles', undefined, superTok)).data;
  const adminRoleId = roles.find((r) => r.name === 'Admin')?.id;
  const studentRoleId = roles.find((r) => r.name === 'Student')?.id;

  const plan = (await api('POST', '/commerce/plans',
    { code: `INST-${stamp.toUpperCase()}`, name: `Institute Plan ${stamp}`, seatLimit: 25 }, superTok)).data;
  const prov = await api('POST', `/admin/organizations/${org.id}/subscription`, { planId: plan.id }, superTok);
  if (prov.status === 201 && prov.data?.planId === plan.id) ok(`provisioned plan to org (seats ${prov.data.seatsUsed}/${prov.data.seatLimit})`);
  else return bad(`provision failed: ${prov.status} ${JSON.stringify(prov.data)}`);

  // 2) Create an org ADMIN and an org MEMBER inside the institution.
  const adminEmail = `viz-admin-${stamp}@inst.local`;
  const memberEmail = `viz-member-${stamp}@inst.local`;
  const pwd = 'Demo@12345';
  const a = await api('POST', '/admin/users',
    { name: 'Viz Admin', email: adminEmail, password: pwd, roleId: adminRoleId, organizationId: org.id }, superTok);
  const m = await api('POST', '/admin/users',
    { name: 'Viz Member', email: memberEmail, password: pwd, roleId: studentRoleId, organizationId: org.id }, superTok);
  if (a.status === 201 && m.status === 201) ok('created org admin + org member');
  else return bad(`user create failed: admin ${a.status}, member ${m.status}`);

  const ent = (tok) => api('GET', '/commerce/me/entitlements', undefined, tok);

  // 3) Org ADMIN: institution-managed + sees their institution's chosen plan.
  const adminTok = await login({ email: adminEmail, password: pwd });
  const adminEnt = (await ent(adminTok)).data;
  if (adminEnt?.institutionManaged === true && adminEnt.institutionName === org.name)
    ok(`org admin entitlements: institutionManaged=true, name="${adminEnt.institutionName}"`);
  else bad(`org admin entitlements wrong: ${JSON.stringify(adminEnt)}`);
  const adminView = await api('GET', '/commerce/me/organization/subscription', undefined, adminTok);
  if (adminView.status === 200 && adminView.data?.planId === plan.id) {
    ok(`org admin sees chosen plan "${adminView.data.planName}" (seats ${adminView.data.seatsUsed}/${adminView.data.seatLimit})`);
    if (adminView.data.seatsUsed === 2) ok('seat usage reflects the 2 members'); else bad(`seatsUsed=${adminView.data.seatsUsed}, expected 2`);
  } else bad(`org admin view: ${adminView.status} ${JSON.stringify(adminView.data)}`);

  // 4) Org MEMBER: institution-managed (=> text-only card) but blocked from org-sub endpoint.
  const memberTok = await login({ email: memberEmail, password: pwd });
  const memberEnt = (await ent(memberTok)).data;
  const memberMe = (await api('GET', '/auth/me', undefined, memberTok)).data;
  if (memberEnt?.institutionManaged === true && !memberMe.permissions.includes('subscription:read'))
    ok('member = institutionManaged + no subscription:read (=> text-only card)');
  else bad(`member wrong: institutionManaged=${memberEnt?.institutionManaged}, sub:read=${memberMe?.permissions?.includes('subscription:read')}`);
  const memberView = await api('GET', '/commerce/me/organization/subscription', undefined, memberTok);
  if (memberView.status === 403) ok('org member blocked from org-sub endpoint (403)');
  else bad(`org member expected 403, got ${memberView.status}`);

  // 5) Default-org demo student: NOT institution-managed (default org has no seat plan) => normal plans page.
  const stuTok = await login({ email: 'student@demo.local', password: pwd });
  const stuEnt = (await ent(stuTok)).data;
  if (stuEnt?.institutionManaged === false)
    ok('default-org student is NOT institution-managed (sees normal plans page)');
  else bad(`default-org student should be institutionManaged=false, got ${JSON.stringify(stuEnt)}`);

  // 6) Super admin (no org) -> entitlements not institutional, org-sub 200 null.
  const superEnt = (await ent(superTok)).data;
  if (superEnt?.institutionManaged === false) ok('super admin not institution-managed');
  else bad(`super admin institutionManaged should be false, got ${JSON.stringify(superEnt)}`);
  const superOrg = await api('GET', '/commerce/me/organization/subscription', undefined, superTok);
  if (superOrg.status === 200 && superOrg.data === null) ok('super admin (no org) -> 200 null');
  else bad(`super admin org-sub expected 200 null, got ${superOrg.status} ${JSON.stringify(superOrg.data)}`);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
