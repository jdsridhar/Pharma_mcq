import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ANALYTICS_QUEUE } from '../../../infra/queue/queue.module';
import { PRACTICE_ANSWER_JOB, type PracticeAnswerJobData } from './practice-analytics.constants';

/**
 * Enqueues practice-answer analytics jobs. Best-effort: a queue outage must never fail a
 * student's answer submission, so enqueue errors are logged and swallowed (metrics are
 * eventually-consistent).
 */
@Injectable()
export class PracticeAnalyticsProducer {
  private readonly logger = new Logger(PracticeAnalyticsProducer.name);

  constructor(@InjectQueue(ANALYTICS_QUEUE) private readonly queue: Queue) {}

  async recordAnswer(data: PracticeAnswerJobData): Promise<void> {
    try {
      await this.queue.add(PRACTICE_ANSWER_JOB, data, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
    } catch (error) {
      this.logger.warn(`Failed to enqueue practice analytics: ${String(error)}`);
    }
  }
}
