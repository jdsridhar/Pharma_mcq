// Verifies the multi-sheet Excel logic used by the import page (run from apps/web where exceljs lives):
//   node ../../scripts/mt-xlsx-roundtrip.cjs
// Builds a workbook (READ_ME + type sheets + a junk sheet), re-reads it, and asserts that only
// known type sheets are collected (sheet name → questionType) and READ_ME / renamed sheets are skipped.
const ExcelJS = require('exceljs');
const KNOWN = new Set(['SINGLE_CHOICE', 'MULTI_CHOICE', 'ASSERTION_REASON', 'TRUE_FALSE', 'NUMERIC', 'MATCHING']);

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('READ_ME').addRow(['instructions']);

  const sc = wb.addWorksheet('SINGLE_CHOICE');
  sc.columns = ['questionCode', 'questionText', 'optionA', 'optionB', 'correct', 'knowledgeCodes'].map((h) => ({ header: h }));
  sc.addRow(['PHA-1', 'Which vitamin is fat-soluble?', 'Vitamin A', 'Vitamin C', 'A', 'VITAMINS']);

  const tf = wb.addWorksheet('TRUE_FALSE');
  tf.columns = ['questionCode', 'questionText', 'trueFalseAnswer'].map((h) => ({ header: h }));
  tf.addRow(['PHA-2', 'Paracetamol is an NSAID.', 'false']);

  const mt = wb.addWorksheet('MATCHING');
  mt.columns = ['questionCode', 'questionText', 'matchingPairs'].map((h) => ({ header: h }));
  mt.addRow(['PHA-3', 'Match drug to class.', 'Atenolol=Beta blocker;Omeprazole=PPI']);

  wb.addWorksheet('NOTES').addRow(['a deleted/renamed sheet that must be skipped']);

  const buf = await wb.xlsx.writeBuffer();

  // ── read back exactly like the import page ──
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(buf);
  const records = [];
  const perSheet = [];
  wb2.eachSheet((ws) => {
    const type = ws.name.trim().toUpperCase();
    if (!KNOWN.has(type)) return;
    const headers = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (c, col) => (headers[col] = String(c.value ?? '').trim().toLowerCase()));
    let count = 0;
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const rec = { questiontype: type };
      let any = false;
      row.eachCell({ includeEmpty: true }, (c, col) => {
        const h = headers[col];
        if (!h) return;
        const v = String(c.value ?? '').trim();
        if (v) any = true;
        rec[h] = v;
      });
      if (any) {
        records.push(rec);
        count++;
      }
    }
    if (count) perSheet.push(`${type}(${count})`);
  });

  const checks = [
    ['skips READ_ME + NOTES; reads 3 type sheets', perSheet.length === 3],
    ['SINGLE_CHOICE row typed + fields', !!records.find((r) => r.questioncode === 'PHA-1' && r.questiontype === 'SINGLE_CHOICE' && r.correct === 'A' && r.knowledgecodes === 'VITAMINS')],
    ['TRUE_FALSE row typed', !!records.find((r) => r.questioncode === 'PHA-2' && r.questiontype === 'TRUE_FALSE' && r.truefalseanswer === 'false')],
    ['MATCHING row typed', !!records.find((r) => r.questioncode === 'PHA-3' && r.questiontype === 'MATCHING' && r.matchingpairs.includes('Atenolol=Beta blocker'))],
    ['no junk rows leaked', records.length === 3],
  ];
  let pass = 0;
  let fail = 0;
  for (const [name, cond] of checks) {
    console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
    cond ? pass++ : fail++;
  }
  console.log(`\nxlsx round-trip: ${pass} passed, ${fail} failed (sheets read: ${perSheet.join(', ')})`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
