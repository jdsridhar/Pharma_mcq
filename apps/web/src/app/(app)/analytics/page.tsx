'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, PageHeader, Spinner } from '@/components/ui';
import { analyticsApi } from '@/lib/api/endpoints';

const pct = (n: number): string => `${Math.round(n * 100)}%`;
const toneFor = (score: number): 'green' | 'amber' | 'red' => (score >= 0.8 ? 'green' : score >= 0.5 ? 'amber' : 'red');

export default function AnalyticsPage() {
  const queryClient = useQueryClient();
  const mastery = useQuery({ queryKey: ['mastery'], queryFn: analyticsApi.mastery });
  const recompute = useMutation({
    mutationFn: analyticsApi.recompute,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mastery'] });
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
  });

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Per-topic mastery from your practice and tests."
        actions={
          <Button variant="secondary" onClick={() => recompute.mutate()} disabled={recompute.isPending}>
            {recompute.isPending ? 'Recomputing…' : 'Recompute mastery'}
          </Button>
        }
      />

      {mastery.isLoading ? (
        <Spinner />
      ) : mastery.error ? (
        <Alert>Could not load mastery.</Alert>
      ) : mastery.data && mastery.data.length > 0 ? (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Topic</th>
                <th className="px-5 py-3 font-medium">Accuracy</th>
                <th className="px-5 py-3 font-medium">Mastery</th>
              </tr>
            </thead>
            <tbody>
              {mastery.data.map((m) => (
                <tr key={m.knowledgeNodeId} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-3 text-slate-800">{m.name}</td>
                  <td className="px-5 py-3 text-slate-600">{pct(m.accuracy)}</td>
                  <td className="px-5 py-3">
                    <Badge tone={toneFor(m.masteryScore)}>{pct(m.masteryScore)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-slate-500">
            No mastery data yet. Practice some questions, then recompute.
          </p>
        </Card>
      )}
    </>
  );
}
