'use client';

import { BILLING_INTERVALS, type FeatureDto, type PlanDetailDto } from '@pharmacy/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { ApiClientError } from '@/lib/api-client';
import { commerceApi } from '@/lib/api/endpoints';

const money = (minor: number, currency: string): string =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(minor / 100);

export default function AdminPlansPage() {
  const queryClient = useQueryClient();
  const plans = useQuery({ queryKey: ['admin-plans'], queryFn: commerceApi.plans });
  const features = useQuery({ queryKey: ['features'], queryFn: commerceApi.listFeatures });
  const invalidatePlans = (): void => void queryClient.invalidateQueries({ queryKey: ['admin-plans'] });

  // ── Create plan ──
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const createPlan = useMutation({
    mutationFn: () =>
      commerceApi.createPlan({ code: code.trim(), name: name.trim(), description: description.trim() || undefined, isActive: true }),
    onSuccess: () => {
      setCode('');
      setName('');
      setDescription('');
      invalidatePlans();
    },
  });

  // ── Create feature ──
  const [fKey, setFKey] = useState('');
  const [fName, setFName] = useState('');
  const createFeature = useMutation({
    mutationFn: () => commerceApi.createFeature({ key: fKey.trim(), name: fName.trim() }),
    onSuccess: () => {
      setFKey('');
      setFName('');
      void queryClient.invalidateQueries({ queryKey: ['features'] });
    },
  });

  return (
    <>
      <PageHeader title="Plans (manage)" description="Create subscription plans, prices and features." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold text-slate-900">New plan</h2>
          {createPlan.isError ? (
            <div className="mt-2">
              <Alert>{createPlan.error instanceof ApiClientError ? createPlan.error.message : 'Could not create plan'}</Alert>
            </div>
          ) : null}
          <div className="mt-3 space-y-3">
            <Field label="Code" htmlFor="pcode">
              <Input id="pcode" placeholder="PRO" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </Field>
            <Field label="Name" htmlFor="pname">
              <Input id="pname" placeholder="Pro" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Description (optional)" htmlFor="pdesc">
              <Input id="pdesc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <Button onClick={() => createPlan.mutate()} disabled={createPlan.isPending || !code.trim() || !name.trim()}>
              {createPlan.isPending ? 'Creating…' : 'Create plan'}
            </Button>
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold text-slate-900">New feature</h2>
          {createFeature.isError ? (
            <div className="mt-2">
              <Alert>{createFeature.error instanceof ApiClientError ? createFeature.error.message : 'Could not create feature'}</Alert>
            </div>
          ) : null}
          <div className="mt-3 space-y-3">
            <Field label="Key" htmlFor="fkey">
              <Input id="fkey" placeholder="mock_tests" value={fKey} onChange={(e) => setFKey(e.target.value.toLowerCase())} />
            </Field>
            <Field label="Name" htmlFor="fname">
              <Input id="fname" placeholder="Mock tests" value={fName} onChange={(e) => setFName(e.target.value)} />
            </Field>
            <Button onClick={() => createFeature.mutate()} disabled={createFeature.isPending || !fKey.trim() || !fName.trim()}>
              {createFeature.isPending ? 'Creating…' : 'Create feature'}
            </Button>
          </div>
          {features.data && features.data.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1">
              {features.data.map((f) => (
                <Badge key={f.id} tone="slate">
                  {f.key}
                </Badge>
              ))}
            </div>
          ) : null}
        </Card>
      </div>

      <h2 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">Existing plans</h2>
      {plans.isLoading ? (
        <Spinner />
      ) : plans.data && plans.data.length > 0 ? (
        <div className="space-y-4">
          {plans.data.map((plan) => (
            <PlanCard key={plan.id} plan={plan} features={features.data ?? []} onChanged={invalidatePlans} />
          ))}
        </div>
      ) : (
        <Card>
          <p className="text-sm text-slate-500">No plans yet — create one above.</p>
        </Card>
      )}
    </>
  );
}

function PlanCard({ plan, features, onChanged }: { plan: PlanDetailDto; features: FeatureDto[]; onChanged: () => void }) {
  const [interval, setInterval] = useState<(typeof BILLING_INTERVALS)[number]>('MONTHLY');
  const [amountMajor, setAmountMajor] = useState('');
  const [currency, setCurrency] = useState('INR');

  const addPrice = useMutation({
    mutationFn: () =>
      commerceApi.addPrice(plan.id, {
        billingInterval: interval,
        amountMinor: Math.round(Number(amountMajor || '0') * 100),
        currency: currency.trim().toUpperCase(),
        isActive: true,
      }),
    onSuccess: () => {
      setAmountMajor('');
      onChanged();
    },
  });

  const attachedKeys = new Set(plan.features.map((f) => f.key));
  const [checked, setChecked] = useState<Set<string>>(attachedKeys);
  const setFeatures = useMutation({
    mutationFn: () => commerceApi.setPlanFeatures(plan.id, { items: [...checked].map((key) => ({ featureKey: key })) }),
    onSuccess: onChanged,
  });

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">
            {plan.name} <span className="font-mono text-xs text-slate-400">{plan.code}</span>
          </h3>
          {plan.description ? <p className="text-sm text-slate-600">{plan.description}</p> : null}
        </div>
        <Badge tone={plan.isActive ? 'green' : 'slate'}>{plan.isActive ? 'active' : 'inactive'}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {plan.prices.length > 0 ? (
          plan.prices.map((p) => (
            <Badge key={p.id} tone="blue">
              {money(p.amountMinor, p.currency)} / {p.billingInterval.toLowerCase()}
            </Badge>
          ))
        ) : (
          <span className="text-xs text-slate-400">No prices yet</span>
        )}
      </div>

      {/* Add price */}
      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
        <div className="w-36">
          <Field label="Interval" htmlFor={`int-${plan.id}`}>
            <Select id={`int-${plan.id}`} value={interval} onChange={(e) => setInterval(e.target.value as (typeof BILLING_INTERVALS)[number])}>
              {BILLING_INTERVALS.map((b) => (
                <option key={b} value={b}>
                  {b.toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="w-28">
          <Field label="Amount" htmlFor={`amt-${plan.id}`}>
            <Input id={`amt-${plan.id}`} type="number" placeholder="499" value={amountMajor} onChange={(e) => setAmountMajor(e.target.value)} />
          </Field>
        </div>
        <div className="w-24">
          <Field label="Currency" htmlFor={`cur-${plan.id}`}>
            <Input id={`cur-${plan.id}`} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
          </Field>
        </div>
        <Button variant="secondary" onClick={() => addPrice.mutate()} disabled={addPrice.isPending || !amountMajor}>
          {addPrice.isPending ? 'Adding…' : 'Add price'}
        </Button>
      </div>

      {/* Features */}
      {features.length > 0 ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="mb-2 text-sm font-medium text-slate-700">Features</p>
          <div className="flex flex-wrap gap-3">
            {features.map((f) => (
              <label key={f.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={checked.has(f.key)}
                  onChange={() =>
                    setChecked((prev) => {
                      const next = new Set(prev);
                      if (next.has(f.key)) next.delete(f.key);
                      else next.add(f.key);
                      return next;
                    })
                  }
                />
                {f.name}
              </label>
            ))}
          </div>
          <Button variant="secondary" className="mt-3" onClick={() => setFeatures.mutate()} disabled={setFeatures.isPending}>
            {setFeatures.isPending ? 'Saving…' : 'Save features'}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
