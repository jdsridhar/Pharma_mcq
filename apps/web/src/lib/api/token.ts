/**
 * In-memory access token (never persisted — XSS-safe). The refresh token lives in an
 * httpOnly cookie and is rotated by the API. Kept in a module singleton so the fetch wrapper
 * and the auth store share one source of truth without a React dependency.
 */
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
