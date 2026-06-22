'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Spinner } from '@/components/ui';
import { ApiClientError } from '@/lib/api-client';
import { mockTestApi, questionApi } from '@/lib/api/endpoints';

export default function AdminMockTestsPage() {
  const queryClient = useQueryClient();
  const tests = useQuery({ queryKey: ['admin-mock-tests'], queryFn: () => mockTestApi.listAll() });
  const invalidate = (): void => void queryClient.invalidateQueries({ queryKey: ['admin-mock-tests'] });

  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [durationMinutes, setDuration] = useState(15);
  // FIXED mocks: the question count is derived from the questions you attach below — not typed here.
  const create = useMutation({
    mutationFn: () =>
      mockTestApi.create({ code: code.trim(), title: title.trim(), mode: 'FIXED', durationMinutes, status: 'DRAFT' }),
    onSuccess: (t) => {
      setCode('');
      setTitle('');
      setSelected(t.id);
      invalidate();
    },
  });

  const publish = useMutation({
    mutationFn: (id: string) => mockTestApi.update(id, { status: 'PUBLISHED' }),
    onSuccess: invalidate,
  });

  const [selected, setSelected] = useState<string | null>(null);
  const list = tests.data?.items ?? [];

  return (
    <>
      <PageHeader title="Mock tests (build)" description="Create timed tests, attach published questions, and publish." />

      <Card className="mb-6">
        <h2 className="font-semibold text-slate-900">New mock test</h2>
        {create.isError ? (
          <div className="mt-2">
            <Alert>{create.error instanceof ApiClientError ? create.error.message : 'Could not create mock test'}</Alert>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="w-36">
            <Field label="Code" htmlFor="mcode">
              <Input id="mcode" placeholder="MT-01" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </Field>
          </div>
          <div className="min-w-48 flex-1">
            <Field label="Title" htmlFor="mtitle">
              <Input id="mtitle" value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
          </div>
          <div className="w-28">
            <Field label="Minutes" htmlFor="mdur">
              <Input id="mdur" type="number" value={durationMinutes} onChange={(e) => setDuration(Number(e.target.value))} />
            </Field>
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !code.trim() || !title.trim()}>
            {create.isPending ? 'Creating…' : 'Create'}
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          The question count is set automatically from the questions you attach via “Manage questions”.
        </p>
      </Card>

      {tests.isLoading ? (
        <Spinner />
      ) : list.length > 0 ? (
        <div className="space-y-3">
          {list.map((t) => (
            <Card key={t.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">
                    {t.title} <span className="font-mono text-xs text-slate-400">{t.code}</span>
                  </p>
                  <p className="text-sm text-slate-500">⏱ {t.durationMinutes} min · {t.totalQuestions} questions</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={t.status === 'PUBLISHED' ? 'green' : 'slate'}>{t.status.toLowerCase()}</Badge>
                  <Button variant="secondary" onClick={() => setSelected(selected === t.id ? null : t.id)}>
                    {selected === t.id ? 'Close' : 'Manage questions'}
                  </Button>
                  {t.status !== 'PUBLISHED' ? (
                    <Button
                      onClick={() => publish.mutate(t.id)}
                      disabled={publish.isPending || t.totalQuestions === 0}
                      title={t.totalQuestions === 0 ? 'Attach at least one question first' : undefined}
                    >
                      Publish
                    </Button>
                  ) : null}
                </div>
              </div>
              {selected === t.id ? <QuestionManager testId={t.id} onSaved={invalidate} /> : null}
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <p className="text-sm text-slate-500">No mock tests yet — create one above.</p>
        </Card>
      )}
    </>
  );
}

function QuestionManager({ testId, onSaved }: { testId: string; onSaved: () => void }) {
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ['mock-test-detail', testId], queryFn: () => mockTestApi.get(testId) });
  const published = useQuery({ queryKey: ['published-questions'], queryFn: () => questionApi.list({ status: 'PUBLISHED' }) });

  const [checked, setChecked] = useState<Set<string> | null>(null);
  const current = new Set((detail.data?.questions ?? []).map((q) => q.questionId));
  const effective = checked ?? current;

  const toggle = (id: string): void =>
    setChecked(() => {
      const next = new Set(effective);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = useMutation({
    mutationFn: () =>
      mockTestApi.setQuestions(testId, {
        items: [...effective].map((questionId) => ({ questionId, marks: 1, negativeMarks: 0 })),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mock-test-detail', testId] });
      onSaved();
    },
  });

  const pubList = published.data?.items ?? [];

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      {detail.isLoading || published.isLoading ? (
        <Spinner />
      ) : pubList.length === 0 ? (
        <Alert tone="green">No published questions to add yet — publish some questions first.</Alert>
      ) : (
        <>
          <p className="mb-2 text-sm font-medium text-slate-700">
            Select questions ({effective.size} selected of {pubList.length} published)
          </p>
          <div className="max-h-72 space-y-1 overflow-auto rounded-lg border border-slate-200 p-2">
            {pubList.map((q) => (
              <label key={q.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                <input type="checkbox" className="h-4 w-4" checked={effective.has(q.id)} onChange={() => toggle(q.id)} />
                <span className="font-mono text-xs text-slate-500">{q.questionCode}</span>
                <span className="truncate text-slate-700">{q.preview ?? q.questionType}</span>
              </label>
            ))}
          </div>
          <Button className="mt-3" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save questions'}
          </Button>
        </>
      )}
    </div>
  );
}
