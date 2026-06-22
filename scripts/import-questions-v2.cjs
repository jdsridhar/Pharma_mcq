// Imports pharmacy-questions-v2.xlsx into the platform AND links each question to its
// knowledge/exam/curriculum/track mappings + tags — same logic as the admin Import page, run
// server-side for a one-shot populate. Run from repo root:
//   NODE_PATH="apps/web/node_modules" node scripts/import-questions-v2.cjs [file.xlsx]
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const BASE = process.env.API_BASE || 'http://localhost:4000/api/v1';
const FILE = path.join(__dirname, '..', process.argv[2] || 'pharmacy-questions-v2.xlsx');
const EMAIL = process.env.SU_EMAIL || 'admin@pharmacy-mcq.local';
const PASSWORD = process.env.SU_PASSWORD || 'ChangeMe_Admin1';
const KNOWN = new Set(['SINGLE_CHOICE', 'MULTI_CHOICE', 'ASSERTION_REASON', 'TRUE_FALSE', 'NUMERIC', 'MATCHING']);

async function api(token, method, p, body) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const e = new Error(data?.error?.message || text || `HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return data;
}

function cellText(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text ?? '').join('').trim();
    if (typeof v.text === 'string') return v.text.trim();
    if ('result' in v) return cellText(v.result);
    if (typeof v.hyperlink === 'string') return v.hyperlink.trim();
  }
  return String(v).trim();
}
const splitList = (s) => (s ?? '').split(/[;,]/).map((x) => x.trim()).filter(Boolean);
function normRef(ref) {
  const i = ref.indexOf('>');
  if (i === -1) return ref.trim().toUpperCase();
  return `${ref.slice(0, i).trim().toUpperCase()}>${ref.slice(i + 1).trim().toUpperCase()}`;
}
function parentCodes(refs) {
  const out = new Set();
  for (const r of refs) {
    const i = r.indexOf('>');
    const p = (i === -1 ? r : r.slice(0, i)).trim().toUpperCase();
    if (p) out.add(p);
  }
  return out;
}
function flatten(nodes, out = []) {
  for (const n of nodes) {
    out.push(n);
    if (n.children?.length) flatten(n.children, out);
  }
  return out;
}
function mediaFrom(rec) {
  const url = (rec.mediaurl ?? '').trim();
  if (!url) return null;
  const m = { mediaType: (rec.mediatype || 'IMAGE').toUpperCase(), url, displayOrder: 0 };
  if (rec.mediaalttext) m.altText = rec.mediaalttext;
  return m;
}
function rowToPayload(rec) {
  const type = (rec.questiontype ?? '').toUpperCase();
  const base = {
    questionCode: (rec.questioncode ?? '').toUpperCase(),
    questionType: type,
    authorDifficulty: (rec.difficulty || 'MEDIUM').toUpperCase(),
    language: (rec.language || 'en').toLowerCase(),
    questionText: rec.questiontext ?? '',
  };
  if (rec.explanation) base.explanation = rec.explanation;
  const media = mediaFrom(rec);
  if (media) base.media = [media];
  if (type === 'TRUE_FALSE') return { ...base, answerSpec: { type, answer: /^true$/i.test(rec.truefalseanswer ?? '') } };
  if (type === 'NUMERIC')
    return { ...base, answerSpec: { type, value: Number(rec.numericvalue), tolerance: Number(rec.numerictolerance || '0') } };
  if (type === 'MATCHING') {
    const pairs = splitList(rec.matchingpairs)
      .map((p) => {
        const i = p.indexOf('=');
        return i === -1 ? null : { left: p.slice(0, i).trim(), right: p.slice(i + 1).trim() };
      })
      .filter((p) => p && p.left && p.right);
    return { ...base, answerSpec: { type, pairs } };
  }
  const correct = new Set((rec.correct ?? '').toUpperCase().split(/[\s,;]+/).filter(Boolean));
  const options = ['A', 'B', 'C', 'D', 'E', 'F']
    .map((l) => ({ l, text: (rec['option' + l.toLowerCase()] ?? '').trim() }))
    .filter((o) => o.text)
    .map((o) => ({ text: o.text, isCorrect: correct.has(o.l) }));
  return { ...base, answerSpec: { type }, options };
}

async function fetchKnowledgeMap(token) {
  const map = new Map();
  for (let page = 1; page <= 200; page++) {
    const res = await api(token, 'GET', `/knowledge/nodes?page=${page}&pageSize=100`);
    for (const n of res.items) map.set(n.code.toUpperCase(), n.id);
    if (res.items.length < 100 || page * 100 >= (res.meta?.total ?? 0)) break;
  }
  return map;
}
async function fetchExamMap(token) {
  const res = await api(token, 'GET', '/exams?pageSize=100');
  return new Map(res.items.map((e) => [e.code.toUpperCase(), e.id]));
}
async function fetchCurriculumNodeMap(token, codes) {
  const map = new Map();
  if (!codes.size) return map;
  const list = await api(token, 'GET', '/curriculums?pageSize=100');
  const byCode = new Map(list.items.map((c) => [c.code.toUpperCase(), c.id]));
  for (const cc of codes) {
    const cid = byCode.get(cc);
    if (!cid) continue;
    for (const node of flatten(await api(token, 'GET', `/curriculums/${cid}/tree`))) {
      if (node.code) map.set(`${cc}>${node.code.toUpperCase()}`, node.id);
      map.set(`${cc}>${node.name.toUpperCase()}`, node.id);
    }
  }
  return map;
}
async function fetchTrackModuleMap(token, codes) {
  const map = new Map();
  if (!codes.size) return map;
  const list = await api(token, 'GET', '/tracks?pageSize=100');
  const byCode = new Map(list.items.map((t) => [t.code.toUpperCase(), t.id]));
  for (const tc of codes) {
    const tid = byCode.get(tc);
    if (!tid) continue;
    const detail = await api(token, 'GET', `/tracks/${tid}`);
    for (const m of detail.modules) map.set(`${tc}>${m.name.toUpperCase()}`, m.id);
  }
  return map;
}

async function main() {
  const token = (await api(null, 'POST', '/auth/login', { email: EMAIL, password: PASSWORD })).accessToken;
  console.log(`Logged in as ${EMAIL}`);

  // Ensure the one extra knowledge code the bank references besides the taxonomy.
  try { await api(token, 'POST', '/knowledge/nodes', { code: 'DEMO-PHARMA', name: 'Demo Pharma', type: 'SUBJECT' }); } catch (e) { if (e.status !== 409) throw e; }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(fs.readFileSync(FILE));
  const records = [];
  wb.eachSheet((ws) => {
    const type = ws.name.trim().toUpperCase();
    if (!KNOWN.has(type)) return;
    const headers = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (c, col) => (headers[col] = cellText(c.value).toLowerCase()));
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const rec = { questiontype: type };
      let any = false;
      row.eachCell({ includeEmpty: true }, (c, col) => { const h = headers[col]; if (!h) return; const v = cellText(c.value); if (v) any = true; rec[h] = v; });
      if (any) records.push(rec);
    }
  });
  console.log(`Read ${records.length} questions from ${path.basename(FILE)}`);

  const knowledgeMap = records.some((r) => splitList(r.knowledgecodes).length) ? await fetchKnowledgeMap(token) : new Map();
  const examMap = records.some((r) => splitList(r.examcodes).length) ? await fetchExamMap(token) : new Map();
  const currCodes = new Set(); const trackCodes = new Set();
  for (const r of records) { parentCodes(splitList(r.curriculumnodes)).forEach((c) => currCodes.add(c)); parentCodes(splitList(r.trackmodules)).forEach((c) => trackCodes.add(c)); }
  const curriculumNodeMap = await fetchCurriculumNodeMap(token, currCodes);
  const trackModuleMap = await fetchTrackModuleMap(token, trackCodes);

  let created = 0, skipped = 0, failed = 0;
  const mc = { K: 0, E: 0, C: 0, M: 0, T: 0 };
  const unknown = new Set();
  const seen = new Set();
  for (const rec of records) {
    const code = (rec.questioncode || '').toUpperCase();
    if (seen.has(code)) { skipped++; continue; }
    try {
      const q = await api(token, 'POST', '/questions', rowToPayload(rec));
      seen.add(code); created++;
      const kIds = splitList(rec.knowledgecodes).map((c) => { const id = knowledgeMap.get(c.toUpperCase()); if (!id) unknown.add('K:' + c); return id; }).filter(Boolean);
      if (kIds.length) { await api(token, 'PUT', `/questions/${q.id}/mappings/knowledge`, { items: kIds.map((id) => ({ knowledgeNodeId: id })) }); mc.K += kIds.length; }
      const eIds = splitList(rec.examcodes).map((c) => { const id = examMap.get(c.toUpperCase()); if (!id) unknown.add('E:' + c); return id; }).filter(Boolean);
      if (eIds.length) { await api(token, 'PUT', `/questions/${q.id}/mappings/exams`, { items: eIds.map((id) => ({ examProfileId: id })) }); mc.E += eIds.length; }
      const cIds = splitList(rec.curriculumnodes).map((r) => { const id = curriculumNodeMap.get(normRef(r)); if (!id) unknown.add('C:' + r); return id; }).filter(Boolean);
      if (cIds.length) { await api(token, 'PUT', `/questions/${q.id}/mappings/curriculum`, { items: cIds.map((id) => ({ curriculumNodeId: id })) }); mc.C += cIds.length; }
      const mIds = splitList(rec.trackmodules).map((r) => { const id = trackModuleMap.get(normRef(r)); if (!id) unknown.add('M:' + r); return id; }).filter(Boolean);
      if (mIds.length) { await api(token, 'PUT', `/questions/${q.id}/mappings/tracks`, { items: mIds.map((id) => ({ trackModuleId: id })) }); mc.M += mIds.length; }
      const tags = splitList(rec.tags);
      if (tags.length) { await api(token, 'PUT', `/questions/${q.id}/mappings/tags`, { tags }); mc.T += tags.length; }
    } catch (e) {
      if (e.status === 409) skipped++;
      else { failed++; console.log(`  FAIL ${code}: ${e.message}`); }
    }
  }
  console.log(`\nDone: ${created} created, ${skipped} skipped, ${failed} failed.`);
  console.log(`Mappings applied -> knowledge:${mc.K} exam:${mc.E} curriculum:${mc.C} track:${mc.M} tags:${mc.T}`);
  if (unknown.size) console.log(`Unknown refs: ${[...unknown].join(', ')}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
