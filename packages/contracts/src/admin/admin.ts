import { z } from 'zod';
import { paginationQuerySchema } from '../common/pagination';
import { emailSchema, passwordSchema } from '../identity/auth';

/**
 * Admin contracts — user/role administration, append-only audit log, and the review queue.
 */

export const adminUserStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']);
export type AdminUserStatusT = z.infer<typeof adminUserStatusSchema>;

export const assignRoleSchema = z.object({ roleId: z.string().uuid() });
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;

/** Admin-created user (no auto-login/cookie, unlike public registration). */
export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  password: passwordSchema,
  roleId: z.string().uuid().optional(),
  /** Super-admin only: place the user in a specific organization (institution). */
  organizationId: z.string().uuid().optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

// ── Organizations (multi-tenancy) ──
export const organizationSlugSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9-]{1,63}$/, 'Slug must be 2–64 chars: lowercase letters, digits, hyphen');

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(200),
  slug: organizationSlugSchema,
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export interface OrganizationDto {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  userCount: number;
  createdAt: string;
}

export const setUserStatusSchema = z.object({ status: adminUserStatusSchema });
export type SetUserStatusInput = z.infer<typeof setUserStatusSchema>;

export const listUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(200).optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const listAuditLogsQuerySchema = paginationQuerySchema.extend({
  entityType: z.string().trim().min(1).max(64).optional(),
  actorUserId: z.string().uuid().optional(),
});
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;

// ── Response DTOs ──
export interface AdminUserDto {
  id: string;
  email: string;
  name: string;
  status: string;
  roles: string[];
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AdminRoleDto {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
}

export interface AuditLogDto {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  ip: string | null;
  createdAt: string;
}

export interface ReviewQuestionDto {
  id: string;
  questionCode: string;
  questionType: string;
  status: string;
  authorDifficulty: string;
  createdAt: string;
}
