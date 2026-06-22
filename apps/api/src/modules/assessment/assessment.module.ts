import { Module } from '@nestjs/common';
import { MockTestController } from './controllers/mock-test.controller';
import { TestSessionController } from './controllers/test-session.controller';
import { MockTestService } from './mock-test.service';
import { MockTestRepository } from './repositories/mock-test.repository';
import { TestSessionRepository } from './repositories/test-session.repository';
import { TestSessionService } from './test-session.service';

/**
 * Assessment domain — timed mock tests (the shared ranking cohort) and per-user attempts.
 * Each attempt freezes immutable JSONB snapshots; scoring (shared evaluator, negative
 * marking) and ranking run at submit/read over those snapshots, never the live questions.
 */
@Module({
  controllers: [MockTestController, TestSessionController],
  providers: [MockTestService, TestSessionService, MockTestRepository, TestSessionRepository],
  exports: [MockTestService, TestSessionService],
})
export class AssessmentModule {}
