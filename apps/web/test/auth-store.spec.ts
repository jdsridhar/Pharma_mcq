jest.mock('@/lib/api/endpoints', () => ({
  authApi: {
    login: jest.fn(),
    register: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    me: jest.fn(),
  },
}));

import type { AuthResult, UserPublic } from '@pharmacy/contracts';
import { authApi } from '@/lib/api/endpoints';
import { getAccessToken, setAccessToken } from '@/lib/api/token';
import { useAuthStore } from '@/store/auth-store';

/**
 * The auth store coordinates the in-memory token + status transitions. We mock the endpoints
 * layer so these tests exercise store logic only (no fetch).
 */

const login = authApi.login as jest.MockedFunction<typeof authApi.login>;
const logout = authApi.logout as jest.MockedFunction<typeof authApi.logout>;
const refresh = authApi.refresh as jest.MockedFunction<typeof authApi.refresh>;

const user: UserPublic = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'stu@test.local',
  name: 'Stu Dent',
  status: 'ACTIVE',
  emailVerified: true,
  organizationId: null,
  organizationName: null,
  roles: ['Student'],
  permissions: ['practice:start'],
};

const authResult: AuthResult = { user, accessToken: 'tok-abc', tokenType: 'Bearer', expiresIn: 900 };

beforeEach(() => {
  useAuthStore.setState({ user: null, status: 'loading' });
  setAccessToken(null);
});

describe('auth store', () => {
  it('starts in the loading state', () => {
    expect(useAuthStore.getState().status).toBe('loading');
  });

  it('login stores the user + token and marks authenticated', async () => {
    login.mockResolvedValue(authResult);

    await useAuthStore.getState().login('stu@test.local', 'pw');

    const state = useAuthStore.getState();
    expect(state.status).toBe('authenticated');
    expect(state.user?.email).toBe('stu@test.local');
    expect(getAccessToken()).toBe('tok-abc');
    expect(login).toHaveBeenCalledWith({ email: 'stu@test.local', password: 'pw' });
  });

  it('hasPermission / hasRole reflect the current user', async () => {
    login.mockResolvedValue(authResult);
    await useAuthStore.getState().login('a', 'b');

    const state = useAuthStore.getState();
    expect(state.hasPermission('practice:start')).toBe(true);
    expect(state.hasPermission('admin:everything')).toBe(false);
    expect(state.hasRole('Student')).toBe(true);
    expect(state.hasRole('SuperAdmin')).toBe(false);
  });

  it('logout clears state even if the API call fails', async () => {
    setAccessToken('tok-abc');
    useAuthStore.setState({ user, status: 'authenticated' });
    logout.mockRejectedValue(new Error('network down'));

    await useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.status).toBe('anonymous');
    expect(getAccessToken()).toBeNull();
  });

  it('bootstrap restores a session from the refresh cookie', async () => {
    refresh.mockResolvedValue(authResult);
    await useAuthStore.getState().bootstrap();
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().user?.id).toBe(user.id);
    expect(getAccessToken()).toBe('tok-abc');
  });

  it('bootstrap falls back to anonymous when refresh fails (not logged in)', async () => {
    refresh.mockRejectedValue(new Error('401'));
    await useAuthStore.getState().bootstrap();
    expect(useAuthStore.getState().status).toBe('anonymous');
    expect(useAuthStore.getState().user).toBeNull();
  });
});
