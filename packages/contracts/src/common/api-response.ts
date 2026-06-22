import { z } from 'zod';

/** Canonical machine-readable error codes returned by the API. Extended per phase. */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  /** Field-level issues (e.g., flattened Zod issues) or arbitrary context. */
  details: z.unknown().optional(),
  /** Correlates a client error to server logs/traces. */
  traceId: z.string().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export interface ApiSuccess<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiFailure {
  error: ApiError;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export function isApiFailure<T>(result: ApiResult<T>): result is ApiFailure {
  return (result as ApiFailure).error !== undefined;
}
