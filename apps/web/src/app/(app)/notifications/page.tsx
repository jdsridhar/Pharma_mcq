'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, PageHeader, Spinner } from '@/components/ui';
import { notificationApi } from '@/lib/api/endpoints';

const fmt = (s: string): string => new Date(s).toLocaleString();

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const feed = useQuery({ queryKey: ['notifications'], queryFn: () => notificationApi.feed(30) });
  const invalidate = (): void => void queryClient.invalidateQueries({ queryKey: ['notifications'] });

  const read = useMutation({ mutationFn: (id: string) => notificationApi.read(id), onSuccess: invalidate });
  const readAll = useMutation({ mutationFn: () => notificationApi.readAll(), onSuccess: invalidate });

  const items = feed.data?.items ?? [];
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        description={unread > 0 ? `${unread} unread` : 'You’re all caught up.'}
        actions={
          unread > 0 ? (
            <Button variant="secondary" onClick={() => readAll.mutate()} disabled={readAll.isPending}>
              {readAll.isPending ? 'Marking…' : 'Mark all read'}
            </Button>
          ) : undefined
        }
      />

      {feed.isLoading ? (
        <Spinner />
      ) : feed.error ? (
        <Alert>Could not load notifications.</Alert>
      ) : items.length > 0 ? (
        <div className="space-y-2">
          {items.map((n) => (
            <Card key={n.id} className={n.readAt ? '' : 'border-brand-200 bg-brand-50/40'}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    {!n.readAt ? <span className="h-2 w-2 rounded-full bg-brand-500" aria-hidden /> : null}
                    <p className="font-medium text-slate-900">{n.title ?? n.template}</p>
                    <Badge tone="slate">{n.channel.toLowerCase()}</Badge>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{n.body}</p>
                  <p className="mt-1 text-xs text-slate-400">{fmt(n.createdAt)}</p>
                </div>
                {!n.readAt ? (
                  <Button variant="ghost" onClick={() => read.mutate(n.id)} disabled={read.isPending}>
                    Mark read
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <p className="text-sm text-slate-500">No notifications yet.</p>
        </Card>
      )}
    </>
  );
}
