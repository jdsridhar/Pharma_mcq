import { type ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ServerEnv } from '@pharmacy/config';
import type { Request, Response } from 'express';
import { RedisService } from '../../infra/redis/redis.service';
import { THROTTLE_OPTIONS, THROTTLE_SKIP } from './throttle.decorator';
import { ThrottlerGuard } from './throttler.guard';

/**
 * The guard is production-gated, so every behavioural test runs with NODE_ENV='production'.
 * Redis is mocked; we assert allow/deny, header, fail-open, skip and per-route override.
 */
describe('ThrottlerGuard', () => {
  const handler = function handlerFn(): void {};
  class FakeController {}

  const makeRedis = (over: Partial<Record<'incr' | 'expire' | 'ttl', jest.Mock>> = {}) => {
    const client = {
      incr: over.incr ?? jest.fn().mockResolvedValue(1),
      expire: over.expire ?? jest.fn().mockResolvedValue(1),
      ttl: over.ttl ?? jest.fn().mockResolvedValue(42),
    };
    return { redis: { client } as unknown as RedisService, client };
  };

  const makeReflector = (meta: Record<string, unknown>): Reflector =>
    ({ getAllAndOverride: (key: string) => meta[key] }) as unknown as Reflector;

  const makeContext = (res: Partial<Response> = {}): ExecutionContext => {
    const request = { headers: {}, ip: '203.0.113.7', socket: {} } as unknown as Request;
    const response = { setHeader: jest.fn(), ...res } as unknown as Response;
    return {
      getHandler: () => handler,
      getClass: () => FakeController,
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    } as unknown as ExecutionContext;
  };

  const prodEnv = { NODE_ENV: 'production', RATE_LIMIT_LIMIT: 3, RATE_LIMIT_TTL: 60 } as ServerEnv;

  it('is a no-op outside production (no Redis calls)', async () => {
    const { redis, client } = makeRedis();
    const guard = new ThrottlerGuard(makeReflector({}), redis, {
      ...prodEnv,
      NODE_ENV: 'development',
    } as ServerEnv);

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(client.incr).not.toHaveBeenCalled();
  });

  it('allows the first request and sets the window TTL', async () => {
    const { redis, client } = makeRedis({ incr: jest.fn().mockResolvedValue(1) });
    const guard = new ThrottlerGuard(makeReflector({}), redis, prodEnv);

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(client.incr).toHaveBeenCalledTimes(1);
    expect(client.expire).toHaveBeenCalledWith(expect.stringContaining('throttle:'), 60);
  });

  it('allows requests up to the limit but not beyond', async () => {
    const { redis } = makeRedis({ incr: jest.fn().mockResolvedValue(3) }); // == limit
    const guard = new ThrottlerGuard(makeReflector({}), redis, prodEnv);
    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
  });

  it('rejects with 429 + Retry-After once over the limit', async () => {
    const { redis } = makeRedis({
      incr: jest.fn().mockResolvedValue(4), // > limit
      ttl: jest.fn().mockResolvedValue(30),
    });
    const guard = new ThrottlerGuard(makeReflector({}), redis, prodEnv);
    const setHeader = jest.fn();
    const ctx = makeContext({ setHeader });

    const err = await guard.canActivate(ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '30');
  });

  it('honours @SkipThrottle (no Redis calls)', async () => {
    const { redis, client } = makeRedis();
    const guard = new ThrottlerGuard(makeReflector({ [THROTTLE_SKIP]: true }), redis, prodEnv);

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(client.incr).not.toHaveBeenCalled();
  });

  it('applies a per-route @Throttle override', async () => {
    const { redis } = makeRedis({ incr: jest.fn().mockResolvedValue(2) });
    const guard = new ThrottlerGuard(
      makeReflector({ [THROTTLE_OPTIONS]: { limit: 1, ttl: 60 } }),
      redis,
      prodEnv,
    );
    const err = await guard.canActivate(makeContext()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
  });

  it('fails OPEN when Redis is unavailable', async () => {
    const { redis } = makeRedis({ incr: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) });
    const guard = new ThrottlerGuard(makeReflector({}), redis, prodEnv);
    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
  });
});
