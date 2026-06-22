'use client';

import { PERMISSIONS } from '@pharmacy/contracts';
import type { ReactNode } from 'react';
import { Alert, PageHeader, Spinner } from '@/components/ui';
import { useAuthStore } from '@/store/auth-store';

/**
 * Client-side guard for the whole /admin subtree: a visitor needs at least one admin-area
 * permission to see any admin page shell. Individual pages + the API still enforce the precise
 * permission for each action (defence in depth) — this just avoids showing a broken page to
 * users who reach an /admin/* URL directly without the rights.
 */
const ADMIN_AREA_PERMISSIONS: string[] = [
  PERMISSIONS.QUESTION_CREATE,
  PERMISSIONS.QUESTION_REVIEW,
  PERMISSIONS.KNOWLEDGE_MANAGE,
  PERMISSIONS.CURRICULUM_MANAGE,
  PERMISSIONS.EXAM_MANAGE,
  PERMISSIONS.MOCKTEST_MANAGE,
  PERMISSIONS.TRACK_MANAGE,
  PERMISSIONS.PLAN_MANAGE,
  PERMISSIONS.USER_READ,
  PERMISSIONS.AUDIT_READ,
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const hasPermission = useAuthStore((s) => s.hasPermission);

  if (status === 'loading') return <Spinner />;

  const allowed = ADMIN_AREA_PERMISSIONS.some((p) => hasPermission(p));
  if (!allowed) {
    return (
      <>
        <PageHeader title="Not authorized" description="You don't have access to the admin area." />
        <Alert>Ask an administrator if you believe you should have access.</Alert>
      </>
    );
  }

  return <>{children}</>;
}
