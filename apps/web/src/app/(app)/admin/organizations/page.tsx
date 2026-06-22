'use client';

import { SystemRole } from '@pharmacy/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Spinner } from '@/components/ui';
import { ApiClientError } from '@/lib/api-client';
import { adminApi, commerceApi } from '@/lib/api/endpoints';

export default function AdminOrganizationsPage() {
  const queryClient = useQueryClient();
  const orgs = useQuery({ queryKey: ['organizations'], queryFn: adminApi.organizations });
  const roles = useQuery({ queryKey: ['admin-roles'], queryFn: adminApi.roles });
  const adminRoleId = roles.data?.find((r) => r.name === SystemRole.ADMIN)?.id;
  const invalidate = (): void => void queryClient.invalidateQueries({ queryKey: ['organizations'] });

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const createOrg = useMutation({
    mutationFn: () => adminApi.createOrganization({ name: name.trim(), slug: slug.trim() }),
    onSuccess: () => {
      setName('');
      setSlug('');
      invalidate();
    },
  });

  const list = orgs.data ?? [];

  return (
    <>
      <PageHeader
        title="Organizations"
        description="Institutions (tenants). Each gets its own admin, staff and students — isolated from other institutions."
      />

      <Card className="mb-6">
        <h2 className="font-semibold text-slate-900">New institution</h2>
        {createOrg.isError ? (
          <div className="mt-2">
            <Alert>{createOrg.error instanceof ApiClientError ? createOrg.error.message : 'Could not create institution'}</Alert>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <Field label="Name" htmlFor="oname">
              <Input id="oname" placeholder="Acme Pharmacy College" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <div className="w-56">
            <Field label="Slug (unique)" htmlFor="oslug">
              <Input id="oslug" placeholder="acme-pharmacy" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
            </Field>
          </div>
          <Button onClick={() => createOrg.mutate()} disabled={createOrg.isPending || !name.trim() || !slug.trim()}>
            {createOrg.isPending ? 'Creating…' : 'Create institution'}
          </Button>
        </div>
      </Card>

      {orgs.isLoading ? (
        <Spinner />
      ) : list.length > 0 ? (
        <div className="space-y-3">
          {list.map((org) => (
            <Card key={org.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">
                    {org.name} <span className="font-mono text-xs text-slate-400">{org.slug}</span>
                  </p>
                  <p className="text-sm text-slate-500">{org.userCount} user{org.userCount === 1 ? '' : 's'}</p>
                </div>
                <Badge tone={org.isActive ? 'green' : 'slate'}>{org.isActive ? 'active' : 'inactive'}</Badge>
              </div>
              <OrgSeats orgId={org.id} />
              <AddAdmin orgId={org.id} adminRoleId={adminRoleId} onAdded={invalidate} />
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <p className="text-sm text-slate-500">No institutions yet — create one above.</p>
        </Card>
      )}
    </>
  );
}

function OrgSeats({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const sub = useQuery({ queryKey: ['org-subscription', orgId], queryFn: () => adminApi.orgSubscription(orgId) });
  const plans = useQuery({ queryKey: ['active-plans'], queryFn: commerceApi.plans });
  // Only institution (seat-based) plans can be provisioned to an organization.
  const seatPlans = (plans.data ?? []).filter((p) => p.seatLimit != null);
  const [planId, setPlanId] = useState('');

  const provision = useMutation({
    mutationFn: () => adminApi.provisionOrgSubscription(orgId, { planId }),
    onSuccess: () => {
      setPlanId('');
      void queryClient.invalidateQueries({ queryKey: ['org-subscription', orgId] });
    },
  });

  const current = sub.data;
  const full = current?.seatsAvailable === 0;

  return (
    <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-slate-700">Seats:</span>
        {sub.isLoading ? (
          <span className="text-slate-400">loading…</span>
        ) : current ? (
          <Badge tone={full ? 'amber' : 'green'}>
            {current.seatsUsed}/{current.seatLimit ?? '∞'} used · {current.planName}
          </Badge>
        ) : (
          <span className="text-slate-500">no seat plan provisioned (unlimited)</span>
        )}
      </div>

      {provision.isError ? (
        <div className="mt-2">
          <Alert>{provision.error instanceof ApiClientError ? provision.error.message : 'Could not provision plan'}</Alert>
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          aria-label="Institution plan"
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          value={planId}
          onChange={(e) => setPlanId(e.target.value)}
        >
          <option value="">{seatPlans.length > 0 ? 'Select an institution plan…' : 'No institution plans — create one in Plans'}</option>
          {seatPlans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.seatLimit} seats)
            </option>
          ))}
        </select>
        <Button variant="secondary" onClick={() => provision.mutate()} disabled={!planId || provision.isPending}>
          {provision.isPending ? 'Provisioning…' : current ? 'Change plan' : 'Provision seats'}
        </Button>
      </div>
    </div>
  );
}

function AddAdmin({ orgId, adminRoleId, onAdded }: { orgId: string; adminRoleId: string | undefined; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const create = useMutation({
    mutationFn: () =>
      adminApi.createUser({ name: name.trim(), email: email.trim(), password, roleId: adminRoleId, organizationId: orgId }),
    onSuccess: () => {
      setName('');
      setEmail('');
      setPassword('');
      setOpen(false);
      onAdded();
    },
  });

  if (!open) {
    return (
      <div className="mt-3">
        <Button variant="secondary" onClick={() => setOpen(true)} disabled={!adminRoleId}>
          + Add institution admin
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <p className="mb-2 text-sm font-medium text-slate-700">New institution admin</p>
      {create.isError ? (
        <div className="mb-2">
          <Alert>{create.error instanceof ApiClientError ? create.error.message : 'Could not create admin'}</Alert>
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <Field label="Name" htmlFor={`an-${orgId}`}>
            <Input id={`an-${orgId}`} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <div className="min-w-48 flex-1">
          <Field label="Email" htmlFor={`ae-${orgId}`}>
            <Input id={`ae-${orgId}`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
        <div className="w-48">
          <Field label="Password (min 10)" htmlFor={`ap-${orgId}`}>
            <Input id={`ap-${orgId}`} type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>
        <Button onClick={() => create.mutate()} disabled={create.isPending || !name.trim() || !email.trim() || !password}>
          {create.isPending ? 'Creating…' : 'Create admin'}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
