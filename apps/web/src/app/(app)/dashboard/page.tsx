'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Alert, Badge, Card, PageHeader, Spinner } from '@/components/ui';
import { analyticsApi, recommendationApi, revisionApi } from '@/lib/api/endpoints';

const pct = (n: number): string => `${Math.round(n * 100)}%`;

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-slate-900">{value}</p>
    </Card>
  );
}

export default function DashboardPage() {
  const overview = useQuery({ queryKey: ['overview'], queryFn: analyticsApi.overview });
  const weak = useQuery({ queryKey: ['weak-areas'], queryFn: recommendationApi.weakAreas });
  const due = useQuery({ queryKey: ['revision-due'], queryFn: revisionApi.due });

  return (
    <>
      <PageHeader title="Dashboard" description="Your progress at a glance." />

      {overview.isLoading ? (
        <Spinner />
      ) : overview.error ? (
        <Alert>Could not load your overview.</Alert>
      ) : overview.data ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Questions answered" value={overview.data.totalAnswered} />
          <Stat label="Accuracy" value={pct(overview.data.accuracy)} />
          <Stat label="Topics mastered" value={`${overview.data.masteredNodes}/${overview.data.trackedNodes}`} />
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-semibold text-slate-900">Focus areas</h2>
          {weak.isLoading ? (
            <div className="mt-3">
              <Spinner />
            </div>
          ) : weak.data && weak.data.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {weak.data.slice(0, 5).map((w) => (
                <li key={w.knowledgeNodeId} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">{w.name}</span>
                  <Badge tone="amber">{pct(w.masteryScore)}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No weak areas yet — practice more to see insights.</p>
          )}
          <Link href="/practice" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
            Start practicing →
          </Link>
        </Card>

        <Card>
          <h2 className="font-semibold text-slate-900">Revision due</h2>
          <p className="mt-3 text-3xl font-bold text-slate-900">{due.data?.length ?? 0}</p>
          <p className="text-sm text-slate-500">items ready to review</p>
          <Link href="/revision" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
            Go to revision →
          </Link>
        </Card>
      </div>
    </>
  );
}
