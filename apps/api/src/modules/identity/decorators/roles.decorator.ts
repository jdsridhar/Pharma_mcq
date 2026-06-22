import { SetMetadata } from '@nestjs/common';
import { ROLES_KEY } from '../identity.constants';

/** Require the caller to hold at least ONE of the given role names. */
export const Roles = (...roles: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
