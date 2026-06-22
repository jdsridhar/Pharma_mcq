'use client';

import type { CurriculumTreeNodeDto } from '@pharmacy/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { KnowledgeSetPicker } from '@/components/knowledge-set-picker';
import { ApiClientError } from '@/lib/api-client';
import { curriculumApi } from '@/lib/api/endpoints';

function flatten(nodes: CurriculumTreeNodeDto[], depth = 0): { id: string; name: string; depth: number }[] {
  return nodes.flatMap((n) => [{ id: n.id, name: n.name, depth }, ...flatten(n.children, depth + 1)]);
}

function TreeNodes({ nodes, depth = 0 }: { nodes: CurriculumTreeNodeDto[]; depth?: number }) {
  return (
    <ul className={depth === 0 ? 'space-y-1' : 'ml-4 space-y-1 border-l border-slate-200 pl-3'}>
      {nodes.map((n) => (
        <li key={n.id}>
          <span className="text-sm text-slate-700">{n.name}</span>
          {n.code ? <span className="ml-2 font-mono text-xs text-slate-400">{n.code}</span> : null}
          {n.children.length > 0 ? <TreeNodes nodes={n.children} depth={depth + 1} /> : null}
        </li>
      ))}
    </ul>
  );
}

export default function AdminCurriculumPage() {
  const queryClient = useQueryClient();
  const curricula = useQuery({ queryKey: ['curricula'], queryFn: curriculumApi.list });
  const [selected, setSelected] = useState<string | null>(null);
  const tree = useQuery({
    queryKey: ['curriculum-tree', selected],
    queryFn: () => curriculumApi.tree(selected as string),
    enabled: !!selected,
  });

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const createCurriculum = useMutation({
    mutationFn: () => curriculumApi.create({ code: code.trim(), name: name.trim(), status: 'DRAFT' }),
    onSuccess: (c) => {
      setCode('');
      setName('');
      setSelected(c.id);
      void queryClient.invalidateQueries({ queryKey: ['curricula'] });
    },
  });

  const [nodeName, setNodeName] = useState('');
  const [parentId, setParentId] = useState('');
  const [kbNode, setKbNode] = useState('');
  const addNode = useMutation({
    mutationFn: () =>
      curriculumApi.addNode(selected as string, { name: nodeName.trim(), parentId: parentId || undefined, displayOrder: 0 }),
    onSuccess: () => {
      setNodeName('');
      setParentId('');
      void queryClient.invalidateQueries({ queryKey: ['curriculum-tree', selected] });
    },
  });

  const list = curricula.data?.items ?? [];
  const flat = tree.data ? flatten(tree.data) : [];

  return (
    <>
      <PageHeader title="Curriculum" description="Build curricula as an ordered tree of subjects → chapters → topics." />

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <div className="space-y-4">
          <Card>
            <h2 className="font-semibold text-slate-900">New curriculum</h2>
            {createCurriculum.isError ? (
              <div className="mt-2">
                <Alert>{createCurriculum.error instanceof ApiClientError ? createCurriculum.error.message : 'Failed'}</Alert>
              </div>
            ) : null}
            <div className="mt-3 space-y-3">
              <Field label="Code" htmlFor="ccode">
                <Input id="ccode" placeholder="BPHARM" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
              </Field>
              <Field label="Name" htmlFor="cname">
                <Input id="cname" placeholder="B.Pharm" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Button onClick={() => createCurriculum.mutate()} disabled={createCurriculum.isPending || !code.trim() || !name.trim()}>
                {createCurriculum.isPending ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </Card>

          <Card className="p-0">
            {curricula.isLoading ? (
              <div className="p-4"><Spinner /></div>
            ) : list.length > 0 ? (
              <ul>
                {list.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(c.id)}
                      className={`flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left text-sm last:border-0 hover:bg-slate-50 ${selected === c.id ? 'bg-brand-50' : ''}`}
                    >
                      <span className="text-slate-800">{c.name}</span>
                      <Badge tone="slate">{c.status.toLowerCase()}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-4 text-sm text-slate-500">No curricula yet.</p>
            )}
          </Card>
        </div>

        <Card>
          {!selected ? (
            <p className="text-sm text-slate-500">Select a curriculum to view its tree and add nodes.</p>
          ) : (
            <>
              <h2 className="font-semibold text-slate-900">Structure</h2>
              <div className="mt-3">
                {tree.isLoading ? <Spinner /> : flat.length > 0 ? <TreeNodes nodes={tree.data ?? []} /> : <p className="text-sm text-slate-500">No nodes yet.</p>}
              </div>

              <div className="mt-5 border-t border-slate-100 pt-4">
                <p className="mb-2 text-sm font-medium text-slate-700">Add node</p>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-48 flex-1">
                    <Field label="Name" htmlFor="nn">
                      <Input id="nn" placeholder="Chapter / Topic name" value={nodeName} onChange={(e) => setNodeName(e.target.value)} />
                    </Field>
                  </div>
                  <div className="w-56">
                    <Field label="Parent" htmlFor="np">
                      <Select id="np" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                        <option value="">(root)</option>
                        {flat.map((f) => (
                          <option key={f.id} value={f.id}>
                            {'— '.repeat(f.depth)}{f.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Button onClick={() => addNode.mutate()} disabled={addNode.isPending || !nodeName.trim()}>
                    {addNode.isPending ? 'Adding…' : 'Add'}
                  </Button>
                </div>
              </div>

              <div className="mt-5 border-t border-slate-100 pt-4">
                <p className="mb-2 text-sm font-medium text-slate-700">Map knowledge to a node</p>
                <div className="w-72">
                  <Field label="Node" htmlFor="kbn">
                    <Select id="kbn" value={kbNode} onChange={(e) => setKbNode(e.target.value)}>
                      <option value="">— select node —</option>
                      {flat.map((f) => (
                        <option key={f.id} value={f.id}>
                          {'— '.repeat(f.depth)}
                          {f.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                {kbNode ? (
                  <div className="mt-2">
                    <KnowledgeSetPicker
                      key={kbNode}
                      saveLabel="Set node knowledge"
                      onSave={(ids) => curriculumApi.setNodeKnowledge(selected as string, kbNode, { knowledgeNodeIds: ids })}
                    />
                  </div>
                ) : null}
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
