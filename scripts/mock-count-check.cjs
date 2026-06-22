// Verifies FIXED mock tests derive their question count from the attached set (not a free-typed
// number), and can't be published empty; and that BLUEPRINT mocks reject a hand-picked list.
// Run:  node scripts/mock-count-check.cjs
const BASE = 'http://localhost:4000/api/v1';
const SUPER = { email: 'admin@pharmacy-mcq.local', password: 'ChangeMe_Admin1' };
const stamp = Date.now().toString(36);
const up = stamp.toUpperCase();

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
  const tok = await login(SUPER);
  console.log('=== mock-test count check ===');

  const pub = (await api('GET', '/questions?status=PUBLISHED&pageSize=5', undefined, tok)).data.items;
  if (pub.length >= 2) ok(`found ${pub.length} published questions to attach`);
  else return bad('need ≥2 published questions to run this check');
  const qids = pub.slice(0, 2).map((q) => q.id);

  // 1) Create a FIXED mock WITHOUT a count → starts as an empty shell (0).
  const mt = (await api('POST', '/mock-tests', { code: `MTX-${up}`, title: `MT ${stamp}`, durationMinutes: 30 }, tok)).data;
  if (mt.totalQuestions === 0) ok('new FIXED mock starts with 0 questions (no free-typed count)');
  else bad(`new FIXED mock totalQuestions expected 0, got ${mt.totalQuestions}`);

  // 2) Publishing an empty FIXED mock is blocked.
  const pub0 = await api('PATCH', `/mock-tests/${mt.id}`, { status: 'PUBLISHED' }, tok);
  if (pub0.status === 400) ok('publishing an empty FIXED mock rejected (400)');
  else bad(`publish empty expected 400, got ${pub0.status} ${JSON.stringify(pub0.data)}`);

  // 3) Attaching questions derives the count from the set.
  const set = await api('PUT', `/mock-tests/${mt.id}/questions`,
    { items: qids.map((id) => ({ questionId: id, marks: 1, negativeMarks: 0 })) }, tok);
  if (set.status === 200 && set.data.totalQuestions === 2) ok('attaching 2 questions → totalQuestions derived to 2');
  else bad(`setQuestions expected total 2, got ${set.status} total=${set.data?.totalQuestions}`);

  // 4) The derived count persists on read.
  const got = (await api('GET', `/mock-tests/${mt.id}`, undefined, tok)).data;
  if (got.totalQuestions === 2 && got.questions.length === 2) ok('GET reflects derived count (2) and 2 attached questions');
  else bad(`GET mismatch: total=${got.totalQuestions} attached=${got.questions?.length}`);

  // 5) Now publish succeeds.
  const pub1 = await api('PATCH', `/mock-tests/${mt.id}`, { status: 'PUBLISHED' }, tok);
  if (pub1.status === 200 && pub1.data.status === 'PUBLISHED') ok('FIXED mock with questions publishes (200)');
  else bad(`publish expected 200 PUBLISHED, got ${pub1.status} ${JSON.stringify(pub1.data)}`);

  // 6) Manual totalQuestions edits on a FIXED mock are ignored (count stays derived).
  await api('PATCH', `/mock-tests/${mt.id}`, { totalQuestions: 99 }, tok);
  const after = (await api('GET', `/mock-tests/${mt.id}`, undefined, tok)).data;
  if (after.totalQuestions === 2) ok('manual totalQuestions=99 ignored on FIXED mock (stays 2)');
  else bad(`manual edit leaked: totalQuestions=${after.totalQuestions}`);

  // 7) A BLUEPRINT mock rejects a hand-picked question list.
  const exam = (await api('POST', '/exams', { code: `MC-${up}`, name: `MC Exam ${stamp}`, status: 'DRAFT' }, tok)).data;
  const bp = (await api('POST', `/exams/${exam.id}/blueprints`, { name: 'BP', totalQuestions: 10, isActive: true }, tok)).data;
  const bmt = (await api('POST', '/mock-tests',
    { code: `MTB-${up}`, title: `MTB ${stamp}`, mode: 'BLUEPRINT', blueprintId: bp.id, totalQuestions: 10, durationMinutes: 30 }, tok)).data;
  const bset = await api('PUT', `/mock-tests/${bmt.id}/questions`,
    { items: [{ questionId: qids[0], marks: 1, negativeMarks: 0 }] }, tok);
  if (bset.status === 400) ok('BLUEPRINT mock rejects a hand-picked list (400)');
  else bad(`blueprint setQuestions expected 400, got ${bset.status}`);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
