import { Module } from '@nestjs/common';
import { RecommendationRuleController } from './recommendation-rule.controller';
import { RecommendationRuleService } from './recommendation-rule.service';
import { RecommendationController } from './recommendation.controller';
import { RecommendationService } from './recommendation.service';
import { RecommendationRepository } from './repositories/recommendation.repository';

/**
 * Recommendation domain — weak-area detection (from mastery), a configurable rule-driven
 * recommendations feed (logged to history), and a study planner. Student-facing routes are
 * self-scoped; rule administration is Admin-only.
 */
@Module({
  controllers: [RecommendationController, RecommendationRuleController],
  providers: [RecommendationService, RecommendationRuleService, RecommendationRepository],
  exports: [RecommendationService],
})
export class RecommendationModule {}
