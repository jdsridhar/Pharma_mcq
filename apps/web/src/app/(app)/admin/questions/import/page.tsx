'use client';

import { createQuestionSchema } from '@pharmacy/contracts';
import Link from 'next/link';
import { type ChangeEvent, useState } from 'react';
import type { CurriculumNodeDto, CurriculumTreeNodeDto } from '@pharmacy/contracts';
import { Alert, Badge, Button, Card, PageHeader } from '@/components/ui';
import { ApiClientError } from '@/lib/api-client';
import { curriculumApi, examApi, knowledgeApi, questionApi, trackApi } from '@/lib/api/endpoints';

type Rec = Record<string, string>;

// ── Per-type sheet definitions (the Excel workbook has one sheet per question type) ─────────────
// Mapping columns (knowledge/exam) reference rows by their unique CODE; tags are free text.
// `;` separates multiple values (e.g. correct=A;B, examCodes=GPAT;NEET, matchingPairs=L=R;L2=R2).
const COMMON_HEAD = ['questionCode', 'difficulty', 'language', 'questionText', 'explanation'];
// Mapping columns: knowledge/exam by node/profile CODE; curriculum/track by "PARENT_CODE>CHILD"
// (curriculumCode>nodeCode|nodeName, trackCode>moduleName); tags free text. `;` separates values.
const COMMON_TAIL = [
  'knowledgeCodes',
  'examCodes',
  'curriculumNodes',
  'trackModules',
  'tags',
  'mediaType',
  'mediaUrl',
  'mediaAltText',
];
const CHOICE_COLS = ['optionA', 'optionB', 'optionC', 'optionD', 'optionE', 'optionF', 'correct'];

interface SheetDef {
  type: string;
  columns: string[];
  samples: Rec[];
}

const SHEETS: SheetDef[] = [
  {
    type: 'SINGLE_CHOICE',
    columns: [...COMMON_HEAD, ...CHOICE_COLS, ...COMMON_TAIL],
    samples: [
      {
        questionCode: 'PHA-101',
        difficulty: 'EASY',
        questionText: 'Which vitamin is fat-soluble?',
        explanation: 'Vitamin A is fat-soluble.',
        optionA: 'Vitamin A',
        optionB: 'Vitamin C',
        optionC: 'Vitamin B12',
        optionD: 'Folic acid',
        correct: 'A',
        knowledgeCodes: 'VITAMINS',
        examCodes: 'GPAT',
        curriculumNodes: 'GPAT-SYLLABUS>Pharmacology',
        trackModules: 'GPAT-TRACK>Module 1',
        tags: 'vitamins;nutrition',
      },
    ],
  },
  {
    type: 'MULTI_CHOICE',
    columns: [...COMMON_HEAD, ...CHOICE_COLS, ...COMMON_TAIL],
    samples: [
      {
        questionCode: 'PHA-102',
        difficulty: 'MEDIUM',
        questionText: 'Select the beta-blockers.',
        optionA: 'Atenolol',
        optionB: 'Metoprolol',
        optionC: 'Aspirin',
        optionD: 'Propranolol',
        correct: 'A;B;D',
        knowledgeCodes: 'CARDIO.BETA_BLOCKERS',
        examCodes: 'GPAT;NEET',
        tags: 'beta-blockers',
      },
    ],
  },
  {
    type: 'ASSERTION_REASON',
    columns: [...COMMON_HEAD, ...CHOICE_COLS, ...COMMON_TAIL],
    samples: [
      {
        questionCode: 'PHA-106',
        difficulty: 'HARD',
        questionText: 'Assertion: Aspirin is used post-MI. Reason: it irreversibly inhibits COX-1.',
        optionA: 'Both true; reason explains assertion',
        optionB: "Both true; reason doesn't explain",
        optionC: 'Assertion true, reason false',
        optionD: 'Assertion false, reason true',
        correct: 'A',
        knowledgeCodes: 'CARDIO',
        examCodes: 'GPAT',
      },
    ],
  },
  {
    type: 'TRUE_FALSE',
    columns: [...COMMON_HEAD, 'trueFalseAnswer', ...COMMON_TAIL],
    samples: [
      {
        questionCode: 'PHA-103',
        difficulty: 'EASY',
        questionText: 'Paracetamol is an NSAID.',
        explanation: 'It is an analgesic but not an NSAID.',
        trueFalseAnswer: 'false',
        knowledgeCodes: 'ANALGESICS',
      },
    ],
  },
  {
    type: 'NUMERIC',
    columns: [...COMMON_HEAD, 'numericValue', 'numericTolerance', ...COMMON_TAIL],
    samples: [
      {
        questionCode: 'PHA-104',
        difficulty: 'MEDIUM',
        questionText: 'Normal adult resting heart-rate lower bound (bpm)?',
        numericValue: '60',
        numericTolerance: '5',
        knowledgeCodes: 'VITALS',
      },
    ],
  },
  {
    type: 'MATCHING',
    columns: [...COMMON_HEAD, 'matchingPairs', ...COMMON_TAIL],
    samples: [
      {
        questionCode: 'PHA-105',
        difficulty: 'MEDIUM',
        questionText: 'Match each drug to its class.',
        matchingPairs: 'Atenolol=Beta blocker;Omeprazole=PPI;Loratadine=Antihistamine',
        knowledgeCodes: 'PHARMACOLOGY',
        examCodes: 'GPAT',
        tags: 'drug-classes',
      },
    ],
  },
];

const KNOWN_TYPES = new Set(SHEETS.map((s) => s.type));
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const READ_ME = [
  'One sheet per question type — fill rows under each. Delete any sheet/type you are not using; missing or renamed sheets are simply skipped on upload.',
  'Do NOT rename the type sheets — the sheet name selects the question type.',
  'questionCode is unique per institution (your org). Duplicate codes within the file are skipped; codes already used in your org are rejected.',
  'difficulty: EASY | MEDIUM | HARD (default MEDIUM). language defaults to "en".',
  'Choice types: fill optionA..optionF and put the correct LETTER(s) in "correct" (e.g. A, or A;C). SINGLE_CHOICE / ASSERTION_REASON = exactly one; MULTI_CHOICE = one or more.',
  'TRUE_FALSE: trueFalseAnswer = true|false.  NUMERIC: numericValue (+ numericTolerance).  MATCHING: matchingPairs = "Left=Right;Left2=Right2".',
  'knowledgeCodes / examCodes: semicolon-separated codes that already exist in the platform (e.g. PHARMA.ANTIBIOTICS). tags: free text, semicolon-separated.',
  'curriculumNodes: semicolon-separated "CURRICULUM_CODE>NODE_CODE_OR_NAME" (e.g. GPAT-SYLLABUS>Pharmacology). trackModules: "TRACK_CODE>MODULE_NAME" (e.g. GPAT-TRACK>Module 1). Unknown references are reported but do not fail the row.',
  'media (optional): mediaUrl with mediaType = IMAGE | AUDIO | VIDEO | PDF (defaults to IMAGE) and optional mediaAltText.',
  'Every imported question is created as DRAFT, owned by your organization.',
];

type RowState = 'ok' | 'skip' | 'error';
interface RowResult {
  code: string;
  state: RowState;
  message: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────────────────────
/** Coerce any ExcelJS cell value (rich text, hyperlink, formula result, number, …) to trimmed text. */
function cellText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return (o.richText as Array<{ text?: string }>).map((r) => r.text ?? '').join('').trim();
    }
    if (typeof o.text === 'string') return o.text.trim();
    if ('result' in o) return cellText(o.result);
    if (typeof o.hyperlink === 'string') return o.hyperlink.trim();
  }
  return String(v).trim();
}

/** Split a `;`/`,`-separated cell into trimmed, non-empty values. */
function splitList(cell: string | undefined): string[] {
  return (cell ?? '')
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Minimal RFC-4180-ish CSV parser (advanced single-sheet fallback). */
function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Optional single media attachment (mediaUrl required; type defaults to IMAGE). */
function mediaFrom(rec: Rec): Record<string, unknown> | null {
  const url = (rec.mediaurl ?? '').trim();
  if (!url) return null;
  const media: Record<string, unknown> = {
    mediaType: (rec.mediatype || 'IMAGE').toUpperCase(),
    url,
    displayOrder: 0,
  };
  if (rec.mediaalttext) media.altText = rec.mediaalttext;
  return media;
}

function rowToPayload(rec: Rec): Record<string, unknown> {
  const type = (rec.questiontype ?? '').toUpperCase();
  const base: Record<string, unknown> = {
    questionCode: (rec.questioncode ?? '').toUpperCase(),
    questionType: type,
    authorDifficulty: (rec.difficulty || 'MEDIUM').toUpperCase(),
    language: (rec.language || 'en').toLowerCase(),
    questionText: rec.questiontext ?? '',
  };
  if (rec.explanation) base.explanation = rec.explanation;
  const media = mediaFrom(rec);
  if (media) base.media = [media];

  if (type === 'TRUE_FALSE') {
    return { ...base, answerSpec: { type, answer: /^true$/i.test(rec.truefalseanswer ?? '') } };
  }
  if (type === 'NUMERIC') {
    return {
      ...base,
      answerSpec: { type, value: Number(rec.numericvalue), tolerance: Number(rec.numerictolerance || '0') },
    };
  }
  if (type === 'MATCHING') {
    const pairs = splitList(rec.matchingpairs)
      .map((p) => {
        const i = p.indexOf('=');
        return i === -1 ? null : { left: p.slice(0, i).trim(), right: p.slice(i + 1).trim() };
      })
      .filter((p): p is { left: string; right: string } => !!p && !!p.left && !!p.right);
    return { ...base, answerSpec: { type, pairs } };
  }
  if (type === 'SINGLE_CHOICE' || type === 'MULTI_CHOICE' || type === 'ASSERTION_REASON') {
    const correct = new Set(
      (rec.correct ?? '')
        .toUpperCase()
        .split(/[\s,;]+/)
        .filter(Boolean),
    );
    const options = ['A', 'B', 'C', 'D', 'E', 'F']
      .map((letter) => ({ letter, text: (rec['option' + letter.toLowerCase()] ?? '').trim() }))
      .filter((o) => o.text)
      .map((o) => ({ text: o.text, isCorrect: correct.has(o.letter) }));
    return { ...base, answerSpec: { type }, options };
  }
  throw new Error(`Unsupported questionType "${type || '(blank)'}"`);
}

async function fetchKnowledgeMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const pageSize = 100; // list query caps pageSize at 100
  for (let page = 1; page <= 200; page++) {
    const res = await knowledgeApi.list({ page, pageSize });
    for (const n of res.items) map.set(n.code.toUpperCase(), n.id);
    if (res.items.length < pageSize || page * pageSize >= (res.meta?.total ?? 0)) break;
  }
  return map;
}

async function fetchExamMap(): Promise<Map<string, string>> {
  const res = await examApi.list();
  const map = new Map<string, string>();
  for (const e of res.items) map.set(e.code.toUpperCase(), e.id);
  return map;
}

/** Normalize a "PARENT>CHILD" reference to "PARENT>CHILD" upper-cased + trimmed. */
function normRef(ref: string): string {
  const i = ref.indexOf('>');
  if (i === -1) return ref.trim().toUpperCase();
  return `${ref.slice(0, i).trim().toUpperCase()}>${ref.slice(i + 1).trim().toUpperCase()}`;
}

function parentCodes(refs: string[]): Set<string> {
  const out = new Set<string>();
  for (const r of refs) {
    const i = r.indexOf('>');
    const p = (i === -1 ? r : r.slice(0, i)).trim().toUpperCase();
    if (p) out.add(p);
  }
  return out;
}

function flattenTree(nodes: CurriculumTreeNodeDto[], out: CurriculumNodeDto[] = []): CurriculumNodeDto[] {
  for (const n of nodes) {
    out.push(n);
    if (n.children?.length) flattenTree(n.children, out);
  }
  return out;
}

/** Map "CURRICULUMCODE>NODECODE|NODENAME" → curriculumNodeId for the referenced curricula. */
async function fetchCurriculumNodeMap(currCodes: Set<string>): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (currCodes.size === 0) return map;
  const list = await curriculumApi.list();
  const byCode = new Map(list.items.map((c) => [c.code.toUpperCase(), c.id]));
  for (const cc of currCodes) {
    const cid = byCode.get(cc);
    if (!cid) continue;
    const tree = await curriculumApi.tree(cid);
    for (const node of flattenTree(tree)) {
      if (node.code) map.set(`${cc}>${node.code.toUpperCase()}`, node.id);
      map.set(`${cc}>${node.name.toUpperCase()}`, node.id);
    }
  }
  return map;
}

/** Map "TRACKCODE>MODULENAME" → trackModuleId for the referenced tracks. */
async function fetchTrackModuleMap(trackCodes: Set<string>): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (trackCodes.size === 0) return map;
  const list = await trackApi.list();
  const byCode = new Map(list.items.map((t) => [t.code.toUpperCase(), t.id]));
  for (const tc of trackCodes) {
    const tid = byCode.get(tc);
    if (!tid) continue;
    const detail = await trackApi.get(tid);
    for (const m of detail.modules) map.set(`${tc}>${m.name.toUpperCase()}`, m.id);
  }
  return map;
}

export default function ImportQuestionsPage() {
  const [pending, setPending] = useState<{ records: Rec[]; info: string } | null>(null);
  const [csvText, setCsvText] = useState('');
  const [loadInfo, setLoadInfo] = useState('');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<RowResult[]>([]);

  const downloadTemplate = async (): Promise<void> => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Pharmacy MCQ Platform';

    const info = wb.addWorksheet('READ_ME');
    info.columns = [{ header: 'How to use this template', key: 'a', width: 110 }];
    info.getRow(1).font = { bold: true };
    READ_ME.forEach((line) => info.addRow([line]));
    info.getColumn(1).alignment = { wrapText: true };

    for (const def of SHEETS) {
      const ws = wb.addWorksheet(def.type);
      ws.columns = def.columns.map((c) => ({ header: c, key: c, width: Math.min(42, Math.max(12, c.length + 2)) }));
      ws.getRow(1).font = { bold: true };
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      for (const s of def.samples) ws.addRow(def.columns.map((c) => s[c] ?? ''));
    }

    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: XLSX_MIME }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'questions-template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const collectFromXlsx = async (file: File): Promise<{ records: Rec[]; info: string }> => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const records: Rec[] = [];
    const perSheet: string[] = [];
    wb.eachSheet((ws) => {
      const type = ws.name.trim().toUpperCase();
      if (!KNOWN_TYPES.has(type)) return; // skip READ_ME, deleted or renamed sheets
      const headers: string[] = [];
      ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
        headers[col] = cellText(cell.value).toLowerCase();
      });
      let count = 0;
      for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const rec: Rec = { questiontype: type };
        let any = false;
        row.eachCell({ includeEmpty: true }, (cell, col) => {
          const h = headers[col];
          if (!h) return;
          const val = cellText(cell.value);
          if (val) any = true;
          rec[h] = val;
        });
        if (any) {
          records.push(rec);
          count++;
        }
      }
      if (count) perSheet.push(`${type}(${count})`);
    });
    return {
      records,
      info: perSheet.length
        ? `Loaded ${records.length} row(s) from ${perSheet.length} sheet(s): ${perSheet.join(', ')}`
        : 'No question-type sheets with data were found in this file',
    };
  };

  const collectFromCsv = (text: string): { records: Rec[]; info: string } => {
    const rows = parseCsv(text.trim());
    if (rows.length < 2) return { records: [], info: 'No CSV data rows found' };
    const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
    const records: Rec[] = [];
    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r] ?? [];
      if (cells.every((c) => !c.trim())) continue;
      const rec: Rec = {};
      header.forEach((h, i) => {
        rec[h] = (cells[i] ?? '').trim();
      });
      records.push(rec);
    }
    return { records, info: `Loaded ${records.length} CSV row(s) (needs a questionType column)` };
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResults([]);
    setLoadInfo('Reading file…');
    try {
      const res = /\.xlsx$/i.test(file.name) ? await collectFromXlsx(file) : collectFromCsv(await file.text());
      setPending(res);
      setCsvText('');
      setLoadInfo(res.info);
    } catch (err) {
      setPending(null);
      setLoadInfo(`Could not read file: ${(err as Error).message}`);
    }
    e.target.value = '';
  };

  const run = async (): Promise<void> => {
    setRunning(true);
    setResults([]);
    const records = pending?.records ?? collectFromCsv(csvText).records;
    if (records.length === 0) {
      setResults([{ code: '—', state: 'error', message: 'Nothing to import — upload a file or paste CSV first' }]);
      setRunning(false);
      return;
    }

    // Resolve mapping references → ids once (only when referenced).
    let knowledgeMap = new Map<string, string>();
    let examMap = new Map<string, string>();
    let curriculumNodeMap = new Map<string, string>();
    let trackModuleMap = new Map<string, string>();
    try {
      if (records.some((r) => splitList(r.knowledgecodes).length)) knowledgeMap = await fetchKnowledgeMap();
      if (records.some((r) => splitList(r.examcodes).length)) examMap = await fetchExamMap();
      const currCodes = new Set<string>();
      const trackCodes = new Set<string>();
      for (const r of records) {
        parentCodes(splitList(r.curriculumnodes)).forEach((c) => currCodes.add(c));
        parentCodes(splitList(r.trackmodules)).forEach((c) => trackCodes.add(c));
      }
      if (currCodes.size) curriculumNodeMap = await fetchCurriculumNodeMap(currCodes);
      if (trackCodes.size) trackModuleMap = await fetchTrackModuleMap(trackCodes);
    } catch {
      // Mapping lookups are best-effort; question creation still proceeds.
    }

    const seen = new Set<string>();
    const out: RowResult[] = [];
    for (let i = 0; i < records.length; i++) {
      const rec = records[i] ?? {};
      const code = (rec.questioncode || '').toUpperCase() || `row ${i + 1}`;
      if (seen.has(code)) {
        out.push({ code, state: 'skip', message: 'duplicate questionCode in file — skipped' });
        setResults([...out]);
        continue;
      }
      try {
        const parsed = createQuestionSchema.safeParse(rowToPayload(rec));
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          throw new Error(issue ? `${issue.path.join('.')}: ${issue.message}` : 'invalid row');
        }
        const created = await questionApi.create(parsed.data);
        seen.add(code);

        // Apply mappings (best-effort; the question is already created as DRAFT).
        const notes: string[] = [];
        const kCodes = splitList(rec.knowledgecodes).map((c) => c.toUpperCase());
        if (kCodes.length) {
          const ids = kCodes.map((c) => knowledgeMap.get(c)).filter((x): x is string => !!x);
          const missing = kCodes.filter((c) => !knowledgeMap.has(c));
          if (ids.length) await questionApi.setKnowledgeMappings(created.id, { items: ids.map((id) => ({ knowledgeNodeId: id })) });
          notes.push(`K:${ids.length}${missing.length ? ` (unknown ${missing.join(',')})` : ''}`);
        }
        const eCodes = splitList(rec.examcodes).map((c) => c.toUpperCase());
        if (eCodes.length) {
          const ids = eCodes.map((c) => examMap.get(c)).filter((x): x is string => !!x);
          const missing = eCodes.filter((c) => !examMap.has(c));
          if (ids.length) await questionApi.setExamMappings(created.id, { items: ids.map((id) => ({ examProfileId: id })) });
          notes.push(`E:${ids.length}${missing.length ? ` (unknown ${missing.join(',')})` : ''}`);
        }
        const cRefs = splitList(rec.curriculumnodes);
        if (cRefs.length) {
          const ids = cRefs.map((r) => curriculumNodeMap.get(normRef(r))).filter((x): x is string => !!x);
          const missing = cRefs.filter((r) => !curriculumNodeMap.has(normRef(r)));
          if (ids.length) await questionApi.setCurriculumMappings(created.id, { items: ids.map((id) => ({ curriculumNodeId: id })) });
          notes.push(`C:${ids.length}${missing.length ? ` (unknown ${missing.join(',')})` : ''}`);
        }
        const tRefs = splitList(rec.trackmodules);
        if (tRefs.length) {
          const ids = tRefs.map((r) => trackModuleMap.get(normRef(r))).filter((x): x is string => !!x);
          const missing = tRefs.filter((r) => !trackModuleMap.has(normRef(r)));
          if (ids.length) await questionApi.setTrackMappings(created.id, { items: ids.map((id) => ({ trackModuleId: id })) });
          notes.push(`M:${ids.length}${missing.length ? ` (unknown ${missing.join(',')})` : ''}`);
        }
        const tags = splitList(rec.tags);
        if (tags.length) {
          await questionApi.setTags(created.id, { tags });
          notes.push(`T:${tags.length}`);
        }

        seen.add(code);
        out.push({ code, state: 'ok', message: `created (DRAFT)${notes.length ? ` · ${notes.join(' ')}` : ''}` });
      } catch (err) {
        // A 409 (code or identical-text already exists) means it's already in the system → skip, not fail.
        if (err instanceof ApiClientError && err.status === 409) {
          out.push({ code, state: 'skip', message: 'already exists — skipped' });
        } else {
          out.push({ code, state: 'error', message: err instanceof ApiClientError ? err.message : (err as Error).message });
        }
      }
      setResults([...out]);
    }
    setRunning(false);
  };

  const okCount = results.filter((r) => r.state === 'ok').length;
  const skipCount = results.filter((r) => r.state === 'skip').length;
  const errCount = results.filter((r) => r.state === 'error').length;
  const staged = pending?.records.length ?? 0;

  return (
    <>
      <PageHeader
        title="Import questions"
        description="Bulk-create questions from a multi-sheet Excel workbook (one sheet per type). Each becomes a DRAFT owned by your organization."
        actions={
          <Link href="/admin/questions">
            <Button variant="secondary">← Back</Button>
          </Link>
        }
      />

      <Card className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => void downloadTemplate()}>
            ⬇ Download Excel template (.xlsx)
          </Button>
          <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm hover:border-brand-400">
            Upload .xlsx / .csv
            <input type="file" accept=".xlsx,.csv,text/csv" className="hidden" onChange={(e) => void onFile(e)} />
          </label>
          {loadInfo ? <span className="text-xs text-slate-500">{loadInfo}</span> : null}
        </div>
        <div className="space-y-1 text-xs text-slate-500">
          <p>
            The workbook has one sheet per type (<code>SINGLE_CHOICE, MULTI_CHOICE, ASSERTION_REASON, TRUE_FALSE,
            NUMERIC, MATCHING</code>) plus a <code>READ_ME</code>. Delete any sheets you don&rsquo;t need — they&rsquo;re
            skipped on upload.
          </p>
          <p>
            Optional per-row mappings (applied automatically): <code>knowledgeCodes</code> / <code>examCodes</code> by
            unique <strong>code</strong>; <code>curriculumNodes</code> / <code>trackModules</code> as{' '}
            <code>PARENT_CODE&gt;CHILD</code> (e.g. <code>GPAT-SYLLABUS&gt;Pharmacology</code>,{' '}
            <code>GPAT-TRACK&gt;Module 1</code>); <code>tags</code> free text; <code>mediaUrl</code> (+{' '}
            <code>mediaType</code>, <code>mediaAltText</code>) for media. All <code>;</code>-separated; unknown
            references are reported but don&rsquo;t fail the row.
          </p>
        </div>

        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer select-none">Advanced: paste a single-sheet CSV (needs a questionType column)</summary>
          <textarea
            rows={6}
            placeholder="questionType,questionCode,difficulty,questionText,…"
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setPending(null);
              setLoadInfo(e.target.value.trim() ? 'Using pasted CSV' : '');
            }}
          />
        </details>

        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">{staged > 0 ? `${staged} row(s) staged from file` : ''}</span>
          <Button onClick={() => void run()} disabled={running || (staged === 0 && !csvText.trim())}>
            {running ? 'Importing…' : 'Import'}
          </Button>
        </div>
      </Card>

      {results.length > 0 ? (
        <Card className="p-0">
          <div className="flex items-center justify-between px-5 py-3 text-sm">
            <span className="font-medium text-slate-700">Results</span>
            <span className="text-slate-500">
              {okCount} created · {skipCount} skipped · {errCount} error{errCount === 1 ? '' : 's'} (of {results.length})
            </span>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {results.map((res, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-5 py-2 font-mono text-xs text-slate-700">{res.code}</td>
                  <td className="px-5 py-2">
                    <Badge tone={res.state === 'ok' ? 'green' : res.state === 'skip' ? 'amber' : 'red'}>
                      {res.state === 'ok' ? 'Created' : res.state === 'skip' ? 'Skipped' : 'Error'}
                    </Badge>
                  </td>
                  <td className="px-5 py-2 text-slate-600">{res.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Alert tone="green">
          Tip: download the template, fill the per-type sheets (sample rows included), delete any types you
          don&rsquo;t need, then upload. Questions are created as DRAFT and go through the normal review workflow.
        </Alert>
      )}
    </>
  );
}
