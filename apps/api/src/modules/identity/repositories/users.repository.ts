import { Injectable } from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';

export interface CreateUserData {
  organizationId: string | null;
  email: string;
  name: string;
  passwordHash: string;
  mobile?: string;
}

/** User with roles → permissions eagerly loaded, for RBAC resolution. */
export type UserWithRoles = Prisma.UserGetPayload<{
  include: {
    userRoles: {
      include: { role: { include: { rolePermissions: { include: { permission: true } } } } };
    };
  };
}>;

/** All persistence for the Identity domain's users. Repositories never leak Prisma upward. */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(organizationId: string | null, email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { organizationId, email, deletedAt: null },
    });
  }

  /** Find an account by email across ALL organizations (multi-tenant login + global uniqueness). */
  findByEmailGlobal(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { email, deletedAt: null } });
  }

  findActiveById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { id, deletedAt: null } });
  }

  findWithRolesById(id: string): Promise<UserWithRoles | null> {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: {
        userRoles: {
          include: {
            role: { include: { rolePermissions: { include: { permission: true } } } },
          },
        },
      },
    });
  }

  create(data: CreateUserData): Promise<User> {
    return this.prisma.user.create({
      data: {
        organizationId: data.organizationId,
        email: data.email,
        name: data.name,
        passwordHash: data.passwordHash,
        mobile: data.mobile,
      },
    });
  }

  update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  /** Idempotently attach a role to a user. */
  async addRole(userId: string, roleId: string): Promise<void> {
    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      update: {},
      create: { userId, roleId },
    });
  }
}
