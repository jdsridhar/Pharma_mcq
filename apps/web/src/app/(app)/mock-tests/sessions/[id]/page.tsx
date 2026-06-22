'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AssessmentQuestionDto, StudentAnswer, TestResultDto } from '@pharmacy/contracts';
import { Alert, Badge, Button, Card, Input, PageHeader, Select, Spinner, cn } from '@/components/ui';
import { mockTestApi } from '@/lib/api/endpoints';

const pct = (n: number): string => `${Math.round(n * 100)}%`;

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function TestRunnerPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const session = useQuery({ queryKey: ['test-session', id], queryFn: () => mockTestApi.session(id) });

  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<TestResultDto | null>(null);
  const [answered, setAnswered] = useState<Set<string>>(new Set());

  const [choice, setChoice] = useState<Record<string, string[]>>({});
  const [boolAns, setBoolAns] = useState<Record<string, boolean>>({});
  const [numAns, setNumAns] = useState<Record<string, string>>({});
  const [matchAns, setMatchAns] = useState<Record<string, Record<string, string>>>({});

  const save = useMutation({
    mutationFn: (input: StudentAnswer & { snapshotId: string }) => mockTestApi.answer(id, input),
    onSuccess: (_data, variables) => setAnswered((prev) => new Set(prev).add(variables.snapshotId)),
  });

  const submitted = useRef(false);
  const submit = useMutation({
    mutationFn: () => mockTestApi.submit(id),
    onSuccess: (res) => {
      setResult(res);
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
  });

  const doSubmit = () => {
    if (submitted.current || submit.isPending) return;
    submitted.current = true;
    submit.mutate();
  };

  // Countdown — derived from server-authoritative expiresAt; auto-submits at zero.
  const expiresAt = session.data?.expiresAt ?? null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const remainingMs = expiresAt ? new Date(expiresAt).getTime() - now : null;
  useEffect(() => {
    if (remainingMs !== null && remainingMs <= 0 && !result && session.data?.status === 'IN_PROGRESS') {
      doSubmit();
    }
  }, [remainingMs, result, session.data?.status]);

  const questions = useMemo(() => session.data?.questions ?? [], [session.data]);
  const current = questions[index];

  if (session.isLoading) return <Spinner />;
  if (session.error || !session.data) return <Alert>Could not load this test session.</Alert>;

  if (result || session.data.status !== 'IN_PROGRESS') {
    return <ResultView sessionId={id} liveResult={result} />;
  }

  if (!current) return <Alert>This session has no questions.</Alert>;

  const draft = buildAnswer(current, { choice, boolAns, numAns, matchAns });
  const total = questions.length;

  const saveCurrent = (then?: () => void) => {
    if (draft) {
      save.mutate(
        { ...draft, snapshotId: current.snapshotId },
        { onSuccess: () => then?.() },
      );
    } else {
      then?.();
    }
  };

  return (
    <>
      <PageHeader
        title="Mock test"
        description={`Question ${index + 1} of ${total}`}
        actions={
          remainingMs !== null ? (
            <Badge tone={remainingMs < 60_000 ? 'red' : 'slate'}>⏱ {formatRemaining(remainingMs)}</Badge>
          ) : undefined
        }
      />

      {/* Question navigator */}
      <div className="mb-4 flex flex-wrap gap-2">
        {questions.map((q, i) => (
          <button
            key={q.snapshotId}
            type="button"
            onClick={() => saveCurrent(() => setIndex(i))}
            className={cn(
              'h-8 w-8 rounded-md border text-xs font-medium transition',
              i === index && 'ring-2 ring-brand-300',
              answered.has(q.snapshotId)
                ? 'border-brand-500 bg-brand-500 text-white'
                : 'border-slate-200 text-slate-600 hover:border-slate-300',
            )}
          >
            {i + 1}
          </button>
        ))}
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <Badge tone="slate">{current.questionType.replace(/_/g, ' ').toLowerCase()}</Badge>
          <span className="text-xs text-slate-500">
            +{current.marks}
            {current.negativeMarks > 0 ? ` / −${current.negativeMarks}` : ''}
          </span>
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

        <div className="mt-6 flex items-center justify-between">
          <Button variant="ghost" onClick={() => saveCurrent(() => setIndex((i) => Math.max(0, i - 1)))} disabled={index === 0}>
            ← Previous
          </Button>

          {index < total - 1 ? (
            <Button onClick={() => saveCurrent(() => setIndex((i) => Math.min(total - 1, i + 1)))} disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save & next →'}
            </Button>
          ) : (
            <Button onClick={() => saveCurrent(doSubmit)} disabled={save.isPending || submit.isPending}>
              {submit.isPending ? 'Submitting…' : 'Save & submit'}
            </Button>
          )}
        </div>
      </Card>

      <div className="mt-4 text-center">
        <Button variant="secondary" onClick={() => saveCurrent(doSubmit)} disabled={submit.isPending}>
          Submit test
        </Button>
      </div>
    </>
  );
}

// ── Answer building ──
type Drafts = {
  choice: Record<string, string[]>;
  boolAns: Record<string, boolean>;
  numAns: Record<string, string>;
  matchAns: Record<string, Record<string, string>>;
};

function buildAnswer(q: AssessmentQuestionDto, d: Drafts): StudentAnswer | null {
  const key = q.snapshotId;
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

// ── Answer input (no feedback — timed test) ──
type AnswerInputProps = Drafts & {
  question: AssessmentQuestionDto;
  setChoice: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  setBoolAns: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setNumAns: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setMatchAns: React.Dispatch<React.SetStateAction<Record<string, Record<string, string>>>>;
};

function AnswerInput(props: AnswerInputProps) {
  const { question: q, choice, boolAns, numAns, matchAns } = props;
  const key = q.snapshotId;

  if (q.questionType === 'TRUE_FALSE') {
    const value = boolAns[key];
    return (
      <div className="flex gap-3">
        {[true, false].map((opt) => (
          <button
            key={String(opt)}
            type="button"
            onClick={() => props.setBoolAns((p) => ({ ...p, [key]: opt }))}
            className={cn(
              'flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition',
              value === opt ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 hover:border-slate-300',
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
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => toggle(opt.id)}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition',
              isSelected ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300',
            )}
          >
            <span
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center border text-xs',
                multi ? 'rounded' : 'rounded-full',
                isSelected ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300',
              )}
            >
              {isSelected ? '✓' : ''}
            </span>
            <span className="text-slate-800">{opt.optionText}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Result view ──
function ResultView({ sessionId, liveResult }: { sessionId: string; liveResult: TestResultDto | null }) {
  const result = useQuery({
    queryKey: ['test-result', sessionId],
    queryFn: () => mockTestApi.result(sessionId),
    enabled: !liveResult,
    initialData: liveResult ?? undefined,
  });

  const data = liveResult ?? result.data;

  return (
    <>
      <PageHeader
        title="Test submitted"
        description="Your results are in."
        actions={
          <Link href="/mock-tests">
            <Button variant="secondary">Back to tests</Button>
          </Link>
        }
      />

      {result.isLoading && !data ? (
        <Spinner />
      ) : data ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <ResultStat label="Score" value={`${data.score}/${data.maxScore}`} />
            <ResultStat label="Accuracy" value={pct(data.accuracy)} />
            <ResultStat
              label="Rank"
              value={data.rank !== null ? `#${data.rank}${data.cohortSize ? ` / ${data.cohortSize}` : ''}` : '—'}
            />
          </div>
          <Card>
            <div className="grid grid-cols-3 gap-4 text-center text-sm">
              <div>
                <p className="text-2xl font-bold text-green-600">{data.correctCount}</p>
                <p className="text-slate-500">Correct</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-500">{data.wrongCount}</p>
                <p className="text-slate-500">Wrong</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-400">{data.skippedCount}</p>
                <p className="text-slate-500">Skipped</p>
              </div>
            </div>
            {data.percentile !== null ? (
              <p className="mt-4 text-center text-sm text-slate-600">
                You scored better than <strong>{pct(data.percentile)}</strong> of the cohort.
              </p>
            ) : null}
          </Card>
        </div>
      ) : (
        <Alert>Could not load the result.</Alert>
      )}
    </>
  );
}

function ResultStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-slate-900">{value}</p>
    </Card>
  );
}
