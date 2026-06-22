import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { NOTIFICATIONS_QUEUE } from '../../infra/queue/queue.module';
import { NOTIFICATION_DELIVER_JOB, type NotificationJobData } from './notification.constants';

/** Enqueues delivery jobs. Best-effort: a queue outage never fails the caller. */
@Injectable()
export class NotificationProducer {
  private readonly logger = new Logger(NotificationProducer.name);

  constructor(@InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue) {}

  async enqueue(data: NotificationJobData): Promise<void> {
    try {
      await this.queue.add(NOTIFICATION_DELIVER_JOB, data, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
    } catch (error) {
      this.logger.warn(`Failed to enqueue notification: ${String(error)}`);
    }
  }
}
