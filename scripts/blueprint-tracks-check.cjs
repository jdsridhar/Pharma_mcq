// Verifies the weight-driven blueprint model + knowledge-driven tracks, end-to-end.
//   A) Blueprint: # Qs is DERIVED from weight × total; weightTotal/isReady reported; the plan
//      endpoint surfaces per-section supply + warnings; weight budget still guards > 100%.
//   B) Tracks: a module's question pool is driven by the module's KNOWLEDGE mapping (not the old
//      orphaned QuestionTrackMapping) — an empty module yields 0, mapping knowledge makes it match.
// Run:  node scripts/blueprint-tracks-check.cjs
const BASE = 'http://localhost:4000/api/v1';
const SUPER = { email: 'admin@pharmacy-mcq.local', password: 'ChangeMe_Admin1' };
const stamp = Date.now().toString(36);

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
  console.log('=== blueprint + tracks check ===');

  // ─────────────────────────── A) Weight-driven blueprint ───────────────────────────
  const exam = (await api('POST', '/exams', { code: `BT-${stamp.toUpperCase()}`, name: `BT Exam ${stamp}`, status: 'DRAFT' }, tok)).data;
  const bp = (await api('POST', `/exams/${exam.id}/blueprints`, { name: 'Full blueprint', totalQuestions: 50, isActive: true }, tok)).data;

  // Empty blueprint → not ready, plan warns about no sections.
  let plan = (await api('GET', `/exams/${exam.id}/blueprints/${bp.id}/plan`, undefined, tok)).data;
  if (plan.totalQuestions === 50 && plan.isReady === false && plan.warnings.some((w) => /no sections/i.test(w)))
    ok('empty blueprint: plan not ready + "no sections" warning');
  else bad(`empty plan unexpected: ${JSON.stringify(plan)}`);

  // Add one 50% section → derived count = 25; weightTotal 50; not ready.
  await api('POST', `/exams/${exam.id}/blueprints/${bp.id}/items`, { label: 'Section A', weightPercent: 50 }, tok);
  let detail = (await api('GET', `/exams/${exam.id}/blueprints/${bp.id}`, undefined, tok)).data;
  if (detail.items[0]?.questionCount === 25 && detail.weightTotal === 50 && detail.isReady === false)
    ok('one 50% section → derived # Qs = 25, weightTotal 50%, not ready');
  else bad(`after 1 item: ${JSON.stringify({ q: detail.items[0]?.questionCount, wt: detail.weightTotal, ready: detail.isReady })}`);

  // Add second 50% section → weights complete (100%), derived 25/25.
  await api('POST', `/exams/${exam.id}/blueprints/${bp.id}/items`, { label: 'Section B', weightPercent: 50 }, tok);
  detail = (await api('GET', `/exams/${exam.id}/blueprints/${bp.id}`, undefined, tok)).data;
  const counts = detail.items.map((i) => i.questionCount).sort();
  if (JSON.stringify(counts) === JSON.stringify([25, 25]) && detail.weightTotal === 100 && detail.isReady === true)
    ok('two 50% sections → derived 25/25, weightTotal 100%, weights ready');
  else bad(`after 2 items: counts=${JSON.stringify(counts)} wt=${detail.weightTotal} ready=${detail.isReady}`);

  // Plan now allocates the full 50; pool is empty for this fresh exam → under-supply warning.
  plan = (await api('GET', `/exams/${exam.id}/blueprints/${bp.id}/plan`, undefined, tok)).data;
  if (plan.plannedCount === 50 && plan.sections.every((s) => s.targetCount === 25))
    ok(`plan allocates 50 across sections (25 each), sourceable ${plan.sourceableCount}`);
  else bad(`plan after 100%: planned=${plan.plannedCount} sections=${JSON.stringify(plan.sections.map((s) => s.targetCount))}`);

  // Weight budget still guards: a third section pushing over 100% is rejected.
  const over = await api('POST', `/exams/${exam.id}/blueprints/${bp.id}/items`, { label: 'Over', weightPercent: 10 }, tok);
  if (over.status === 400) ok('adding weight beyond 100% rejected (400)');
  else bad(`over-budget item expected 400, got ${over.status}`);

  // ─────────────────────────── B) Knowledge-driven tracks ───────────────────────────
  // Find a knowledge node that actually has published questions.
  const nodes = (await api('GET', '/knowledge/nodes?pageSize=100', undefined, tok)).data.items;
  let target = null;
  for (const n of nodes) {
    const a = (await api('GET', `/practice/sessions/available?knowledgeNodeId=${n.id}`, undefined, tok)).data;
    if (a && a.available > 0) { target = { id: n.id, name: n.name, available: a.available }; break; }
  }
  if (target) ok(`found knowledge node "${target.name}" with ${target.available} published question(s)`);
  else return bad('no knowledge node with published questions found — cannot verify track mapping');

  const track = (await api('POST', '/tracks', { code: `TRK${stamp.toUpperCase()}`, name: `BT Track ${stamp}` }, tok)).data;
  const mod = (await api('POST', `/tracks/${track.id}/modules`, { name: 'Module 1' }, tok)).data;

  // Empty module → knowledge-driven pool is empty.
  const before = (await api('GET', `/practice/sessions/available?trackModuleId=${mod.id}`, undefined, tok)).data;
  if (before.available === 0) ok('unmapped module → 0 questions available (knowledge-driven)');
  else bad(`unmapped module expected 0, got ${before.available}`);

  // Map the knowledge node to the module → module now surfaces that node's questions.
  await api('PUT', `/tracks/${track.id}/modules/${mod.id}/knowledge`, { knowledgeNodeIds: [target.id] }, tok);
  const after = (await api('GET', `/practice/sessions/available?trackModuleId=${mod.id}`, undefined, tok)).data;
  if (after.available === target.available)
    ok(`mapped module → ${after.available} questions (matches the node's pool — knowledge drives questions)`);
  else bad(`mapped module expected ${target.available}, got ${after.available}`);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
