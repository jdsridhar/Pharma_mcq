import { SetMetadata } from '@nestjs/common';

/** Reflector key signalling a route should bypass the global `JwtAuthGuard`. */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route (or controller) as public — reachable without authentication.
 * Lives in `common/` so any module can use it without depending on Identity.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
