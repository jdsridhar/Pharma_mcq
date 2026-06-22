import { clientEnv } from './env';
import { getAccessToken, setAccessToken } from './api/token';

/** API version prefix (health lives at /api/health; everything else under /api/v1). */
const REFRESH_PATH = '/v1/auth/refresh';

/** Mirrors the server's `{ error: ApiError }` envelope (@pharmacy/contracts). */
export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

let refreshing: Promise<boolean> | null = null;

function doFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getAccessToken();
  return fetch(`${clientEnv.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    credentials: 'include',
  });
}

/** Single-flight refresh: many concurrent 401s trigger only one /auth/refresh. */
function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${clientEnv.NEXT_PUBLIC_API_URL}${REFRESH_PATH}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (!res.ok) {
          setAccessToken(null);
          return false;
        }
        const data = (await res.json()) as { accessToken?: string };
        if (data.accessToken) {
          setAccessToken(data.accessToken);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    })();
    void refreshing.finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

/**
 * Typed fetch wrapper. Attaches the bearer token, forwards cookies, and on a 401 performs a
 * one-shot silent refresh + retry. API errors become `ApiClientError`.
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  options?: { retryOnAuthError?: boolean },
): Promise<T> {
  let response = await doFetch(path, init);

  if (response.status === 401 && options?.retryOnAuthError !== false && path !== REFRESH_PATH) {
    const refreshed = await refreshSession();
    if (refreshed) {
      response = await doFetch(path, init);
    }
  }

  const text = await response.text();
  const body = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const error = (body as { error?: { message?: string; code?: string; details?: unknown } })?.error;
    throw new ApiClientError(
      error?.message ?? `Request failed (${response.status})`,
      response.status,
      error?.code,
      error?.details,
    );
  }

  return body as T;
}
