'use client';

import type { CreateVersionInput } from '@pharmacy/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, Field, Input, PageHeader } from '@/components/ui';
import { QuestionContentEditor } from '@/components/question-content-editor';
import { ApiClientError } from '@/lib/api-client';
import { knowledgeApi, questionApi } from '@/lib/api/endpoints';

export default function NewQuestionPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [knowledgeIds, setKnowledgeIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const knowledgeNodes = useQuery({ queryKey: ['knowledge-nodes'], queryFn: () => knowledgeApi.list() });

  const create = useMutation({
    mutationFn: (content: CreateVersionInput) => questionApi.create({ ...content, questionCode: code.trim() }),
    onSuccess: async (created) => {
      if (knowledgeIds.length > 0) {
        try {
          await questionApi.setKnowledgeMappings(created.id, { items: knowledgeIds.map((id) => ({ knowledgeNodeId: id })) });
        } catch {
          // Mapping is best-effort — the question is already created.
        }
      }
      router.push('/admin/questions');
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : 'Could not create the question'),
  });

  const nodes = knowledgeNodes.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="New question"
        description="Author a question. It is created as a DRAFT — submit it for review next."
        actions={
          <Link href="/admin/questions">
            <Button variant="secondary">← Back</Button>
          </Link>
        }
      />

      <Card>
        <QuestionContentEditor
          submitLabel="Create draft"
          submitting={create.isPending}
          error={error}
          onSubmit={(content) => {
            setError(null);
            create.mutate(content);
          }}
          header={
            <Field label="Question code" htmlFor="code">
              <Input id="code" placeholder="PHA-001" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </Field>
          }
          footer={
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Knowledge topics (optional — powers topic analytics)</p>
              {nodes.length > 0 ? (
                <div className="max-h-40 space-y-1 overflow-auto rounded-lg border border-slate-200 p-2">
                  {nodes.map((n) => (
                    <label key={n.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={knowledgeIds.includes(n.id)}
                        onChange={() =>
                          setKnowledgeIds((prev) => (prev.includes(n.id) ? prev.filter((x) => x !== n.id) : [...prev, n.id]))
                        }
                      />
                      {n.name}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  No knowledge topics yet — add some under Admin → Knowledge to enable per-topic analytics.
                </p>
              )}
            </div>
          }
        />
      </Card>
    </>
  );
}
