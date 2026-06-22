'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Badge, Button, Card, PageHeader, Spinner } from '@/components/ui';
import { mockTestApi } from '@/lib/api/endpoints';

export default function MockTestsPage() {
  const router = useRouter();
  const [startingId, setStartingId] = useState<string | null>(null);
  const tests = useQuery({ queryKey: ['mock-tests'], queryFn: mockTestApi.list });

  const start = useMutation({
    mutationFn: (testId: string) => mockTestApi.start(testId),
    onMutate: (testId) => setStartingId(testId),
    onSettled: () => setStartingId(null),
    onSuccess: (session) => router.push(`/mock-tests/sessions/${session.id}`),
  });

  return (
    <>
      <PageHeader title="Mock tests" description="Timed, ranked exams that mirror the real thing." />

      {start.isError ? (
        <div className="mb-4">
          <Alert>Could not start this test. It may be closed or you may have an attempt in progress.</Alert>
        </div>
      ) : null}

      {tests.isLoading ? (
        <Spinner />
      ) : tests.error ? (
        <Alert>Could not load mock tests.</Alert>
      ) : tests.data && tests.data.items.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {tests.data.items.map((t) => (
            <Card key={t.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">{t.title}</h2>
                <Badge tone="blue">{t.mode.toLowerCase()}</Badge>
              </div>
              {t.description ? <p className="mt-1 text-sm text-slate-600">{t.description}</p> : null}

              <div className="mt-4 flex gap-4 text-sm text-slate-500">
                <span>⏱ {t.durationMinutes} min</span>
                <span>📝 {t.totalQuestions} questions</span>
              </div>

              <div className="mt-4">
                <Button onClick={() => start.mutate(t.id)} disabled={start.isPending}>
                  {startingId === t.id ? 'Starting…' : 'Start test'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <p className="text-sm text-slate-500">No published mock tests yet. Check back soon.</p>
        </Card>
      )}
    </>
  );
}
