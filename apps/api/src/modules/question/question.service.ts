import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type AnswerSpec,
  type BulkActionItemResult,
  type BulkActionResultDto,
  type BulkQuestionActionInput,
  type CheckDuplicateQuery,
  type CreateQuestionInput,
  type CreateVersionInput,
  type DuplicateCandidateDto,
  type ListQuestionsQuery,
  PERMISSIONS,
  type Paginated,
  type QuestionBulkAction,
  type QuestionDetailDto,
  type QuestionSummaryDto,
  type QuestionVersionDto,
  SystemRole,
  type UpdateQuestionMetaInput,
  buildPaginationMeta,
  toSkipTake,
} from '@pharmacy/contracts';
import { type ContentStatus, Prisma, type Question } from '@prisma/client';
import type { AuthenticatedUser } from '../identity/types/auth.types';
import { PolicyService } from '../identity/policies/policy.service';
import {
  type QuestionDetailRow,
  QuestionRepository,
  type QuestionListRow,
  type QuestionVersionRow,
  type VersionContentData,
} from './repositories/question.repository';
import { computeNormalizedTextHash } from './utils/normalized-hash.util';

/** Permission required to run each bulk action (enforced once for the whole batch). */
const BULK_ACTION_PERMISSION: Record<QuestionBulkAction, string> = {
  submit: PERMISSIONS.QUESTION_UPDATE,
  approve: PERMISSIONS.QUESTION_APPROVE,
  reject: PERMISSIONS.QUESTION_REVIEW,
  publish: PERMISSIONS.QUESTION_PUBLISH,
  archive: PERMISSIONS.QUESTION_PUBLISH,
  delete: PERMISSIONS.QUESTION_DELETE,
};

/** Allowed status transitions for the review workflow. */
const TRANSITIONS = {
  submit: { from: ['DRAFT'], to: 'REVIEW' },
  approve: { from: ['REVIEW'], to: 'APPROVED' },
  reject: { from: ['REVIEW'], to: 'DRAFT' },
  publish: { from: ['APPROVED'], to: 'PUBLISHED' },
  archive: { from: ['PUBLISHED', 'APPROVED'], to: 'ARCHIVED' },
} as const satisfies Record<string, { from: ContentStatus[]; to: ContentStatus }>;

@Injectable()
export class QuestionService {
  /** Cached platform/shared org id (resolved once). `undefined` = not yet resolved. */
  private platformOrgId: string | null | undefined;

  constructor(
    private readonly repo: QuestionRepository,
    private readonly policy: PolicyService,
  ) {}

  // ── Create / version / metadata ──────────────────────────────────────────────

  async create(input: CreateQuestionInput, user: AuthenticatedUser): Promise<QuestionDetailDto> {
    const hash = computeNormalizedTextHash(input.questionText);
    // Dedup is scoped to the question's ownership bucket (own org, or platform-shared) so two
    // institutions may legitimately author identical text. (RLS also enforces this at the DB.)
    const organizationId = await this.contentOrgId(user);
    await this.assertNotDuplicate(hash, organizationId);

    try {
      const created = await this.repo.createWithVersion({
        questionCode: input.questionCode,
        questionType: input.questionType,
        authorDifficulty: input.authorDifficulty,
        language: input.language,
        createdById: user.id,
        organizationId,
        content: this.buildContent(input, hash, user.id),
      });
      return this.getDetail(created.id);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(`A question with code "${input.questionCode}" already exists`);
      }
      throw error;
    }
  }

  async addVersion(
    id: string,
    input: CreateVersionInput,
    user: AuthenticatedUser,
  ): Promise<QuestionDetailDto> {
    const question = await this.requireQuestion(id);
    this.policy.assertOwnerOrPermission(user, question.createdById, PERMISSIONS.QUESTION_REVIEW);

    if (input.questionType !== question.questionType) {
      throw new ConflictException('Question type is immutable and cannot change between versions');
    }

    const hash = computeNormalizedTextHash(input.questionText);
    await this.assertNotDuplicate(hash, question.organizationId, id);

    await this.repo.addVersion(id, this.buildContent(input, hash, user.id));
    // New content needs re-review; the published currentVersion keeps serving until republish.
    await this.repo.updateQuestion(id, { status: 'DRAFT' });
    return this.getDetail(id);
  }

  async updateMeta(
    id: string,
    input: UpdateQuestionMetaInput,
    user: AuthenticatedUser,
  ): Promise<QuestionDetailDto> {
    const question = await this.requireQuestion(id);
    this.policy.assertOwnerOrPermission(user, question.createdById, PERMISSIONS.QUESTION_REVIEW);
    await this.repo.updateQuestion(id, {
      authorDifficulty: input.authorDifficulty,
      language: input.language,
    });
    return this.getDetail(id);
  }

  async remove(id: string): Promise<void> {
    await this.requireQuestion(id);
    await this.repo.softDelete(id);
  }

  // ── Review workflow ──────────────────────────────────────────────────────────

  async submit(id: string, user: AuthenticatedUser): Promise<QuestionDetailDto> {
    const question = await this.requireQuestion(id);
    this.policy.assertOwnerOrPermission(user, question.createdById, PERMISSIONS.QUESTION_REVIEW);
    return this.transition(question, 'submit');
  }

  async approve(id: string): Promise<QuestionDetailDto> {
    return this.transition(await this.requireQuestion(id), 'approve');
  }

  async reject(id: string): Promise<QuestionDetailDto> {
    return this.transition(await this.requireQuestion(id), 'reject');
  }

  async archive(id: string): Promise<QuestionDetailDto> {
    return this.transition(await this.requireQuestion(id), 'archive');
  }

  /** Publish promotes the working version to the live `currentVersion`. */
  async publish(id: string): Promise<QuestionDetailDto> {
    const question = await this.requireQuestion(id);
    this.assertTransition(question.status, 'publish');

    const working = await this.repo.findWorkingVersion(id);
    if (!working) {
      throw new ConflictException('No version to publish');
    }

    if (question.currentVersionId && question.currentVersionId !== working.id) {
      await this.repo.updateVersionStatus(question.currentVersionId, 'ARCHIVED');
    }
    await this.repo.updateQuestion(id, {
      status: 'PUBLISHED',
      currentVersion: { connect: { id: working.id } },
      normalizedTextHash: working.normalizedTextHash,
    });
    await this.repo.updateVersionStatus(working.id, 'PUBLISHED');
    return this.getDetail(id);
  }

  /**
   * Run one workflow action across many questions. The required permission is checked once for the
   * batch; each question is then attempted independently so one failure (e.g. wrong status) does not
   * abort the rest — per-id outcomes are returned for display.
   */
  async bulkAction(input: BulkQuestionActionInput, user: AuthenticatedUser): Promise<BulkActionResultDto> {
    const required = BULK_ACTION_PERMISSION[input.action];
    if (!user.permissions.includes(required)) {
      throw new ForbiddenException(`You lack the "${required}" permission required for bulk ${input.action}`);
    }
    const results: BulkActionItemResult[] = [];
    for (const id of input.ids) {
      try {
        await this.runBulkAction(id, input.action, user);
        results.push({ id, ok: true, error: null });
      } catch (err) {
        results.push({ id, ok: false, error: err instanceof Error ? err.message : 'Action failed' });
      }
    }
    const succeeded = results.filter((r) => r.ok).length;
    return { action: input.action, total: results.length, succeeded, failed: results.length - succeeded, results };
  }

  private runBulkAction(id: string, action: QuestionBulkAction, user: AuthenticatedUser): Promise<unknown> {
    switch (action) {
      case 'submit':
        return this.submit(id, user);
      case 'approve':
        return this.approve(id);
      case 'reject':
        return this.reject(id);
      case 'publish':
        return this.publish(id);
      case 'archive':
        return this.archive(id);
      case 'delete':
        return this.remove(id);
    }
  }

  // ── Reads ────────────────────────────────────────────────────────────────────

  async get(id: string): Promise<QuestionDetailDto> {
    return this.getDetail(id);
  }

  async listVersions(id: string): Promise<QuestionVersionDto[]> {
    await this.requireQuestion(id);
    const versions = await this.repo.findAllVersions(id);
    return versions.map((v) => this.toVersionDto(v));
  }

  async list(query: ListQuestionsQuery, actor: AuthenticatedUser): Promise<Paginated<QuestionSummaryDto>> {
    const { skip, take } = toSkipTake(query);
    const orgFilter = await this.listOrgFilter(actor);
    const { items, total } = await this.repo.list(
      { status: query.status, type: query.type, knowledgeNodeId: query.knowledgeNodeId, search: query.search },
      skip,
      take,
      orgFilter,
    );
    return {
      items: items.map((q) => this.toSummary(q, this.preview(q.currentVersion?.questionText))),
      meta: buildPaginationMeta(total, query),
    };
  }

  async checkDuplicates(query: CheckDuplicateQuery): Promise<DuplicateCandidateDto[]> {
    const rows = await this.repo.similarCandidates(query.text, query.threshold, query.limit);
    return rows.map((r) => ({
      questionId: r.questionId,
      questionCode: r.questionCode,
      similarity: Number(r.similarity),
      questionText: r.questionText,
    }));
  }

  // ── internals ────────────────────────────────────────────────────────────────

  /** Owner org for new content: null (platform-shared) for platform staff/super-admin, else the
   *  creator's own org (private to that institution). */
  private async contentOrgId(user: AuthenticatedUser): Promise<string | null> {
    if (!user.organizationId) return null;
    const platform = await this.resolvePlatformOrgId();
    return user.organizationId === platform ? null : user.organizationId;
  }

  private async resolvePlatformOrgId(): Promise<string | null> {
    if (this.platformOrgId === undefined) {
      const slug = process.env.DEFAULT_ORGANIZATION_SLUG ?? 'default';
      const org = await this.repo.findOrgIdBySlug(slug);
      this.platformOrgId = org?.id ?? null;
    }
    return this.platformOrgId;
  }

  /** Management list scope: super-admin → all; platform staff → shared (null); institution → own org. */
  private async listOrgFilter(actor: AuthenticatedUser): Promise<string | null | undefined> {
    if (actor.roles.includes(SystemRole.SUPER_ADMIN)) return undefined;
    const platform = await this.resolvePlatformOrgId();
    return actor.organizationId && actor.organizationId !== platform ? actor.organizationId : null;
  }

  private buildContent(
    input: CreateQuestionInput | CreateVersionInput,
    hash: string,
    userId: string,
  ): VersionContentData {
    return {
      questionText: input.questionText,
      explanation: input.explanation,
      answerSpec: input.answerSpec as unknown as Prisma.InputJsonValue,
      normalizedTextHash: hash,
      createdById: userId,
      options: (input.options ?? []).map((o, i) => ({
        optionText: o.text,
        isCorrect: o.isCorrect,
        displayOrder: o.displayOrder ?? i,
      })),
      media: (input.media ?? []).map((m, i) => ({
        mediaType: m.mediaType,
        url: m.url,
        altText: m.altText,
        displayOrder: m.displayOrder ?? i,
      })),
    };
  }

  private async assertNotDuplicate(
    hash: string,
    organizationId: string | null,
    excludeQuestionId?: string,
  ): Promise<void> {
    const existing = await this.repo.findByNormalizedHash(hash, organizationId, excludeQuestionId);
    if (existing) {
      throw new ConflictException(
        `A question with identical text already exists (${existing.questionCode})`,
      );
    }
  }

  private async transition(
    question: Question,
    action: keyof typeof TRANSITIONS,
  ): Promise<QuestionDetailDto> {
    this.assertTransition(question.status, action);
    const target = TRANSITIONS[action].to;
    await this.repo.updateQuestion(question.id, { status: target });
    const working = await this.repo.findWorkingVersion(question.id);
    if (working) {
      await this.repo.updateVersionStatus(working.id, target);
    }
    return this.getDetail(question.id);
  }

  private assertTransition(current: ContentStatus, action: keyof typeof TRANSITIONS): void {
    const allowed = TRANSITIONS[action].from as readonly ContentStatus[];
    if (!allowed.includes(current)) {
      throw new ConflictException(`Cannot ${action} a question in ${current} state`);
    }
  }

  private async requireQuestion(id: string): Promise<Question> {
    const question = await this.repo.findById(id);
    if (!question) {
      throw new NotFoundException(`Question ${id} not found`);
    }
    return question;
  }

  private async getDetail(id: string): Promise<QuestionDetailDto> {
    const detail = await this.repo.findDetailById(id);
    if (!detail) {
      throw new NotFoundException(`Question ${id} not found`);
    }
    const working = await this.repo.findWorkingVersion(id);
    const summary = this.toSummary(detail, this.preview(detail.currentVersion?.questionText));
    return {
      ...summary,
      currentVersion: detail.currentVersion ? this.toVersionDto(detail.currentVersion) : null,
      workingVersion: working ? this.toVersionDto(working) : null,
      knowledgeNodeIds: detail.knowledgeMappings.map((m) => m.knowledgeNodeId),
      curriculumNodeIds: detail.curriculumMappings.map((m) => m.curriculumNodeId),
      examProfileIds: detail.examMappings.map((m) => m.examProfileId),
      trackModuleIds: detail.trackMappings.map((m) => m.trackModuleId),
      tags: detail.tagMappings.map((t) => t.tag.name),
    };
  }

  private toSummary(q: Question | QuestionListRow | QuestionDetailRow, preview: string | null): QuestionSummaryDto {
    return {
      id: q.id,
      questionCode: q.questionCode,
      questionType: q.questionType,
      status: q.status,
      authorDifficulty: q.authorDifficulty,
      calculatedDifficulty: q.calculatedDifficulty ?? null,
      language: q.language,
      currentVersionId: q.currentVersionId ?? null,
      createdById: q.createdById ?? null,
      preview,
      createdAt: q.createdAt.toISOString(),
      updatedAt: q.updatedAt.toISOString(),
    };
  }

  private toVersionDto(v: QuestionVersionRow): QuestionVersionDto {
    return {
      id: v.id,
      versionNumber: v.versionNumber,
      questionText: v.questionText,
      explanation: v.explanation ?? null,
      answerSpec: v.answerSpec as unknown as AnswerSpec,
      status: v.status,
      normalizedTextHash: v.normalizedTextHash,
      createdAt: v.createdAt.toISOString(),
      options: v.options.map((o) => ({
        id: o.id,
        optionText: o.optionText,
        isCorrect: o.isCorrect,
        displayOrder: o.displayOrder,
      })),
      media: v.media.map((m) => ({
        id: m.id,
        mediaType: m.mediaType,
        url: m.url,
        altText: m.altText ?? null,
        displayOrder: m.displayOrder,
      })),
    };
  }

  private preview(text: string | null | undefined): string | null {
    if (!text) {
      return null;
    }
    return text.length > 200 ? `${text.slice(0, 200)}…` : text;
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
