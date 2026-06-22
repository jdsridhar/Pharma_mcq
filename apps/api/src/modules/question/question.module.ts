import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { QuestionController } from './controllers/question.controller';
import { QuestionMappingController } from './controllers/question-mapping.controller';
import { QuestionMappingService } from './question-mapping.service';
import { QuestionService } from './question.service';
import { QuestionRepository } from './repositories/question.repository';

/**
 * Question domain — the platform's content core. Owns question identity, versioning,
 * typed answer specs, the review workflow, deduplication, search and the mapping system
 * (knowledge + tags here; exam/curriculum/track mappings join in later phases).
 */
@Module({
  imports: [IdentityModule],
  controllers: [QuestionController, QuestionMappingController],
  providers: [QuestionService, QuestionMappingService, QuestionRepository],
  exports: [QuestionService],
})
export class QuestionModule {}
