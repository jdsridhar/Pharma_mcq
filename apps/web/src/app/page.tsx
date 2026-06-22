import Link from 'next/link';
import { SystemStatus } from '@/components/system-status';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <span className="w-fit rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700">
        Pharmacy MCQ Platform
      </span>

      <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
        Master pharmacy exams with adaptive practice
      </h1>

      <p className="max-w-2xl text-lg text-slate-600">
        Practice from a curated question bank, take timed mock tests with cohort ranking, and let
        the platform surface your weak areas and a personalized study plan.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/register"
          className="rounded-md bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Get started
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          Sign in
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-4 pt-2">
        <SystemStatus />
        <a
          className="text-sm font-medium text-brand-600 underline-offset-4 hover:underline"
          href="http://localhost:4000/api/docs"
          target="_blank"
          rel="noreferrer"
        >
          API documentation →
        </a>
      </div>
    </main>
  );
}
