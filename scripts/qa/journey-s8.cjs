// QA journey S8 — Daily student loop (as student@demo.local).
// Exercises the core learner endpoints end-to-end, exactly as the web app calls them:
//   practice: start (POST /practice/sessions) -> answer (POST .../:id/answers)
//             -> complete (POST .../:id/complete) -> summary (GET .../:id/summary)
//   revision:    GET /revision/due
//   study-plan:  POST /recommendations/me/study-plan
//   analytics:   GET /analytics/me/overview
//   notifications: GET /notifications/me
// Each must return 2xx (empty payloads are OK). Any 5xx or unexpected 4xx is a FAIL (product defect).
//
// Paths/bodies were verified against packages/contracts/src/** and apps/api/src/modules/**:
//   - StartPracticeSessionInput (practice.ts): { count, knowledgeNodeIds?, examProfileId?, difficulty?, ... }
//   - SubmitPracticeAnswerInput (practice.ts): { sessionQuestionId, selectedOptionIds?/booleanAnswer?/numericAnswer?/matchingAnswer?, timeMs? }
//   - StudyPlanInput (recommendation.ts): { examProfileId?, days?, dailyQuestions? } (all optional w/ defaults)
//   - Notifications feed is GET /notifications/me (NOT /notifications).
//
// Usage:  node scripts/qa/journey-s8.cjs
const BASE = 'http://localhost:4000/api/v1';
const STAMP = `qa-${Date.now()}`; // stamped run id (no data created needs naming, but keeps logs traceable)

let token;
async function api(method, p, body) {
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

let pass = 0, fail = 0;
const ok = (m) => { console.log('PASS: ' + m); pass++; };
const bad = (m) => { console.log('FAIL: ' + m); fail++; };

// 2xx assertion helper — empty body is fine; 5xx / unexpected 4xx is a product defect.
function assert2xx(label, r, extra = '') {
  const msg = r.data?.error?.message ?? r.data?.message ?? '';
  if (r.status >= 200 && r.status < 300) ok(`${label} -> HTTP ${r.status}${extra ? ' ' + extra : ''}`);
  else bad(`${label} -> expected 2xx, got HTTP ${r.status} ${msg ? `(${msg})` : ''}`.trim());
  return r.status >= 200 && r.status < 300;
}

// Build a type-appropriate answer for a served practice question (correctness irrelevant for QA).
function buildAnswer(q) {
  const base = { sessionQuestionId: q.sessionQuestionId, timeMs: 1234 };
  switch (q.questionType) {
    case 'SINGLE_CHOICE':
    case 'ASSERTION_REASON':
      return { ...base, selectedOptionIds: q.options?.[0] ? [q.options[0].id] : [] };
    case 'MULTI_CHOICE':
      return { ...base, selectedOptionIds: (q.options ?? []).slice(0, 1).map((o) => o.id) };
    case 'TRUE_FALSE':
      return { ...base, booleanAnswer: true };
    case 'NUMERIC':
      return { ...base, numericAnswer: 0 };
    case 'MATCHING': {
      const lefts = q.matchingPrompt?.lefts ?? [];
      const rights = q.matchingPrompt?.rights ?? [];
      return { ...base, matchingAnswer: lefts.map((left, i) => ({ left, right: rights[i] ?? rights[0] ?? left })) };
    }
    default:
      // Unknown type — still send a choice attempt so the endpoint is exercised.
      return { ...base, selectedOptionIds: q.options?.[0] ? [q.options[0].id] : [] };
  }
}

async function main() {
  console.log(`=== Journey S8: daily student loop (${STAMP}) ===`);

  // ── Login as the demo student ──
  const login = await api('POST', '/auth/login', { email: 'student@demo.local', password: 'Demo@12345' });
  token = login.data?.accessToken;
  if (!token) { bad(`login student@demo.local -> HTTP ${login.status} (no token)`); console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`); process.exit(1); }
  ok(`login student@demo.local -> HTTP ${login.status}`);

  // ── 1. Practice: start a session (random pool, modest count) ──
  const startBody = { count: 5 };
  const started = await api('POST', '/practice/sessions', startBody);
  const startedOk = assert2xx('practice.start POST /practice/sessions', started,
    `(${started.data?.questions?.length ?? 0} questions, session ${started.data?.id ?? 'n/a'})`);

  let sessionId = started.data?.id;
  const questions = started.data?.questions ?? [];

  // ── 2. Practice: submit at least one answer ──
  if (startedOk && sessionId && questions.length > 0) {
    const answerBody = buildAnswer(questions[0]);
    const answered = await api('POST', `/practice/sessions/${sessionId}/answers`, answerBody);
    assert2xx(`practice.answer POST /practice/sessions/:id/answers (${questions[0].questionType})`, answered,
      answered.data ? `(isCorrect=${answered.data.isCorrect})` : '');
  } else if (startedOk && sessionId && questions.length === 0) {
    // Session started but no questions in pool — can't answer. Not a practice-endpoint failure; note it.
    console.log('NOTE: session started with 0 questions; skipping answer/complete-with-answer assertions.');
  } else {
    bad('practice.answer — skipped because start failed (no session id)');
  }

  // ── 3. Practice: complete and read summary ──
  if (startedOk && sessionId) {
    const completed = await api('POST', `/practice/sessions/${sessionId}/complete`, {});
    assert2xx('practice.complete POST /practice/sessions/:id/complete', completed,
      completed.data ? `(answered=${completed.data.answered}/${completed.data.total}, accuracy=${completed.data.accuracy})` : '');

    const summary = await api('GET', `/practice/sessions/${sessionId}/summary`);
    assert2xx('practice.summary GET /practice/sessions/:id/summary', summary,
      summary.data ? `(correct=${summary.data.correct}, incorrect=${summary.data.incorrect})` : '');
  } else {
    bad('practice.complete/summary — skipped because start failed (no session id)');
  }

  // ── 4. Revision: due list ──
  const due = await api('GET', '/revision/due');
  assert2xx('revision.due GET /revision/due', due, `(${Array.isArray(due.data) ? due.data.length : '?'} due)`);

  // ── 5. Study plan: build a day-by-day plan from weak areas ──
  const plan = await api('POST', '/recommendations/me/study-plan', { days: 7, dailyQuestions: 20 });
  assert2xx('study-plan POST /recommendations/me/study-plan', plan,
    plan.data ? `(${plan.data.days?.length ?? 0} days, total=${plan.data.totalQuestions})` : '');

  // ── 6. Analytics: overview ──
  const overview = await api('GET', '/analytics/me/overview');
  assert2xx('analytics.overview GET /analytics/me/overview', overview);

  // ── 7. Notifications: in-app feed ──
  const notes = await api('GET', '/notifications/me?page=1&pageSize=10');
  assert2xx('notifications.feed GET /notifications/me', notes,
    notes.data ? `(${notes.data.items?.length ?? notes.data.total ?? 0} items)` : '');

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
