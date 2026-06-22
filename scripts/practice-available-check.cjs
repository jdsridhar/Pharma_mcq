// Verifies the practice "available count" endpoint drives the count field correctly.
//   node scripts/practice-available-check.cjs
const BASE = 'http://localhost:4000/api/v1';
let token;
async function api(method, p, body) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}
function flatten(nodes, out = []) { for (const n of nodes) { out.push(n); if (n.children?.length) flatten(n.children, out); } return out; }

let pass = 0, fail = 0;
const ok = (m) => { console.log('PASS: ' + m); pass++; };
const bad = (m) => { console.log('FAIL: ' + m); fail++; };

async function avail(label, q, expect) {
  const r = await api('GET', `/practice/sessions/available${q}`);
  if (r.status !== 200) return bad(`${label} -> status ${r.status} (${r.data?.error?.message ?? ''})`);
  const { available, max } = r.data;
  if (typeof available !== 'number' || typeof max !== 'number') return bad(`${label} -> bad shape ${JSON.stringify(r.data)}`);
  if (expect && !expect(available, max)) return bad(`${label} -> available=${available}, max=${max} (failed expectation)`);
  ok(`${label} -> available=${available}, max=${max}`);
  return r.data;
}

async function main() {
  token = (await api('POST', '/auth/login', { email: 'student@demo.local', password: 'Demo@12345' })).data.accessToken;
  console.log('=== practice available-count check (student) ===');

  const exams = (await api('GET', '/exams?pageSize=100')).data.items;
  const examId = exams.find((e) => e.code === 'GPAT')?.id;
  const nodes = (await api('GET', '/knowledge/nodes?pageSize=100')).data.items;
  const topicId = nodes.find((n) => n.code === 'PHARMACOLOGY')?.id;

  const all = await avail('no filters (whole pool)', '', (a, m) => a > 0 && m >= a);
  const byExam = await avail('exam = GPAT', `?examProfileId=${examId}`, (a) => a > 0);
  const byTopic = await avail('topic = Pharmacology', `?knowledgeNodeId=${topicId}`, (a) => a > 0);
  await avail('exam + difficulty', `?examProfileId=${examId}&difficulty=EASY`, (a) => a >= 0);
  await avail('no-match topic', '?knowledgeNodeId=00000000-0000-0000-0000-0000000000aa', (a) => a === 0);

  if (all && byExam && all.available >= byExam.available) ok('filter narrows the pool (exam <= all)');
  else bad('filter did not narrow the pool');
  if (all && byTopic && all.available >= byTopic.available) ok('filter narrows the pool (topic <= all)');
  else bad('topic filter did not narrow the pool');

  // Starting a session with count = available should succeed and return exactly that many (capped).
  if (all) {
    const want = Math.min(all.available, all.max);
    const s = await api('POST', '/practice/sessions', { count: want });
    if (s.status === 201 && s.data?.questions?.length === want) ok(`start count=${want} -> ${s.data.questions.length} questions`);
    else bad(`start count=${want} -> status ${s.status}, ${s.data?.questions?.length ?? 0} questions`);
  }

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
