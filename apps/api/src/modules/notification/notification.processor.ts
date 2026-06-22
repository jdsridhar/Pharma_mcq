import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import { NOTIFICATIONS_QUEUE } from '../../infra/queue/queue.module';
import { NOTIFICATION_DELIVER_JOB, type NotificationJobData } from './notification.constants';
import { CHANNEL_REGISTRY, type ChannelRegistry } from './ports/notification-channel.port';
import { NotificationRepository } from './repositories/notification.repository';

/** Worker that dispatches a notification via its channel adapter and records the outcome. */
@Processor(NOTIFICATIONS_QUEUE)
export class NotificationProcessor extends WorkerHost {
  constructor(
    @Inject(CHANNEL_REGISTRY) private readonly registry: ChannelRegistry,
    private readonly repo: NotificationRepository,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== NOTIFICATION_DELIVER_JOB) {
      return;
    }
    const data = job.data as NotificationJobData;
    const adapter = this.registry.get(data.channel);
    if (!adapter) {
      if (data.notificationId) {
        await this.repo.markFailed(data.notificationId, `No adapter for channel ${data.channel}`);
      }
      return;
    }

    try {
      await adapter.send({ to: data.to, subject: data.subject ?? undefined, body: data.body });
      if (data.notificationId) {
        await this.repo.markSent(data.notificationId);
      }
    } catch (error) {
      if (data.notificationId) {
        await this.repo.markFailed(data.notificationId, String(error));
      }
      throw error;
    }
  }
}
