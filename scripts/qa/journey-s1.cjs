// QA Scenario S1 — Question lifecycle across roles:
//   Author drafts → submits  •  Reviewer approves  •  Academic publishes  •  Student practices
//
// This exercises the full content workflow end-to-end against the live API and asserts every
// role-gated transition (a) succeeds for the RIGHT role and (b) is blocked (403) for a WRONG role.
//
//   node scripts/qa/journey-s1.cjs [--json]
//
// Verified against:
//   packages/contracts/src/question/question.ts          (createQuestionSchema, answerSpec union)
//   apps/api/src/modules/question/controllers/question.controller.ts   (paths + @Permissions)
//   apps/api/src/modules/question/question.service.ts     (TRANSITIONS: submit/approve/publish)
//   apps/api/src/modules/question/controllers/question-mapping.controller.ts (PUT mappings/knowledge)
//   apps/api/src/modules/practice/practice.{service,controller}.ts + repository (pool = PUBLISHED,
//     org-scoped: organizationId null|viewerOrg; knowledge filter narrows via knowledgeMappings).
//
// A genuine product defect is recorded as a FAILED step (with expected/actual), NOT a thrown error.

const BASE = process.env.API_BASE || 'http://localhost:4000/api/v1';
const TS = Date.now();
const STAMP = `QA-S1-${TS}`; // stamped question code so cleanup can find it

const CREDS = {
  author: { email: 'author@demo.local', password: 'Demo@12345' },
  reviewer: { email: 'reviewer@demo.local', password: 'Demo@12345' },
  academic: { email: 'academic@demo.local', password: 'Demo@12345' },
  student: { email: 'student@demo.local', password: 'Demo@12345' },
};

async function api(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}
const login = async (creds) => (await api('POST', '/auth/login', creds)).data?.accessToken;

// ── step recorder ──
const steps = [];
let pass = 0, fail = 0;
function record(name, ok, detail) {
  steps.push({ name, status: ok ? 'pass' : 'fail', detail });
  if (ok) { pass++; console.log(`PASS: ${name} — ${detail}`); }
  else { fail++; console.log(`FAIL: ${name} — ${detail}`); }
  return ok;
}
const errMsg = (r) => r.data?.error?.message || r.data?.message || JSON.stringify(r.data);

async function main() {
  console.log(`=== QA S1: question lifecycle (code=${STAMP}) ===\n`);

  // ── Authenticate all four personas ──
  const tokens = {};
  for (const [role, creds] of Object.entries(CREDS)) {
    tokens[role] = await login(creds);
    if (!tokens[role]) { record(`login:${role}`, false, `could not authenticate ${creds.email}`); }
  }
  if (!tokens.author || !tokens.reviewer || !tokens.academic || !tokens.student) {
    console.log(`\n=== RESULT: ${pass} passed, ${fail} failed (aborted: auth) ===`);
    return finish();
  }

  // Pick a real knowledge node to map + filter on (scopes the practice assertion to our question).
  const nodes = (await api('GET', '/knowledge/nodes?pageSize=100', undefined, tokens.author)).data?.items ?? [];
  const node = nodes[0];
  if (!node) { record('precondition:knowledge-node', false, 'no knowledge nodes available to map/filter'); }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1 — Author creates a DRAFT single-choice MCQ, then submits for review.
  // ─────────────────────────────────────────────────────────────────────────
  const createBody = {
    questionCode: STAMP,
    questionType: 'SINGLE_CHOICE',
    authorDifficulty: 'MEDIUM',
    language: 'en',
    questionText: `[${STAMP}] Which receptor does salbutamol primarily agonise?`,
    explanation: 'Salbutamol is a selective beta-2 adrenergic receptor agonist.',
    answerSpec: { type: 'SINGLE_CHOICE' },
    options: [
      { text: 'Beta-2 adrenergic receptor', isCorrect: true },
      { text: 'Alpha-1 adrenergic receptor', isCorrect: false },
      { text: 'Muscarinic M3 receptor', isCorrect: false },
      { text: 'Beta-1 adrenergic receptor', isCorrect: false },
    ],
  };
  const created = await api('POST', '/questions', createBody, tokens.author);
  const questionId = created.data?.id;
  record(
    '1a. author creates DRAFT (POST /questions)',
    created.status === 201 && created.data?.status === 'DRAFT' && !!questionId,
    `expected 201 + status DRAFT, got HTTP ${created.status} status=${created.data?.status} (${created.status === 201 ? '' : errMsg(created)})`,
  );
  if (!questionId) {
    console.log(`\n=== RESULT: ${pass} passed, ${fail} failed (aborted: create) ===`);
    return finish();
  }

  // Map the question to a knowledge node (best-effort like the web UI; also lets us filter later).
  if (node) {
    const mapped = await api('PUT', `/questions/${questionId}/mappings/knowledge`,
      { items: [{ knowledgeNodeId: node.id }] }, tokens.author);
    record(
      '1b. author maps question → knowledge node (PUT mappings/knowledge)',
      mapped.status === 200 && (mapped.data?.knowledgeNodeIds || []).includes(node.id),
      `expected 200 incl ${node.code}, got HTTP ${mapped.status} (${mapped.status === 200 ? '' : errMsg(mapped)})`,
    );
  }

  const submitted = await api('POST', `/questions/${questionId}/submit`, undefined, tokens.author);
  record(
    '1c. author submits DRAFT → REVIEW (POST /:id/submit)',
    submitted.status === 201 && submitted.data?.status === 'REVIEW',
    `expected 201 + status REVIEW, got HTTP ${submitted.status} status=${submitted.data?.status} (${submitted.status === 201 ? '' : errMsg(submitted)})`,
  );

  // ── NEGATIVE: wrong role cannot approve/publish (permission guard → 403). ──
  const authorApprove = await api('POST', `/questions/${questionId}/approve`, undefined, tokens.author);
  record(
    '1d. NEG author cannot approve (no question:approve → 403)',
    authorApprove.status === 403,
    `expected 403, got HTTP ${authorApprove.status}`,
  );
  const authorPublish = await api('POST', `/questions/${questionId}/publish`, undefined, tokens.author);
  record(
    '1e. NEG author cannot publish (no question:publish → 403)',
    authorPublish.status === 403,
    `expected 403, got HTTP ${authorPublish.status}`,
  );

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2 — Reviewer sees it in the review queue and approves (REVIEW → APPROVED).
  // ─────────────────────────────────────────────────────────────────────────
  const queue = await api('GET', `/questions?status=REVIEW&pageSize=100`, undefined, tokens.reviewer);
  const inQueue = (queue.data?.items || []).some((q) => q.id === questionId);
  record(
    '2a. reviewer sees question in REVIEW queue (GET /questions?status=REVIEW)',
    queue.status === 200 && inQueue,
    `expected the question present, got HTTP ${queue.status}, present=${inQueue}`,
  );

  // ── NEGATIVE: reviewer cannot publish (no question:publish → 403). ──
  const reviewerPublish = await api('POST', `/questions/${questionId}/publish`, undefined, tokens.reviewer);
  record(
    '2b. NEG reviewer cannot publish (no question:publish → 403)',
    reviewerPublish.status === 403,
    `expected 403, got HTTP ${reviewerPublish.status}`,
  );

  const approved = await api('POST', `/questions/${questionId}/approve`, undefined, tokens.reviewer);
  record(
    '2c. reviewer approves REVIEW → APPROVED (POST /:id/approve)',
    approved.status === 201 && approved.data?.status === 'APPROVED',
    `expected 201 + status APPROVED, got HTTP ${approved.status} status=${approved.data?.status} (${approved.status === 201 ? '' : errMsg(approved)})`,
  );

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3 — Academic publishes (APPROVED → PUBLISHED).
  // ─────────────────────────────────────────────────────────────────────────
  const published = await api('POST', `/questions/${questionId}/publish`, undefined, tokens.academic);
  const okPublish = published.status === 201 && published.data?.status === 'PUBLISHED' && !!published.data?.currentVersionId;
  record(
    '3a. academic publishes APPROVED → PUBLISHED (POST /:id/publish)',
    okPublish,
    `expected 201 + status PUBLISHED + currentVersionId set, got HTTP ${published.status} status=${published.data?.status} currentVersionId=${published.data?.currentVersionId} (${okPublish ? '' : errMsg(published)})`,
  );

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 4 — Student finds the newly published question in the practice pool.
  // ─────────────────────────────────────────────────────────────────────────
  // 4a. available-count for the mapped knowledge node must be >= 1 (our question is published+mapped).
  let availForNode = null;
  if (node) {
    const r = await api('GET', `/practice/sessions/available?knowledgeNodeId=${node.id}`, undefined, tokens.student);
    availForNode = r.data?.available;
    record(
      '4a. student available-count for mapped node >= 1 (GET /practice/sessions/available)',
      r.status === 200 && typeof availForNode === 'number' && availForNode >= 1,
      `expected >=1 for ${node.code}, got HTTP ${r.status} available=${availForNode}`,
    );
  }

  // 4b. Starting a practice session filtered to that node must include OUR question id.
  if (node) {
    const cap = Math.min(availForNode || 1, 50);
    const start = await api('POST', '/practice/sessions',
      { count: cap, knowledgeNodeIds: [node.id] }, tokens.student);
    const ids = (start.data?.questions || []).map((q) => q.questionId);
    const includesOurs = ids.includes(questionId);
    record(
      '4b. student practice session (filtered to node) includes the new question (POST /practice/sessions)',
      start.status === 201 && includesOurs,
      `expected our question in the served pool, got HTTP ${start.status}, served=${ids.length}, includesOurs=${includesOurs}`,
    );
  }

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed (question ${STAMP} = ${questionId}) ===`);
  return finish();
}

function finish() {
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ scenario: 'S1', code: STAMP, pass, fail, steps }, null, 2));
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
