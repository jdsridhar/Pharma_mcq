'use client';

import type { CreateVersionInput, CurriculumTreeNodeDto, QuestionDetailDto } from '@pharmacy/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { answerSpecToInitial, type QuestionContentInitial, QuestionContentEditor } from '@/components/question-content-editor';
import { ApiClientError } from '@/lib/api-client';
import { curriculumApi, examApi, knowledgeApi, questionApi, trackApi } from '@/lib/api/endpoints';

const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
const fmt = (s: string): string => new Date(s).toLocaleString();
const statusTone = (s: string): 'slate' | 'amber' | 'green' | 'blue' =>
  s === 'PUBLISHED' ? 'green' : s === 'APPROVED' ? 'blue' : s === 'REVIEW' ? 'amber' : 'slate';

function flattenCurriculum(nodes: CurriculumTreeNodeDto[], prefix: string): { id: string; label: string }[] {
  return nodes.flatMap((n) => [{ id: n.id, label: `${prefix}${n.name}` }, ...flattenCurriculum(n.children, `${prefix}${n.name} › `)]);
}

export default function EditQuestionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ['question', id], queryFn: () => questionApi.get(id) });

  const remove = useMutation({
    mutationFn: () => questionApi.remove(id),
    onSuccess: () => router.push('/admin/questions'),
  });

  if (detail.isLoading) return <Spinner />;
  if (detail.error || !detail.data) return <Alert>Could not load this question.</Alert>;
  const q = detail.data;

  return (
    <>
      <PageHeader
        title={q.questionCode}
        description={`${q.questionType.replace(/_/g, ' ').toLowerCase()} · `}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={statusTone(q.status)}>{q.status.toLowerCase()}</Badge>
            <Button
              variant="danger"
              onClick={() => {
                if (window.confirm('Delete this question? It will be soft-deleted.')) remove.mutate();
              }}
              disabled={remove.isPending}
            >
              Delete
            </Button>
            <Link href="/admin/questions">
              <Button variant="secondary">← Back</Button>
            </Link>
          </div>
        }
      />

      <div className="space-y-6">
        <ContentCard question={q} onSaved={() => void queryClient.invalidateQueries({ queryKey: ['question', id] })} />
        <div className="grid gap-6 lg:grid-cols-2">
          <MetaCard question={q} onSaved={() => void queryClient.invalidateQueries({ queryKey: ['question', id] })} />
          <MappingsCard question={q} onSaved={() => void queryClient.invalidateQueries({ queryKey: ['question', id] })} />
        </div>
        <TagsCard question={q} onSaved={() => void queryClient.invalidateQueries({ queryKey: ['question', id] })} />
        <VersionsCard questionId={id} />
      </div>
    </>
  );
}

function ContentCard({ question, onSaved }: { question: QuestionDetailDto; onSaved: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const version = question.workingVersion ?? question.currentVersion;

  const initial: QuestionContentInitial = {
    questionType: question.questionType,
    authorDifficulty: question.authorDifficulty,
    ...(version
      ? {
          questionText: version.questionText,
          explanation: version.explanation ?? undefined,
          options: version.options.map((o) => ({ text: o.optionText, isCorrect: o.isCorrect })),
          ...answerSpecToInitial(version.answerSpec),
        }
      : {}),
  };

  const addVersion = useMutation({
    mutationFn: (content: CreateVersionInput) => questionApi.addVersion(question.id, content),
    onSuccess: () => {
      setSaved(true);
      setError(null);
      onSaved();
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : 'Could not save the new version'),
  });

  return (
    <Card>
      <h2 className="font-semibold text-slate-900">Edit content</h2>
      <p className="mb-3 mt-1 text-sm text-slate-500">
        Saving creates a new version and resets the question to <strong>DRAFT</strong> for re-review. The published
        version keeps serving until you re-publish. (Type is fixed; difficulty is managed under Metadata.)
      </p>
      {saved ? (
        <div className="mb-3">
          <Alert tone="green">New version saved — status is now DRAFT.</Alert>
        </div>
      ) : null}
      <QuestionContentEditor
        key={version?.id ?? question.id}
        initial={initial}
        lockType
        showDifficulty={false}
        submitLabel="Save as new version"
        submitting={addVersion.isPending}
        error={error}
        onSubmit={(content) => {
          setSaved(false);
          addVersion.mutate(content);
        }}
      />
    </Card>
  );
}

function MetaCard({ question, onSaved }: { question: QuestionDetailDto; onSaved: () => void }) {
  const [difficulty, setDifficulty] = useState<(typeof DIFFICULTIES)[number]>(question.authorDifficulty);
  const [language, setLanguage] = useState(question.language);
  const update = useMutation({
    mutationFn: () => questionApi.updateMeta(question.id, { authorDifficulty: difficulty, language }),
    onSuccess: onSaved,
  });

  return (
    <Card>
      <h2 className="font-semibold text-slate-900">Metadata</h2>
      <div className="mt-3 space-y-3">
        <Field label="Difficulty" htmlFor="md">
          <Select id="md" value={difficulty} onChange={(e) => setDifficulty(e.target.value as (typeof DIFFICULTIES)[number])}>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d.toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Language" htmlFor="ml">
          <Select id="ml" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="en">English</option>
            <option value="hi">Hindi</option>
          </Select>
        </Field>
        <Button variant="secondary" onClick={() => update.mutate()} disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save metadata'}
        </Button>
      </div>
    </Card>
  );
}

function CheckGroup({
  items,
  checked,
  onToggle,
  empty,
}: {
  items: { id: string; label: string }[];
  checked: Set<string>;
  onToggle: (id: string) => void;
  empty: string;
}) {
  if (items.length === 0) return <p className="text-xs text-slate-400">{empty}</p>;
  return (
    <div className="max-h-40 space-y-1 overflow-auto rounded-lg border border-slate-200 p-2">
      {items.map((it) => (
        <label key={it.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
          <input type="checkbox" className="h-4 w-4" checked={checked.has(it.id)} onChange={() => onToggle(it.id)} />
          {it.label}
        </label>
      ))}
    </div>
  );
}

function MappingSection({
  title,
  desc,
  loading,
  items,
  checked,
  onToggle,
  onSave,
  saving,
  empty,
  saveLabel,
  divider,
}: {
  title: string;
  desc: string;
  loading: boolean;
  items: { id: string; label: string }[];
  checked: Set<string>;
  onToggle: (id: string) => void;
  onSave: () => void;
  saving: boolean;
  empty: string;
  saveLabel: string;
  divider?: boolean;
}) {
  return (
    <div className={divider ? 'border-t border-slate-100 pt-4' : ''}>
      <h2 className="font-semibold text-slate-900">{title}</h2>
      <p className="mb-2 mt-1 text-xs text-slate-500">{desc}</p>
      {loading ? (
        <Spinner />
      ) : (
        <>
          <CheckGroup items={items} checked={checked} onToggle={onToggle} empty={empty} />
          <Button variant="secondary" className="mt-3" onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : saveLabel}
          </Button>
        </>
      )}
    </div>
  );
}

function MappingsCard({ question, onSaved }: { question: QuestionDetailDto; onSaved: () => void }) {
  const nodes = useQuery({ queryKey: ['knowledge-nodes'], queryFn: () => knowledgeApi.list() });
  const exams = useQuery({ queryKey: ['exam-profiles'], queryFn: examApi.list });
  const curriculumNodes = useQuery({
    queryKey: ['all-curriculum-nodes'],
    queryFn: async () => {
      const curricula = (await curriculumApi.list()).items;
      const trees = await Promise.all(curricula.map((c) => curriculumApi.tree(c.id).then((t) => ({ c, t }))));
      return trees.flatMap(({ c, t }) => flattenCurriculum(t, `${c.name} › `));
    },
  });
  const trackModules = useQuery({
    queryKey: ['all-track-modules'],
    queryFn: async () => {
      const tracks = (await trackApi.list()).items;
      const details = await Promise.all(tracks.map((t) => trackApi.get(t.id)));
      return details.flatMap((d) => d.modules.map((m) => ({ id: m.id, label: `${d.name} › ${m.name}` })));
    },
  });

  const [kChecked, setKChecked] = useState<Set<string>>(new Set(question.knowledgeNodeIds));
  const [eChecked, setEChecked] = useState<Set<string>>(new Set(question.examProfileIds));
  const [cChecked, setCChecked] = useState<Set<string>>(new Set(question.curriculumNodeIds));
  const [tChecked, setTChecked] = useState<Set<string>>(new Set(question.trackModuleIds));

  const toggle = (setter: typeof setKChecked) => (id: string): void =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const saveKnowledge = useMutation({ mutationFn: () => questionApi.setKnowledgeMappings(question.id, { items: [...kChecked].map((knowledgeNodeId) => ({ knowledgeNodeId })) }), onSuccess: onSaved });
  const saveExams = useMutation({ mutationFn: () => questionApi.setExamMappings(question.id, { items: [...eChecked].map((examProfileId) => ({ examProfileId })) }), onSuccess: onSaved });
  const saveCurriculum = useMutation({ mutationFn: () => questionApi.setCurriculumMappings(question.id, { items: [...cChecked].map((curriculumNodeId) => ({ curriculumNodeId })) }), onSuccess: onSaved });
  const saveTracks = useMutation({ mutationFn: () => questionApi.setTrackMappings(question.id, { items: [...tChecked].map((trackModuleId) => ({ trackModuleId })) }), onSuccess: onSaved });

  return (
    <Card className="space-y-5">
      <MappingSection
        title="Knowledge topics"
        desc="Feeds per-topic analytics & weak-area detection."
        loading={nodes.isLoading}
        items={(nodes.data?.items ?? []).map((n) => ({ id: n.id, label: n.name }))}
        checked={kChecked}
        onToggle={toggle(setKChecked)}
        onSave={() => saveKnowledge.mutate()}
        saving={saveKnowledge.isPending}
        empty="No knowledge topics yet — add under Admin → Knowledge."
        saveLabel="Save topics"
      />
      <MappingSection
        title="Exam profiles"
        desc="Tag for exam-specific practice & mock tests."
        loading={exams.isLoading}
        items={(exams.data?.items ?? []).map((e) => ({ id: e.id, label: e.name }))}
        checked={eChecked}
        onToggle={toggle(setEChecked)}
        onSave={() => saveExams.mutate()}
        saving={saveExams.isPending}
        empty="No exam profiles yet — add under Admin → Exams."
        saveLabel="Save exams"
        divider
      />
      <MappingSection
        title="Curriculum nodes"
        desc="Place this question in your curriculum tree."
        loading={curriculumNodes.isLoading}
        items={curriculumNodes.data ?? []}
        checked={cChecked}
        onToggle={toggle(setCChecked)}
        onSave={() => saveCurriculum.mutate()}
        saving={saveCurriculum.isPending}
        empty="No curriculum nodes yet — add under Admin → Curriculum."
        saveLabel="Save curriculum"
        divider
      />
      <MappingSection
        title="Track modules"
        desc="Attach to learning-track modules."
        loading={trackModules.isLoading}
        items={trackModules.data ?? []}
        checked={tChecked}
        onToggle={toggle(setTChecked)}
        onSave={() => saveTracks.mutate()}
        saving={saveTracks.isPending}
        empty="No track modules yet — add under Admin → Tracks."
        saveLabel="Save tracks"
        divider
      />
    </Card>
  );
}

function TagsCard({ question, onSaved }: { question: QuestionDetailDto; onSaved: () => void }) {
  const [tags, setTags] = useState(question.tags.join(', '));
  const save = useMutation({
    mutationFn: () =>
      questionApi.setTags(question.id, { tags: tags.split(',').map((t) => t.trim()).filter(Boolean) }),
    onSuccess: onSaved,
  });
  return (
    <Card>
      <h2 className="font-semibold text-slate-900">Tags</h2>
      <p className="mb-2 mt-1 text-xs text-slate-500">Comma-separated free-form tags for search &amp; organisation.</p>
      <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="cardiology, high-yield, formula" />
      <Button variant="secondary" className="mt-3" onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? 'Saving…' : 'Save tags'}
      </Button>
    </Card>
  );
}

function VersionsCard({ questionId }: { questionId: string }) {
  const versions = useQuery({ queryKey: ['question-versions', questionId], queryFn: () => questionApi.versions(questionId) });
  const list = versions.data ?? [];
  return (
    <Card className="p-0">
      <div className="px-5 py-3 text-sm font-medium text-slate-700">Version history</div>
      {versions.isLoading ? (
        <div className="p-4"><Spinner /></div>
      ) : list.length > 0 ? (
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className="px-5 py-2 font-medium">Version</th>
              <th className="px-5 py-2 font-medium">Status</th>
              <th className="px-5 py-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {list.map((v) => (
              <tr key={v.id} className="border-b border-slate-100 last:border-0">
                <td className="px-5 py-2 text-slate-700">v{v.versionNumber}</td>
                <td className="px-5 py-2">
                  <Badge tone={statusTone(v.status)}>{v.status.toLowerCase()}</Badge>
                </td>
                <td className="px-5 py-2 text-slate-500">{fmt(v.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="p-4 text-sm text-slate-500">No versions.</p>
      )}
    </Card>
  );
}
