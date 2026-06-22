// Verifies a STUDENT can start practice randomly and with each filter. Run from repo root:
//   node scripts/practice-filters-check.cjs
const BASE = 'http://localhost:4000/api/v1';
let token;
async function api(method, p, body) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { status: res.status, data };
}
function flatten(nodes, out = []) { for (const n of nodes) { out.push(n); if (n.children?.length) flatten(n.children, out); } return out; }

let pass = 0, fail = 0;
const ok = (m) => { console.log('PASS: ' + m); pass++; };
const bad = (m) => { console.log('FAIL: ' + m); fail++; };

async function start(label, body, expectQuestions = true) {
  const r = await api('POST', '/practice/sessions', body);
  if (expectQuestions) {
    if (r.status === 201 && (r.data?.questions?.length ?? 0) > 0) ok(`${label} -> ${r.data.questions.length} questions`);
    else bad(`${label} -> status ${r.status}, ${r.data?.questions?.length ?? 0} questions (${r.data?.error?.message ?? ''})`);
  } else {
    if (r.status === 400) ok(`${label} -> 400 (clean, no match)`);
    else bad(`${label} -> expected 400, got ${r.status}`);
  }
}

async function main() {
  token = (await api('POST', '/auth/login', { email: 'student@demo.local', password: 'Demo@12345' })).data.accessToken;
  console.log('=== practice filters check (student) ===');

  const exams = (await api('GET', '/exams?pageSize=100')).data.items;
  const examId = exams.find((e) => e.code === 'GPAT')?.id;
  const nodes = (await api('GET', '/knowledge/nodes?pageSize=100')).data.items;
  const topicId = nodes.find((n) => n.code === 'PHARMACOLOGY')?.id;
  const curricula = (await api('GET', '/curriculums?pageSize=100')).data.items;
  const cur = curricula.find((c) => c.code === 'BPHARM-SYL');
  const curNodes = flatten((await api('GET', `/curriculums/${cur.id}/tree`)).data);
  const curNodeId = curNodes.find((n) => n.name === 'Pharmacology')?.id;
  const tracks = (await api('GET', '/tracks?pageSize=100')).data.items;
  const trk = tracks.find((t) => t.code === 'GPAT-PREP');
  const mods = (await api('GET', `/tracks/${trk.id}`)).data.modules;
  const modId = mods.find((m) => m.name === 'Pharmacology')?.id;

  await start('random (no filters)', { count: 5 });
  await start('exam = GPAT', { count: 5, examProfileId: examId });
  await start('topic = Pharmacology', { count: 5, knowledgeNodeIds: [topicId] });
  await start('curriculum node = Pharmacology', { count: 5, curriculumNodeId: curNodeId });
  await start('track module = Pharmacology', { count: 5, trackModuleId: modId });
  await start('difficulty = EASY', { count: 5, difficulty: 'EASY' });
  await start('exam + difficulty', { count: 5, examProfileId: examId, difficulty: 'MEDIUM' });
  await start('no-match filter', { count: 5, knowledgeNodeIds: ['00000000-0000-0000-0000-0000000000aa'] }, false);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
