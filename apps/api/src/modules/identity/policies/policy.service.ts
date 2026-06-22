import { ForbiddenException, Injectable } from '@nestjs/common';
import type { PermissionKey } from '@pharmacy/contracts';
import type { AuthenticatedUser } from '../types/auth.types';

/**
 * Resource-level authorization helpers, injected by domain services where coarse
 * route-level guards aren't enough (e.g. "an author may edit only their own draft").
 * Guards answer "can this role reach this route?"; policies answer "may this user act on
 * THIS record?".
 */
@Injectable()
export class PolicyService {
  hasPermission(user: AuthenticatedUser, permission: PermissionKey): boolean {
    return user.permissions.includes(permission);
  }

  hasRole(user: AuthenticatedUser, role: string): boolean {
    return user.roles.includes(role);
  }

  isOwner(user: AuthenticatedUser, ownerId: string | null | undefined): boolean {
    return !!ownerId && user.id === ownerId;
  }

  assertPermission(user: AuthenticatedUser, permission: PermissionKey): void {
    if (!this.hasPermission(user, permission)) {
      throw new ForbiddenException(`Missing permission: ${permission}`);
    }
  }

  /** Allow when the user owns the resource OR holds an overriding permission. */
  assertOwnerOrPermission(
    user: AuthenticatedUser,
    ownerId: string | null | undefined,
    permission: PermissionKey,
  ): void {
    if (this.isOwner(user, ownerId) || this.hasPermission(user, permission)) {
      return;
    }
    throw new ForbiddenException('Not allowed to act on this resource');
  }
}
