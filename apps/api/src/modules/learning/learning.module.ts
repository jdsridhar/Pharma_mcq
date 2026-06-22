import { Module } from '@nestjs/common';
import { LearningTrackController } from './controllers/learning-track.controller';
import { TrackModuleController } from './controllers/track-module.controller';
import { LearningService } from './learning.service';
import { LearningRepository } from './repositories/learning.repository';
import { TrackModuleService } from './track-module.service';

/**
 * Learning domain — guided study tracks made of ordered modules that map onto the knowledge
 * graph, with per-student progress. Questions map to modules via the question↔track mapping
 * (Question module). Track/module management requires track:* permissions; progress is
 * student-self (any authenticated user).
 */
@Module({
  controllers: [LearningTrackController, TrackModuleController],
  providers: [LearningService, TrackModuleService, LearningRepository],
  exports: [LearningService],
})
export class LearningModule {}
