'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { PERMISSIONS, SystemRole } from '@pharmacy/contracts';
import type { ReactNode } from 'react';
import { Button, cn } from '@/components/ui';
import { useAuthStore } from '@/store/auth-store';

interface NavItem {
  href: string;
  label: string;
  /** Show if the user has this permission. */
  permission?: string;
  /** Show if the user has ANY of these permissions. */
  anyOf?: string[];
  /** Show if the user has ANY of these roles. */
  roles?: string[];
}

const STUDENT_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/practice', label: 'Practice' },
  { href: '/mock-tests', label: 'Mock Tests' },
  { href: '/revision', label: 'Revision' },
  { href: '/study-plan', label: 'Study Plan' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/plans', label: 'Plans' },
  { href: '/notifications', label: 'Notifications' },
];

const ADMIN_NAV: NavItem[] = [
  { href: '/admin/organizations', label: 'Organizations', roles: [SystemRole.SUPER_ADMIN] },
  { href: '/admin/questions', label: 'Questions', anyOf: [PERMISSIONS.QUESTION_CREATE, PERMISSIONS.QUESTION_REVIEW] },
  { href: '/admin/knowledge', label: 'Knowledge', permission: PERMISSIONS.KNOWLEDGE_MANAGE },
  { href: '/admin/curriculum', label: 'Curriculum', permission: PERMISSIONS.CURRICULUM_MANAGE },
  { href: '/admin/exams', label: 'Exams', permission: PERMISSIONS.EXAM_MANAGE },
  { href: '/admin/mock-tests', label: 'Mock Tests (build)', permission: PERMISSIONS.MOCKTEST_MANAGE },
  { href: '/admin/tracks', label: 'Tracks', permission: PERMISSIONS.TRACK_MANAGE },
  { href: '/admin/plans', label: 'Plans (manage)', permission: PERMISSIONS.PLAN_MANAGE },
  { href: '/admin/users', label: 'Users', permission: PERMISSIONS.USER_READ },
  { href: '/admin/audit', label: 'Audit Log', permission: PERMISSIONS.AUDIT_READ },
  { href: '/admin/recommendation-rules', label: 'Rec. Rules', roles: [SystemRole.ADMIN, SystemRole.SUPER_ADMIN] },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={cn(
        'block rounded-md px-3 py-2 text-sm font-medium',
        active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
      )}
    >
      {item.label}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const hasRole = useAuthStore((s) => s.hasRole);
  const logout = useAuthStore((s) => s.logout);

  const adminItems = ADMIN_NAV.filter((item) => {
    if (item.anyOf) return item.anyOf.some((p) => hasPermission(p));
    if (item.roles) return item.roles.some((r) => hasRole(r));
    if (item.permission) return hasPermission(item.permission);
    return true;
  });

  const onLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_1fr]">
      <aside className="border-b border-slate-200 bg-white md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 px-5 py-4">
          <span className="h-7 w-7 rounded-lg bg-brand-600" aria-hidden="true" />
          <span className="font-semibold text-slate-900">Pharmacy MCQ</span>
        </div>
        <nav className="space-y-1 px-3 pb-4">
          {STUDENT_NAV.map((item) => (
            <NavLink key={item.href} item={item} active={pathname === item.href} />
          ))}
          {adminItems.length > 0 ? (
            <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Administration
            </p>
          ) : null}
          {adminItems.map((item) => (
            <NavLink key={item.href} item={item} active={pathname.startsWith(item.href)} />
          ))}
        </nav>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            {user ? <span>Signed in as {user.name}</span> : null}
            {user?.organizationName ? (
              <span
                className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800"
                title="Your institution (tenant)"
              >
                🏢 {user.organizationName}
              </span>
            ) : null}
          </div>
          <Button variant="secondary" onClick={onLogout}>
            Sign out
          </Button>
        </header>
        <main className="flex-1 px-6 py-8">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
