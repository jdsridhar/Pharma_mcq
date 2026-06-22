import type { RegisterInput, UserPublic } from '@pharmacy/contracts';
import { create } from 'zustand';
import { authApi } from '@/lib/api/endpoints';
import { setAccessToken } from '@/lib/api/token';
import { getQueryClient } from '@/lib/query-client';

/** Drop all cached queries so a new principal never sees the previous user's data. */
function resetQueryCache(): void {
  getQueryClient().clear();
}

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthState {
  user: UserPublic | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
}

/**
 * Auth state: the `UserPublic` profile + status. The access token lives in the api/token
 * singleton (memory), the refresh token in an httpOnly cookie. `bootstrap` restores a session
 * on load via /auth/refresh — one request that both rotates the cookie and returns the user.
 * A 401 there simply means the visitor isn't logged in (handled as anonymous).
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: 'loading',

  login: async (email, password) => {
    const result = await authApi.login({ email, password });
    resetQueryCache();
    setAccessToken(result.accessToken);
    set({ user: result.user, status: 'authenticated' });
  },

  register: async (input) => {
    const result = await authApi.register(input);
    resetQueryCache();
    setAccessToken(result.accessToken);
    set({ user: result.user, status: 'authenticated' });
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore — clear locally regardless
    } finally {
      setAccessToken(null);
      set({ user: null, status: 'anonymous' });
      resetQueryCache();
    }
  },

  bootstrap: async () => {
    set({ status: 'loading' });
    try {
      const result = await authApi.refresh();
      setAccessToken(result.accessToken);
      set({ user: result.user, status: 'authenticated' });
    } catch {
      setAccessToken(null);
      set({ user: null, status: 'anonymous' });
    }
  },

  hasPermission: (permission) => get().user?.permissions.includes(permission) ?? false,
  hasRole: (role) => get().user?.roles.includes(role) ?? false,
}));
