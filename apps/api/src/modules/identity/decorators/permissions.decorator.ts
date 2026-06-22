import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '@pharmacy/contracts';
import { PERMISSIONS_KEY } from '../identity.constants';

/** Require the caller to hold ALL of the given permission keys (`resource:action`). */
export const Permissions = (...permissions: PermissionKey[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);
