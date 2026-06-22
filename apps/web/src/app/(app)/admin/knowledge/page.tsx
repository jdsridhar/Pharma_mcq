'use client';

import { KNOWLEDGE_RELATIONSHIP_TYPES, type KnowledgeRelationshipTypeT } from '@pharmacy/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { ApiClientError } from '@/lib/api-client';
import { knowledgeApi } from '@/lib/api/endpoints';

export default function AdminKnowledgePage() {
  const queryClient = useQueryClient();
  const nodes = useQuery({ queryKey: ['knowledge-nodes'], queryFn: () => knowledgeApi.list() });
  const invalidate = (): void => void queryClient.invalidateQueries({ queryKey: ['knowledge-nodes'] });

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('CONCEPT');
  const create = useMutation({
    mutationFn: () => knowledgeApi.create({ code: code.trim(), name: name.trim(), type: type.trim() }),
    onSuccess: () => {
      setCode('');
      setName('');
      invalidate();
    },
  });

  const remove = useMutation({ mutationFn: (id: string) => knowledgeApi.remove(id), onSuccess: invalidate });

  // Edge creator
  const [parentNodeId, setParent] = useState('');
  const [childNodeId, setChild] = useState('');
  const [relationshipType, setRel] = useState<KnowledgeRelationshipTypeT>('IS_A');
  const createEdge = useMutation({
    mutationFn: () => knowledgeApi.createEdge({ parentNodeId, childNodeId, relationshipType }),
    onSuccess: () => {
      setParent('');
      setChild('');
    },
  });

  const list = nodes.data?.items ?? [];

  return (
    <>
      <PageHeader title="Knowledge graph" description="Topics (nodes) and their relationships (edges)." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold text-slate-900">New node</h2>
          {create.isError ? (
            <div className="mt-2">
              <Alert>{create.error instanceof ApiClientError ? create.error.message : 'Could not create node'}</Alert>
            </div>
          ) : null}
          <div className="mt-3 space-y-3">
            <Field label="Code" htmlFor="kcode">
              <Input id="kcode" placeholder="PHARMACOLOGY" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </Field>
            <Field label="Name" htmlFor="kname">
              <Input id="kname" placeholder="Pharmacology" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Type" htmlFor="ktype">
              <Input id="ktype" placeholder="DOMAIN / CONCEPT / DRUG…" value={type} onChange={(e) => setType(e.target.value)} />
            </Field>
            <Button onClick={() => create.mutate()} disabled={create.isPending || !code.trim() || !name.trim()}>
              {create.isPending ? 'Creating…' : 'Create node'}
            </Button>
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold text-slate-900">Link nodes (edge)</h2>
          {createEdge.isError ? (
            <div className="mt-2">
              <Alert>{createEdge.error instanceof ApiClientError ? createEdge.error.message : 'Could not create edge'}</Alert>
            </div>
          ) : null}
          <div className="mt-3 space-y-3">
            <Field label="Parent" htmlFor="kp">
              <Select id="kp" value={parentNodeId} onChange={(e) => setParent(e.target.value)}>
                <option value="">— select —</option>
                {list.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Relationship" htmlFor="kr">
              <Select id="kr" value={relationshipType} onChange={(e) => setRel(e.target.value as KnowledgeRelationshipTypeT)}>
                {KNOWLEDGE_RELATIONSHIP_TYPES.map((r) => (
                  <option key={r} value={r}>
                    {r.replace(/_/g, ' ').toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Child" htmlFor="kc">
              <Select id="kc" value={childNodeId} onChange={(e) => setChild(e.target.value)}>
                <option value="">— select —</option>
                {list.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              variant="secondary"
              onClick={() => createEdge.mutate()}
              disabled={createEdge.isPending || !parentNodeId || !childNodeId || parentNodeId === childNodeId}
            >
              {createEdge.isPending ? 'Linking…' : 'Create edge'}
            </Button>
          </div>
        </Card>
      </div>

      <h2 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">Nodes ({list.length})</h2>
      {nodes.isLoading ? (
        <Spinner />
      ) : list.length > 0 ? (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Code</th>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((n) => (
                <tr key={n.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-3 font-mono text-xs text-slate-700">{n.code}</td>
                  <td className="px-5 py-3 text-slate-800">{n.name}</td>
                  <td className="px-5 py-3">
                    <Badge tone="slate">{n.type}</Badge>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button variant="ghost" onClick={() => remove.mutate(n.id)} disabled={remove.isPending}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-slate-500">No nodes yet — create one above.</p>
        </Card>
      )}
    </>
  );
}
