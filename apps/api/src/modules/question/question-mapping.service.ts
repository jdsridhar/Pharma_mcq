import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  SetCurriculumMappingsInput,
  SetExamMappingsInput,
  SetKnowledgeMappingsInput,
  SetTagsInput,
  SetTrackMappingsInput,
} from '@pharmacy/contracts';
import { QuestionRepository } from './repositories/question.repository';

/**
 * Manages a question's mappings — the Golden Rule surface. Phase 5 covers the knowledge
 * graph and tags; exam/curriculum/track mappings are added in their respective phases
 * (their target entities don't exist yet).
 */
@Injectable()
export class QuestionMappingService {
  constructor(private readonly repo: QuestionRepository) {}

  async setKnowledge(
    questionId: string,
    input: SetKnowledgeMappingsInput,
  ): Promise<{ knowledgeNodeIds: string[] }> {
    await this.requireQuestion(questionId);

    const ids = input.items.map((i) => i.knowledgeNodeId);
    if (ids.length > 0) {
      const existing = await this.repo.findExistingKnowledgeNodeIds(ids);
      const missing = ids.filter((id) => !existing.has(id));
      if (missing.length > 0) {
        throw new BadRequestException(`Unknown knowledge node(s): ${missing.join(', ')}`);
      }
    }

    await this.repo.setKnowledgeMappings(questionId, input.items);
    return { knowledgeNodeIds: await this.repo.getKnowledgeNodeIds(questionId) };
  }

  async setCurriculum(
    questionId: string,
    input: SetCurriculumMappingsInput,
  ): Promise<{ curriculumNodeIds: string[] }> {
    await this.requireQuestion(questionId);

    const ids = input.items.map((i) => i.curriculumNodeId);
    if (ids.length > 0) {
      const existing = await this.repo.findExistingCurriculumNodeIds(ids);
      const missing = ids.filter((id) => !existing.has(id));
      if (missing.length > 0) {
        throw new BadRequestException(`Unknown curriculum node(s): ${missing.join(', ')}`);
      }
    }

    await this.repo.setCurriculumMappings(questionId, ids);
    return { curriculumNodeIds: await this.repo.getCurriculumNodeIds(questionId) };
  }

  async setExams(
    questionId: string,
    input: SetExamMappingsInput,
  ): Promise<{ examProfileIds: string[] }> {
    await this.requireQuestion(questionId);

    const ids = input.items.map((i) => i.examProfileId);
    if (ids.length > 0) {
      const existing = await this.repo.findExistingExamProfileIds(ids);
      const missing = ids.filter((id) => !existing.has(id));
      if (missing.length > 0) {
        throw new BadRequestException(`Unknown exam profile(s): ${missing.join(', ')}`);
      }
    }

    await this.repo.setExamMappings(questionId, input.items);
    return { examProfileIds: await this.repo.getExamProfileIds(questionId) };
  }

  async setTracks(
    questionId: string,
    input: SetTrackMappingsInput,
  ): Promise<{ trackModuleIds: string[] }> {
    await this.requireQuestion(questionId);

    const ids = input.items.map((i) => i.trackModuleId);
    if (ids.length > 0) {
      const existing = await this.repo.findExistingTrackModuleIds(ids);
      const missing = ids.filter((id) => !existing.has(id));
      if (missing.length > 0) {
        throw new BadRequestException(`Unknown track module(s): ${missing.join(', ')}`);
      }
    }

    await this.repo.setTrackMappings(questionId, ids);
    return { trackModuleIds: await this.repo.getTrackModuleIds(questionId) };
  }

  async setTags(questionId: string, input: SetTagsInput): Promise<{ tags: string[] }> {
    await this.requireQuestion(questionId);
    const tagIds = input.tags.length > 0 ? await this.repo.getOrCreateTagIds(input.tags) : [];
    await this.repo.setTagMappings(questionId, tagIds);
    return { tags: await this.repo.getTagNames(questionId) };
  }

  private async requireQuestion(id: string): Promise<void> {
    const question = await this.repo.findById(id);
    if (!question) {
      throw new NotFoundException(`Question ${id} not found`);
    }
  }
}
