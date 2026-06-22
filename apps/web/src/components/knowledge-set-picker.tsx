'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Spinner } from '@/components/ui';
import { knowledgeApi } from '@/lib/api/endpoints';

/**
 * Reusable knowledge-node multi-select that **replaces** a target's knowledge mappings
 * (exam / curriculum-node / track-module). The API exposes only a PUT (set) for these, so the
 * picker starts empty — `key` it by the target id so it resets when the target changes.
 */
export function KnowledgeSetPicker({
  onSave,
  saveLabel = 'Set knowledge',
}: {
  onSave: (ids: string[]) => Promise<unknown>;
  saveLabel?: string;
}) {
  const nodes = useQuery({ queryKey: ['knowledge-nodes'], queryFn: () => knowledgeApi.list() });
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const save = useMutation({ mutationFn: () => onSave([...checked]) });
  const list = nodes.data?.items ?? [];

  if (nodes.isLoading) return <Spinner />;
  if (list.length === 0) return <p className="text-xs text-slate-400">No knowledge nodes yet — add under Admin → Knowledge.</p>;

  return (
    <>
      <div className="max-h-40 space-y-1 overflow-auto rounded-lg border border-slate-200 p-2">
        {list.map((n) => (
          <label key={n.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={checked.has(n.id)}
              onChange={() =>
                setChecked((prev) => {
                  const next = new Set(prev);
                  if (next.has(n.id)) next.delete(n.id);
                  else next.add(n.id);
                  return next;
                })
              }
            />
            {n.name}
          </label>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Button variant="secondary" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : saveLabel}
        </Button>
        {save.isSuccess ? <span className="text-xs text-brand-600">Saved ({checked.size})</span> : null}
      </div>
      <p className="mt-1 text-xs text-slate-400">Replaces the existing knowledge links for this item.</p>
    </>
  );
}
