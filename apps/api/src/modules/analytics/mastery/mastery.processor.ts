import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { MASTERY_QUEUE } from '../../../infra/queue/queue.module';
import { MasteryService } from '../mastery.service';
import { MASTERY_RECOMPUTE_JOB, type MasteryRecomputeJobData } from './mastery.constants';

/** Worker that recomputes a student's mastery off the request path. */
@Processor(MASTERY_QUEUE)
export class MasteryProcessor extends WorkerHost {
  constructor(private readonly mastery: MasteryService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === MASTERY_RECOMPUTE_JOB) {
      await this.mastery.recompute((job.data as MasteryRecomputeJobData).userId);
    }
  }
}
