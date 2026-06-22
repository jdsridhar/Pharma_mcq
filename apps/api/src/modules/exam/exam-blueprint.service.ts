import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type BlueprintPlanDto,
  type BlueprintPlanSectionDto,
  type CreateExamBlueprintInput,
  type CreateExamBlueprintItemInput,
  type DifficultyMix,
  type ExamBlueprintDto,
  type ExamBlueprintItemDto,
  type UpdateExamBlueprintInput,
  type UpdateExamBlueprintItemInput,
} from '@pharmacy/contracts';
import { type ExamBlueprintItem, type ExamProfile, Prisma } from '@prisma/client';
import { TenantScopeService } from '../../common/tenancy/tenant-scope.service';
import type { AuthenticatedUser } from '../identity/types/auth.types';
import { targetCountsFromWeights } from './blueprint-plan.util';
import {
  type ExamBlueprintWithItems,
  ExamRepository,
} from './repositories/exam.repository';

/** Round to 2 decimals (weight sums) without floating-point noise. */
const round2 = (n: number): number => Math.round(n * 100) / 100;
/** A blueprint fully allocates the paper when its weights total 100 (±0.01). */
const isWeightComplete = (weightTotal: number): boolean => Math.abs(weightTotal - 100) < 0.01;

@Injectable()
export class ExamBlueprintService {
  constructor(
    private readonly repo: ExamRepository,
    private readonly tenant: TenantScopeService,
  ) {}

  async create(
    examId: string,
    input: CreateExamBlueprintInput,
    actor: AuthenticatedUser,
  ): Promise<ExamBlueprintDto> {
    await this.requireProfile(examId, actor, 'manage');
    const blueprint = await this.repo.createBlueprint({
      examProfileId: examId,
      name: input.name,
      totalQuestions: input.totalQuestions,
      durationMinutes: input.durationMinutes,
      isActive: input.isActive,
    });
    return this.toBlueprintDto(blueprint);
  }

  async get(examId: string, blueprintId: string, actor: AuthenticatedUser): Promise<ExamBlueprintDto> {
    return this.toBlueprintDto(await this.requireBlueprint(examId, blueprintId, actor, 'read'));
  }

  async list(examId: string, actor: AuthenticatedUser): Promise<ExamBlueprintDto[]> {
    await this.requireProfile(examId, actor, 'read');
    const blueprints = await this.repo.listBlueprintsByProfile(examId);
    return blueprints.map((b) => this.toBlueprintDto(b));
  }

  async update(
    examId: string,
    blueprintId: string,
    input: UpdateExamBlueprintInput,
    actor: AuthenticatedUser,
  ): Promise<ExamBlueprintDto> {
    await this.requireBlueprint(examId, blueprintId, actor, 'manage');
    const updated = await this.repo.updateBlueprint(blueprintId, {
      name: input.name,
      totalQuestions: input.totalQuestions,
      durationMinutes: input.durationMinutes,
      isActive: input.isActive,
    });
    return this.toBlueprintDto(updated);
  }

  async remove(examId: string, blueprintId: string, actor: AuthenticatedUser): Promise<void> {
    await this.requireBlueprint(examId, blueprintId, actor, 'manage');
    await this.repo.deleteBlueprint(blueprintId);
  }

  async addItem(
    examId: string,
    blueprintId: string,
    input: CreateExamBlueprintItemInput,
    actor: AuthenticatedUser,
  ): Promise<ExamBlueprintItemDto> {
    const blueprint = await this.requireBlueprint(examId, blueprintId, actor, 'manage');
    await this.assertWeightWithinBudget(blueprintId, input.weightPercent);
    if (input.knowledgeNodeId) {
      await this.assertKnowledgeExists(input.knowledgeNodeId);
    }
    const item = await this.repo.createItem({
      blueprintId,
      label: input.label,
      weightPercent: input.weightPercent,
      // Weight-driven: store the derived count (the exact value is recomputed across all items in the
      // blueprint DTO); the author never supplies it.
      questionCount: this.deriveCount(input.weightPercent, blueprint.totalQuestions),
      difficultyMix: input.difficultyMix as Prisma.InputJsonValue | undefined,
      knowledgeNodeId: input.knowledgeNodeId,
    });
    return this.toItemDto(item);
  }

  /** Single-item derived count (rounded). The blueprint DTO recomputes exactly via largest-remainder. */
  private deriveCount(weightPercent: number, totalQuestions: number): number {
    return Math.round((Math.max(0, weightPercent) / 100) * totalQuestions);
  }

  async updateItem(
    examId: string,
    blueprintId: string,
    itemId: string,
    input: UpdateExamBlueprintItemInput,
    actor: AuthenticatedUser,
  ): Promise<ExamBlueprintItemDto> {
    const blueprint = await this.requireBlueprint(examId, blueprintId, actor, 'manage');
    await this.requireItem(blueprintId, itemId);

    if (input.weightPercent !== undefined) {
      await this.assertWeightWithinBudget(blueprintId, input.weightPercent, itemId);
    }
    if (input.knowledgeNodeId) {
      await this.assertKnowledgeExists(input.knowledgeNodeId);
    }

    const data: Prisma.ExamBlueprintItemUpdateInput = {};
    if (input.label !== undefined) {
      data.label = input.label;
    }
    if (input.weightPercent !== undefined) {
      data.weightPercent = input.weightPercent;
      // Keep the derived count in step with the weight (authoritative value recomputed in the DTO).
      data.questionCount = this.deriveCount(input.weightPercent, blueprint.totalQuestions);
    }
    if (input.difficultyMix !== undefined) {
      data.difficultyMix =
        input.difficultyMix === null ? Prisma.DbNull : (input.difficultyMix as Prisma.InputJsonValue);
    }
    if (input.knowledgeNodeId !== undefined) {
      data.knowledgeNode =
        input.knowledgeNodeId === null
          ? { disconnect: true }
          : { connect: { id: input.knowledgeNodeId } };
    }

    const updated = await this.repo.updateItem(itemId, data);
    return this.toItemDto(updated);
  }

  async removeItem(
    examId: string,
    blueprintId: string,
    itemId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    await this.requireBlueprint(examId, blueprintId, actor, 'manage');
    await this.requireItem(blueprintId, itemId);
    await this.repo.deleteItem(itemId);
  }

  // ── internals ────────────────────────────────────────────────────────────────

  private async assertWeightWithinBudget(
    blueprintId: string,
    weightPercent: number,
    excludeItemId?: string,
  ): Promise<void> {
    const current = await this.repo.sumItemWeight(blueprintId, excludeItemId);
    if (current + weightPercent > 100.0001) {
      throw new BadRequestException(
        `Total blueprint weight would exceed 100% (current ${current}, adding ${weightPercent})`,
      );
    }
  }

  private async assertKnowledgeExists(knowledgeNodeId: string): Promise<void> {
    const existing = await this.repo.findExistingKnowledgeNodeIds([knowledgeNodeId]);
    if (!existing.has(knowledgeNodeId)) {
      throw new BadRequestException(`Unknown knowledge node: ${knowledgeNodeId}`);
    }
  }

  /**
   * Load the parent exam profile and enforce tenant scope: cross-org reads 404 (don't leak
   * existence); `manage` additionally requires ownership (403 when readable but not owned).
   */
  private async requireProfile(
    examId: string,
    actor: AuthenticatedUser,
    mode: 'read' | 'manage',
  ): Promise<ExamProfile> {
    const profile = await this.repo.findProfileById(examId);
    if (!profile || !this.tenant.canRead(profile.organizationId, actor)) {
      throw new NotFoundException(`Exam profile ${examId} not found`);
    }
    if (mode === 'manage' && !(await this.tenant.canManage(profile.organizationId, actor))) {
      throw new ForbiddenException('You cannot modify an exam profile owned by another organization');
    }
    return profile;
  }

  private async requireBlueprint(
    examId: string,
    blueprintId: string,
    actor: AuthenticatedUser,
    mode: 'read' | 'manage',
  ): Promise<ExamBlueprintWithItems> {
    await this.requireProfile(examId, actor, mode);
    const blueprint = await this.repo.findBlueprintById(blueprintId);
    if (!blueprint || blueprint.examProfileId !== examId) {
      throw new NotFoundException(`Blueprint ${blueprintId} not found in exam ${examId}`);
    }
    return blueprint;
  }

  private async requireItem(blueprintId: string, itemId: string): Promise<ExamBlueprintItem> {
    const item = await this.repo.findItemById(itemId);
    if (!item || item.blueprintId !== blueprintId) {
      throw new NotFoundException(`Item ${itemId} not found in blueprint ${blueprintId}`);
    }
    return item;
  }

  private toBlueprintDto(b: ExamBlueprintWithItems): ExamBlueprintDto {
    // Derive each item's question count from its weight (largest-remainder → sums to the subtotal).
    const derived = targetCountsFromWeights(
      b.items.map((i) => i.weightPercent),
      b.totalQuestions,
    );
    const weightTotal = round2(b.items.reduce((sum, i) => sum + i.weightPercent, 0));
    return {
      id: b.id,
      examProfileId: b.examProfileId,
      name: b.name,
      totalQuestions: b.totalQuestions,
      durationMinutes: b.durationMinutes ?? null,
      isActive: b.isActive,
      items: b.items.map((i, idx) => ({ ...this.toItemDto(i), questionCount: derived[idx] ?? 0 })),
      weightTotal,
      isReady: isWeightComplete(weightTotal),
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
    };
  }

  /**
   * Author-facing dry run: derive each section's target from its weight, then count how many
   * published questions actually exist for that section in the viewer's scope. Surfaces weight gaps
   * and under-supplied sections BEFORE a student sits the exam.
   */
  async plan(examId: string, blueprintId: string, actor: AuthenticatedUser): Promise<BlueprintPlanDto> {
    const blueprint = await this.requireBlueprint(examId, blueprintId, actor, 'read');
    const viewerOrg = this.tenant.isSuper(actor) ? undefined : (actor.organizationId ?? null);
    const targets = targetCountsFromWeights(
      blueprint.items.map((i) => i.weightPercent),
      blueprint.totalQuestions,
    );

    const sections: BlueprintPlanSectionDto[] = [];
    const warnings: string[] = [];
    let sourceableCount = 0;
    for (let idx = 0; idx < blueprint.items.length; idx += 1) {
      const item = blueprint.items[idx]!;
      const targetCount = targets[idx] ?? 0;
      const availableCount = await this.repo.countPublishedCandidates(
        { knowledgeNodeId: item.knowledgeNodeId, examProfileId: examId },
        viewerOrg,
      );
      sourceableCount += Math.min(targetCount, availableCount);
      if (availableCount < targetCount) {
        warnings.push(
          `Section "${item.label}": needs ${targetCount}, only ${availableCount} published question(s) available.`,
        );
      }
      sections.push({
        itemId: item.id,
        label: item.label,
        weightPercent: item.weightPercent,
        targetCount,
        availableCount,
        difficultyMix: (item.difficultyMix as DifficultyMix | null) ?? null,
      });
    }

    const weightTotal = round2(blueprint.items.reduce((sum, i) => sum + i.weightPercent, 0));
    const plannedCount = targets.reduce((sum, t) => sum + t, 0);
    if (blueprint.items.length === 0) {
      warnings.push('Blueprint has no sections yet.');
    }
    if (!isWeightComplete(weightTotal)) {
      warnings.push(
        `Weights total ${weightTotal}% (should be 100%). ${plannedCount}/${blueprint.totalQuestions} questions allocated; the remainder is topped up from the general exam pool.`,
      );
    }
    return {
      blueprintId,
      totalQuestions: blueprint.totalQuestions,
      weightTotal,
      plannedCount,
      sourceableCount,
      sections,
      warnings,
      isReady: isWeightComplete(weightTotal) && sourceableCount >= blueprint.totalQuestions,
    };
  }

  private toItemDto(i: ExamBlueprintItem): ExamBlueprintItemDto {
    return {
      id: i.id,
      blueprintId: i.blueprintId,
      label: i.label,
      weightPercent: i.weightPercent,
      questionCount: i.questionCount,
      difficultyMix: (i.difficultyMix as DifficultyMix | null) ?? null,
      knowledgeNodeId: i.knowledgeNodeId ?? null,
    };
  }
}
