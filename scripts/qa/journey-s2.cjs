// QA Scenario S2 — Blueprint mock, end-to-end across roles.
//
//   ACADEMIC (Academic Head): create an exam profile → create a blueprint (small total, 3) →
//     add weighted items summing to 100% mapped to a knowledge node that HAS published questions
//     → create a BLUEPRINT-mode mock referencing the blueprint → publish it.
//   STUDENT: POST /mock-tests/:id/start (freezes a per-attempt snapshot from the blueprint pool) →
//     answer every served question → submit → confirm a scored result is produced and self-consistent.
//
// Contracts verified by reading source (no guessed payloads):
//   - packages/contracts/src/exam/exam.ts            (createExamProfile / createExamBlueprint / item)
//   - packages/contracts/src/assessment/assessment.ts (createMockTest BLUEPRINT refine, submitTestAnswer)
//   - apps/api/src/modules/exam/controllers/exam-blueprint.controller.ts  (POST /exams/:id/blueprints[/items])
//   - apps/api/src/modules/assessment/controllers/mock-test.controller.ts (POST /mock-tests, /:id/start)
//   - apps/api/src/modules/assessment/controllers/test-session.controller.ts
//        answers -> POST /assessments/sessions/:id/answers   (body: { snapshotId, selectedOptionIds? ... })
//        submit  -> POST /assessments/sessions/:id/submit     (returns TestResultDto)
//        result  -> GET  /assessments/sessions/:id/result
//   - apps/api/src/modules/assessment/test-session.service.ts (BLUEPRINT assembly + scoring)
//
// A served question withholds correctness, so the student cannot know the right option from the wire.
// We answer each MCQ-style question with its first served option — a *valid* answer; scoring still
// produces a result regardless of whether it is right. The assertion is that a result is produced and
// is internally consistent, NOT that the student scores 100%.
//
// If the blueprint pool cannot fill the paper, the product surfaces a 400 ("No published questions…")
// at start — that is recorded as a FINDING (a failed step with expected/actual), not a crash.
//
// Run:  node scripts/qa/journey-s2.cjs
const BASE = 'http://localhost:4000/api/v1';
const ACADEMIC = { email: 'academic@demo.local', password: 'Demo@12345' };
const STUDENT = { email: 'student@demo.local', password: 'Demo@12345' };
const stamp = Date.now().toString(36);
const TOTAL_QUESTIONS = 3; // small target per scenario brief

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
const login = async (c) => {
  const r = await api('POST', '/auth/login', c);
  if (r.status !== 200 && r.status !== 201) throw new Error(`login ${c.email} failed: ${r.status} ${JSON.stringify(r.data)}`);
  return { token: r.data.accessToken, user: r.data.user };
};

let pass = 0, fail = 0;
const steps = [];
const ok = (name, detail = '') => { console.log('PASS: ' + name + (detail ? ' — ' + detail : '')); pass++; steps.push({ name, status: 'pass', detail }); };
const bad = (name, detail = '') => { console.log('FAIL: ' + name + (detail ? ' — ' + detail : '')); fail++; steps.push({ name, status: 'fail', detail }); };

// Pick a valid answer for a served question from its snapshot, by type. We don't know correctness.
function answerForQuestion(q) {
  const body = { snapshotId: q.snapshotId };
  switch (q.questionType) {
    case 'SINGLE_CHOICE':
    case 'MULTIPLE_CHOICE':
      if (q.options && q.options.length) body.selectedOptionIds = [q.options[0].id];
      break;
    case 'TRUE_FALSE':
      body.booleanAnswer = true;
      break;
    case 'NUMERIC':
      body.numericAnswer = 0;
      break;
    case 'MATCHING':
      if (q.matchingPrompt) {
        body.matchingAnswer = q.matchingPrompt.lefts.map((left, i) => ({
          left,
          right: q.matchingPrompt.rights[i % q.matchingPrompt.rights.length],
        }));
      }
      break;
    default:
      if (q.options && q.options.length) body.selectedOptionIds = [q.options[0].id];
  }
  return body;
}

async function main() {
  console.log('=== S2: Blueprint mock end-to-end (Academic builds+publishes → Student takes → result) ===\n');

  // ── Login both roles ──────────────────────────────────────────────────────────
  let academic, student;
  try { academic = await login(ACADEMIC); ok('academic logs in', academic.user?.email); }
  catch (e) { bad('academic logs in', e.message); return finish(); }
  try { student = await login(STUDENT); ok('student logs in', student.user?.email); }
  catch (e) { bad('student logs in', e.message); return finish(); }

  const aTok = academic.token, sTok = student.token;

  // Confirm academic actually holds the authoring permissions (else the scenario can't run).
  const me = (await api('GET', '/auth/me', undefined, aTok)).data;
  const perms = me?.permissions ?? [];
  const needed = ['exam:manage', 'mocktest:manage'];
  if (needed.every((p) => perms.includes(p))) ok('academic has exam:manage + mocktest:manage', `roles=${(me.roles || []).join(',')}`);
  else bad('academic has exam:manage + mocktest:manage', `missing: ${needed.filter((p) => !perms.includes(p)).join(',')}`);

  // ── Find a knowledge node with enough published questions to FILL the paper ─────
  // Mirror scripts/blueprint-tracks-check.cjs: probe /practice/sessions/available per node.
  // We want >= TOTAL_QUESTIONS so a single 100% item can source the whole blueprint cleanly.
  const nodesRes = await api('GET', '/knowledge/nodes?pageSize=200', undefined, aTok);
  const nodes = nodesRes.data?.items ?? [];
  let target = null;
  let best = null; // fallback: the richest node even if < TOTAL_QUESTIONS
  for (const n of nodes) {
    const a = (await api('GET', `/practice/sessions/available?knowledgeNodeId=${n.id}`, undefined, aTok)).data;
    const avail = a?.available ?? 0;
    if (avail > 0 && (!best || avail > best.available)) best = { id: n.id, name: n.name, available: avail };
    if (avail >= TOTAL_QUESTIONS) { target = { id: n.id, name: n.name, available: avail }; break; }
  }
  if (target) ok('found a knowledge node that can fill the paper', `"${target.name}" has ${target.available} published Qs (need ${TOTAL_QUESTIONS})`);
  else if (best) { target = best; bad('found a knowledge node that can fill the paper', `richest node "${best.name}" has only ${best.available} (< ${TOTAL_QUESTIONS}) — under-supply expected at start`); }
  else { bad('found a knowledge node with published questions', 'no node has any published questions — cannot exercise the blueprint pool'); return finish(); }

  // ── Academic: create exam profile ───────────────────────────────────────────────
  const examRes = await api('POST', '/exams', {
    code: `QA-S2-${stamp.toUpperCase()}`,
    name: `qa-${stamp}-s2-exam`,
    description: 'QA S2 blueprint scenario',
    status: 'DRAFT',
  }, aTok);
  if ((examRes.status === 201 || examRes.status === 200) && examRes.data?.id) ok('academic creates exam profile', `id=${examRes.data.id} code=${examRes.data.code}`);
  else { bad('academic creates exam profile', `status=${examRes.status} body=${JSON.stringify(examRes.data)}`); return finish(); }
  const examId = examRes.data.id;

  // ── Academic: create a blueprint (small total = TOTAL_QUESTIONS) ─────────────────
  const bpRes = await api('POST', `/exams/${examId}/blueprints`, {
    name: `qa-${stamp}-s2-blueprint`,
    totalQuestions: TOTAL_QUESTIONS,
    isActive: true,
  }, aTok);
  if ((bpRes.status === 201 || bpRes.status === 200) && bpRes.data?.id) ok('academic creates blueprint', `id=${bpRes.data.id} total=${bpRes.data.totalQuestions}`);
  else { bad('academic creates blueprint', `status=${bpRes.status} body=${JSON.stringify(bpRes.data)}`); return finish(); }
  const blueprintId = bpRes.data.id;

  // ── Academic: add weighted items summing to 100%, mapped to the node that has questions ──
  // Two items 60/40 = 100% so we exercise multi-section weight-driven assembly; both map to the
  // SAME node (the only one we know has supply) so the whole paper is sourceable from it.
  const item1 = await api('POST', `/exams/${examId}/blueprints/${blueprintId}/items`, { label: 'qa-s2-section-A', weightPercent: 60, knowledgeNodeId: target.id }, aTok);
  const item2 = await api('POST', `/exams/${examId}/blueprints/${blueprintId}/items`, { label: 'qa-s2-section-B', weightPercent: 40, knowledgeNodeId: target.id }, aTok);
  if ([201, 200].includes(item1.status) && [201, 200].includes(item2.status)) ok('academic adds two weighted items (60% + 40%) mapped to the node', `${item1.data?.label}/${item2.data?.label}`);
  else { bad('academic adds two weighted items', `s1=${item1.status} s2=${item2.status} b1=${JSON.stringify(item1.data)} b2=${JSON.stringify(item2.data)}`); return finish(); }

  // Re-read blueprint: weights total 100, isReady true, derived counts reconcile to TOTAL_QUESTIONS.
  const bpDetail = (await api('GET', `/exams/${examId}/blueprints/${blueprintId}`, undefined, aTok)).data;
  const derivedSum = (bpDetail.items || []).reduce((s, i) => s + (i.questionCount || 0), 0);
  if (bpDetail.weightTotal === 100 && bpDetail.isReady === true && derivedSum === TOTAL_QUESTIONS)
    ok('blueprint weights sum to 100% and derived counts reconcile to total', `weightTotal=${bpDetail.weightTotal} isReady=${bpDetail.isReady} derived=${JSON.stringify((bpDetail.items||[]).map((i)=>i.questionCount))}`);
  else bad('blueprint weights sum to 100% and derived counts reconcile to total', `weightTotal=${bpDetail.weightTotal} isReady=${bpDetail.isReady} derivedSum=${derivedSum} (expected ${TOTAL_QUESTIONS})`);

  // Author-facing dry-run plan: sourceable count should meet the planned count when supply suffices.
  const plan = (await api('GET', `/exams/${examId}/blueprints/${blueprintId}/plan`, undefined, aTok)).data;
  if (plan && plan.plannedCount === TOTAL_QUESTIONS && plan.sourceableCount >= TOTAL_QUESTIONS)
    ok('blueprint plan reports the pool can source the full paper', `planned=${plan.plannedCount} sourceable=${plan.sourceableCount} isReady=${plan.isReady}`);
  else bad('blueprint plan reports the pool can source the full paper', `planned=${plan?.plannedCount} sourceable=${plan?.sourceableCount} warnings=${JSON.stringify(plan?.warnings)} (expected sourceable>=${TOTAL_QUESTIONS})`);

  // ── Academic: create a BLUEPRINT-mode mock referencing the blueprint ─────────────
  const mockRes = await api('POST', '/mock-tests', {
    code: `QA-S2-${stamp.toUpperCase()}`,
    title: `qa-${stamp}-s2-blueprint-mock`,
    description: 'QA S2 blueprint mock',
    mode: 'BLUEPRINT',
    durationMinutes: 30,
    totalQuestions: TOTAL_QUESTIONS,
    examProfileId: examId,
    blueprintId,
    status: 'DRAFT',
  }, aTok);
  if ((mockRes.status === 201 || mockRes.status === 200) && mockRes.data?.id) ok('academic creates BLUEPRINT-mode mock', `id=${mockRes.data.id} mode=${mockRes.data.mode}`);
  else { bad('academic creates BLUEPRINT-mode mock', `status=${mockRes.status} body=${JSON.stringify(mockRes.data)}`); return finish(); }
  const mockId = mockRes.data.id;

  // ── Academic: publish the mock (PATCH status -> PUBLISHED) ───────────────────────
  const pub = await api('PATCH', `/mock-tests/${mockId}`, { status: 'PUBLISHED' }, aTok);
  if ([200, 201].includes(pub.status) && pub.data?.status === 'PUBLISHED') ok('academic publishes the mock', `status=${pub.data.status}`);
  else { bad('academic publishes the mock', `status=${pub.status} body=${JSON.stringify(pub.data)}`); return finish(); }

  // ── Student: start an attempt (assembles from blueprint, freezes snapshots) ──────
  const startRes = await api('POST', `/mock-tests/${mockId}/start`, undefined, sTok);
  if (startRes.status === 201 || startRes.status === 200) {
    const session = startRes.data;
    const qs = session.questions || [];
    if (qs.length === TOTAL_QUESTIONS) ok('student starts attempt — blueprint fills the full paper', `sessionId=${session.id} served=${qs.length}/${TOTAL_QUESTIONS}`);
    else if (qs.length > 0) bad('student starts attempt — blueprint fills the full paper', `served only ${qs.length}/${TOTAL_QUESTIONS} (under-fill from a thin pool)`);
    else { bad('student starts attempt — served questions', `served 0 questions`); return finish(); }

    const sessionId = session.id;

    // ── Student: answer every served question (valid answer; correctness unknown to client) ──
    let saved = 0;
    for (const q of qs) {
      const body = answerForQuestion(q);
      const r = await api('POST', `/assessments/sessions/${sessionId}/answers`, body, sTok);
      if (r.status === 200 && r.data?.saved === true) saved++;
      else console.log(`  (answer for ${q.snapshotId} -> ${r.status} ${JSON.stringify(r.data)})`);
    }
    if (saved === qs.length) ok('student saves an answer for every served question', `${saved}/${qs.length} saved`);
    else bad('student saves an answer for every served question', `${saved}/${qs.length} saved`);

    // ── Student: submit — scores it and returns the result ───────────────────────
    const sub = await api('POST', `/assessments/sessions/${sessionId}/submit`, undefined, sTok);
    if (sub.status === 200 && sub.data && typeof sub.data.score === 'number') {
      const res = sub.data;
      ok('student submits → a scored result is produced', `score=${res.score}/${res.maxScore} correct=${res.correctCount} wrong=${res.wrongCount} skipped=${res.skippedCount} accuracy=${res.accuracy}`);

      // Result self-consistency: counts reconcile to the paper size; score within [-?, maxScore].
      const counted = res.correctCount + res.wrongCount + res.skippedCount;
      if (counted === qs.length) ok('result counts reconcile to the served paper size', `correct+wrong+skipped=${counted}=${qs.length}`);
      else bad('result counts reconcile to the served paper size', `correct+wrong+skipped=${counted} but served=${qs.length}`);

      if (res.maxScore > 0 && res.score <= res.maxScore) ok('result score is bounded by maxScore (> 0)', `score=${res.score} maxScore=${res.maxScore}`);
      else bad('result score is bounded by maxScore (> 0)', `score=${res.score} maxScore=${res.maxScore}`);

      // ── Student: GET the persisted result, confirm it matches submit's response ──
      const got = await api('GET', `/assessments/sessions/${sessionId}/result`, undefined, sTok);
      if (got.status === 200 && got.data?.sessionId === sessionId && got.data.score === res.score && got.data.maxScore === res.maxScore)
        ok('GET result returns the same persisted score', `score=${got.data.score}/${got.data.maxScore} rank=${got.data.rank} cohort=${got.data.cohortSize}`);
      else bad('GET result returns the same persisted score', `status=${got.status} body=${JSON.stringify(got.data)}`);

      // Cohort fields should be populated for a mock-test (not ad-hoc) result.
      if (got.data && got.data.cohortSize !== null && got.data.rank !== null)
        ok('mock-test result carries cohort rank/percentile', `rank=${got.data.rank} percentile=${got.data.percentile} cohortSize=${got.data.cohortSize}`);
      else bad('mock-test result carries cohort rank/percentile', `rank=${got.data?.rank} percentile=${got.data?.percentile} cohortSize=${got.data?.cohortSize}`);

      // Session should now read COMPLETED.
      const sess = await api('GET', `/assessments/sessions/${sessionId}`, undefined, sTok);
      if (sess.status === 200 && sess.data?.status === 'COMPLETED') ok('session transitions to COMPLETED after submit', `status=${sess.data.status} submittedAt=${sess.data.submittedAt}`);
      else bad('session transitions to COMPLETED after submit', `status=${sess.status} sessionStatus=${sess.data?.status}`);
    } else {
      bad('student submits → a scored result is produced', `status=${sub.status} body=${JSON.stringify(sub.data)}`);
    }
  } else if (startRes.status === 400) {
    // Product behaviour for an unfillable pool: a clean 400, not a crash. Record as a finding.
    bad('student starts attempt (blueprint pool fills the paper)', `start returned 400 — pool could not fill: ${JSON.stringify(startRes.data)} (FINDING: blueprint under-supply, not a crash)`);
  } else if (startRes.status === 404) {
    bad('student starts attempt (mock visible to student tenant)', `start returned 404 — mock not visible in student's org scope (FINDING: tenant-scope mismatch academic vs student): ${JSON.stringify(startRes.data)}`);
  } else {
    bad('student starts attempt', `unexpected status=${startRes.status} body=${JSON.stringify(startRes.data)}`);
  }

  finish();
}

function finish() {
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  // Emit a machine-readable block for the harness.
  console.log('STEPS_JSON=' + JSON.stringify(steps));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
