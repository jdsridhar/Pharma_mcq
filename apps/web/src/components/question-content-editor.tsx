'use client';

import { createVersionSchema, type AnswerSpec, type CreateVersionInput, QUESTION_TYPES, type QuestionTypeT } from '@pharmacy/contracts';
import { type ReactNode, useState } from 'react';
import { Alert, Button, Field, Input, Select } from '@/components/ui';

const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
const CHOICE_TYPES: QuestionTypeT[] = ['SINGLE_CHOICE', 'MULTI_CHOICE', 'ASSERTION_REASON'];
const typeLabel = (t: string): string => t.replace(/_/g, ' ').toLowerCase();

export interface OptionRow {
  text: string;
  isCorrect: boolean;
}
export interface PairRow {
  left: string;
  right: string;
}

export interface QuestionContentInitial {
  questionType?: QuestionTypeT;
  authorDifficulty?: (typeof DIFFICULTIES)[number];
  questionText?: string;
  explanation?: string;
  options?: OptionRow[];
  boolAnswer?: boolean;
  numericValue?: string;
  numericTolerance?: string;
  pairs?: PairRow[];
}

/**
 * Shared editor for a question's *content* (one version): type, difficulty, text, explanation and
 * the type-specific answer (options / true-false / numeric / matching). Builds + validates a
 * `CreateVersionInput` against the shared Zod schema and hands it to `onSubmit`. Reused by the
 * create page and the edit (new-version) page. `header`/`footer` let the parent inject extra
 * fields (e.g. question code, knowledge-topic picker).
 */
export function QuestionContentEditor({
  initial,
  lockType = false,
  showDifficulty = true,
  submitLabel,
  submitting = false,
  error,
  header,
  footer,
  onSubmit,
}: {
  initial?: QuestionContentInitial;
  lockType?: boolean;
  /** Hide the difficulty control (e.g. on edit, where difficulty is managed via metadata). */
  showDifficulty?: boolean;
  submitLabel: string;
  submitting?: boolean;
  error?: string | null;
  header?: ReactNode;
  footer?: ReactNode;
  onSubmit: (content: CreateVersionInput) => void;
}) {
  const [type, setType] = useState<QuestionTypeT>(initial?.questionType ?? 'SINGLE_CHOICE');
  const [difficulty, setDifficulty] = useState<(typeof DIFFICULTIES)[number]>(initial?.authorDifficulty ?? 'MEDIUM');
  const [text, setText] = useState(initial?.questionText ?? '');
  const [explanation, setExplanation] = useState(initial?.explanation ?? '');
  const [options, setOptions] = useState<OptionRow[]>(
    initial?.options ?? [
      { text: '', isCorrect: true },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
    ],
  );
  const [boolAnswer, setBoolAnswer] = useState(initial?.boolAnswer ?? true);
  const [numericValue, setNumericValue] = useState(initial?.numericValue ?? '');
  const [numericTolerance, setNumericTolerance] = useState(initial?.numericTolerance ?? '0');
  const [pairs, setPairs] = useState<PairRow[]>(
    initial?.pairs ?? [
      { left: '', right: '' },
      { left: '', right: '' },
    ],
  );
  const [localError, setLocalError] = useState<string | null>(null);

  const isChoice = CHOICE_TYPES.includes(type);
  const multi = type === 'MULTI_CHOICE';

  const setOption = (i: number, patch: Partial<OptionRow>): void =>
    setOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  const setCorrect = (i: number): void =>
    setOptions((prev) => prev.map((o, idx) => (multi ? (idx === i ? { ...o, isCorrect: !o.isCorrect } : o) : { ...o, isCorrect: idx === i })));

  const buildAnswerSpec = (): AnswerSpec => {
    switch (type) {
      case 'TRUE_FALSE':
        return { type, answer: boolAnswer };
      case 'NUMERIC':
        return { type, value: Number(numericValue), tolerance: Number(numericTolerance || '0') };
      case 'MATCHING':
        return { type, pairs: pairs.map((p) => ({ left: p.left.trim(), right: p.right.trim() })) };
      default:
        return { type };
    }
  };

  const submit = (): void => {
    setLocalError(null);
    const content = {
      questionType: type,
      authorDifficulty: difficulty,
      language: 'en',
      questionText: text.trim(),
      explanation: explanation.trim() || undefined,
      answerSpec: buildAnswerSpec(),
      options: isChoice
        ? options.filter((o) => o.text.trim()).map((o, i) => ({ text: o.text.trim(), isCorrect: o.isCorrect, displayOrder: i }))
        : undefined,
    };
    const parsed = createVersionSchema.safeParse(content);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setLocalError(issue ? `${issue.path.join('.')}: ${issue.message}` : 'Please check the form');
      return;
    }
    onSubmit(parsed.data);
  };

  return (
    <div className="space-y-4">
      {error || localError ? <Alert>{error ?? localError}</Alert> : null}

      {header}

      <div className={showDifficulty ? 'grid gap-4 sm:grid-cols-2' : ''}>
        <Field label="Type" htmlFor="qce-type">
          <Select id="qce-type" value={type} disabled={lockType} onChange={(e) => setType(e.target.value as QuestionTypeT)}>
            {QUESTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {typeLabel(t)}
              </option>
            ))}
          </Select>
        </Field>
        {showDifficulty ? (
          <Field label="Difficulty" htmlFor="qce-diff">
            <Select id="qce-diff" value={difficulty} onChange={(e) => setDifficulty(e.target.value as (typeof DIFFICULTIES)[number])}>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {d.toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>

      <Field label="Question text" htmlFor="qce-text">
        <textarea
          id="qce-text"
          rows={3}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </Field>

      {isChoice ? (
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Options {multi ? '(tick all correct)' : '(select the one correct)'}</p>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type={multi ? 'checkbox' : 'radio'} name="qce-correct" checked={opt.isCorrect} onChange={() => setCorrect(i)} className="h-4 w-4" />
                <Input placeholder={`Option ${i + 1}`} value={opt.text} onChange={(e) => setOption(i, { text: e.target.value })} />
                {options.length > 2 ? (
                  <Button variant="ghost" onClick={() => setOptions((p) => p.filter((_, idx) => idx !== i))}>
                    ✕
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
          {options.length < 10 ? (
            <Button variant="ghost" className="mt-2" onClick={() => setOptions((p) => [...p, { text: '', isCorrect: false }])}>
              + Add option
            </Button>
          ) : null}
        </div>
      ) : null}

      {type === 'TRUE_FALSE' ? (
        <Field label="Correct answer" htmlFor="qce-tf">
          <Select id="qce-tf" value={String(boolAnswer)} onChange={(e) => setBoolAnswer(e.target.value === 'true')}>
            <option value="true">True</option>
            <option value="false">False</option>
          </Select>
        </Field>
      ) : null}

      {type === 'NUMERIC' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Correct value" htmlFor="qce-num">
            <Input id="qce-num" type="number" value={numericValue} onChange={(e) => setNumericValue(e.target.value)} />
          </Field>
          <Field label="Tolerance (±)" htmlFor="qce-tol">
            <Input id="qce-tol" type="number" value={numericTolerance} onChange={(e) => setNumericTolerance(e.target.value)} />
          </Field>
        </div>
      ) : null}

      {type === 'MATCHING' ? (
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Pairs (left ↔ right)</p>
          <div className="space-y-2">
            {pairs.map((pair, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input placeholder="Left" value={pair.left} onChange={(e) => setPairs((p) => p.map((x, idx) => (idx === i ? { ...x, left: e.target.value } : x)))} />
                <span className="text-slate-400">↔</span>
                <Input placeholder="Right" value={pair.right} onChange={(e) => setPairs((p) => p.map((x, idx) => (idx === i ? { ...x, right: e.target.value } : x)))} />
                {pairs.length > 2 ? (
                  <Button variant="ghost" onClick={() => setPairs((p) => p.filter((_, idx) => idx !== i))}>
                    ✕
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
          {pairs.length < 20 ? (
            <Button variant="ghost" className="mt-2" onClick={() => setPairs((p) => [...p, { left: '', right: '' }])}>
              + Add pair
            </Button>
          ) : null}
        </div>
      ) : null}

      <Field label="Explanation (optional)" htmlFor="qce-exp">
        <textarea
          id="qce-exp"
          rows={2}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
        />
      </Field>

      {footer}

      <div className="flex justify-end">
        <Button onClick={submit} disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </div>
  );
}

/** Maps a stored answerSpec back into the editor's flat initial fields. */
export function answerSpecToInitial(spec: AnswerSpec): Partial<QuestionContentInitial> {
  switch (spec.type) {
    case 'TRUE_FALSE':
      return { boolAnswer: spec.answer };
    case 'NUMERIC':
      return { numericValue: String(spec.value), numericTolerance: String(spec.tolerance) };
    case 'MATCHING':
      return { pairs: spec.pairs.map((p) => ({ left: p.left, right: p.right })) };
    default:
      return {};
  }
}
