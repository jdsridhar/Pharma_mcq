import { Injectable } from '@nestjs/common';
import {
  type DifficultyLevel,
  type PracticeAnswer,
  type PracticeSession,
  type PracticeSessionQuestion,
  Prisma,
  type SessionStatus,
} from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';

export interface PoolFilter {
  knowledgeNodeIds?: string[];
  examProfileId?: string;
  trackModuleId?: string;
  curriculumNodeId?: string;
  tagIds?: string[];
  difficulty?: DifficultyLevel;
}

const servedVersionInclude = Prisma.validator<Prisma.QuestionVersionInclude>()({
  options: { orderBy: { displayOrder: 'asc' } },
  media: { orderBy: { displayOrder: 'asc' } },
  question: { select: { questionType: true } },
});
export type ServedVersionRow = Prisma.QuestionVersionGetPayload<{ include: typeof servedVersionInclude }>;

export interface AnswerWrite {
  selectedOptionIds?: Prisma.InputJsonValue;
  answerPayload?: Prisma.InputJsonValue;
  isCorrect: boolean;
  timeMs?: number;
}

/** Persistence for practice sessions, served questions and answers, plus pool selection. */
@Injectable()
export class PracticeRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Where-clause shared by candidate selection and the available-count — keeps them in lockstep.
   * `trackKnowledgeNodeIds` is the resolved knowledge set for a selected track module (knowledge-
   * driven tracks): a module's questions are those tagged with the module's knowledge nodes. A
   * module with no knowledge mapped resolves to `[]` → matches nothing (signals "configure me").
   */
  private buildPoolWhere(
    filter: PoolFilter,
    viewerOrgId: string | null,
    trackKnowledgeNodeIds: string[] | null,
  ): Prisma.QuestionWhereInput {
    // The track dimension and an explicit knowledge filter both constrain `knowledgeMappings`, so
    // they go in an AND array to avoid a duplicate-key collision when both are present.
    const and: Prisma.QuestionWhereInput[] = [];
    if (filter.trackModuleId) {
      and.push({ knowledgeMappings: { some: { knowledgeNodeId: { in: trackKnowledgeNodeIds ?? [] } } } });
    }
    return {
      deletedAt: null,
      status: 'PUBLISHED',
      currentVersionId: { not: null },
      // Org isolation: platform-shared (null) + the viewer's own org's questions.
      OR: [{ organizationId: null }, { organizationId: viewerOrgId }],
      ...(filter.difficulty ? { authorDifficulty: filter.difficulty } : {}),
      ...(filter.knowledgeNodeIds?.length
        ? { knowledgeMappings: { some: { knowledgeNodeId: { in: filter.knowledgeNodeIds } } } }
        : {}),
      ...(filter.examProfileId ? { examMappings: { some: { examProfileId: filter.examProfileId } } } : {}),
      ...(filter.curriculumNodeId
        ? { curriculumMappings: { some: { curriculumNodeId: filter.curriculumNodeId } } }
        : {}),
      ...(filter.tagIds?.length ? { tagMappings: { some: { tagId: { in: filter.tagIds } } } } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  /** The knowledge nodes a track module covers — these drive the module's question pool. */
  private async resolveTrackKnowledgeIds(trackModuleId: string): Promise<string[]> {
    const rows = await this.prisma.trackKnowledgeMapping.findMany({
      where: { trackModuleId },
      select: { knowledgeNodeId: true },
    });
    return rows.map((r) => r.knowledgeNodeId);
  }

  /** Candidate PUBLISHED questions (with a current version) matching the filter, capped. */
  async findPublishedCandidates(
    filter: PoolFilter,
    cap: number,
    viewerOrgId: string | null,
  ): Promise<{ id: string; currentVersionId: string }[]> {
    const trackKnowledge = filter.trackModuleId
      ? await this.resolveTrackKnowledgeIds(filter.trackModuleId)
      : null;
    const rows = await this.prisma.question.findMany({
      where: this.buildPoolWhere(filter, viewerOrgId, trackKnowledge),
      select: { id: true, currentVersionId: true },
      take: cap,
      orderBy: { createdAt: 'desc' },
    });
    return rows.flatMap((r) => (r.currentVersionId ? [{ id: r.id, currentVersionId: r.currentVersionId }] : []));
  }

  /** How many PUBLISHED questions match the filter in the viewer's scope (drives the count field). */
  async countPublishedCandidates(filter: PoolFilter, viewerOrgId: string | null): Promise<number> {
    const trackKnowledge = filter.trackModuleId
      ? await this.resolveTrackKnowledgeIds(filter.trackModuleId)
      : null;
    return this.prisma.question.count({ where: this.buildPoolWhere(filter, viewerOrgId, trackKnowledge) });
  }

  async createSession(params: {
    userId: string;
    organizationId: string | null;
    config: Prisma.InputJsonValue;
    questions: { questionId: string; servedVersionId: string }[];
  }): Promise<string> {
    const session = await this.prisma.practiceSession.create({
      data: {
        userId: params.userId,
        organizationId: params.organizationId,
        status: 'IN_PROGRESS',
        config: params.config,
        questions: {
          create: params.questions.map((q, index) => ({
            questionId: q.questionId,
            servedVersionId: q.servedVersionId,
            displayOrder: index,
          })),
        },
      },
      select: { id: true },
    });
    return session.id;
  }

  findSessionById(id: string): Promise<PracticeSession | null> {
    return this.prisma.practiceSession.findUnique({ where: { id } });
  }

  findSessionQuestions(sessionId: string): Promise<PracticeSessionQuestion[]> {
    return this.prisma.practiceSessionQuestion.findMany({
      where: { sessionId },
      orderBy: { displayOrder: 'asc' },
    });
  }

  findSessionQuestionById(id: string): Promise<PracticeSessionQuestion | null> {
    return this.prisma.practiceSessionQuestion.findUnique({ where: { id } });
  }

  findServedVersions(versionIds: string[]): Promise<ServedVersionRow[]> {
    return this.prisma.questionVersion.findMany({
      where: { id: { in: versionIds } },
      include: servedVersionInclude,
    });
  }

  findServedVersionById(versionId: string): Promise<ServedVersionRow | null> {
    return this.prisma.questionVersion.findUnique({
      where: { id: versionId },
      include: servedVersionInclude,
    });
  }

  async listSessions(
    userId: string,
    status: SessionStatus | undefined,
    skip: number,
    take: number,
  ): Promise<{
    items: (PracticeSession & { _count: { questions: number; answers: number } })[];
    total: number;
  }> {
    const where: Prisma.PracticeSessionWhereInput = { userId, ...(status ? { status } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.practiceSession.findMany({
        where,
        skip,
        take,
        orderBy: { startedAt: 'desc' },
        include: { _count: { select: { questions: true, answers: true } } },
      }),
      this.prisma.practiceSession.count({ where }),
    ]);
    return { items, total };
  }

  updateSessionStatus(id: string, status: SessionStatus, completedAt: Date | null): Promise<PracticeSession> {
    return this.prisma.practiceSession.update({ where: { id }, data: { status, completedAt } });
  }

  async upsertAnswer(sessionId: string, questionId: string, data: AnswerWrite): Promise<PracticeAnswer> {
    const existing = await this.prisma.practiceAnswer.findFirst({ where: { sessionId, questionId } });
    if (existing) {
      return this.prisma.practiceAnswer.update({
        where: { id: existing.id },
        data: {
          selectedOptionIds: data.selectedOptionIds,
          answerPayload: data.answerPayload,
          isCorrect: data.isCorrect,
          timeMs: data.timeMs,
          answeredAt: new Date(),
        },
      });
    }
    return this.prisma.practiceAnswer.create({
      data: {
        sessionId,
        questionId,
        selectedOptionIds: data.selectedOptionIds,
        answerPayload: data.answerPayload,
        isCorrect: data.isCorrect,
        timeMs: data.timeMs,
      },
    });
  }

  findAnswers(sessionId: string): Promise<PracticeAnswer[]> {
    return this.prisma.practiceAnswer.findMany({ where: { sessionId } });
  }

  countAnswered(sessionId: string): Promise<number> {
    return this.prisma.practiceAnswer.count({ where: { sessionId } });
  }

  async getKnowledgeMapForQuestions(questionIds: string[]): Promise<Map<string, string[]>> {
    if (questionIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.questionKnowledgeMapping.findMany({
      where: { questionId: { in: questionIds } },
      select: { questionId: true, knowledgeNodeId: true },
    });
    const map = new Map<string, string[]>();
    for (const row of rows) {
      const list = map.get(row.questionId) ?? [];
      list.push(row.knowledgeNodeId);
      map.set(row.questionId, list);
    }
    return map;
  }
}
