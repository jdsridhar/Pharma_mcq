import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ANALYTICS_QUEUE } from '../../../infra/queue/queue.module';
import { PRACTICE_ANSWER_JOB, type PracticeAnswerJobData } from './practice-analytics.constants';
import { PracticeAnalyticsRepository } from './practice-analytics.repository';

/** Worker that applies queued practice-answer analytics (question metrics + events). */
@Processor(ANALYTICS_QUEUE)
export class PracticeAnalyticsProcessor extends WorkerHost {
  private readonly logger = new Logger(PracticeAnalyticsProcessor.name);

  constructor(private readonly repo: PracticeAnalyticsRepository) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === PRACTICE_ANSWER_JOB) {
      await this.repo.recordAnswer(job.data as PracticeAnswerJobData);
    } else {
      this.logger.debug(`Ignoring unknown analytics job: ${job.name}`);
    }
  }
}
