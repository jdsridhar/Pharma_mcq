'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { type AdminUserStatusT, type CreateUserInput, roleRank } from '@pharmacy/contracts';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { ApiClientError } from '@/lib/api-client';
import { adminApi } from '@/lib/api/endpoints';
import { useAuthStore } from '@/store/auth-store';

const fmt = (s: string | null): string => (s ? new Date(s).toLocaleDateString() : '—');

const statusTone = (status: string): 'green' | 'amber' | 'red' | 'slate' =>
  status === 'ACTIVE' ? 'green' : status === 'SUSPENDED' ? 'red' : status === 'INACTIVE' ? 'amber' : 'slate';

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [term, setTerm] = useState('');
  const [committed, setCommitted] = useState('');

  const users = useQuery({
    queryKey: ['admin-users', committed],
    queryFn: () => adminApi.users(committed || undefined),
  });
  const roles = useQuery({ queryKey: ['admin-roles'], queryFn: adminApi.roles });

  // Grantable roles are capped at the viewer's own rank — an admin can't grant a tier above themselves.
  const viewerRank = roleRank(useAuthStore((s) => s.user?.roles) ?? []);
  const grantableRoles = (roles.data ?? []).filter((r) => roleRank([r.name]) <= viewerRank);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin-users'] });

  const assignRole = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) => adminApi.assignRole(userId, roleId),
    onSuccess: invalidate,
  });

  const setStatus = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: AdminUserStatusT }) => adminApi.setStatus(userId, status),
    onSuccess: invalidate,
  });

  // ── Create user ──
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateUserInput>({ name: '', email: '', password: '', roleId: undefined });
  const createUser = useMutation({
    mutationFn: () =>
      adminApi.createUser({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        roleId: form.roleId || undefined,
      }),
    onSuccess: () => {
      setForm({ name: '', email: '', password: '', roleId: undefined });
      setShowCreate(false);
      invalidate();
    },
  });

  return (
    <>
      <PageHeader
        title="Users"
        description="Manage accounts, roles and access."
        actions={
          <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? 'Close' : '+ New user'}</Button>
        }
      />

      {showCreate ? (
        <Card className="mb-4">
          <h2 className="font-semibold text-slate-900">Create user</h2>
          {createUser.isError ? (
            <div className="mt-2">
              <Alert>{createUser.error instanceof ApiClientError ? createUser.error.message : 'Could not create user'}</Alert>
            </div>
          ) : null}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="nu-name">
              <Input id="nu-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Email" htmlFor="nu-email">
              <Input id="nu-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </Field>
            <Field label="Password (min 10, upper/lower/digit)" htmlFor="nu-pass">
              <Input id="nu-pass" type="text" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
            </Field>
            <Field label="Role" htmlFor="nu-role">
              <Select id="nu-role" value={form.roleId ?? ''} onChange={(e) => setForm((f) => ({ ...f, roleId: e.target.value || undefined }))}>
                <option value="">— No role —</option>
                {grantableRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-3 flex justify-end">
            <Button onClick={() => createUser.mutate()} disabled={createUser.isPending || !form.name.trim() || !form.email.trim() || !form.password}>
              {createUser.isPending ? 'Creating…' : 'Create user'}
            </Button>
          </div>
        </Card>
      ) : null}

      <Card className="mb-4">
        <form
          className="flex gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setCommitted(term.trim());
          }}
        >
          <Input
            placeholder="Search by name or email…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="max-w-md"
          />
          <Button type="submit">Search</Button>
          {committed ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setTerm('');
                setCommitted('');
              }}
            >
              Clear
            </Button>
          ) : null}
        </form>
      </Card>

      {users.isLoading ? (
        <Spinner />
      ) : users.error ? (
        <Alert>Could not load users.</Alert>
      ) : users.data && users.data.items.length > 0 ? (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">User</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Roles</th>
                <th className="px-5 py-3 font-medium">Last login</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.data.items.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 align-top last:border-0">
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-800">{u.name}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={statusTone(u.status)}>{u.status.toLowerCase()}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.length > 0 ? (
                        u.roles.map((r) => (
                          <Badge key={r} tone="blue">
                            {r}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{fmt(u.lastLoginAt)}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-col gap-2">
                      <Select
                        aria-label={`Assign role to ${u.email}`}
                        value=""
                        disabled={assignRole.isPending}
                        onChange={(e) => {
                          if (e.target.value) assignRole.mutate({ userId: u.id, roleId: e.target.value });
                        }}
                      >
                        <option value="">Add role…</option>
                        {grantableRoles
                          .filter((r) => !u.roles.includes(r.name))
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                      </Select>
                      {u.status === 'ACTIVE' ? (
                        <Button
                          variant="danger"
                          onClick={() => setStatus.mutate({ userId: u.id, status: 'SUSPENDED' })}
                          disabled={setStatus.isPending}
                        >
                          Suspend
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          onClick={() => setStatus.mutate({ userId: u.id, status: 'ACTIVE' })}
                          disabled={setStatus.isPending}
                        >
                          Activate
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-slate-500">No users found.</p>
        </Card>
      )}
    </>
  );
}
