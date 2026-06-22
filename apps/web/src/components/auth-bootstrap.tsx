'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth-store';

/** Restores the session once on app load (silent cookie refresh → /auth/me). */
export function AuthBootstrap() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);
  return null;
}
