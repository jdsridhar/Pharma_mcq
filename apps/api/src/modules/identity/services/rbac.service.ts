import { Injectable, NotFoundException } from '@nestjs/common';
import type { Role } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { UsersRepository } from '../repositories/users.repository';

export interface ResolvedAccess {
  roles: string[];
  permissions: string[];
}

/**
 * Resolves a user's effective roles + permissions (the union across assigned roles).
 * These are embedded in the short-lived access token, so a request needs no extra DB hit
 * for authorization; staleness is bounded by the access-token TTL.
 */
@Injectable()
export class RbacService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersRepository: UsersRepository,
  ) {}

  async resolveAccess(userId: string): Promise<ResolvedAccess> {
    const user = await this.usersRepository.findWithRolesById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const roles = new Set<string>();
    const permissions = new Set<string>();
    for (const userRole of user.userRoles) {
      roles.add(userRole.role.name);
      for (const rp of userRole.role.rolePermissions) {
        permissions.add(rp.permission.key);
      }
    }

    return { roles: [...roles], permissions: [...permissions] };
  }

  /** Find a global (org-less) system role by name — used to assign the default role. */
  findSystemRoleByName(name: string): Promise<Role | null> {
    return this.prisma.role.findFirst({ where: { name, organizationId: null } });
  }
}
