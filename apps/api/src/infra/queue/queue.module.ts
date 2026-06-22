import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import type { ServerEnv } from '@pharmacy/config';
import { APP_ENV } from '../../config/app-config.module';

/** Name of the shared analytics queue (async metrics + event ingestion). */
export const ANALYTICS_QUEUE = 'analytics';

/** Queue for (re)computing per-student mastery off the request path. */
export const MASTERY_QUEUE = 'mastery';

/** Queue for dispatching notifications (email/SMS/push) off the request path. */
export const NOTIFICATIONS_QUEUE = 'notifications';

/**
 * BullMQ wiring. We hand BullMQ parsed connection *options* (not a pre-built client) so it
 * owns the connection lifecycle; `maxRetriesPerRequest: null` is required by BullMQ workers.
 * Global so any domain can inject a registered queue or host a processor.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [APP_ENV],
      useFactory: (env: ServerEnv) => {
        const url = new URL(env.REDIS_URL);
        return {
          connection: {
            host: url.hostname,
            port: url.port ? Number(url.port) : 6379,
            username: url.username ? decodeURIComponent(url.username) : undefined,
            password: url.password ? decodeURIComponent(url.password) : undefined,
            db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined,
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
    BullModule.registerQueue(
      { name: ANALYTICS_QUEUE },
      { name: MASTERY_QUEUE },
      { name: NOTIFICATIONS_QUEUE },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
