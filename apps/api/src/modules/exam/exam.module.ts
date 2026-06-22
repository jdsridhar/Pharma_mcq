import { Module } from '@nestjs/common';
import { ExamBlueprintController } from './controllers/exam-blueprint.controller';
import { ExamProfileController } from './controllers/exam-profile.controller';
import { ExamBlueprintService } from './exam-blueprint.service';
import { ExamService } from './exam.service';
import { ExamRepository } from './repositories/exam.repository';

/**
 * Exam domain — exam profiles (GPAT, NIPER, …) and their weighted blueprints used to
 * assemble tests. Questions map to exam profiles via the question↔exam mapping (Question
 * module). Knowledge mapping records which knowledge areas an exam covers.
 */
@Module({
  controllers: [ExamProfileController, ExamBlueprintController],
  providers: [ExamService, ExamBlueprintService, ExamRepository],
  exports: [ExamService, ExamBlueprintService],
})
export class ExamModule {}
