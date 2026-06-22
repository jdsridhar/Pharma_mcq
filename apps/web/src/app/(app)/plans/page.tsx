'use client';

import { PERMISSIONS, type PlanDetailDto } from '@pharmacy/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Badge, Button, Card, PageHeader, Spinner } from '@/components/ui';
import { commerceApi } from '@/lib/api/endpoints';
import { useAuthStore } from '@/store/auth-store';

const money = (minor: number, currency: string): string =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(minor / 100);

const formatDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/** A single plan card. When `current`, the pricing buttons are replaced by an "active" note. */
function PlanCard({
  plan,
  current,
  onSubscribe,
  subscribing,
}: {
  plan: PlanDetailDto;
  current?: boolean;
  onSubscribe?: (planPriceId: string) => void;
  subscribing?: boolean;
}) {
  return (
    <Card className={`flex flex-col ${current ? 'border-brand-300 ring-1 ring-brand-200' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">{plan.name}</h2>
        {current ? <Badge tone="green">Current</Badge> : null}
      </div>
      {plan.description ? <p className="mt-1 text-sm text-slate-600">{plan.description}</p> : null}

      <ul className="mt-4 flex-1 space-y-1 text-sm text-slate-600">
        {plan.features.map((f) => (
          <li key={f.key} className="flex items-center gap-2">
            <span className="text-brand-600">✓</span>
            {f.name}
            {f.limit !== null ? <Badge tone="slate">{f.limit}</Badge> : null}
          </li>
        ))}
        {plan.features.length === 0 ? <li className="text-slate-400">Core features</li> : null}
      </ul>

      <div className="mt-4 space-y-2">
        {current ? (
          <p className="rounded-md bg-brand-50 py-2 text-center text-sm font-medium text-brand-700">
            Your active plan
          </p>
        ) : (
          <>
            {plan.prices.map((price) => (
              <Button
                key={price.id}
                className="w-full"
                onClick={() => onSubscribe?.(price.id)}
                disabled={subscribing}
              >
                {money(price.amountMinor, price.currency)} / {price.billingInterval.toLowerCase()}
              </Button>
            ))}
            {plan.prices.length === 0 ? (
              <p className="text-center text-sm text-slate-400">No pricing yet</p>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}

export default function PlansPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const canViewOrgPlan = user?.permissions.includes(PERMISSIONS.SUBSCRIPTION_READ) ?? false;

  // Entitlements are self-readable (no special perm) and tell us whether the user's access is
  // managed by an institution with an active seat plan. Belonging to the single-tenant default
  // org does NOT count — only a real institutional subscription does.
  const entitlements = useQuery({ queryKey: ['entitlements'], queryFn: commerceApi.entitlements });
  const institutionManaged = entitlements.data?.institutionManaged ?? false;
  const institutionName = entitlements.data?.institutionName ?? user?.organizationName ?? 'your institution';
  const isOrgAdmin = institutionManaged && canViewOrgPlan;
  const isOrgMember = institutionManaged && !canViewOrgPlan;

  // Marketplace plans only matter for individual (non-institution-managed) users.
  const plans = useQuery({ queryKey: ['plans'], queryFn: commerceApi.plans, enabled: !institutionManaged });
  const orgSub = useQuery({
    queryKey: ['org-subscription'],
    queryFn: commerceApi.myOrgSubscription,
    enabled: isOrgAdmin,
  });

  const subscribe = useMutation({
    mutationFn: (planPriceId: string) => commerceApi.subscribe(planPriceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['entitlements'] });
    },
  });

  const [showAll, setShowAll] = useState(false);

  // Resolve the viewer's branch only once we know whether they're institution-managed.
  if (entitlements.isLoading) {
    return (
      <>
        <PageHeader title="Plan" description="Loading your plan…" />
        <Spinner />
      </>
    );
  }

  // ── Institution member: no plan details at all, just a single informational card. ──
  if (isOrgMember) {
    return (
      <>
        <PageHeader title="Plan" description="Your access is provided by your institution." />
        <Card className="max-w-xl">
          <Badge tone="blue">Institutional plan</Badge>
          <p className="mt-3 text-sm text-slate-700">
            Your access is provided by <strong>{institutionName}</strong>.
          </p>
          <p className="mt-2 text-sm text-slate-500">
            Plan details, billing and seats are managed by your institution’s administrator.
          </p>
        </Card>
      </>
    );
  }

  // ── Institution admin: only the institution's chosen plan + seat usage. ──
  if (isOrgAdmin) {
    const sub = orgSub.data;
    return (
      <>
        <PageHeader title="Institution plan" description={`The active plan for ${institutionName}.`} />
        {orgSub.isLoading ? (
          <Spinner />
        ) : orgSub.error ? (
          <Alert>Could not load your institution’s plan.</Alert>
        ) : sub ? (
          <Card className="max-w-xl border-brand-300 ring-1 ring-brand-200">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{sub.planName}</h2>
                <p className="mt-0.5 text-xs uppercase tracking-wide text-slate-400">{sub.planCode}</p>
              </div>
              <Badge tone={sub.status === 'ACTIVE' ? 'green' : 'amber'}>{sub.status.toLowerCase()}</Badge>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Seats used</dt>
                <dd className="font-medium text-slate-900">
                  {sub.seatsUsed}
                  {sub.seatLimit !== null ? ` / ${sub.seatLimit}` : ' (unlimited)'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Seats available</dt>
                <dd className="font-medium text-slate-900">
                  {sub.seatsAvailable !== null ? sub.seatsAvailable : 'Unlimited'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Current period start</dt>
                <dd className="font-medium text-slate-900">{formatDate(sub.currentPeriodStart)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Renews / ends</dt>
                <dd className="font-medium text-slate-900">{formatDate(sub.currentPeriodEnd)}</dd>
              </div>
            </dl>

            <p className="mt-4 text-xs text-slate-500">
              Institution plans are provisioned by the platform team. Contact us to change your plan or add
              seats.
            </p>
          </Card>
        ) : (
          <Card className="max-w-xl">
            <Badge tone="amber">No active plan</Badge>
            <p className="mt-3 text-sm text-slate-700">
              No institution plan is active for {institutionName} yet.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Contact the platform team to provision an institutional plan with member seats.
            </p>
          </Card>
        )}
      </>
    );
  }

  // ── Platform (individual) user: chosen plan with details + "view more plans". ──
  const ent = entitlements.data;
  const currentPlan = ent?.plan ? (plans.data?.find((p) => p.code === ent.plan?.code) ?? null) : null;
  const otherPlans = (plans.data ?? []).filter((p) => p.code !== ent?.plan?.code);

  return (
    <>
      <PageHeader title="Plans" description="Upgrade to unlock premium features." />

      {subscribe.isError ? (
        <div className="mb-4">
          <Alert>Could not start checkout. Please try again.</Alert>
        </div>
      ) : null}
      {subscribe.data?.status === 'PENDING' ? (
        <div className="mb-4">
          <Alert tone="green">Checkout started — complete payment in the gateway to activate.</Alert>
        </div>
      ) : null}

      {plans.isLoading || entitlements.isLoading ? (
        <Spinner />
      ) : plans.error ? (
        <Alert>Could not load plans.</Alert>
      ) : ent?.plan ? (
        // Has an active plan → show only that plan, with an expander for the rest.
        <>
          <div className="mb-6 max-w-xl">
            {currentPlan ? (
              <PlanCard plan={currentPlan} current />
            ) : (
              <Card className="border-brand-300 ring-1 ring-brand-200">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">{ent.plan.name}</h2>
                  <Badge tone="green">Current</Badge>
                </div>
                <ul className="mt-4 space-y-1 text-sm text-slate-600">
                  {ent.features.map((f) => (
                    <li key={f.key} className="flex items-center gap-2">
                      <span className="text-brand-600">✓</span>
                      {f.name}
                      {f.limit !== null ? <Badge tone="slate">{f.limit}</Badge> : null}
                    </li>
                  ))}
                  {ent.features.length === 0 ? <li className="text-slate-400">Core features</li> : null}
                </ul>
              </Card>
            )}
          </div>

          {otherPlans.length > 0 ? (
            <div>
              <button
                type="button"
                className="text-sm font-medium text-brand-700 underline"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? 'Hide other plans' : `View more plans available (${otherPlans.length})`}
              </button>
              {showAll ? (
                <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {otherPlans.map((plan) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      onSubscribe={(id) => subscribe.mutate(id)}
                      subscribing={subscribe.isPending}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : plans.data && plans.data.length > 0 ? (
        // No active plan → let the user choose one.
        <>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Choose a plan</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {plans.data.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onSubscribe={(id) => subscribe.mutate(id)}
                subscribing={subscribe.isPending}
              />
            ))}
          </div>
        </>
      ) : (
        <Card>
          <p className="text-sm text-slate-500">No plans available yet.</p>
        </Card>
      )}
    </>
  );
}
