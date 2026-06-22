import { Module } from '@nestjs/common';
import { CurriculumNodeController } from './controllers/curriculum-node.controller';
import { CurriculumController } from './controllers/curriculum.controller';
import { CurriculumNodeService } from './curriculum-node.service';
import { CurriculumService } from './curriculum.service';
import { CurriculumRepository } from './repositories/curriculum.repository';

/**
 * Curriculum domain — an ordered tree of nodes that map onto the shared knowledge graph.
 * Questions attach to curriculum nodes via the question↔curriculum mapping (Question module).
 */
@Module({
  controllers: [CurriculumController, CurriculumNodeController],
  providers: [CurriculumService, CurriculumNodeService, CurriculumRepository],
  exports: [CurriculumService],
})
export class CurriculumModule {}
