'use client';

import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Card, PageHeader, Spinner } from '@/components/ui';
import { adminApi } from '@/lib/api/endpoints';

const fmt = (s: string): string => new Date(s).toLocaleString();

export default function AdminAuditPage() {
  const logs = useQuery({ queryKey: ['audit-logs'], queryFn: adminApi.auditLogs });

  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of privileged actions." />

      {logs.isLoading ? (
        <Spinner />
      ) : logs.error ? (
        <Alert>Could not load the audit log.</Alert>
      ) : logs.data && logs.data.items.length > 0 ? (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-5 py-3 font-medium">Action</th>
                <th className="px-5 py-3 font-medium">Entity</th>
                <th className="px-5 py-3 font-medium">Actor</th>
                <th className="px-5 py-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.data.items.map((log) => (
                <tr key={log.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-3 whitespace-nowrap text-slate-500">{fmt(log.createdAt)}</td>
                  <td className="px-5 py-3">
                    <Badge tone="slate">{log.action}</Badge>
                  </td>
                  <td className="px-5 py-3 text-slate-600">
                    {log.entityType}
                    {log.entityId ? <span className="ml-1 font-mono text-xs text-slate-400">{log.entityId}</span> : null}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">{log.actorUserId ?? 'system'}</td>
                  <td className="px-5 py-3 text-slate-500">{log.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-slate-500">No audit entries yet.</p>
        </Card>
      )}
    </>
  );
}
