'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import type {
  PracticeAnswerResultDto,
  PracticeQuestionDto,
  PracticeSummaryDto,
  StudentAnswer,
} from '@pharmacy/contracts';
import { Alert, Badge, Button, Card, cn, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { practiceApi } from '@/lib/api/endpoints';

const pct = (n: number): string => `${Math.round(n * 100)}%`;

export default function PracticeRunnerPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const session = useQuery({ queryKey: ['practice-session', id], queryFn: () => practiceApi.get(id) });

  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<Record<string, PracticeAnswerResultDto>>({});
  const [summary, setSummary] = useState<PracticeSummaryDto | null>(null);

  // Per-question answer drafts (keyed by sessionQuestionId so navigation preserves input).
  const [choice, setChoice] = useState<Record<string, string[]>>({});
  const [boolAns, setBoolAns] = useState<Record<string, boolean>>({});
  const [numAns, setNumAns] = useState<Record<string, string>>({});
  const [matchAns, setMatchAns] = useState<Record<string, Record<string, string>>>({});

  const answer = useMutation({
    mutationFn: (input: StudentAnswer & { sessionQuestionId: string }) => practiceApi.answer(id, input),
    onSuccess: (result) => {
      setFeedback((prev) => ({ ...prev, [result.sessionQuestionId]: result }));
      void queryClient.invalidateQueries({ queryKey: ['practice-session', id] });
    },
  });

  const complete = useMutation({
    mutationFn: () => practiceApi.complete(id),
    onSuccess: (result) => {
      setSummary(result);
      void queryClient.invalidateQueries({ queryKey: ['practice-sessions'] });
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
  });

  const questions = useMemo(() => session.data?.questions ?? [], [session.data]);
  const current = questions[index];

  if (session.isLoading) return <Spinner />;
  if (session.error || !session.data) return <Alert>Could not load this practice session.</Alert>;

  // Completed view — show the summary either from this run or the persisted session.
  if (summary || session.data.status === 'COMPLETED') {
    return <CompletedView sessionId={id} liveSummary={summary} />;
  }

  if (!current) return <Alert>This session has no questions.</Alert>;

  const fb = feedback[current.sessionQuestionId];
  const locked = Boolean(fb);
  const draft = buildAnswer(current, { choice, boolAns, numAns, matchAns });
  const total = questions.length;
  const answeredCount = Object.keys(feedback).length;

  return (
    <>
      <PageHeader
        title="Practice"
        description={`Question ${index + 1} of ${total}`}
        actions={
          <Button onClick={() => complete.mutate()} disabled={complete.isPending}>
            {complete.isPending ? 'Finishing…' : 'Finish & score'}
          </Button>
        }
      />

      <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-brand-500 transition-all"
          style={{ width: `${total ? (answeredCount / total) * 100 : 0}%` }}
        />
      </div>

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <Badge tone="slate">{current.questionType.replace(/_/g, ' ').toLowerCase()}</Badge>
          {fb ? <Badge tone={fb.isCorrect ? 'green' : 'red'}>{fb.isCorrect ? 'Correct' : 'Incorrect'}</Badge> : null}
        </div>

        <p className="whitespace-pre-wrap text-base text-slate-900">{current.questionText}</p>

        {current.media.length > 0 ? (
          <div className="mt-3 space-y-2">
            {current.media
              .filter((m) => m.mediaType === 'IMAGE')
              .map((m) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={m.id} src={m.url} alt={m.altText ?? ''} className="max-h-64 rounded-lg border border-slate-200" />
              ))}
          </div>
        ) : null}

        <div className="mt-5">
          <AnswerInput
            question={current}
            locked={locked}
            feedback={fb}
            choice={choice}
            boolAns={boolAns}
            numAns={numAns}
            matchAns={matchAns}
            setChoice={setChoice}
            setBoolAns={setBoolAns}
            setNumAns={setNumAns}
            setMatchAns={setMatchAns}
          />
        </div>

        {fb ? (
          <div className="mt-5 rounded-lg bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-700">Explanation</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
              {fb.explanation ?? 'No explanation provided.'}
            </p>
          </div>
        ) : null}

        <div className="mt-6 flex items-center justify-between">
          <Button variant="ghost" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
            ← Previous
          </Button>

          {!locked ? (
            <Button
              onClick={() => draft && answer.mutate({ ...draft, sessionQuestionId: current.sessionQuestionId })}
              disabled={!draft || answer.isPending}
            >
              {answer.isPending ? 'Checking…' : 'Submit answer'}
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
              disabled={index >= total - 1}
            >
              Next →
            </Button>
          )}
        </div>
      </Card>
    </>
  );
}

// ── Answer-building helper ──
type Drafts = {
  choice: Record<string, string[]>;
  boolAns: Record<string, boolean>;
  numAns: Record<string, string>;
  matchAns: Record<string, Record<string, string>>;
};

function buildAnswer(q: PracticeQuestionDto, d: Drafts): StudentAnswer | null {
  const key = q.sessionQuestionId;
  switch (q.questionType) {
    case 'SINGLE_CHOICE':
    case 'ASSERTION_REASON': {
      const ids = d.choice[key] ?? [];
      return ids.length > 0 ? { selectedOptionIds: ids.slice(0, 1) } : null;
    }
    case 'MULTI_CHOICE': {
      const ids = d.choice[key] ?? [];
      return ids.length > 0 ? { selectedOptionIds: ids } : null;
    }
    case 'TRUE_FALSE': {
      const b = d.boolAns[key];
      return b === undefined ? null : { booleanAnswer: b };
    }
    case 'NUMERIC': {
      const raw = d.numAns[key];
      if (raw === undefined || raw.trim() === '') return null;
      const n = Number(raw);
      return Number.isFinite(n) ? { numericAnswer: n } : null;
    }
    case 'MATCHING': {
      const map = d.matchAns[key] ?? {};
      const pairs = Object.entries(map)
        .filter(([, right]) => right)
        .map(([left, right]) => ({ left, right }));
      return pairs.length > 0 ? { matchingAnswer: pairs } : null;
    }
    default:
      return null;
  }
}

// ── Answer input renderer ──
type AnswerInputProps = Drafts & {
  question: PracticeQuestionDto;
  locked: boolean;
  feedback: PracticeAnswerResultDto | undefined;
  setChoice: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  setBoolAns: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setNumAns: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setMatchAns: React.Dispatch<React.SetStateAction<Record<string, Record<string, string>>>>;
};

function AnswerInput(props: AnswerInputProps) {
  const { question: q, locked, feedback, choice, boolAns, numAns, matchAns } = props;
  const key = q.sessionQuestionId;
  const correctIds = feedback?.correctOptionIds ?? [];

  if (q.questionType === 'TRUE_FALSE') {
    const value = boolAns[key];
    return (
      <div className="flex gap-3">
        {[true, false].map((opt) => (
          <button
            key={String(opt)}
            type="button"
            disabled={locked}
            onClick={() => props.setBoolAns((p) => ({ ...p, [key]: opt }))}
            className={cn(
              'flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition',
              value === opt ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 hover:border-slate-300',
              locked && 'cursor-not-allowed opacity-70',
            )}
          >
            {opt ? 'True' : 'False'}
          </button>
        ))}
      </div>
    );
  }

  if (q.questionType === 'NUMERIC') {
    return (
      <Input
        type="number"
        inputMode="decimal"
        placeholder="Enter a number"
        disabled={locked}
        value={numAns[key] ?? ''}
        onChange={(e) => props.setNumAns((p) => ({ ...p, [key]: e.target.value }))}
        className="max-w-xs"
      />
    );
  }

  if (q.questionType === 'MATCHING' && q.matchingPrompt) {
    const map = matchAns[key] ?? {};
    return (
      <div className="space-y-2">
        {q.matchingPrompt.lefts.map((left) => (
          <div key={left} className="flex items-center gap-3">
            <span className="w-1/2 text-sm text-slate-700">{left}</span>
            <Select
              disabled={locked}
              value={map[left] ?? ''}
              onChange={(e) => props.setMatchAns((p) => ({ ...p, [key]: { ...(p[key] ?? {}), [left]: e.target.value } }))}
            >
              <option value="">— select —</option>
              {q.matchingPrompt!.rights.map((right) => (
                <option key={right} value={right}>
                  {right}
                </option>
              ))}
            </Select>
          </div>
        ))}
      </div>
    );
  }

  // Choice types: SINGLE_CHOICE, MULTI_CHOICE, ASSERTION_REASON
  const multi = q.questionType === 'MULTI_CHOICE';
  const selected = choice[key] ?? [];
  const toggle = (optionId: string) => {
    props.setChoice((p) => {
      const cur = p[key] ?? [];
      if (multi) {
        return { ...p, [key]: cur.includes(optionId) ? cur.filter((x) => x !== optionId) : [...cur, optionId] };
      }
      return { ...p, [key]: [optionId] };
    });
  };

  return (
    <div className="space-y-2">
      {q.options.map((opt) => {
        const isSelected = selected.includes(opt.id);
        const isCorrect = correctIds.includes(opt.id);
        return (
          <button
            key={opt.id}
            type="button"
            disabled={locked}
            onClick={() => toggle(opt.id)}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition',
              !locked && isSelected && 'border-brand-500 bg-brand-50',
              !locked && !isSelected && 'border-slate-200 hover:border-slate-300',
              locked && isCorrect && 'border-green-500 bg-green-50',
              locked && !isCorrect && isSelected && 'border-red-400 bg-red-50',
              locked && !isCorrect && !isSelected && 'border-slate-200 opacity-70',
            )}
          >
            <span
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center border text-xs',
                multi ? 'rounded' : 'rounded-full',
                isSelected ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300',
                locked && isCorrect && 'border-green-500 bg-green-500 text-white',
              )}
            >
              {isSelected || (locked && isCorrect) ? '✓' : ''}
            </span>
            <span className="text-slate-800">{opt.optionText}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Completed / summary view ──
function CompletedView({ sessionId, liveSummary }: { sessionId: string; liveSummary: PracticeSummaryDto | null }) {
  const summary = useQuery({
    queryKey: ['practice-summary', sessionId],
    queryFn: () => practiceApi.summary(sessionId),
    enabled: !liveSummary,
    initialData: liveSummary ?? undefined,
  });

  const data = liveSummary ?? summary.data;

  return (
    <>
      <PageHeader
        title="Session complete"
        description="Here's how you did."
        actions={
          <Link href="/practice">
            <Button variant="secondary">Back to practice</Button>
          </Link>
        }
      />

      {summary.isLoading && !data ? (
        <Spinner />
      ) : data ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryStat label="Score" value={`${data.correct}/${data.answered}`} />
            <SummaryStat label="Accuracy" value={pct(data.accuracy)} />
            <SummaryStat label="Incorrect" value={data.incorrect} />
          </div>
          <Card>
            <Link href="/revision" className="text-sm font-medium text-brand-600 hover:underline">
              Review your mistakes in Revision →
            </Link>
          </Card>
        </div>
      ) : (
        <Alert>Could not load the summary.</Alert>
      )}
    </>
  );
}

function SummaryStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-slate-900">{value}</p>
    </Card>
  );
}
