import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { MasteryProcessor } from './mastery/mastery.processor';
import { MasteryProducer } from './mastery/mastery.producer';
import { MasteryService } from './mastery.service';
import { AnalyticsRepository } from './repositories/analytics.repository';

/**
 * Analytics domain — the mastery engine (per-knowledge `student_mastery`), topic/question
 * metrics, and student dashboards. Recompute runs on demand or via the `mastery` BullMQ
 * queue. `MasteryProducer` is exported so other domains can trigger async recompute.
 */
@Module({
  controllers: [AnalyticsController],
  providers: [
    MasteryService,
    AnalyticsService,
    AnalyticsRepository,
    MasteryProducer,
    MasteryProcessor,
  ],
  exports: [MasteryService, MasteryProducer],
})
export class AnalyticsModule {}
