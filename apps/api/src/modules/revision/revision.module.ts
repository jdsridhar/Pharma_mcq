import { Module } from '@nestjs/common';
import { RevisionRepository } from './repositories/revision.repository';
import { RevisionController } from './revision.controller';
import { RevisionService } from './revision.service';

/**
 * Revision domain — a per-student spaced-repetition queue. Items (from wrong answers,
 * bookmarks, weak topics, time gaps) are rescheduled over growing intervals by a pure
 * scheduler. Student-self.
 */
@Module({
  controllers: [RevisionController],
  providers: [RevisionService, RevisionRepository],
  exports: [RevisionService],
})
export class RevisionModule {}
