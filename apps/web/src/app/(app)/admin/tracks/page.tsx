'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { KnowledgeSetPicker } from '@/components/knowledge-set-picker';
import { ApiClientError } from '@/lib/api-client';
import { trackApi } from '@/lib/api/endpoints';

export default function AdminTracksPage() {
  const queryClient = useQueryClient();
  const tracks = useQuery({ queryKey: ['tracks'], queryFn: trackApi.list });
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useQuery({
    queryKey: ['track-detail', selected],
    queryFn: () => trackApi.get(selected as string),
    enabled: !!selected,
  });

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const createTrack = useMutation({
    mutationFn: () => trackApi.create({ code: code.trim(), name: name.trim(), status: 'DRAFT' }),
    onSuccess: (t) => {
      setCode('');
      setName('');
      setSelected(t.id);
      void queryClient.invalidateQueries({ queryKey: ['tracks'] });
    },
  });

  const [moduleName, setModuleName] = useState('');
  const [kbModule, setKbModule] = useState('');
  const addModule = useMutation({
    mutationFn: () => trackApi.addModule(selected as string, { name: moduleName.trim(), displayOrder: 0 }),
    onSuccess: () => {
      setModuleName('');
      void queryClient.invalidateQueries({ queryKey: ['track-detail', selected] });
    },
  });

  const list = tracks.data?.items ?? [];
  const modules = detail.data?.modules ?? [];

  return (
    <>
      <PageHeader title="Learning tracks" description="Guided study paths made of ordered modules." />

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <div className="space-y-4">
          <Card>
            <h2 className="font-semibold text-slate-900">New track</h2>
            {createTrack.isError ? (
              <div className="mt-2">
                <Alert>{createTrack.error instanceof ApiClientError ? createTrack.error.message : 'Failed'}</Alert>
              </div>
            ) : null}
            <div className="mt-3 space-y-3">
              <Field label="Code" htmlFor="tcode">
                <Input id="tcode" placeholder="TRACK01" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
              </Field>
              <Field label="Name" htmlFor="tname">
                <Input id="tname" placeholder="Foundations" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Button onClick={() => createTrack.mutate()} disabled={createTrack.isPending || !code.trim() || !name.trim()}>
                {createTrack.isPending ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </Card>

          <Card className="p-0">
            {tracks.isLoading ? (
              <div className="p-4"><Spinner /></div>
            ) : list.length > 0 ? (
              <ul>
                {list.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(t.id)}
                      className={`flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left text-sm last:border-0 hover:bg-slate-50 ${selected === t.id ? 'bg-brand-50' : ''}`}
                    >
                      <span className="text-slate-800">{t.name}</span>
                      <Badge tone="slate">{t.status.toLowerCase()}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-4 text-sm text-slate-500">No tracks yet.</p>
            )}
          </Card>
        </div>

        <Card>
          {!selected ? (
            <p className="text-sm text-slate-500">Select a track to manage its modules.</p>
          ) : (
            <>
              <h2 className="font-semibold text-slate-900">Modules</h2>
              <div className="mt-3">
                {detail.isLoading ? (
                  <Spinner />
                ) : modules.length > 0 ? (
                  <ol className="space-y-1">
                    {modules.map((m, i) => (
                      <li key={m.id} className="flex items-center gap-2 text-sm text-slate-700">
                        <span className="text-xs text-slate-400">{i + 1}.</span> {m.name}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-slate-500">No modules yet.</p>
                )}
              </div>
              <div className="mt-5 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
                <div className="min-w-48 flex-1">
                  <Field label="Module name" htmlFor="mn">
                    <Input id="mn" value={moduleName} onChange={(e) => setModuleName(e.target.value)} />
                  </Field>
                </div>
                <Button onClick={() => addModule.mutate()} disabled={addModule.isPending || !moduleName.trim()}>
                  {addModule.isPending ? 'Adding…' : 'Add module'}
                </Button>
              </div>

              {modules.length > 0 ? (
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <p className="mb-2 text-sm font-medium text-slate-700">Map knowledge to a module</p>
                  <div className="w-72">
                    <Field label="Module" htmlFor="kbm">
                      <Select id="kbm" value={kbModule} onChange={(e) => setKbModule(e.target.value)}>
                        <option value="">— select module —</option>
                        {modules.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  {kbModule ? (
                    <div className="mt-2">
                      <KnowledgeSetPicker
                        key={kbModule}
                        saveLabel="Set module knowledge"
                        onSave={(ids) => trackApi.setModuleKnowledge(selected as string, kbModule, { knowledgeNodeIds: ids })}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </Card>
      </div>
    </>
  );
}
