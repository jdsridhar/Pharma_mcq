'use client';

import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@pharmacy/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert, Button, Card, Field, Input } from '@/components/ui';
import { ApiClientError } from '@/lib/api-client';
import { clientEnv } from '@/lib/env';
import { useAuthStore } from '@/store/auth-store';

export default function LoginPage() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Which action is in flight: 'form' or a demo account's email (null = idle).
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/dashboard');
    }
  }, [status, router]);

  const doLogin = async (em: string, pw: string, key: string): Promise<void> => {
    setError(null);
    setPending(key);
    try {
      await login(em, pw);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong');
      setPending(null);
    }
  };

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    void doLogin(email, password, 'form');
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-600">Welcome back to the Pharmacy MCQ Platform.</p>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          {error ? <Alert>{error}</Alert> : null}
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" disabled={pending !== null}>
            {pending === 'form' ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        {clientEnv.NEXT_PUBLIC_ENABLE_DEMO_LOGINS ? (
          <div className="mt-6 border-t border-slate-200 pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Demo accounts — one-click sign in
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  title={account.description}
                  onClick={() => void doLogin(account.email, account.password, account.email)}
                  disabled={pending !== null}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-left transition hover:border-brand-400 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="block text-sm font-medium text-slate-800">
                    {pending === account.email ? 'Signing in…' : account.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">{account.description}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              All demo accounts use password <code className="rounded bg-slate-100 px-1 py-0.5">{DEMO_PASSWORD}</code>
            </p>
          </div>
        ) : null}

        <p className="mt-5 text-sm text-slate-600">
          No account?{' '}
          <Link className="font-medium text-brand-600 hover:underline" href="/register">
            Create one
          </Link>
        </p>
      </Card>
    </main>
  );
}
