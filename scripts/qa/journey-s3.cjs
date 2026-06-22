// QA Scenario S3 — FIXED mock end-to-end across two roles.
//
//   ACADEMIC (Academic Head, has mocktest:manage):
//     1. picks 3 PUBLISHED questions
//     2. creates a FIXED mock (no count → empty shell)        POST  /mock-tests
//     3. asserts publishing the EMPTY fixed mock is rejected  PATCH /mock-tests/:id {status:PUBLISHED} → 400
//     4. attaches the questions                               PUT   /mock-tests/:id/questions {items:[...]}
//        → totalQuestions is DERIVED from the set (= 3)
//     5. publishes the now-populated mock                     PATCH /mock-tests/:id {status:PUBLISHED} → 200
//
//   STUDENT (student@demo.local):
//     6. starts an attempt (freezes per-question snapshots)   POST  /mock-tests/:id/start → TestSessionDetailDto
//     7. answers every served question CORRECTLY              POST  /assessments/sessions/:id/answers
//        (correct answers are resolved from the academic-side question detail, which exposes isCorrect /
//         answerSpec; snapshot option ids equal the version option ids, so we map by id)
//     8. submits → scored result                              POST  /assessments/sessions/:id/submit → TestResultDto
//     9. confirms the result is durable / re-readable         GET   /assessments/sessions/:id/result → TestResultDto
//
// Contracts verified against packages/contracts/src/assessment/assessment.ts + practice/practice.ts and the
// controllers/service under apps/api/src/modules/assessment. Everything is STAMPED (qa-<ts>) so cleanup can
// find it; no seed/demo data is mutated (we only create a fresh mock and a fresh attempt).
//
// Run:  node scripts/qa/journey-s3.cjs
const BASE = 'http://localhost:4000/api/v1';
const ACADEMIC = { email: 'academic@demo.local', password: 'Demo@12345' };
const STUDENT = { email: 'student@demo.local', password: 'Demo@12345' };

const ts = Date.now();
const up = ts.toString(36).toUpperCase();

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

let pass = 0, fail = 0;
const ok = (m) => { console.log('PASS: ' + m); pass++; };
const bad = (m) => { console.log('FAIL: ' + m); fail++; };

/**
 * Build the correct answer payload for a served snapshot, using the authoritative question detail
 * (currentVersion.options[isCorrect] + answerSpec). Snapshot option ids == version option ids.
 */
function correctAnswerFor(served, detail) {
  const ver = detail.currentVersion;
  const spec = ver.answerSpec;
  switch (served.questionType) {
    case 'SINGLE_CHOICE':
    case 'MULTI_CHOICE':
    case 'ASSERTION_REASON': {
      const correctIds = ver.options.filter((o) => o.isCorrect).map((o) => o.id);
      return { selectedOptionIds: correctIds };
    }
    case 'TRUE_FALSE':
      return { booleanAnswer: spec.answer };
    case 'NUMERIC':
      return { numericAnswer: spec.value };
    case 'MATCHING':
      return { matchingAnswer: spec.pairs.map((p) => ({ left: p.left, right: p.right })) };
    default:
      return {};
  }
}

async function main() {
  console.log(`=== S3: FIXED mock end-to-end (academic → student) [stamp qa-${ts}] ===`);

  const academicTok = await login(ACADEMIC);
  const studentTok = await login(STUDENT);
  if (!academicTok) return bad('could not authenticate academic@demo.local') ?? finish();
  if (!studentTok) return bad('could not authenticate student@demo.local') ?? finish();
  ok('authenticated academic + student');

  // ── Academic: pick 3 PUBLISHED single-choice questions (deterministic to answer/score) ──
  const pubRes = await api('GET', '/questions?status=PUBLISHED&type=SINGLE_CHOICE&pageSize=3', undefined, academicTok);
  const pub = pubRes.data?.items ?? [];
  if (pub.length >= 3) ok(`found ${pub.length} published questions to attach`);
  else { bad(`need >=3 published SINGLE_CHOICE questions, got ${pub.length}`); return finish(); }
  const qids = pub.slice(0, 3).map((q) => q.id);

  // Pull authoritative answers (isCorrect/answerSpec) for the chosen questions, keyed by questionId.
  const detailByQid = new Map();
  for (const qid of qids) {
    const d = await api('GET', `/questions/${qid}`, undefined, academicTok);
    if (d.status !== 200 || !d.data?.currentVersion) { bad(`GET /questions/${qid} failed (${d.status})`); return finish(); }
    detailByQid.set(qid, d.data);
  }

  // ── Academic: create a FIXED mock with NO count → empty shell ──
  const code = `QAS3-${up}`;
  const createRes = await api('POST', '/mock-tests',
    { code, title: `qa-${ts} S3 fixed mock`, mode: 'FIXED', durationMinutes: 30 }, academicTok);
  const mock = createRes.data;
  if (createRes.status === 201 && mock?.id) ok(`academic created FIXED mock ${code} (${mock.id})`);
  else { bad(`POST /mock-tests failed: ${createRes.status} ${JSON.stringify(createRes.data)}`); return finish(); }
  if (mock.totalQuestions === 0) ok('new FIXED mock starts as an empty shell (totalQuestions=0)');
  else bad(`expected empty shell totalQuestions=0, got ${mock.totalQuestions}`);

  // ── Academic: publishing the EMPTY fixed mock must be rejected (400) ──
  const pubEmpty = await api('PATCH', `/mock-tests/${mock.id}`, { status: 'PUBLISHED' }, academicTok);
  if (pubEmpty.status === 400) ok('publishing an EMPTY FIXED mock is rejected (400)');
  else bad(`publish-empty expected 400, got ${pubEmpty.status} ${JSON.stringify(pubEmpty.data)}`);

  // ── Academic: attach the 3 questions; count derives from the set ──
  const attachRes = await api('PUT', `/mock-tests/${mock.id}/questions`,
    { items: qids.map((id) => ({ questionId: id, marks: 1, negativeMarks: 0 })) }, academicTok);
  if (attachRes.status === 200 && attachRes.data?.totalQuestions === 3 && attachRes.data?.questions?.length === 3) {
    ok('attaching 3 questions → totalQuestions DERIVED to 3');
  } else {
    bad(`PUT questions expected 200 total=3, got ${attachRes.status} total=${attachRes.data?.totalQuestions} attached=${attachRes.data?.questions?.length}`);
    return finish();
  }

  // ── Academic: publish the populated mock (200 PUBLISHED) ──
  const pubFull = await api('PATCH', `/mock-tests/${mock.id}`, { status: 'PUBLISHED' }, academicTok);
  if (pubFull.status === 200 && pubFull.data?.status === 'PUBLISHED') ok('academic published the populated FIXED mock (200)');
  else { bad(`publish expected 200 PUBLISHED, got ${pubFull.status} ${JSON.stringify(pubFull.data)}`); return finish(); }

  // ── Student: start an attempt → frozen snapshots ──
  const startRes = await api('POST', `/mock-tests/${mock.id}/start`, undefined, studentTok);
  const session = startRes.data;
  if (startRes.status === 201 && session?.id && session.status === 'IN_PROGRESS') {
    ok(`student started attempt ${session.id} (IN_PROGRESS)`);
  } else {
    bad(`POST /mock-tests/:id/start expected 201 IN_PROGRESS, got ${startRes.status} ${JSON.stringify(startRes.data)}`);
    return finish();
  }
  if (session.totalQuestions === 3 && session.questions?.length === 3) ok('attempt served 3 snapshot questions');
  else bad(`attempt expected 3 served questions, got total=${session.totalQuestions} served=${session.questions?.length}`);

  // ── Student: answer every served question correctly ──
  let answeredOk = 0;
  for (const served of session.questions) {
    // Map this snapshot back to its source question via matching option ids / order to fetch correct answers.
    // The served snapshot withholds questionId, but snapshot option ids equal version option ids, so we
    // identify the source question by intersecting option-id sets (or, for non-choice types, by text+type).
    let detail = null;
    if (served.options?.length) {
      const servedIds = new Set(served.options.map((o) => o.id));
      for (const qid of qids) {
        const d = detailByQid.get(qid);
        if (d.currentVersion.options.some((o) => servedIds.has(o.id))) { detail = d; break; }
      }
    } else {
      for (const qid of qids) {
        const d = detailByQid.get(qid);
        if (d.currentVersion.questionText === served.questionText && d.questionType === served.questionType) { detail = d; break; }
      }
    }
    if (!detail) { bad(`could not resolve source question for snapshot ${served.snapshotId}`); continue; }

    const ans = correctAnswerFor(served, detail);
    const aRes = await api('POST', `/assessments/sessions/${session.id}/answers`,
      { snapshotId: served.snapshotId, timeMs: 1500, ...ans }, studentTok);
    if (aRes.status === 200 && aRes.data?.saved === true) answeredOk++;
    else bad(`save answer for ${served.snapshotId} expected 200 saved, got ${aRes.status} ${JSON.stringify(aRes.data)}`);
  }
  if (answeredOk === session.questions.length) ok(`student saved ${answeredOk}/${session.questions.length} answers`);
  else bad(`only ${answeredOk}/${session.questions.length} answers saved`);

  // ── Student: submit → scored result ──
  const submitRes = await api('POST', `/assessments/sessions/${session.id}/submit`, undefined, studentTok);
  const result = submitRes.data;
  if (submitRes.status === 200 && result?.sessionId === session.id) ok('student submitted the attempt → result returned (200)');
  else { bad(`submit expected 200 with result, got ${submitRes.status} ${JSON.stringify(submitRes.data)}`); return finish(); }

  // Answered correctly → full marks (3 of 3 correct, score == maxScore).
  if (result.correctCount === 3 && result.wrongCount === 0 && result.skippedCount === 0) {
    ok(`result counts correct: 3 correct / 0 wrong / 0 skipped`);
  } else {
    bad(`result counts unexpected: correct=${result.correctCount} wrong=${result.wrongCount} skipped=${result.skippedCount}`);
  }
  if (result.maxScore === 3 && result.score === 3 && result.accuracy === 1) {
    ok(`scoring correct: score=${result.score}/${result.maxScore} accuracy=${result.accuracy}`);
  } else {
    bad(`scoring unexpected: score=${result.score} maxScore=${result.maxScore} accuracy=${result.accuracy}`);
  }
  // Mock-test attempts carry cohort ranking metadata.
  if (typeof result.rank === 'number' && result.rank >= 1 && typeof result.cohortSize === 'number' && result.cohortSize >= 1) {
    ok(`cohort ranking present: rank=${result.rank}/${result.cohortSize} percentile=${result.percentile}`);
  } else {
    bad(`expected cohort rank/cohortSize for a mock attempt, got rank=${result.rank} cohortSize=${result.cohortSize}`);
  }

  // ── Student: result is durable / re-readable ──
  const getRes = await api('GET', `/assessments/sessions/${session.id}/result`, undefined, studentTok);
  if (getRes.status === 200 && getRes.data?.score === result.score && getRes.data?.sessionId === session.id) {
    ok('GET /sessions/:id/result re-reads the same durable result');
  } else {
    bad(`GET result mismatch: ${getRes.status} score=${getRes.data?.score} (expected ${result.score})`);
  }

  finish();
}

function finish() {
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('[journey-s3] ERROR', e); process.exit(1); });
