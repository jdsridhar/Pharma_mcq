import { Injectable } from '@nestjs/common';
import {
  type ContentStatus,
  type DifficultyLevel,
  type ExamBlueprintItem,
  type ExamProfile,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';

const blueprintInclude = Prisma.validator<Prisma.ExamBlueprintInclude>()({
  items: { orderBy: { label: 'asc' } },
});
export type ExamBlueprintWithItems = Prisma.ExamBlueprintGetPayload<{
  include: typeof blueprintInclude;
}>;

export interface CreateProfileData {
  code: string;
  name: string;
  description?: string;
  status: ContentStatus;
  /** Tenant owner. null = platform-shared; set = private to an institution. */
  organizationId?: string | null;
}

export interface CreateBlueprintData {
  examProfileId: string;
  name: string;
  totalQuestions: number;
  durationMinutes?: number;
  isActive: boolean;
}

export interface CreateItemData {
  blueprintId: string;
  label: string;
  weightPercent: number;
  questionCount: number;
  difficultyMix?: Prisma.InputJsonValue;
  knowledgeNodeId?: string;
}

/** Persistence for exam profiles, blueprints and weighted blueprint items. */
@Injectable()
export class ExamRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Profiles ─────────────────────────────────────────────────────────────────

  createProfile(data: CreateProfileData): Promise<ExamProfile> {
    return this.prisma.examProfile.create({
      data: {
        code: data.code,
        name: data.name,
        description: data.description,
        status: data.status,
        organizationId: data.organizationId ?? null,
      },
    });
  }

  findProfileById(id: string): Promise<ExamProfile | null> {
    return this.prisma.examProfile.findFirst({ where: { id, deletedAt: null } });
  }

  async listProfiles(
    filter: { status?: ContentStatus; search?: string },
    skip: number,
    take: number,
    viewerOrg?: string | null,
  ): Promise<{ items: ExamProfile[]; total: number }> {
    const and: Prisma.ExamProfileWhereInput[] = [];
    // Inclusive read scope: viewers see platform-shared (null) + their own org. `undefined` = all.
    if (viewerOrg !== undefined) {
      and.push({ OR: [{ organizationId: null }, { organizationId: viewerOrg }] });
    }
    if (filter.search) {
      and.push({
        OR: [
          { name: { contains: filter.search, mode: 'insensitive' } },
          { code: { contains: filter.search, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.ExamProfileWhereInput = {
      deletedAt: null,
      ...(filter.status ? { status: filter.status } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.examProfile.findMany({ where, skip, take, orderBy: { name: 'asc' } }),
      this.prisma.examProfile.count({ where }),
    ]);
    return { items, total };
  }

  updateProfile(id: string, data: Prisma.ExamProfileUpdateInput): Promise<ExamProfile> {
    return this.prisma.examProfile.update({ where: { id }, data });
  }

  async softDeleteProfile(id: string): Promise<void> {
    await this.prisma.examProfile.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // ── Profile ↔ knowledge ────────────────────────────────────────────────────────

  async findExistingKnowledgeNodeIds(ids: string[]): Promise<Set<string>> {
    const rows = await this.prisma.knowledgeNode.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  async setProfileKnowledge(
    examProfileId: string,
    items: { knowledgeNodeId: string; importance?: number }[],
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.examKnowledgeMapping.deleteMany({ where: { examProfileId } }),
      this.prisma.examKnowledgeMapping.createMany({
        data: items.map((i) => ({ examProfileId, knowledgeNodeId: i.knowledgeNodeId, importance: i.importance })),
        skipDuplicates: true,
      }),
    ]);
  }

  async getProfileKnowledge(
    examProfileId: string,
  ): Promise<{ knowledgeNodeId: string; importance: number | null }[]> {
    return this.prisma.examKnowledgeMapping.findMany({
      where: { examProfileId },
      select: { knowledgeNodeId: true, importance: true },
    });
  }

  // ── Blueprints ─────────────────────────────────────────────────────────────────

  createBlueprint(data: CreateBlueprintData): Promise<ExamBlueprintWithItems> {
    return this.prisma.examBlueprint.create({ data, include: blueprintInclude });
  }

  findBlueprintById(id: string): Promise<ExamBlueprintWithItems | null> {
    return this.prisma.examBlueprint.findUnique({ where: { id }, include: blueprintInclude });
  }

  listBlueprintsByProfile(examProfileId: string): Promise<ExamBlueprintWithItems[]> {
    return this.prisma.examBlueprint.findMany({
      where: { examProfileId },
      orderBy: { createdAt: 'desc' },
      include: blueprintInclude,
    });
  }

  updateBlueprint(
    id: string,
    data: Prisma.ExamBlueprintUpdateInput,
  ): Promise<ExamBlueprintWithItems> {
    return this.prisma.examBlueprint.update({ where: { id }, data, include: blueprintInclude });
  }

  async deleteBlueprint(id: string): Promise<void> {
    await this.prisma.examBlueprint.delete({ where: { id } });
  }

  // ── Items ────────────────────────────────────────────────────────────────────

  createItem(data: CreateItemData): Promise<ExamBlueprintItem> {
    return this.prisma.examBlueprintItem.create({ data });
  }

  findItemById(id: string): Promise<ExamBlueprintItem | null> {
    return this.prisma.examBlueprintItem.findUnique({ where: { id } });
  }

  updateItem(id: string, data: Prisma.ExamBlueprintItemUpdateInput): Promise<ExamBlueprintItem> {
    return this.prisma.examBlueprintItem.update({ where: { id }, data });
  }

  async deleteItem(id: string): Promise<void> {
    await this.prisma.examBlueprintItem.delete({ where: { id } });
  }

  /** Sum of weightPercent across a blueprint's items, optionally excluding one. */
  async sumItemWeight(blueprintId: string, excludeItemId?: string): Promise<number> {
    const agg = await this.prisma.examBlueprintItem.aggregate({
      where: { blueprintId, ...(excludeItemId ? { id: { not: excludeItemId } } : {}) },
      _sum: { weightPercent: true },
    });
    return agg._sum.weightPercent ?? 0;
  }

  /**
   * Count PUBLISHED questions (with a current version) matching a blueprint section's filter, in the
   * viewer's tenant scope (`viewerOrg`: `undefined` = all, else platform-shared + that org). Drives
   * the author-facing blueprint plan/validation.
   */
  countPublishedCandidates(
    filter: { knowledgeNodeId?: string | null; examProfileId?: string | null; difficulty?: DifficultyLevel },
    viewerOrg: string | null | undefined,
  ): Promise<number> {
    return this.prisma.question.count({
      where: {
        deletedAt: null,
        status: 'PUBLISHED',
        currentVersionId: { not: null },
        ...(viewerOrg !== undefined ? { OR: [{ organizationId: null }, { organizationId: viewerOrg }] } : {}),
        ...(filter.difficulty ? { authorDifficulty: filter.difficulty } : {}),
        ...(filter.knowledgeNodeId
          ? { knowledgeMappings: { some: { knowledgeNodeId: filter.knowledgeNodeId } } }
          : {}),
        ...(filter.examProfileId ? { examMappings: { some: { examProfileId: filter.examProfileId } } } : {}),
      },
    });
  }
}
