import { SetMetadata } from '@nestjs/common';

/** Reflector keys for the Redis-backed `ThrottlerGuard`. */
export const THROTTLE_SKIP = 'throttle:skip';
export const THROTTLE_OPTIONS = 'throttle:options';

export interface ThrottleOptions {
  /** Max requests allowed within the window. */
  limit: number;
  /** Window length in seconds. */
  ttl: number;
}

/**
 * Override the default rate limit for a route or controller — e.g. tighten auth endpoints:
 * `@Throttle({ limit: 10, ttl: 60 })`.
 */
export const Throttle = (options: ThrottleOptions): MethodDecorator & ClassDecorator =>
  SetMetadata(THROTTLE_OPTIONS, options);

/** Exempt a route or controller from rate limiting (e.g. health/readiness probes). */
export const SkipThrottle = (): MethodDecorator & ClassDecorator => SetMetadata(THROTTLE_SKIP, true);
