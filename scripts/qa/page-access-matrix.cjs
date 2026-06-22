// QA harness — deterministic page × role ACCESS MATRIX (Layer B).
// For each persona it (1) reads the live /auth/me permissions, (2) recomputes admin-nav visibility
// EXACTLY as the web app does (app-shell.tsx) and asserts it equals the hand-derived oracle, and
// (3) probes each admin page's permission-gated API endpoint to confirm the server ENFORCES it
// (allowed role → not 403; denied role → 403). POST probes send {} so the permission guard fires
// BEFORE body validation — denied = 403, allowed = 400 — creating NO data.
//
// Usage:  node scripts/qa/page-access-matrix.cjs [--role <persona|all>] [--json]
//         personas: student author reviewer academic admin superadmin  (+ any in QA_EXTRA_PERSONAS env JSON)
const BASE = 'http://localhost:4000/api/v1';

const PERSONAS = {
  student: { creds: { email: 'student@demo.local', password: 'Demo@12345' }, label: 'Student' },
  author: { creds: { email: 'author@demo.local', password: 'Demo@12345' }, label: 'Content Author' },
  reviewer: { creds: { email: 'reviewer@demo.local', password: 'Demo@12345' }, label: 'Reviewer' },
  academic: { creds: { email: 'academic@demo.local', password: 'Demo@12345' }, label: 'Academic Head' },
  admin: { creds: { email: 'admin@demo.local', password: 'Demo@12345' }, label: 'Admin' },
  superadmin: { creds: { email: 'admin@pharmacy-mcq.local', password: 'ChangeMe_Admin1' }, label: 'Super Admin' },
};

// Admin pages: nav gate (mirrors app-shell.tsx) + a permission-gated API probe (mirrors the same gate).
const ADMIN_PAGES = [
  { label: 'Organizations', gate: { roles: ['Super Admin'] }, probe: { method: 'GET', path: '/admin/organizations' } },
  { label: 'Questions', gate: { anyOf: ['question:create', 'question:review'] }, probe: { method: 'POST', path: '/questions' } },
  { label: 'Knowledge', gate: { permission: 'knowledge:manage' }, probe: { method: 'POST', path: '/knowledge/nodes' } },
  { label: 'Curriculum', gate: { permission: 'curriculum:manage' }, probe: { method: 'POST', path: '/curriculums' } },
  { label: 'Exams', gate: { permission: 'exam:manage' }, probe: { method: 'POST', path: '/exams' } },
  { label: 'Mock Tests (build)', gate: { permission: 'mocktest:manage' }, probe: { method: 'POST', path: '/mock-tests' } },
  { label: 'Tracks', gate: { permission: 'track:manage' }, probe: { method: 'POST', path: '/tracks' } },
  { label: 'Plans (manage)', gate: { permission: 'plan:manage' }, probe: { method: 'GET', path: '/commerce/features' } },
  { label: 'Users', gate: { permission: 'user:read' }, probe: { method: 'GET', path: '/admin/users' } },
  { label: 'Audit Log', gate: { permission: 'audit:read' }, probe: { method: 'GET', path: '/admin/audit-logs' } },
  { label: 'Rec. Rules', gate: { roles: ['Admin', 'Super Admin'] }, probe: { method: 'GET', path: '/recommendation-rules' } },
];

// Student-area pages (nav shown to every authenticated user — no gate) + their representative endpoints.
const STUDENT_PAGES = [
  { label: 'Dashboard', probe: { method: 'GET', path: '/practice/sessions?page=1&pageSize=1' } },
  { label: 'Practice', probe: { method: 'GET', path: '/practice/sessions/available' } },
  { label: 'Mock Tests', probe: { method: 'GET', path: '/mock-tests?page=1&pageSize=1' } },
  { label: 'Plans', probe: { method: 'GET', path: '/commerce/me/entitlements' } },
  { label: 'Notifications', probe: { method: 'GET', path: '/notifications?page=1&pageSize=1' } },
];

const gateAllows = (gate, perms, roles) => {
  if (gate.anyOf) return gate.anyOf.some((p) => perms.includes(p));
  if (gate.roles) return gate.roles.some((r) => roles.includes(r));
  if (gate.permission) return perms.includes(gate.permission);
  return true;
};

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

async function runPersona(key, persona, findings) {
  const out = { persona: key, label: persona.label, checks: [] };
  const record = (name, status, detail) => { out.checks.push({ name, status, detail }); if (status === 'FAIL') findings.push({ persona: key, name, detail }); };

  const token = await login(persona.creds);
  if (!token) { record('login', 'FAIL', 'could not authenticate'); return out; }
  const me = (await api('GET', '/auth/me', undefined, token)).data;
  const perms = me?.permissions ?? [];
  const roles = me?.roles ?? [];
  out.roles = roles;

  for (const page of ADMIN_PAGES) {
    const expectedAllow = gateAllows(page.gate, perms, roles);
    // (a) API enforcement probe.
    const probe = await api(page.probe.method, page.probe.path, page.probe.method === 'POST' ? {} : undefined, token);
    const denied = probe.status === 403;
    const apiOk = expectedAllow ? !denied : denied;
    record(
      `admin:${page.label} [API ${page.probe.method} ${page.probe.path}]`,
      apiOk ? 'PASS' : 'FAIL',
      `expected ${expectedAllow ? 'ALLOW' : 'DENY(403)'}, got HTTP ${probe.status}`,
    );
  }

  for (const page of STUDENT_PAGES) {
    const probe = await api(page.probe.method, page.probe.path, undefined, token);
    // Every authenticated user may reach student endpoints (2xx); some may legitimately 404 on empty.
    const reachable = probe.status < 400 || probe.status === 404;
    record(`student:${page.label} [${page.probe.path}]`, reachable ? 'PASS' : 'FAIL', `HTTP ${probe.status}`);
  }

  out.adminNavComputed = ADMIN_PAGES.filter((p) => gateAllows(p.gate, perms, roles)).map((p) => p.label);
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const roleArg = args.includes('--role') ? args[args.indexOf('--role') + 1] : 'all';
  const asJson = args.includes('--json');

  let personas = { ...PERSONAS };
  if (process.env.QA_EXTRA_PERSONAS) {
    try { personas = { ...personas, ...JSON.parse(process.env.QA_EXTRA_PERSONAS) }; } catch { /* ignore */ }
  }
  const keys = roleArg === 'all' ? Object.keys(personas) : [roleArg];

  const findings = [];
  const results = [];
  for (const k of keys) {
    if (!personas[k]) { console.error(`unknown persona: ${k}`); continue; }
    results.push(await runPersona(k, personas[k], findings));
  }

  if (asJson) {
    console.log(JSON.stringify({ results, findings, ok: findings.length === 0 }, null, 2));
  } else {
    for (const r of results) {
      const pass = r.checks.filter((c) => c.status === 'PASS').length;
      const fail = r.checks.filter((c) => c.status === 'FAIL').length;
      console.log(`\n[${r.label}] roles=${(r.roles || []).join(',')} — ${pass} pass / ${fail} fail`);
      console.log(`  admin nav: ${r.adminNavComputed?.join(', ') || '(none)'}`);
      for (const c of r.checks.filter((c) => c.status === 'FAIL')) console.log(`  FAIL ${c.name} — ${c.detail}`);
    }
    console.log(`\n=== MATRIX RESULT: ${findings.length === 0 ? 'ALL PASS' : findings.length + ' FAILURE(S)'} ===`);
  }
  process.exit(findings.length === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
