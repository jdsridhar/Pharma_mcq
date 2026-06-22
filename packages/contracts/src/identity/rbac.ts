/**
 * RBAC catalog — the single source of truth for permission keys and the system roles
 * that bundle them. Shared by the API (guards + seeder) and the web app (conditional UI).
 *
 * Permission key format is `resource:action`. Roles are additive: a user's effective
 * permissions are the union across all assigned roles.
 */

export const PERMISSIONS = {
  // Question authoring & review workflow
  QUESTION_CREATE: 'question:create',
  QUESTION_READ: 'question:read',
  QUESTION_UPDATE: 'question:update',
  QUESTION_DELETE: 'question:delete',
  QUESTION_REVIEW: 'question:review',
  QUESTION_APPROVE: 'question:approve',
  QUESTION_PUBLISH: 'question:publish',

  // Knowledge graph
  KNOWLEDGE_READ: 'knowledge:read',
  KNOWLEDGE_MANAGE: 'knowledge:manage',

  // Curriculum
  CURRICULUM_READ: 'curriculum:read',
  CURRICULUM_MANAGE: 'curriculum:manage',

  // Exams & blueprints
  EXAM_READ: 'exam:read',
  EXAM_MANAGE: 'exam:manage',

  // Learning tracks
  TRACK_READ: 'track:read',
  TRACK_MANAGE: 'track:manage',

  // Mock tests
  MOCKTEST_READ: 'mocktest:read',
  MOCKTEST_MANAGE: 'mocktest:manage',

  // Identity administration
  USER_READ: 'user:read',
  USER_MANAGE: 'user:manage',
  ROLE_MANAGE: 'role:manage',

  // Commerce
  PLAN_MANAGE: 'plan:manage',
  SUBSCRIPTION_READ: 'subscription:read',
  SUBSCRIPTION_MANAGE: 'subscription:manage',

  // Analytics, audit, notifications
  ANALYTICS_READ: 'analytics:read',
  AUDIT_READ: 'audit:read',
  NOTIFICATION_MANAGE: 'notification:manage',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Flat list of every permission key (used to grant the full set to Super Admin). */
export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

/** Stable system role names. Org-custom roles may be added later (organizationId set). */
export const SystemRole = {
  STUDENT: 'Student',
  CONTENT_AUTHOR: 'Content Author',
  REVIEWER: 'Reviewer',
  ACADEMIC_HEAD: 'Academic Head',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super Admin',
} as const;

export type SystemRoleName = (typeof SystemRole)[keyof typeof SystemRole];

/**
 * Privilege rank of each system role (higher = more privileged). Mirrors the permission supersets
 * in {@link SYSTEM_ROLE_DEFINITIONS}. Used to enforce that an administrator may only see and manage
 * accounts at or **below** their own rank — e.g. a (non-super) Admin must never see, suspend, or
 * re-role a Super Admin, nor grant a role above their own tier.
 */
export const SYSTEM_ROLE_RANK: Record<SystemRoleName, number> = {
  [SystemRole.STUDENT]: 0,
  [SystemRole.CONTENT_AUTHOR]: 1,
  [SystemRole.REVIEWER]: 2,
  [SystemRole.ACADEMIC_HEAD]: 3,
  [SystemRole.ADMIN]: 4,
  [SystemRole.SUPER_ADMIN]: 5,
};

/** Highest privilege rank among the given role names; unknown/custom roles count as 0 (lowest). */
export function roleRank(roleNames: readonly string[]): number {
  return roleNames.reduce((max, name) => {
    const rank = SYSTEM_ROLE_RANK[name as SystemRoleName] ?? 0;
    return rank > max ? rank : max;
  }, 0);
}

/** System role names ranked strictly above `rank` — the tiers an actor of `rank` must not see/manage. */
export function rolesAboveRank(rank: number): SystemRoleName[] {
  return (Object.keys(SYSTEM_ROLE_RANK) as SystemRoleName[]).filter((name) => SYSTEM_ROLE_RANK[name] > rank);
}

export interface SystemRoleDefinition {
  name: SystemRoleName;
  description: string;
  /** Permission keys granted to this role (Super Admin receives ALL_PERMISSIONS). */
  permissions: PermissionKey[];
}

const READ_CONTENT: PermissionKey[] = [
  PERMISSIONS.QUESTION_READ,
  PERMISSIONS.KNOWLEDGE_READ,
  PERMISSIONS.CURRICULUM_READ,
  PERMISSIONS.EXAM_READ,
  PERMISSIONS.TRACK_READ,
  PERMISSIONS.MOCKTEST_READ,
];

const AUTHOR_PERMS: PermissionKey[] = [
  ...READ_CONTENT,
  PERMISSIONS.QUESTION_CREATE,
  PERMISSIONS.QUESTION_UPDATE,
];

const REVIEWER_PERMS: PermissionKey[] = [
  ...AUTHOR_PERMS,
  PERMISSIONS.QUESTION_REVIEW,
  PERMISSIONS.QUESTION_APPROVE,
];

const ACADEMIC_HEAD_PERMS: PermissionKey[] = [
  ...REVIEWER_PERMS,
  PERMISSIONS.QUESTION_PUBLISH,
  PERMISSIONS.QUESTION_DELETE,
  PERMISSIONS.KNOWLEDGE_MANAGE,
  PERMISSIONS.CURRICULUM_MANAGE,
  PERMISSIONS.EXAM_MANAGE,
  PERMISSIONS.TRACK_MANAGE,
  PERMISSIONS.MOCKTEST_MANAGE,
  PERMISSIONS.ANALYTICS_READ,
];

const ADMIN_PERMS: PermissionKey[] = [
  ...ACADEMIC_HEAD_PERMS,
  PERMISSIONS.USER_READ,
  PERMISSIONS.USER_MANAGE,
  PERMISSIONS.ROLE_MANAGE,
  PERMISSIONS.PLAN_MANAGE,
  PERMISSIONS.SUBSCRIPTION_READ,
  PERMISSIONS.SUBSCRIPTION_MANAGE,
  PERMISSIONS.AUDIT_READ,
  PERMISSIONS.NOTIFICATION_MANAGE,
];

/** De-duplicate while preserving order. */
function uniq(keys: PermissionKey[]): PermissionKey[] {
  return Array.from(new Set(keys));
}

export const SYSTEM_ROLE_DEFINITIONS: SystemRoleDefinition[] = [
  {
    name: SystemRole.STUDENT,
    description: 'Default role for learners: read content, practice, and take tests.',
    permissions: uniq(READ_CONTENT),
  },
  {
    name: SystemRole.CONTENT_AUTHOR,
    description: 'Creates and edits draft questions and submits them for review.',
    permissions: uniq(AUTHOR_PERMS),
  },
  {
    name: SystemRole.REVIEWER,
    description: 'Reviews and approves authored questions.',
    permissions: uniq(REVIEWER_PERMS),
  },
  {
    name: SystemRole.ACADEMIC_HEAD,
    description: 'Publishes content and manages the knowledge/exam/curriculum structures.',
    permissions: uniq(ACADEMIC_HEAD_PERMS),
  },
  {
    name: SystemRole.ADMIN,
    description: 'Administers users, roles, commerce, audit and notifications.',
    permissions: uniq(ADMIN_PERMS),
  },
  {
    name: SystemRole.SUPER_ADMIN,
    description: 'Unrestricted access to every permission in the platform.',
    permissions: ALL_PERMISSIONS,
  },
];

/** The role auto-assigned to a newly registered user. */
export const DEFAULT_REGISTRATION_ROLE: SystemRoleName = SystemRole.STUDENT;

/**
 * Demo accounts for one-click sign-in in NON-PRODUCTION environments. Seeded by the API
 * (`apps/api/prisma/seeders/demo.seeder.ts`, dev-only) and surfaced as quick-login buttons on
 * the web login page. One account per system role; all share {@link DEMO_PASSWORD}.
 * Never seeded in production.
 */
export const DEMO_PASSWORD = 'Demo@12345';

export interface DemoAccount {
  role: SystemRoleName;
  email: string;
  /** Shared dev password — see {@link DEMO_PASSWORD}. */
  password: string;
  /** Short button label. */
  label: string;
  /** One-line description of what this role can do. */
  description: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { role: SystemRole.STUDENT, email: 'student@demo.local', password: DEMO_PASSWORD, label: 'Student', description: 'Practice, tests, revision & analytics' },
  { role: SystemRole.CONTENT_AUTHOR, email: 'author@demo.local', password: DEMO_PASSWORD, label: 'Content Author', description: 'Create & edit draft questions' },
  { role: SystemRole.REVIEWER, email: 'reviewer@demo.local', password: DEMO_PASSWORD, label: 'Reviewer', description: 'Review & approve questions' },
  { role: SystemRole.ACADEMIC_HEAD, email: 'academic@demo.local', password: DEMO_PASSWORD, label: 'Academic Head', description: 'Publish content & manage structure' },
  { role: SystemRole.ADMIN, email: 'admin@demo.local', password: DEMO_PASSWORD, label: 'Admin', description: 'Users, roles, commerce & audit' },
  { role: SystemRole.SUPER_ADMIN, email: 'superadmin@demo.local', password: DEMO_PASSWORD, label: 'Super Admin', description: 'Full access to everything' },
];
