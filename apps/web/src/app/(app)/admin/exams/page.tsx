'use client';

import type { BlueprintPlanDto, ExamBlueprintDto } from '@pharmacy/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Spinner } from '@/components/ui';
import { KnowledgeSetPicker } from '@/components/knowledge-set-picker';
import { ApiClientError } from '@/lib/api-client';
import { examApi } from '@/lib/api/endpoints';

const fmt = (s: string): string => new Date(s).toLocaleDateString();

export default function AdminExamsPage() {
  const queryClient = useQueryClient();
  const exams = useQuery({ queryKey: ['exam-profiles'], queryFn: examApi.list });
  const [selected, setSelected] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const create = useMutation({
    mutationFn: () => examApi.create({ code: code.trim(), name: name.trim(), description: description.trim() || undefined, status: 'DRAFT' }),
    onSuccess: () => {
      setCode('');
      setName('');
      setDescription('');
      void queryClient.invalidateQueries({ queryKey: ['exam-profiles'] });
    },
  });

  const list = exams.data?.items ?? [];

  return (
    <>
      <PageHeader title="Exams" description="Exam profiles and their question blueprints." />

      <Card className="mb-6">
        <h2 className="font-semibold text-slate-900">New exam profile</h2>
        {create.isError ? (
          <div className="mt-2">
            <Alert>{create.error instanceof ApiClientError ? create.error.message : 'Could not create exam profile'}</Alert>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Field label="Code" htmlFor="ecode">
              <Input id="ecode" placeholder="EXAM01" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </Field>
          </div>
          <div className="min-w-48 flex-1">
            <Field label="Name" htmlFor="ename">
              <Input id="ename" placeholder="Entrance Exam" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <div className="min-w-48 flex-1">
            <Field label="Description (optional)" htmlFor="edesc">
              <Input id="edesc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !code.trim() || !name.trim()}>
            {create.isPending ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </Card>

      {exams.isLoading ? (
        <Spinner />
      ) : list.length > 0 ? (
        <div className="space-y-3">
          {list.map((e) => (
            <Card key={e.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">
                    {e.name} <span className="font-mono text-xs text-slate-400">{e.code}</span>
                  </p>
                  <p className="text-sm text-slate-500">Created {fmt(e.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="slate">{e.status.toLowerCase()}</Badge>
                  <Button variant="secondary" onClick={() => setSelected(selected === e.id ? null : e.id)}>
                    {selected === e.id ? 'Close' : 'Blueprints'}
                  </Button>
                </div>
              </div>
              {selected === e.id ? (
                <>
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <p className="mb-2 text-sm font-medium text-slate-700">Knowledge areas</p>
                    <KnowledgeSetPicker
                      key={`ek-${e.id}`}
                      saveLabel="Set knowledge areas"
                      onSave={(ids) => examApi.setKnowledge(e.id, { items: ids.map((knowledgeNodeId) => ({ knowledgeNodeId })) })}
                    />
                  </div>
                  <BlueprintManager examId={e.id} />
                </>
              ) : null}
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <p className="text-sm text-slate-500">No exam profiles yet — create one above.</p>
        </Card>
      )}
    </>
  );
}

function BlueprintManager({ examId }: { examId: string }) {
  const queryClient = useQueryClient();
  const blueprints = useQuery({ queryKey: ['blueprints', examId], queryFn: () => examApi.blueprints(examId) });
  const invalidate = (): void => void queryClient.invalidateQueries({ queryKey: ['blueprints', examId] });

  const [name, setName] = useState('');
  const [totalQuestions, setTotal] = useState(50);
  const createBp = useMutation({
    mutationFn: () => examApi.createBlueprint(examId, { name: name.trim(), totalQuestions, isActive: true }),
    onSuccess: () => {
      setName('');
      invalidate();
    },
  });

  const list = blueprints.data ?? [];

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Field label="New blueprint name" htmlFor={`bp-${examId}`}>
            <Input id={`bp-${examId}`} placeholder="Full mock blueprint" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <div className="w-28">
          <Field label="Total Qs" htmlFor={`bpt-${examId}`}>
            <Input id={`bpt-${examId}`} type="number" value={totalQuestions} onChange={(e) => setTotal(Number(e.target.value))} />
          </Field>
        </div>
        <Button onClick={() => createBp.mutate()} disabled={createBp.isPending || !name.trim()}>
          {createBp.isPending ? 'Adding…' : 'Add blueprint'}
        </Button>
      </div>

      {blueprints.isLoading ? (
        <Spinner />
      ) : list.length > 0 ? (
        <div className="space-y-3">
          {list.map((bp) => (
            <BlueprintCard key={bp.id} examId={examId} blueprint={bp} onChanged={invalidate} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No blueprints yet for this exam.</p>
      )}
    </div>
  );
}

function BlueprintCard({
  examId,
  blueprint,
  onChanged,
}: {
  examId: string;
  blueprint: ExamBlueprintDto;
  onChanged: () => void;
}) {
  const [label, setLabel] = useState('');
  const [weightPercent, setWeight] = useState(10);
  // Weight-driven: # Qs is derived, never typed. Preview the count for the weight being entered.
  const previewCount = Math.round((Math.max(0, weightPercent) / 100) * blueprint.totalQuestions);
  const remainingWeight = Math.round((100 - blueprint.weightTotal) * 100) / 100;

  const addItem = useMutation({
    mutationFn: () => examApi.addBlueprintItem(examId, blueprint.id, { label: label.trim(), weightPercent }),
    onSuccess: () => {
      setLabel('');
      setWeight(10);
      onChanged();
    },
  });

  const [plan, setPlan] = useState<BlueprintPlanDto | null>(null);
  const validate = useMutation({
    mutationFn: () => examApi.blueprintPlan(examId, blueprint.id),
    onSuccess: (p) => setPlan(p),
  });

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-800">
          {blueprint.name} <span className="text-xs text-slate-400">· {blueprint.totalQuestions} Qs</span>
        </p>
        <Badge tone={blueprint.isReady ? 'green' : 'amber'}>
          weights {blueprint.weightTotal}%{blueprint.isReady ? ' ✓' : ` · ${remainingWeight}% left`}
        </Badge>
      </div>
      {blueprint.items.length > 0 ? (
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          {blueprint.items.map((it) => (
            <li key={it.id} className="flex justify-between">
              <span>{it.label}</span>
              <span className="text-slate-400">
                {it.weightPercent}% · {it.questionCount}q
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-slate-400">No items yet.</p>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <Field label="Item label" htmlFor={`it-${blueprint.id}`}>
            <Input id={`it-${blueprint.id}`} placeholder="Pharmacology" value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
        </div>
        <div className="w-24">
          <Field label="Weight %" htmlFor={`iw-${blueprint.id}`}>
            <Input id={`iw-${blueprint.id}`} type="number" value={weightPercent} onChange={(e) => setWeight(Number(e.target.value))} />
          </Field>
        </div>
        <div className="w-20">
          <Field label="# Qs (auto)" htmlFor={`ic-${blueprint.id}`}>
            <Input id={`ic-${blueprint.id}`} type="number" value={previewCount} readOnly disabled />
          </Field>
        </div>
        <Button variant="secondary" onClick={() => addItem.mutate()} disabled={addItem.isPending || !label.trim()}>
          {addItem.isPending ? 'Adding…' : 'Add item'}
        </Button>
        <Button variant="ghost" onClick={() => validate.mutate()} disabled={validate.isPending}>
          {validate.isPending ? 'Checking…' : 'Validate pool'}
        </Button>
      </div>

      {addItem.isError ? (
        <div className="mt-2">
          <Alert>{addItem.error instanceof ApiClientError ? addItem.error.message : 'Could not add item'}</Alert>
        </div>
      ) : null}

      {plan ? (
        <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm">
          <p className="font-medium text-slate-700">
            {plan.sourceableCount}/{plan.totalQuestions} questions sourceable{' '}
            <Badge tone={plan.isReady ? 'green' : 'amber'}>{plan.isReady ? 'ready' : 'needs attention'}</Badge>
          </p>
          {plan.sections.length > 0 ? (
            <ul className="mt-2 space-y-0.5 text-slate-600">
              {plan.sections.map((s) => (
                <li key={s.itemId} className="flex justify-between">
                  <span>{s.label}</span>
                  <span className={s.availableCount < s.targetCount ? 'text-red-600' : 'text-slate-400'}>
                    need {s.targetCount} · have {s.availableCount}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {plan.warnings.length > 0 ? (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-amber-700">
              {plan.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
