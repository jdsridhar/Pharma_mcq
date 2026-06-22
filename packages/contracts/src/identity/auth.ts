import { z } from 'zod';

/**
 * Auth contracts shared by API and web. Request schemas drive both client-side form
 * validation and server-side `createZodDto` validation, so the two never drift.
 */

/** Password policy: 10–128 chars with at least one lower, upper, and digit. */
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a digit');

export const emailSchema = z.string().email().toLowerCase().max(254);

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  password: passwordSchema,
  mobile: z.string().trim().min(8).max(20).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Refresh normally arrives via httpOnly cookie; body is the fallback for non-browser clients. */
export const refreshSchema = z.object({
  refreshToken: z.string().min(10).optional(),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(10),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Public projection of a user — never includes the password hash. */
export const userPublicSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION']),
  emailVerified: z.boolean(),
  organizationId: z.string().uuid().nullable(),
  /** Institution name when the user belongs to an institution tenant; null for platform/no-org. */
  organizationName: z.string().nullable(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
});
export type UserPublic = z.infer<typeof userPublicSchema>;

/** Returned by register/login/refresh. The refresh token itself is delivered via cookie. */
export const authResultSchema = z.object({
  user: userPublicSchema,
  accessToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive(), // access-token lifetime in seconds
});
export type AuthResult = z.infer<typeof authResultSchema>;
