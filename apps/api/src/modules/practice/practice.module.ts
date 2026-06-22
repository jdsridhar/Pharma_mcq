import { Module } from '@nestjs/common';
import { PracticeAnalyticsProcessor } from './analytics/practice-analytics.processor';
import { PracticeAnalyticsProducer } from './analytics/practice-analytics.producer';
import { PracticeAnalyticsRepository } from './analytics/practice-analytics.repository';
import { PracticeController } from './practice.controller';
import { PracticeService } from './practice.service';
import { PracticeRepository } from './repositories/practice.repository';

/**
 * Practice domain — untimed self-study sessions built from the published-question pool, with
 * immediate scoring (shared AnswerEvaluator) and analytics pushed to BullMQ. Student-self;
 * the analytics worker updates question metrics + the event store off the request path.
 */
@Module({
  controllers: [PracticeController],
  providers: [
    PracticeService,
    PracticeRepository,
    PracticeAnalyticsProducer,
    PracticeAnalyticsProcessor,
    PracticeAnalyticsRepository,
  ],
  exports: [PracticeService],
})
export class PracticeModule {}
