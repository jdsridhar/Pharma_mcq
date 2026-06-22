'use client';

import type {
  CurriculumTreeNodeDto,
  PracticeAvailableQuery,
  StartPracticeSessionInput,
} from '@pharmacy/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { curriculumApi, examApi, knowledgeApi, practiceApi, trackApi } from '@/lib/api/endpoints';

interface Opt {
  id: string;
  label: string;
}

function flattenTree(nodes: CurriculumTreeNodeDto[], out: CurriculumTreeNodeDto[] = []): CurriculumTreeNodeDto[] {
  for (const n of nodes) {
    out.push(n);
    if (n.children?.length) flattenTree(n.children, out);
  }
  return out;
}

export default function PracticePage() {
  const router = useRouter();
  const [count, setCount] = useState(10);
  const [knowledgeNodeId, setKnowledgeNodeId] = useState('');
  const [examProfileId, setExamProfileId] = useState('');
  const [curriculumNodeId, setCurriculumNodeId] = useState('');
  const [trackModuleId, setTrackModuleId] = useState('');
  const [difficulty, setDifficulty] = useState('');

  const sessions = useQuery({ queryKey: ['practice-sessions'], queryFn: practiceApi.list });

  // Filter sources (read content; students have *_READ). Each is optional.
  const topics = useQuery({
    queryKey: ['practice-knowledge'],
    queryFn: async (): Promise<Opt[]> => {
      const res = await knowledgeApi.list({ pageSize: 100 });
      return res.items.map((n) => ({ id: n.id, label: n.code ? `${n.name} (${n.code})` : n.name }));
    },
  });
  const exams = useQuery({
    queryKey: ['practice-exams'],
    queryFn: async (): Promise<Opt[]> => {
      const res = await examApi.list();
      return res.items.map((e) => ({ id: e.id, label: e.name }));
    },
  });
  const curriculumNodes = useQuery({
    queryKey: ['practice-curriculum-nodes'],
    queryFn: async (): Promise<Opt[]> => {
      const list = await curriculumApi.list();
      const out: Opt[] = [];
      for (const c of list.items) {
        const tree = await curriculumApi.tree(c.id);
        for (const n of flattenTree(tree)) out.push({ id: n.id, label: `${c.name} › ${n.name}` });
      }
      return out;
    },
  });
  const trackModules = useQuery({
    queryKey: ['practice-track-modules'],
    queryFn: async (): Promise<Opt[]> => {
      const list = await trackApi.list();
      const out: Opt[] = [];
      for (const t of list.items) {
        const detail = await trackApi.get(t.id);
        for (const m of detail.modules) out.push({ id: m.id, label: `${t.name} › ${m.name}` });
      }
      return out;
    },
  });

  // How many published questions match the current filters — drives the count field.
  const availableQuery = useMemo<PracticeAvailableQuery>(
    () => ({
      ...(knowledgeNodeId ? { knowledgeNodeId } : {}),
      ...(examProfileId ? { examProfileId } : {}),
      ...(curriculumNodeId ? { curriculumNodeId } : {}),
      ...(trackModuleId ? { trackModuleId } : {}),
      ...(difficulty ? { difficulty: difficulty as PracticeAvailableQuery['difficulty'] } : {}),
    }),
    [knowledgeNodeId, examProfileId, curriculumNodeId, trackModuleId, difficulty],
  );
  const available = useQuery({
    queryKey: ['practice-available', availableQuery],
    queryFn: () => practiceApi.available(availableQuery),
  });
  const availableCount = available.data?.available ?? 0;
  const maxCount = available.data?.max ?? availableCount;
  // Cap a single session at what's available (and the hard ceiling).
  const cap = Math.min(availableCount || 1, maxCount || availableCount || 1);

  // Default the count to the full available pool; reset it whenever the filters change.
  useEffect(() => {
    if (available.data) setCount(Math.max(1, Math.min(available.data.available, available.data.max)));
  }, [available.data]);

  const start = useMutation({
    mutationFn: () => {
      const input: StartPracticeSessionInput = { count: Math.min(count, cap) };
      if (knowledgeNodeId) input.knowledgeNodeIds = [knowledgeNodeId];
      if (examProfileId) input.examProfileId = examProfileId;
      if (curriculumNodeId) input.curriculumNodeId = curriculumNodeId;
      if (trackModuleId) input.trackModuleId = trackModuleId;
      if (difficulty) input.difficulty = difficulty as StartPracticeSessionInput['difficulty'];
      return practiceApi.start(input);
    },
    onSuccess: (session) => router.push(`/practice/${session.id}`),
  });

  const filtersActive = !!(knowledgeNodeId || examProfileId || curriculumNodeId || trackModuleId || difficulty);
  const clearFilters = (): void => {
    setKnowledgeNodeId('');
    setExamProfileId('');
    setCurriculumNodeId('');
    setTrackModuleId('');
    setDifficulty('');
  };

  return (
    <>
      <PageHeader title="Practice" description="Untimed self-study with instant feedback." />

      <Card className="mb-6 space-y-4">
        <p className="text-sm text-slate-500">
          Leave the filters as <strong>Any</strong> for a quick random mix, or narrow by topic, exam, curriculum,
          track or difficulty.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Topic / subject (knowledge)" htmlFor="f-topic">
            <Select id="f-topic" value={knowledgeNodeId} onChange={(e) => setKnowledgeNodeId(e.target.value)}>
              <option value="">Any topic</option>
              {(topics.data ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Exam" htmlFor="f-exam">
            <Select id="f-exam" value={examProfileId} onChange={(e) => setExamProfileId(e.target.value)}>
              <option value="">Any exam</option>
              {(exams.data ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Difficulty" htmlFor="f-diff">
            <Select id="f-diff" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="">Any difficulty</option>
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </Select>
          </Field>

          <Field label="Curriculum topic" htmlFor="f-cur">
            <Select id="f-cur" value={curriculumNodeId} onChange={(e) => setCurriculumNodeId(e.target.value)}>
              <option value="">Any curriculum</option>
              {(curriculumNodes.data ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Track module" htmlFor="f-track">
            <Select id="f-track" value={trackModuleId} onChange={(e) => setTrackModuleId(e.target.value)}>
              <option value="">Any track</option>
              {(trackModules.data ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Number of questions" htmlFor="count">
            <Input
              id="count"
              type="number"
              min={1}
              max={cap}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              onBlur={() => setCount((c) => Math.max(1, Math.min(c || 1, cap)))}
            />
            <span className="mt-1 block text-xs text-slate-500">
              {available.isLoading ? (
                'Checking how many match…'
              ) : availableCount === 0 ? (
                <span className="text-amber-600">No questions match these filters</span>
              ) : (
                <>
                  {availableCount} available{filtersActive ? ' for these filters' : ''} · type any number up to{' '}
                  {cap}
                </>
              )}
            </span>
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => start.mutate()} disabled={start.isPending || availableCount === 0}>
            {start.isPending
              ? 'Starting…'
              : filtersActive
                ? `Start filtered practice (${Math.min(count, cap)})`
                : `Start random practice (${Math.min(count, cap)})`}
          </Button>
          {filtersActive ? (
            <button type="button" className="text-xs text-slate-500 underline" onClick={clearFilters}>
              Clear filters (random)
            </button>
          ) : null}
        </div>

        {start.isError ? (
          <Alert>No published questions match these filters. Try widening them or pick “Any”.</Alert>
        ) : null}
      </Card>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Recent sessions</h2>
      {sessions.isLoading ? (
        <Spinner />
      ) : sessions.data && sessions.data.items.length > 0 ? (
        <div className="space-y-2">
          {sessions.data.items.map((s) => (
            <Link key={s.id} href={`/practice/${s.id}`}>
              <Card className="flex items-center justify-between hover:border-brand-300">
                <span className="text-sm text-slate-700">
                  {s.answeredCount}/{s.totalQuestions} answered
                </span>
                <Badge tone={s.status === 'COMPLETED' ? 'green' : 'slate'}>{s.status.toLowerCase()}</Badge>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No sessions yet.</p>
      )}
    </>
  );
}
