import { Injectable } from '@nestjs/common';
import {
  type AuditLog,
  type Organization,
  Prisma,
  type Question,
  type Role,
  type UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';

export type UserWithRoles = Prisma.UserGetPayload<{
  include: { userRoles: { include: { role: { select: { name: true } } } } };
}>;

export interface AuditEntry {
  actorUserId?: string | null;
  organizationId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Audit ──
  createAudit(entry: AuditEntry): Promise<AuditLog> {
    return this.prisma.auditLog.create({
      data: {
        actorUserId: entry.actorUserId ?? null,
        organizationId: entry.organizationId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        before: entry.before,
        after: entry.after,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  }

  async listAudit(
    filter: { entityType?: string; actorUserId?: string },
    skip: number,
    take: number,
  ): Promise<{ items: AuditLog[]; total: number }> {
    const where: Prisma.AuditLogWhereInput = {
      ...(filter.entityType ? { entityType: filter.entityType } : {}),
      ...(filter.actorUserId ? { actorUserId: filter.actorUserId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total };
  }

  listAuditByEntity(entityType: string, entityId: string): Promise<AuditLog[]> {
    return this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  // ── Users ──
  async listUsers(
    search: string | undefined,
    skip: number,
    take: number,
    organizationId?: string,
    excludeRoleNames?: string[],
  ): Promise<{ items: UserWithRoles[]; total: number }> {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(organizationId ? { organizationId } : {}),
      // Privilege-tier guard: never surface accounts holding a role above the viewer's rank.
      ...(excludeRoleNames && excludeRoleNames.length > 0
        ? { userRoles: { none: { role: { name: { in: excludeRoleNames } } } } }
        : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { userRoles: { include: { role: { select: { name: true } } } } },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total };
  }

  findUserWithRoles(id: string): Promise<UserWithRoles | null> {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { userRoles: { include: { role: { select: { name: true } } } } },
    });
  }

  /** Global email check (one account per email across all organizations). */
  findUserByEmail(email: string): Promise<{ id: string } | null> {
    return this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true },
    });
  }

  createUser(data: {
    organizationId: string;
    email: string;
    name: string;
    passwordHash: string;
    roleId?: string;
  }): Promise<UserWithRoles> {
    return this.prisma.user.create({
      data: {
        organizationId: data.organizationId,
        email: data.email,
        name: data.name,
        passwordHash: data.passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        ...(data.roleId ? { userRoles: { create: { roleId: data.roleId } } } : {}),
      },
      include: { userRoles: { include: { role: { select: { name: true } } } } },
    });
  }

  roleExists(roleId: string): Promise<Role | null> {
    return this.prisma.role.findUnique({ where: { id: roleId } });
  }

  async addRole(userId: string, roleId: string): Promise<void> {
    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      update: {},
      create: { userId, roleId },
    });
  }

  async removeRole(userId: string, roleId: string): Promise<void> {
    await this.prisma.userRole.deleteMany({ where: { userId, roleId } });
  }

  async setStatus(userId: string, status: UserStatus): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { status } });
  }

  listRoles(): Promise<Role[]> {
    return this.prisma.role.findMany({ orderBy: { name: 'asc' } });
  }

  // ── Organizations (multi-tenancy) ──
  createOrganization(data: { name: string; slug: string }): Promise<Organization> {
    return this.prisma.organization.create({ data });
  }

  findOrganizationBySlug(slug: string): Promise<Organization | null> {
    return this.prisma.organization.findUnique({ where: { slug } });
  }

  async listOrganizations(): Promise<{ orgs: Organization[]; userCounts: Record<string, number> }> {
    const orgs = await this.prisma.organization.findMany({ orderBy: { createdAt: 'asc' } });
    const grouped = await this.prisma.user.groupBy({
      by: ['organizationId'],
      where: { deletedAt: null },
      _count: { _all: true },
      orderBy: { organizationId: 'asc' },
    });
    const userCounts: Record<string, number> = {};
    for (const g of grouped) {
      if (g.organizationId) userCounts[g.organizationId] = g._count._all;
    }
    return { orgs, userCounts };
  }

  // ── Review queue ──
  async listReviewQuestions(
    skip: number,
    take: number,
  ): Promise<{ items: Question[]; total: number }> {
    const where: Prisma.QuestionWhereInput = { status: 'REVIEW', deletedAt: null };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.question.findMany({ where, skip, take, orderBy: { updatedAt: 'asc' } }),
      this.prisma.question.count({ where }),
    ]);
    return { items, total };
  }
}
