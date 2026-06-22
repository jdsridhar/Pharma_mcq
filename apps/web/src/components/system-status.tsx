'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

interface HealthResponse {
  status: string;
  timestamp: string;
}

/**
 * Live API status pill — exercises the full client→server wiring (React Query → fetch
 * → NestJS health endpoint). Polls every 15s.
 */
export function SystemStatus() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch<HealthResponse>('/health'),
    refetchInterval: 15_000,
  });

  const label = isLoading
    ? 'Checking…'
    : isError
      ? 'Unreachable'
      : data?.status === 'ok'
        ? 'Operational'
        : 'Degraded';

  const dotClass = isLoading ? 'bg-slate-400' : isError ? 'bg-red-500' : 'bg-brand-500';

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm">
      <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} aria-hidden="true" />
      <span className="text-slate-700">API status: {label}</span>
    </div>
  );
}
