'use client';

import { type BulkActionResultDto, PERMISSIONS, type QuestionBulkAction } from '@pharmacy/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Alert, Badge, Button, Card, PageHeader, Select, Spinner } from '@/components/ui';
import { ApiClientError } from '@/lib/api-client';
import { questionApi } from '@/lib/api/endpoints';
import { useAuthStore } from '@/store/auth-store';

const STATUSES = ['', 'DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED'] as const;
const fmt = (s: string): string => new Date(s).toLocaleDateString();
const statusTone = (s: string): 'slate' | 'amber' | 'green' | 'blue' =>
  s === 'PUBLISHED' ? 'green' : s === 'APPROVED' ? 'blue' : s === 'REVIEW' ? 'amber' : 'slate';

export default function AdminQuestionsPage() {
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const userId = useAuthStore((s) => s.user?.id);
  const [status, setStatus] = useState<string>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkResult, setBulkResult] = useState<BulkActionResultDto | null>(null);
  const [selectingAll, setSelectingAll] = useState(false);

  const questions = useQuery({
    queryKey: ['questions', status],
    queryFn: () => questionApi.list({ status: status || undefined }),
  });

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['questions'] });
  };

  const action = useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: 'submit' | 'approve' | 'reject' | 'publish' }) => {
      if (kind === 'reject') {
        const reason = window.prompt('Reason for rejection?')?.trim();
        if (!reason) return Promise.reject(new Error('cancelled'));
        return questionApi.reject(id, reason);
      }
      return questionApi[kind](id);
    },
    onSuccess: refresh,
  });

  const bulk = useMutation({
    mutationFn: ({ ids, kind }: { ids: string[]; kind: QuestionBulkAction }) => questionApi.bulkAction(ids, kind),
    onSuccess: (res) => {
      setBulkResult(res);
      setSelected(new Set());
      refresh();
    },
  });

  const canAuthor = hasPermission(PERMISSIONS.QUESTION_CREATE);
  const canUpdate = hasPermission(PERMISSIONS.QUESTION_UPDATE);
  const canReview = hasPermission(PERMISSIONS.QUESTION_REVIEW);
  const canApprove = hasPermission(PERMISSIONS.QUESTION_APPROVE);
  const canPublish = hasPermission(PERMISSIONS.QUESTION_PUBLISH);
  const canDelete = hasPermission(PERMISSIONS.QUESTION_DELETE);
  const canSubmit = (q: { status: string; createdById: string | null }): boolean =>
    q.status === 'DRAFT' && (canReview || (canUpdate && q.createdById === userId));

  const items = questions.data?.items ?? [];
  const total = questions.data?.meta.total ?? 0;
  const pageIds = items.map((q) => q.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const toggle = (id: string): void =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAllOnPage = (): void =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });

  // Select every question matching the current filter (paginates the API).
  const selectAllMatching = async (): Promise<void> => {
    setSelectingAll(true);
    try {
      const ids: string[] = [];
      for (let page = 1; page <= 200; page++) {
        const res = await questionApi.list({ status: status || undefined, page, pageSize: 100 });
        res.items.forEach((q) => ids.push(q.id));
        if (res.items.length < 100 || page * 100 >= res.meta.total) break;
      }
      setSelected(new Set(ids));
    } finally {
      setSelectingAll(false);
    }
  };

  const runBulk = (kind: QuestionBulkAction): void => {
    const ids = [...selected];
    if (ids.length === 0) return;
    const verb = kind.charAt(0).toUpperCase() + kind.slice(1);
    if (!window.confirm(`${verb} ${ids.length} selected question(s)?`)) return;
    if (kind === 'delete' && !window.confirm('This permanently removes them. Continue?')) return;
    setBulkResult(null);
    bulk.mutate({ ids, kind });
  };

  // Statuses an action can act on (null = any). Used to only offer valid actions for the selection.
  const ACTION_FROM: Record<QuestionBulkAction, string[] | null> = {
    submit: ['DRAFT'],
    approve: ['REVIEW'],
    reject: ['REVIEW'],
    publish: ['APPROVED'],
    archive: ['PUBLISHED', 'APPROVED'],
    delete: null,
  };
  // What statuses are in the selection? With a status filter, every match is that status; otherwise
  // infer from the selected rows we can see. Empty ⇒ unknown, so don't restrict.
  const knownStatuses = status
    ? new Set([status])
    : new Set(items.filter((q) => selected.has(q.id)).map((q) => q.status));
  const validForSelection = (kind: QuestionBulkAction): boolean => {
    const from = ACTION_FROM[kind];
    if (from === null) return true;
    if (knownStatuses.size === 0) return true;
    return from.some((s) => knownStatuses.has(s));
  };

  // Bulk buttons: the user is permitted to run AND the action is valid for the selected statuses.
  const baseBulkButtons: { kind: QuestionBulkAction; label: string; variant?: 'secondary' | 'danger'; show: boolean }[] = [
    { kind: 'submit', label: 'Submit', variant: 'secondary', show: canUpdate || canReview },
    { kind: 'approve', label: 'Approve', show: canApprove },
    { kind: 'publish', label: 'Publish', show: canPublish },
    { kind: 'reject', label: 'Reject', variant: 'danger', show: canReview },
    { kind: 'archive', label: 'Archive', variant: 'secondary', show: canPublish },
    { kind: 'delete', label: 'Delete', variant: 'danger', show: canDelete },
  ];
  const bulkButtons = baseBulkButtons.map((b) => ({ ...b, show: b.show && validForSelection(b.kind) }));

  return (
    <>
      <PageHeader
        title="Questions"
        description="Author, import and move questions through the review workflow — individually or in bulk."
        actions={
          canAuthor ? (
            <div className="flex gap-2">
              <Link href="/admin/questions/import">
                <Button variant="secondary">⬆ Import</Button>
              </Link>
              <Link href="/admin/questions/new">
                <Button>+ New question</Button>
              </Link>
            </div>
          ) : undefined
        }
      />

      <div className="mb-4 w-56">
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setSelected(new Set());
          }}
          aria-label="Filter by status"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === '' ? 'All statuses' : s.toLowerCase()}
            </option>
          ))}
        </Select>
      </div>

      {action.isError && (action.error as Error).message !== 'cancelled' ? (
        <div className="mb-4">
          <Alert>{(action.error as Error).message}</Alert>
        </div>
      ) : null}
      {bulk.isError ? (
        <div className="mb-4">
          <Alert>{bulk.error instanceof ApiClientError ? bulk.error.message : 'Bulk action failed'}</Alert>
        </div>
      ) : null}
      {bulkResult ? (
        <div className="mb-4">
          <Alert tone={bulkResult.failed === 0 ? 'green' : 'red'}>
            {bulkResult.action}: {bulkResult.succeeded} succeeded, {bulkResult.failed} failed (of {bulkResult.total}).
            {bulkResult.failed > 0 ? ` First error: ${bulkResult.results.find((r) => !r.ok)?.error ?? ''}` : ''}
          </Alert>
        </div>
      ) : null}

      {/* Bulk action bar */}
      {selected.size > 0 ? (
        <Card className="mb-4 flex flex-wrap items-center gap-3 border-brand-200 bg-brand-50">
          <span className="text-sm font-medium text-slate-700">{selected.size} selected</span>
          <div className="flex flex-wrap gap-2">
            {bulkButtons
              .filter((b) => b.show)
              .map((b) => (
                <Button key={b.kind} variant={b.variant} onClick={() => runBulk(b.kind)} disabled={bulk.isPending}>
                  {b.label}
                </Button>
              ))}
          </div>
          <button
            type="button"
            className="ml-auto text-xs text-slate-500 underline"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
        </Card>
      ) : null}

      {questions.isLoading ? (
        <Spinner />
      ) : questions.error ? (
        <Alert>Could not load questions.</Alert>
      ) : items.length > 0 ? (
        <Card className="p-0">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-2 text-xs text-slate-500">
            <span>
              Showing {items.length} of {total}
            </span>
            {total > items.length ? (
              <button
                type="button"
                className="underline disabled:opacity-50"
                onClick={() => void selectAllMatching()}
                disabled={selectingAll}
              >
                {selectingAll ? 'Selecting…' : `Select all ${total} matching`}
              </button>
            ) : null}
          </div>
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="px-5 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all on page"
                    checked={allOnPageSelected}
                    onChange={toggleAllOnPage}
                  />
                </th>
                <th className="px-5 py-3 font-medium">Code</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Created</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((q) => (
                <tr key={q.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${q.questionCode}`}
                      checked={selected.has(q.id)}
                      onChange={() => toggle(q.id)}
                    />
                  </td>
                  <td className="px-5 py-3">
                    <p className="font-mono text-xs text-slate-700">{q.questionCode}</p>
                    {q.preview ? <p className="mt-0.5 max-w-xs truncate text-xs text-slate-500">{q.preview}</p> : null}
                  </td>
                  <td className="px-5 py-3 text-slate-600">{q.questionType.replace(/_/g, ' ').toLowerCase()}</td>
                  <td className="px-5 py-3">
                    <Badge tone={statusTone(q.status)}>{q.status.toLowerCase()}</Badge>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{fmt(q.createdAt)}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-2">
                      {canUpdate ? (
                        <Link href={`/admin/questions/${q.id}`}>
                          <Button variant="ghost">Edit</Button>
                        </Link>
                      ) : null}
                      {canSubmit(q) ? (
                        <Button onClick={() => action.mutate({ id: q.id, kind: 'submit' })} disabled={action.isPending}>
                          Submit
                        </Button>
                      ) : null}
                      {q.status === 'REVIEW' && canApprove ? (
                        <Button onClick={() => action.mutate({ id: q.id, kind: 'approve' })} disabled={action.isPending}>
                          Approve
                        </Button>
                      ) : null}
                      {q.status === 'REVIEW' && canReview ? (
                        <Button variant="danger" onClick={() => action.mutate({ id: q.id, kind: 'reject' })} disabled={action.isPending}>
                          Reject
                        </Button>
                      ) : null}
                      {q.status === 'APPROVED' && canPublish ? (
                        <Button onClick={() => action.mutate({ id: q.id, kind: 'publish' })} disabled={action.isPending}>
                          Publish
                        </Button>
                      ) : null}
                      {q.status === 'PUBLISHED' ? <span className="text-xs text-slate-400">live</span> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-slate-500">
            No questions{status ? ` with status ${status.toLowerCase()}` : ''} yet.
            {canAuthor ? ' Create one or import a workbook to get started.' : ''}
          </p>
        </Card>
      )}
    </>
  );
}
