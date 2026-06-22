import { Injectable } from '@nestjs/common';
import {
  type ContentStatus,
  type DifficultyLevel,
  type MediaType,
  Prisma,
  type Question,
  type QuestionType,
} from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';

const versionInclude = Prisma.validator<Prisma.QuestionVersionInclude>()({
  options: { orderBy: { displayOrder: 'asc' } },
  media: { orderBy: { displayOrder: 'asc' } },
});

const detailInclude = Prisma.validator<Prisma.QuestionInclude>()({
  currentVersion: { include: versionInclude },
  knowledgeMappings: { select: { knowledgeNodeId: true } },
  curriculumMappings: { select: { curriculumNodeId: true } },
  examMappings: { select: { examProfileId: true } },
  trackMappings: { select: { trackModuleId: true } },
  tagMappings: { include: { tag: true } },
});

export type QuestionVersionRow = Prisma.QuestionVersionGetPayload<{ include: typeof versionInclude }>;
export type QuestionDetailRow = Prisma.QuestionGetPayload<{ include: typeof detailInclude }>;
export type QuestionListRow = Prisma.QuestionGetPayload<{
  include: { currentVersion: { select: { questionText: true } } };
}>;

export interface VersionContentData {
  questionText: string;
  explanation?: string;
  answerSpec: Prisma.InputJsonValue;
  normalizedTextHash: string;
  createdById?: string;
  options: { optionText: string; isCorrect: boolean; displayOrder: number }[];
  media: { mediaType: MediaType; url: string; altText?: string; displayOrder: number }[];
}

export interface CreateQuestionData {
  questionCode: string;
  questionType: QuestionType;
  authorDifficulty: DifficultyLevel;
  language: string;
  createdById?: string;
  /** Tenant owner. null = platform-shared; set = private to an institution. */
  organizationId?: string | null;
  content: VersionContentData;
}

export interface ListQuestionsFilter {
  status?: ContentStatus;
  type?: QuestionType;
  knowledgeNodeId?: string;
  search?: string;
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'tag';
}

/** Persistence for questions, versions, options/media, mappings and dedup queries. */
@Injectable()
export class QuestionRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Questions & versions ─────────────────────────────────────────────────────

  createWithVersion(data: CreateQuestionData): Promise<QuestionDetailRow> {
    return this.prisma.question.create({
      data: {
        questionCode: data.questionCode,
        questionType: data.questionType,
        authorDifficulty: data.authorDifficulty,
        language: data.language,
        createdById: data.createdById,
        organizationId: data.organizationId ?? null,
        status: 'DRAFT',
        versions: {
          create: {
            versionNumber: 1,
            questionText: data.content.questionText,
            explanation: data.content.explanation,
            answerSpec: data.content.answerSpec,
            normalizedTextHash: data.content.normalizedTextHash,
            status: 'DRAFT',
            createdById: data.content.createdById,
            options: { create: data.content.options },
            media: { create: data.content.media },
          },
        },
      },
      include: detailInclude,
    });
  }

  async addVersion(
    questionId: string,
    content: VersionContentData,
  ): Promise<QuestionVersionRow> {
    const agg = await this.prisma.questionVersion.aggregate({
      where: { questionId },
      _max: { versionNumber: true },
    });
    const nextNumber = (agg._max.versionNumber ?? 0) + 1;
    return this.prisma.questionVersion.create({
      data: {
        questionId,
        versionNumber: nextNumber,
        questionText: content.questionText,
        explanation: content.explanation,
        answerSpec: content.answerSpec,
        normalizedTextHash: content.normalizedTextHash,
        status: 'DRAFT',
        createdById: content.createdById,
        options: { create: content.options },
        media: { create: content.media },
      },
      include: versionInclude,
    });
  }

  findById(id: string): Promise<Question | null> {
    return this.prisma.question.findFirst({ where: { id, deletedAt: null } });
  }

  findDetailById(id: string): Promise<QuestionDetailRow | null> {
    return this.prisma.question.findFirst({ where: { id, deletedAt: null }, include: detailInclude });
  }

  findWorkingVersion(questionId: string): Promise<QuestionVersionRow | null> {
    return this.prisma.questionVersion.findFirst({
      where: { questionId },
      orderBy: { versionNumber: 'desc' },
      include: versionInclude,
    });
  }

  findAllVersions(questionId: string): Promise<QuestionVersionRow[]> {
    return this.prisma.questionVersion.findMany({
      where: { questionId },
      orderBy: { versionNumber: 'desc' },
      include: versionInclude,
    });
  }

  updateQuestion(id: string, data: Prisma.QuestionUpdateInput): Promise<Question> {
    return this.prisma.question.update({ where: { id }, data });
  }

  updateVersionStatus(versionId: string, status: ContentStatus): Promise<unknown> {
    return this.prisma.questionVersion.update({ where: { id: versionId }, data: { status } });
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.question.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async list(
    filter: ListQuestionsFilter,
    skip: number,
    take: number,
    orgFilter?: string | null,
  ): Promise<{ items: QuestionListRow[]; total: number }> {
    const where: Prisma.QuestionWhereInput = {
      deletedAt: null,
      // Org isolation for management: undefined = all (super-admin); null = platform-shared only
      // (platform staff); an org id = that institution only. Keeps a tenant from seeing/acting on
      // another tenant's — or the platform's — content.
      ...(orgFilter !== undefined ? { organizationId: orgFilter } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.type ? { questionType: filter.type } : {}),
      ...(filter.knowledgeNodeId
        ? { knowledgeMappings: { some: { knowledgeNodeId: filter.knowledgeNodeId } } }
        : {}),
      ...(filter.search
        ? { currentVersion: { is: { questionText: { contains: filter.search, mode: 'insensitive' } } } }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.question.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { currentVersion: { select: { questionText: true } } },
      }),
      this.prisma.question.count({ where }),
    ]);
    return { items, total };
  }

  /** Resolve an organization id by slug (used to identify the platform/shared org). */
  findOrgIdBySlug(slug: string): Promise<{ id: string } | null> {
    return this.prisma.organization.findUnique({ where: { slug }, select: { id: true } });
  }

  // ── Dedup ────────────────────────────────────────────────────────────────────

  findByNormalizedHash(
    hash: string,
    organizationId: string | null,
    excludeQuestionId?: string,
  ): Promise<{ id: string; questionCode: string } | null> {
    return this.prisma.question.findFirst({
      where: {
        deletedAt: null,
        // Scope dedup to the same ownership bucket (own org, or platform-shared when null).
        organizationId,
        ...(excludeQuestionId ? { id: { not: excludeQuestionId } } : {}),
        versions: { some: { normalizedTextHash: hash } },
      },
      select: { id: true, questionCode: true },
    });
  }

  /** Trigram similarity search (requires pg_trgm + the operational trigram index). */
  similarCandidates(
    text: string,
    threshold: number,
    limit: number,
  ): Promise<{ questionId: string; questionCode: string; questionText: string; similarity: number }[]> {
    return this.prisma.$queryRaw`
      SELECT q.id AS "questionId", q."questionCode", v."questionText",
             similarity(v."questionText", ${text}) AS similarity
      FROM question_versions v
      JOIN questions q ON q.id = v."questionId"
      WHERE q."deletedAt" IS NULL
        AND similarity(v."questionText", ${text}) >= ${threshold}
      ORDER BY similarity DESC
      LIMIT ${limit}
    `;
  }

  // ── Mappings ──────────────────────────────────────────────────────────────────

  async findExistingKnowledgeNodeIds(ids: string[]): Promise<Set<string>> {
    const rows = await this.prisma.knowledgeNode.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  async setKnowledgeMappings(
    questionId: string,
    items: { knowledgeNodeId: string; weight?: number }[],
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.questionKnowledgeMapping.deleteMany({ where: { questionId } }),
      this.prisma.questionKnowledgeMapping.createMany({
        data: items.map((i) => ({ questionId, knowledgeNodeId: i.knowledgeNodeId, weight: i.weight })),
        skipDuplicates: true,
      }),
    ]);
  }

  async getKnowledgeNodeIds(questionId: string): Promise<string[]> {
    const rows = await this.prisma.questionKnowledgeMapping.findMany({
      where: { questionId },
      select: { knowledgeNodeId: true },
    });
    return rows.map((r) => r.knowledgeNodeId);
  }

  async findExistingCurriculumNodeIds(ids: string[]): Promise<Set<string>> {
    const rows = await this.prisma.curriculumNode.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  async setCurriculumMappings(questionId: string, curriculumNodeIds: string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.questionCurriculumMapping.deleteMany({ where: { questionId } }),
      this.prisma.questionCurriculumMapping.createMany({
        data: curriculumNodeIds.map((curriculumNodeId) => ({ questionId, curriculumNodeId })),
        skipDuplicates: true,
      }),
    ]);
  }

  async getCurriculumNodeIds(questionId: string): Promise<string[]> {
    const rows = await this.prisma.questionCurriculumMapping.findMany({
      where: { questionId },
      select: { curriculumNodeId: true },
    });
    return rows.map((r) => r.curriculumNodeId);
  }

  async findExistingExamProfileIds(ids: string[]): Promise<Set<string>> {
    const rows = await this.prisma.examProfile.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  async setExamMappings(
    questionId: string,
    items: { examProfileId: string; relevance?: number }[],
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.questionExamMapping.deleteMany({ where: { questionId } }),
      this.prisma.questionExamMapping.createMany({
        data: items.map((i) => ({ questionId, examProfileId: i.examProfileId, relevance: i.relevance })),
        skipDuplicates: true,
      }),
    ]);
  }

  async getExamProfileIds(questionId: string): Promise<string[]> {
    const rows = await this.prisma.questionExamMapping.findMany({
      where: { questionId },
      select: { examProfileId: true },
    });
    return rows.map((r) => r.examProfileId);
  }

  async findExistingTrackModuleIds(ids: string[]): Promise<Set<string>> {
    const rows = await this.prisma.trackModule.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  async setTrackMappings(questionId: string, trackModuleIds: string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.questionTrackMapping.deleteMany({ where: { questionId } }),
      this.prisma.questionTrackMapping.createMany({
        data: trackModuleIds.map((trackModuleId) => ({ questionId, trackModuleId })),
        skipDuplicates: true,
      }),
    ]);
  }

  async getTrackModuleIds(questionId: string): Promise<string[]> {
    const rows = await this.prisma.questionTrackMapping.findMany({
      where: { questionId },
      select: { trackModuleId: true },
    });
    return rows.map((r) => r.trackModuleId);
  }

  async getOrCreateTagIds(names: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const name of names) {
      const slug = slugify(name);
      const tag = await this.prisma.tag.upsert({
        where: { slug },
        update: {},
        create: { name: name.trim(), slug },
        select: { id: true },
      });
      ids.push(tag.id);
    }
    return ids;
  }

  async setTagMappings(questionId: string, tagIds: string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.questionTagMapping.deleteMany({ where: { questionId } }),
      this.prisma.questionTagMapping.createMany({
        data: tagIds.map((tagId) => ({ questionId, tagId })),
        skipDuplicates: true,
      }),
    ]);
  }

  async getTagNames(questionId: string): Promise<string[]> {
    const rows = await this.prisma.questionTagMapping.findMany({
      where: { questionId },
      include: { tag: { select: { name: true } } },
    });
    return rows.map((r) => r.tag.name);
  }
}
