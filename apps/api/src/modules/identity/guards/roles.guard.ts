import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from '../identity.constants';
import type { AuthenticatedUser } from '../types/auth.types';

/**
 * Authorization guard for `@Roles(...)`. Requires the principal to hold at least ONE
 * of the listed role names. No metadata ⇒ pass-through.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException();
    }

    const held = new Set(user.roles);
    if (!required.some((role) => held.has(role))) {
      throw new ForbiddenException(`Requires one of role(s): ${required.join(', ')}`);
    }
    return true;
  }
}
