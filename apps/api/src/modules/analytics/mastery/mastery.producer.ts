import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { MASTERY_QUEUE } from '../../../infra/queue/queue.module';
import { MASTERY_RECOMPUTE_JOB } from './mastery.constants';

/** Enqueues mastery recompute jobs (best-effort; never fails the caller). */
@Injectable()
export class MasteryProducer {
  private readonly logger = new Logger(MasteryProducer.name);

  constructor(@InjectQueue(MASTERY_QUEUE) private readonly queue: Queue) {}

  async recompute(userId: string): Promise<void> {
    try {
      await this.queue.add(
        MASTERY_RECOMPUTE_JOB,
        { userId },
        {
          jobId: `mastery:${userId}`, // de-dupe rapid re-enqueues for the same user
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      );
    } catch (error) {
      this.logger.warn(`Failed to enqueue mastery recompute: ${String(error)}`);
    }
  }
}
