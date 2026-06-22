import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '../types/auth.types';
import { PermissionsGuard } from './permissions.guard';

function contextWith(user: AuthenticatedUser | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

const user: AuthenticatedUser = {
  id: 'u1',
  email: 'a@b.com',
  organizationId: null,
  roles: ['Reviewer'],
  permissions: ['question:read', 'question:review'],
};

describe('PermissionsGuard', () => {
  let reflector: Reflector;
  let guard: PermissionsGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionsGuard(reflector);
  });

  it('allows routes with no @Permissions metadata', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(contextWith(user))).toBe(true);
  });

  it('allows when the user holds all required permissions', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['question:read', 'question:review']);
    expect(guard.canActivate(contextWith(user))).toBe(true);
  });

  it('forbids when a required permission is missing', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['question:approve']);
    expect(() => guard.canActivate(contextWith(user))).toThrow(ForbiddenException);
  });

  it('rejects when there is no authenticated user', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['question:read']);
    expect(() => guard.canActivate(contextWith(undefined))).toThrow(UnauthorizedException);
  });
});
