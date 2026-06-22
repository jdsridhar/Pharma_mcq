/** Token payloads and the request-scoped authenticated principal. */

export interface JwtAccessPayload {
  /** User id. */
  sub: string;
  email: string;
  orgId: string | null;
  roles: string[];
  permissions: string[];
  type: 'access';
}

export interface JwtRefreshPayload {
  /** User id. */
  sub: string;
  /** Token family — all tokens descended from one login share it (rotation/reuse). */
  familyId: string;
  /** Unique id of this specific refresh token (matches the DB row id). */
  jti: string;
  type: 'refresh';
}

/** Attached to `req.user` by `JwtAuthGuard`; consumed by guards and `@CurrentUser()`. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  organizationId: string | null;
  roles: string[];
  permissions: string[];
}
