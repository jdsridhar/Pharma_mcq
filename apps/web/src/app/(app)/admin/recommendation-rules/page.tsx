'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Spinner } from '@/components/ui';
import { ApiClientError } from '@/lib/api-client';
import { recommendationRuleApi } from '@/lib/api/endpoints';

export default function AdminRecommendationRulesPage() {
  const queryClient = useQueryClient();
  const rules = useQuery({ queryKey: ['recommendation-rules'], queryFn: recommendationRuleApi.list });
  const invalidate = (): void => void queryClient.invalidateQueries({ queryKey: ['recommendation-rules'] });

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [priority, setPriority] = useState(0);
  const create = useMutation({
    mutationFn: () =>
      recommendationRuleApi.create({ code: code.trim(), name: name.trim(), definition: {}, isActive: true, priority }),
    onSuccess: () => {
      setCode('');
      setName('');
      setPriority(0);
      invalidate();
    },
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => recommendationRuleApi.update(id, { isActive }),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (id: string) => recommendationRuleApi.remove(id), onSuccess: invalidate });

  const list = rules.data?.items ?? [];

  return (
    <>
      <PageHeader title="Recommendation rules" description="Configurable rules that drive the personalised recommendations feed." />

      <Card className="mb-6">
        <h2 className="font-semibold text-slate-900">New rule</h2>
        {create.isError ? (
          <div className="mt-2">
            <Alert>{create.error instanceof ApiClientError ? create.error.message : 'Could not create rule'}</Alert>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Field label="Code" htmlFor="rcode">
              <Input id="rcode" placeholder="weak_area" value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
          </div>
          <div className="min-w-48 flex-1">
            <Field label="Name" htmlFor="rname">
              <Input id="rname" placeholder="Practise weak areas" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <div className="w-28">
            <Field label="Priority" htmlFor="rprio">
              <Input id="rprio" type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
            </Field>
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !code.trim() || !name.trim()}>
            {create.isPending ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </Card>

      {rules.isLoading ? (
        <Spinner />
      ) : list.length > 0 ? (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Code</th>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Priority</th>
                <th className="px-5 py-3 font-medium">Active</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((rule) => (
                <tr key={rule.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-3 font-mono text-xs text-slate-700">{rule.code}</td>
                  <td className="px-5 py-3 text-slate-800">{rule.name}</td>
                  <td className="px-5 py-3 text-slate-600">{rule.priority}</td>
                  <td className="px-5 py-3">
                    <Badge tone={rule.isActive ? 'green' : 'slate'}>{rule.isActive ? 'active' : 'inactive'}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => toggle.mutate({ id: rule.id, isActive: !rule.isActive })} disabled={toggle.isPending}>
                        {rule.isActive ? 'Disable' : 'Enable'}
                      </Button>
                      <Button variant="ghost" onClick={() => remove.mutate(rule.id)} disabled={remove.isPending}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-slate-500">No rules yet — create one above.</p>
        </Card>
      )}
    </>
  );
}
