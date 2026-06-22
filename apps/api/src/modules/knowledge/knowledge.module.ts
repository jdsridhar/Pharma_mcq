import { Module } from '@nestjs/common';
import { KnowledgeEdgeController } from './controllers/knowledge-edge.controller';
import { KnowledgeNodeController } from './controllers/knowledge-node.controller';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeRepository } from './repositories/knowledge.repository';

/**
 * Knowledge domain — the directed graph of concepts that questions, curriculums, exams and
 * tracks all map onto. Provides node/edge CRUD, hierarchical traversal and DAG enforcement.
 * Authorization uses the global guards (knowledge:read / knowledge:manage).
 */
@Module({
  controllers: [KnowledgeNodeController, KnowledgeEdgeController],
  providers: [KnowledgeService, KnowledgeRepository],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
