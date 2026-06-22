import { Test } from '@nestjs/testing';
import { HealthCheckService } from '@nestjs/terminus';
import { PrismaHealthIndicator } from '../../common/health/prisma.health';
import { RedisHealthIndicator } from '../../common/health/redis.health';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: {
            check: jest.fn((indicators: Array<() => Promise<unknown>>) =>
              Promise.all(indicators.map((indicator) => indicator())),
            ),
          },
        },
        {
          provide: PrismaHealthIndicator,
          useValue: { isHealthy: jest.fn().mockResolvedValue({ database: { status: 'up' } }) },
        },
        {
          provide: RedisHealthIndicator,
          useValue: { isHealthy: jest.fn().mockResolvedValue({ redis: { status: 'up' } }) },
        },
      ],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('liveness returns ok with a timestamp', () => {
    const result = controller.liveness();
    expect(result.status).toBe('ok');
    expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
  });

  it('readiness aggregates dependency indicators', async () => {
    await expect(controller.readiness()).resolves.toBeDefined();
  });
});
