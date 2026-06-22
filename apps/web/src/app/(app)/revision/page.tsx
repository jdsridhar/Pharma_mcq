'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, PageHeader, Spinner } from '@/components/ui';
import { revisionApi } from '@/lib/api/endpoints';

export default function RevisionPage() {
  const queryClient = useQueryClient();
  const due = useQuery({ queryKey: ['revision-due'], queryFn: revisionApi.due });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['revision-due'] });

  const review = useMutation({
    mutationFn: ({ id, outcome }: { id: string; outcome: 'CORRECT' | 'WRONG' | 'SKIPPED' }) =>
      revisionApi.review(id, outcome),
    onSuccess: invalidate,
  });

  const generate = useMutation({ mutationFn: revisionApi.generateFromWrong, onSuccess: invalidate });

  return (
    <>
      <PageHeader
        title="Revision"
        description="Spaced-repetition items due for review."
        actions={
          <Button variant="secondary" onClick={() => generate.mutate()} disabled={generate.isPending}>
            {generate.isPending ? 'Adding…' : 'Add from wrong answers'}
          </Button>
        }
      />

      {due.isLoading ? (
        <Spinner />
      ) : due.error ? (
        <Alert>Could not load your revision queue.</Alert>
      ) : due.data && due.data.length > 0 ? (
        <div className="space-y-3">
          {due.data.map((item) => (
            <Card key={item.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge tone="blue">{item.source.replace('_', ' ').toLowerCase()}</Badge>
                  <span className="text-sm text-slate-500">reviewed {item.reviewCount}×</span>
                </div>
                <p className="mt-1 font-mono text-xs text-slate-400">{item.questionId}</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => review.mutate({ id: item.id, outcome: 'CORRECT' })} disabled={review.isPending}>
                  Got it
                </Button>
                <Button variant="danger" onClick={() => review.mutate({ id: item.id, outcome: 'WRONG' })} disabled={review.isPending}>
                  Missed
                </Button>
                <Button variant="ghost" onClick={() => review.mutate({ id: item.id, outcome: 'SKIPPED' })} disabled={review.isPending}>
                  Skip
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <p className="text-sm text-slate-500">Nothing due right now. Great job staying on top of it!</p>
        </Card>
      )}
    </>
  );
}
