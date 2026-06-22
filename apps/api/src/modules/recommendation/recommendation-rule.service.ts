import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CreateRecommendationRuleInput,
  type ListRecommendationRulesQuery,
  type Paginated,
  type RecommendationRuleDto,
  type UpdateRecommendationRuleInput,
  buildPaginationMeta,
  toSkipTake,
} from '@pharmacy/contracts';
import { Prisma, type RecommendationRule } from '@prisma/client';
import { RecommendationRepository } from './repositories/recommendation.repository';

@Injectable()
export class RecommendationRuleService {
  constructor(private readonly repo: RecommendationRepository) {}

  async create(input: CreateRecommendationRuleInput): Promise<RecommendationRuleDto> {
    try {
      const rule = await this.repo.createRule({
        code: input.code,
        name: input.name,
        description: input.description,
        definition: input.definition as Prisma.InputJsonValue,
        isActive: input.isActive,
        priority: input.priority,
      });
      return this.toDto(rule);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`A rule with code "${input.code}" already exists`);
      }
      throw error;
    }
  }

  async list(query: ListRecommendationRulesQuery): Promise<Paginated<RecommendationRuleDto>> {
    const { skip, take } = toSkipTake(query);
    const { items, total } = await this.repo.listRules(query.isActive, skip, take);
    return { items: items.map((r) => this.toDto(r)), meta: buildPaginationMeta(total, query) };
  }

  async get(id: string): Promise<RecommendationRuleDto> {
    return this.toDto(await this.require(id));
  }

  async update(id: string, input: UpdateRecommendationRuleInput): Promise<RecommendationRuleDto> {
    await this.require(id);
    const data: Prisma.RecommendationRuleUpdateInput = {};
    if (input.name !== undefined) {
      data.name = input.name;
    }
    if (input.description !== undefined) {
      data.description = input.description;
    }
    if (input.definition !== undefined) {
      data.definition = input.definition as Prisma.InputJsonValue;
    }
    if (input.isActive !== undefined) {
      data.isActive = input.isActive;
    }
    if (input.priority !== undefined) {
      data.priority = input.priority;
    }
    const rule = await this.repo.updateRule(id, data);
    return this.toDto(rule);
  }

  async remove(id: string): Promise<void> {
    await this.require(id);
    await this.repo.deleteRule(id);
  }

  private async require(id: string): Promise<RecommendationRule> {
    const rule = await this.repo.findRuleById(id);
    if (!rule) {
      throw new NotFoundException(`Recommendation rule ${id} not found`);
    }
    return rule;
  }

  private toDto(rule: RecommendationRule): RecommendationRuleDto {
    return {
      id: rule.id,
      code: rule.code,
      name: rule.name,
      description: rule.description ?? null,
      definition: (rule.definition as Record<string, unknown>) ?? {},
      isActive: rule.isActive,
      priority: rule.priority,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    };
  }
}
