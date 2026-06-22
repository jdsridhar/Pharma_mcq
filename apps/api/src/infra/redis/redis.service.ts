import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { ServerEnv } from '@pharmacy/config';
import { APP_ENV } from '../../config/app-config.module';

/**
 * Shared Redis connection. Used for caching, rate limiting, and (from Phase 9) as the
 * BullMQ connection — hence `maxRetriesPerRequest: null`, which BullMQ requires.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(@Inject(APP_ENV) env: ServerEnv) {
    this.client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    this.client.on('error', (err: Error) => this.logger.error(`Redis error: ${err.message}`));
    this.client.on('ready', () => this.logger.log('Redis connected'));
  }

  ping(): Promise<string> {
    return this.client.ping();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
