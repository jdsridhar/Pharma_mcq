// QA harness — provision a throwaway INSTITUTION (organization) tenant for tenant/seat tests.
// As the platform super admin it:
//   (a) creates an organization                       POST /admin/organizations {name,slug}
//   (b) creates a seat-based institutional plan        POST /commerce/plans {code,name,seatLimit:25}
//   (c) provisions that plan to the org                POST /admin/organizations/:id/subscription {planId}
//   (d) creates an org Admin user and an org member    POST /admin/users {name,email,password,roleId,organizationId}
//       (member = Student role) using role ids from     GET  /admin/roles
//
// Everything is STAMPED with a timestamp (qa-<ts>-...) so cleanup can find it. It never touches
// seed/demo data. Prints  {orgId, adminEmail, memberEmail, password}  as JSON to stdout (last line).
//
// Run:  node scripts/qa/setup-institution.cjs
const BASE = 'http://localhost:4000/api/v1';
const SUPER = { email: 'admin@pharmacy-mcq.local', password: 'ChangeMe_Admin1' };
// Demo@12345 satisfies the password policy (>=10 chars, lower+upper+digit).
const USER_PASSWORD = 'Demo@12345';

async function api(method, p, body, token) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}
const login = async (c) => (await api('POST', '/auth/login', c)).data?.accessToken;

function die(msg, extra) {
  console.error(`[setup-institution] FAIL: ${msg}${extra ? ' — ' + JSON.stringify(extra) : ''}`);
  process.exit(1);
}

async function main() {
  const ts = Date.now();
  const stamp = `qa-${ts}`;

  const token = await login(SUPER);
  if (!token) die('could not authenticate as super admin');

  // Resolve role ids (Admin + Student) from the live roles list.
  const rolesRes = await api('GET', '/admin/roles', undefined, token);
  if (rolesRes.status !== 200 || !Array.isArray(rolesRes.data)) die('GET /admin/roles failed', rolesRes);
  const adminRoleId = rolesRes.data.find((r) => r.name === 'Admin')?.id;
  const studentRoleId = rolesRes.data.find((r) => r.name === 'Student')?.id;
  if (!adminRoleId || !studentRoleId) die('Admin/Student role id not found', { adminRoleId, studentRoleId });

  // (a) Create the organization (institution). Slug: lowercase/digits/hyphen, 2–64.
  const slug = `${stamp}-inst`;
  const orgRes = await api('POST', '/admin/organizations', { name: `QA Institution ${ts}`, slug }, token);
  if (orgRes.status >= 300 || !orgRes.data?.id) die('POST /admin/organizations failed', orgRes);
  const orgId = orgRes.data.id;

  // (b) Create a seat-based institutional plan (code: A–Z0–9._-, uppercase, 2–64).
  const planCode = `QA_INST_${ts}`;
  const planRes = await api(
    'POST',
    '/commerce/plans',
    { code: planCode, name: `QA Institution Plan ${ts}`, seatLimit: 25 },
    token,
  );
  if (planRes.status >= 300 || !planRes.data?.id) die('POST /commerce/plans failed', planRes);
  const planId = planRes.data.id;

  // (c) Provision the plan to the organization.
  const subRes = await api('POST', `/admin/organizations/${orgId}/subscription`, { planId }, token);
  if (subRes.status >= 300) die('POST /admin/organizations/:id/subscription failed', subRes);

  // (d) Create the org Admin and the org member (Student), both scoped to the org.
  const adminEmail = `${stamp}-instadmin@qa.local`;
  const memberEmail = `${stamp}-instmember@qa.local`;

  const adminUserRes = await api(
    'POST',
    '/admin/users',
    { name: `QA Inst Admin ${ts}`, email: adminEmail, password: USER_PASSWORD, roleId: adminRoleId, organizationId: orgId },
    token,
  );
  if (adminUserRes.status >= 300 || !adminUserRes.data?.id) die('POST /admin/users (admin) failed', adminUserRes);

  const memberUserRes = await api(
    'POST',
    '/admin/users',
    { name: `QA Inst Member ${ts}`, email: memberEmail, password: USER_PASSWORD, roleId: studentRoleId, organizationId: orgId },
    token,
  );
  if (memberUserRes.status >= 300 || !memberUserRes.data?.id) die('POST /admin/users (member) failed', memberUserRes);

  // Final line of stdout is the JSON contract the orchestrator consumes.
  console.log(JSON.stringify({ orgId, adminEmail, memberEmail, password: USER_PASSWORD }));
}
main().catch((e) => { console.error('[setup-institution] ERROR', e); process.exit(1); });
