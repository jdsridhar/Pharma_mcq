import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ServerEnv } from '@pharmacy/config';
import type { Request, Response } from 'express';
import { APP_ENV } from '../../config/app-config.module';
import { RedisService } from '../../infra/redis/redis.service';
import { THROTTLE_OPTIONS, THROTTLE_SKIP, type ThrottleOptions } from './throttle.decorator';

/**
 * Distributed fixed-window rate limiter backed by Redis (so the limit is shared across all
 * API instances). Bound globally (`APP_GUARD`) in {@link AppModule}.
 *
 *  - **Production-only:** in dev/test it is a no-op, so local runs and the e2e suite are never
 *    throttled. Defaults come from `RATE_LIMIT_LIMIT` / `RATE_LIMIT_TTL`; override per route with
 *    `@Throttle({ limit, ttl })` (e.g. tighter on `/auth/*`) and bypass with `@SkipThrottle()`.
 *  - **Keyed by client IP + route handler**, so one noisy client can't starve others.
 *  - **Fails OPEN:** if Redis is unreachable the request is allowed (availability over strict
 *    enforcement) and the error is logged — a limiter outage must not become a self-inflicted DoS.
 */
@Injectable()
export class ThrottlerGuard implements CanActivate {
  private readonly logger = new Logger(ThrottlerGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
    @Inject(APP_ENV) private readonly env: ServerEnv,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.env.NODE_ENV !== 'production') {
      return true;
    }

    const skip = this.reflector.getAllAndOverride<boolean>(THROTTLE_SKIP, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return true;
    }

    const options = this.reflector.getAllAndOverride<ThrottleOptions>(THROTTLE_OPTIONS, [
      context.getHandler(),
      context.getClass(),
    ]) ?? { limit: this.env.RATE_LIMIT_LIMIT, ttl: this.env.RATE_LIMIT_TTL };

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const key = this.buildKey(context, request);

    let count: number;
    try {
      count = await this.redis.client.incr(key);
      if (count === 1) {
        await this.redis.client.expire(key, options.ttl);
      }
    } catch (err) {
      this.logger.error(`Rate limiter unavailable, allowing request: ${(err as Error).message}`);
      return true; // fail open
    }

    if (count > options.limit) {
      const retryAfter = await this.retryAfterSeconds(key, options.ttl);
      response.setHeader('Retry-After', String(retryAfter));
      throw new HttpException('Too many requests — please slow down', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }

  private buildKey(context: ExecutionContext, request: Request): string {
    const route = `${context.getClass().name}.${context.getHandler().name}`;
    return `throttle:${route}:${this.clientIp(request)}`;
  }

  private clientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0]?.trim() ?? 'unknown';
    }
    return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
  }

  private async retryAfterSeconds(key: string, fallback: number): Promise<number> {
    try {
      const ttl = await this.redis.client.ttl(key);
      return ttl > 0 ? ttl : fallback;
    } catch {
      return fallback;
    }
  }
}
