// Validates the generated workbook by parsing it EXACTLY like the import page and checking every
// row against the real createQuestionSchema. Run from repo root:
//   NODE_PATH="apps/web/node_modules" node scripts/validate-question-workbook.cjs
const ExcelJS = require('exceljs');
const path = require('path');
const { createQuestionSchema } = require('@pharmacy/contracts');

const KNOWN = new Set(['SINGLE_CHOICE', 'MULTI_CHOICE', 'ASSERTION_REASON', 'TRUE_FALSE', 'NUMERIC', 'MATCHING']);

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
  if (type === 'NUMERIC') return { ...base, answerSpec: { type, value: Number(rec.numericvalue), tolerance: Number(rec.numerictolerance || '0') } };
  if (type === 'MATCHING') {
    const pairs = splitList(rec.matchingpairs).map((p) => { const i = p.indexOf('='); return i === -1 ? null : { left: p.slice(0, i).trim(), right: p.slice(i + 1).trim() }; }).filter((p) => p && p.left && p.right);
    return { ...base, answerSpec: { type, pairs } };
  }
  if (type === 'SINGLE_CHOICE' || type === 'MULTI_CHOICE' || type === 'ASSERTION_REASON') {
    const correct = new Set((rec.correct ?? '').toUpperCase().split(/[\s,;]+/).filter(Boolean));
    const options = ['A', 'B', 'C', 'D', 'E', 'F']
      .map((l) => ({ l, text: (rec['option' + l.toLowerCase()] ?? '').trim() }))
      .filter((o) => o.text)
      .map((o) => ({ text: o.text, isCorrect: correct.has(o.l) }));
    return { ...base, answerSpec: { type }, options };
  }
  throw new Error(`Unsupported type ${type}`);
}

async function main() {
  const file = path.join(__dirname, '..', process.argv[2] || 'pharmacy-questions-import.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(require('fs').readFileSync(file));
  let total = 0;
  let ok = 0;
  const errors = [];
  const codes = new Set();
  let dupCodes = 0;
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
      if (!any) continue;
      total++;
      if (codes.has(rec.questioncode)) dupCodes++;
      codes.add(rec.questioncode);
      const parsed = createQuestionSchema.safeParse(rowToPayload(rec));
      if (parsed.success) ok++;
      else { const is = parsed.error.issues[0]; errors.push(`${type} ${rec.questioncode}: ${is.path.join('.')} - ${is.message}`); }
    }
  });
  console.log(`Validated ${total} rows: ${ok} OK, ${errors.length} invalid. Unique codes: ${codes.size} (dups: ${dupCodes}).`);
  if (errors.length) { console.log('--- first errors ---'); errors.slice(0, 20).forEach((e) => console.log('  ' + e)); process.exit(1); }
  console.log('All rows pass createQuestionSchema.');
}
main().catch((e) => { console.error(e); process.exit(1); });
