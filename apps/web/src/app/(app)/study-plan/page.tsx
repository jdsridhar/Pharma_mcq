'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import type { StudyPlanDto } from '@pharmacy/contracts';
import { Alert, Badge, Button, Card, Field, PageHeader, Select, Spinner } from '@/components/ui';
import { recommendationApi } from '@/lib/api/endpoints';

export default function StudyPlanPage() {
  const [days, setDays] = useState(7);
  const [dailyQuestions, setDailyQuestions] = useState(20);
  const [plan, setPlan] = useState<StudyPlanDto | null>(null);

  const recommendations = useQuery({ queryKey: ['recommendations'], queryFn: recommendationApi.feed });

  const generate = useMutation({
    mutationFn: () => recommendationApi.studyPlan({ days, dailyQuestions }),
    onSuccess: (data) => setPlan(data),
  });

  return (
    <>
      <PageHeader title="Study plan" description="Turn your weak areas into a day-by-day plan." />

      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-32">
            <Field label="Days" htmlFor="days">
              <Select id="days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {[3, 7, 14, 30].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="w-40">
            <Field label="Questions / day" htmlFor="dq">
              <Select id="dq" value={dailyQuestions} onChange={(e) => setDailyQuestions(Number(e.target.value))}>
                {[10, 20, 30, 50].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
            {generate.isPending ? 'Generating…' : 'Generate plan'}
          </Button>
        </div>
        {generate.isError ? (
          <div className="mt-3">
            <Alert>Could not generate a plan — practice a few questions first so we know your weak areas.</Alert>
          </div>
        ) : null}
      </Card>

      {plan ? (
        <div className="mb-8">
          <p className="mb-3 text-sm text-slate-500">{plan.totalQuestions} questions across {plan.days.length} days</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {plan.days.map((d) => (
              <Card key={d.day}>
                <h3 className="font-semibold text-slate-900">Day {d.day}</h3>
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  {d.items.map((it, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span>{it.name}</span>
                      <Badge tone="green">{it.questions}q</Badge>
                    </li>
                  ))}
                  {d.items.length === 0 ? <li className="text-slate-400">Rest / review</li> : null}
                </ul>
              </Card>
            ))}
          </div>
          <Link href="/practice" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
            Start practising →
          </Link>
        </div>
      ) : null}

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Recommended for you</h2>
      {recommendations.isLoading ? (
        <Spinner />
      ) : recommendations.data && recommendations.data.length > 0 ? (
        <div className="space-y-2">
          {recommendations.data.map((r, i) => (
            <Card key={i} className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-slate-900">{r.title}</p>
                <p className="text-sm text-slate-600">{r.detail}</p>
              </div>
              <Badge tone="blue">{r.type.replace(/_/g, ' ').toLowerCase()}</Badge>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <p className="text-sm text-slate-500">No recommendations yet — practice more to get personalised tips.</p>
        </Card>
      )}
    </>
  );
}
