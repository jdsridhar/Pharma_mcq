// Verifies the "hide higher tiers" rule for the Users admin page, end-to-end.
//   - A non-super Admin never SEES Super Admin accounts in the list (nor via GET by id).
//   - A non-super Admin cannot SUSPEND a Super Admin (404 — hidden) or GRANT a role above
//     their own rank (403). Both are blocked BEFORE any write, so this script mutates nothing.
//   - A Super Admin still sees everyone, including other Super Admins.
// Run:  node scripts/admin-tier-visibility-check.cjs
const BASE = 'http://localhost:4000/api/v1';
const SUPER = { email: 'admin@pharmacy-mcq.local', password: 'ChangeMe_Admin1' };
const ADMIN = { email: 'admin@demo.local', password: 'Demo@12345' };

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
  console.log('=== admin tier-visibility check ===');
  const superTok = await login(SUPER);
  const adminTok = await login(ADMIN);

  // Enumerate as super admin (sees all orgs) to find a Super Admin target + the Super Admin role.
  const all = (await api('GET', '/admin/users?page=1&pageSize=100', undefined, superTok)).data.items;
  const superUser = all.find((u) => u.roles.includes('Super Admin'));
  const roles = (await api('GET', '/admin/roles', undefined, superTok)).data;
  const superRoleId = roles.find((r) => r.name === 'Super Admin')?.id;

  // The at/below target MUST come from the admin's OWN visible list (same org + at/below rank);
  // a Student in another org would 404 on org-scoping and confound the tier checks.
  const adminList = (await api('GET', '/admin/users?page=1&pageSize=100', undefined, adminTok)).data.items;
  const belowUser = adminList.find((u) => u.id !== superUser?.id);

  if (superUser && belowUser && superRoleId) ok('fixtures resolved (a Super Admin user, an at/below user in the admin org, the Super Admin role)');
  else return bad(`fixtures missing: superUser=${!!superUser} belowUser=${!!belowUser} superRoleId=${!!superRoleId}`);

  // 1) Super admin still sees Super Admins.
  if (all.some((u) => u.roles.includes('Super Admin'))) ok('super admin list includes Super Admin accounts');
  else bad('super admin list is missing Super Admin accounts');

  // 2) Non-super Admin list excludes every Super Admin.
  const leaked = adminList.filter((u) => u.roles.includes('Super Admin'));
  if (adminList.length > 0 && leaked.length === 0)
    ok(`admin list has ${adminList.length} users, 0 Super Admins (hidden)`);
  else bad(`admin list leaked ${leaked.length} Super Admin(s): ${leaked.map((u) => u.email).join(', ')}`);

  // 3) Admin CAN see an at-or-below user in their org by id.
  const seeBelow = await api('GET', `/admin/users/${belowUser.id}`, undefined, adminTok);
  if (seeBelow.status === 200) ok(`admin can view an at/below user (${belowUser.roles.join('/')}) by id`);
  else bad(`admin GET at/below user expected 200, got ${seeBelow.status}`);

  // 4) Admin CANNOT see a Super Admin by id (404 — hidden, not 403).
  const seeSuper = await api('GET', `/admin/users/${superUser.id}`, undefined, adminTok);
  if (seeSuper.status === 404) ok('admin GET Super Admin by id -> 404 (hidden)');
  else bad(`admin GET Super Admin expected 404, got ${seeSuper.status}`);

  // 5) Admin CANNOT suspend a Super Admin (404 — blocked before any write).
  const suspend = await api('PATCH', `/admin/users/${superUser.id}/status`, { status: 'SUSPENDED' }, adminTok);
  if (suspend.status === 404) ok('admin cannot suspend a Super Admin -> 404 (no mutation)');
  else bad(`admin suspend Super Admin expected 404, got ${suspend.status} ${JSON.stringify(suspend.data)}`);

  // 6) Admin CANNOT grant the Super Admin role to an at/below user (403 — escalation blocked).
  const grant = await api('POST', `/admin/users/${belowUser.id}/roles`, { roleId: superRoleId }, adminTok);
  if (grant.status === 403) ok('admin cannot grant Super Admin role -> 403 (no escalation)');
  else bad(`admin grant Super Admin role expected 403, got ${grant.status} ${JSON.stringify(grant.data)}`);

  // 7) Confirm no accidental mutation: the Super Admin is still ACTIVE.
  const stillActive = (await api('GET', `/admin/users/${superUser.id}`, undefined, superTok)).data;
  if (stillActive.status === 'ACTIVE') ok('Super Admin account untouched (still ACTIVE)');
  else bad(`Super Admin status changed to ${stillActive.status} — unexpected mutation!`);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
