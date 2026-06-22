import { Injectable } from '@nestjs/common';
import {
  type DifficultyLevel,
  Prisma,
  type Result,
  type SessionStatus,
  type TestAnswer,
  type TestQuestionSnapshot,
  type TestSession,
} from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';

export type SnapshotSourceRow = Prisma.QuestionGetPayload<{
  select: {
    id: true;
    questionType: true;
    currentVersion: { include: { options: true; media: true } };
  };
}>;

export interface SnapshotSeed {
  questionId: string;
  questionVersionId: string;
  displayOrder: number;
  snapshot: Prisma.InputJsonValue;
  marks: number;
  negativeMarks: number;
}

export interface PoolFilter {
  knowledgeNodeIds?: string[];
  examProfileId?: string;
  difficulty?: DifficultyLevel;
}

export interface AnswerWrite {
  selectedOptionIds?: Prisma.InputJsonValue;
  answerPayload?: Prisma.InputJsonValue;
  timeMs?: number;
}

@Injectable()
export class TestSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createSessionWithSnapshots(params: {
    userId: string;
    organizationId: string | null;
    mockTestId?: string;
    expiresAt: Date;
    snapshots: SnapshotSeed[];
  }): Promise<string> {
    const session = await this.prisma.testSession.create({
      data: {
        userId: params.userId,
        organizationId: params.organizationId,
        mockTestId: params.mockTestId,
        status: 'IN_PROGRESS',
        expiresAt: params.expiresAt,
        snapshots: {
          create: params.snapshots.map((s) => ({
            questionId: s.questionId,
            questionVersionId: s.questionVersionId,
            displayOrder: s.displayOrder,
            snapshot: s.snapshot,
            marks: s.marks,
            negativeMarks: s.negativeMarks,
          })),
        },
      },
      select: { id: true },
    });
    return session.id;
  }

  findSessionById(id: string): Promise<TestSession | null> {
    return this.prisma.testSession.findUnique({ where: { id } });
  }

  findSnapshots(testSessionId: string): Promise<TestQuestionSnapshot[]> {
    return this.prisma.testQuestionSnapshot.findMany({
      where: { testSessionId },
      orderBy: { displayOrder: 'asc' },
    });
  }

  findSnapshotById(id: string): Promise<TestQuestionSnapshot | null> {
    return this.prisma.testQuestionSnapshot.findUnique({ where: { id } });
  }

  async listSessions(
    userId: string,
    status: SessionStatus | undefined,
    skip: number,
    take: number,
  ): Promise<{
    items: (TestSession & { _count: { snapshots: number; answers: number } })[];
    total: number;
  }> {
    const where: Prisma.TestSessionWhereInput = { userId, ...(status ? { status } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.testSession.findMany({
        where,
        skip,
        take,
        orderBy: { startedAt: 'desc' },
        include: { _count: { select: { snapshots: true, answers: true } } },
      }),
      this.prisma.testSession.count({ where }),
    ]);
    return { items, total };
  }

  updateSessionStatus(id: string, status: SessionStatus, submittedAt: Date | null): Promise<TestSession> {
    return this.prisma.testSession.update({ where: { id }, data: { status, submittedAt } });
  }

  upsertAnswer(testSessionId: string, snapshotId: string, data: AnswerWrite): Promise<TestAnswer> {
    return this.prisma.testAnswer.upsert({
      where: { testSessionId_snapshotId: { testSessionId, snapshotId } },
      update: {
        selectedOptionIds: data.selectedOptionIds,
        answerPayload: data.answerPayload,
        timeMs: data.timeMs,
        answeredAt: new Date(),
      },
      create: {
        testSessionId,
        snapshotId,
        selectedOptionIds: data.selectedOptionIds,
        answerPayload: data.answerPayload,
        timeMs: data.timeMs,
      },
    });
  }

  findAnswers(testSessionId: string): Promise<TestAnswer[]> {
    return this.prisma.testAnswer.findMany({ where: { testSessionId } });
  }

  countAnswered(testSessionId: string): Promise<number> {
    return this.prisma.testAnswer.count({ where: { testSessionId } });
  }

  async applyAnswerScores(
    scores: { testSessionId: string; snapshotId: string; isCorrect: boolean; marksAwarded: number }[],
  ): Promise<void> {
    if (scores.length === 0) {
      return;
    }
    await this.prisma.$transaction(
      scores.map((s) =>
        this.prisma.testAnswer.update({
          where: { testSessionId_snapshotId: { testSessionId: s.testSessionId, snapshotId: s.snapshotId } },
          data: { isCorrect: s.isCorrect, marksAwarded: s.marksAwarded },
        }),
      ),
    );
  }

  upsertResult(data: {
    testSessionId: string;
    score: number;
    maxScore: number;
    accuracy: number;
    correctCount: number;
    wrongCount: number;
    skippedCount: number;
    timeTakenMs: number | null;
  }): Promise<Result> {
    return this.prisma.result.upsert({
      where: { testSessionId: data.testSessionId },
      update: data,
      create: data,
    });
  }

  findResult(testSessionId: string): Promise<Result | null> {
    return this.prisma.result.findUnique({ where: { testSessionId } });
  }

  async cohortScores(mockTestId: string): Promise<number[]> {
    const rows = await this.prisma.result.findMany({
      where: { testSession: { mockTestId } },
      select: { score: true },
    });
    return rows.map((r) => r.score);
  }

  findQuestionsForSnapshot(ids: string[]): Promise<SnapshotSourceRow[]> {
    return this.prisma.question.findMany({
      where: { id: { in: ids }, status: 'PUBLISHED', deletedAt: null, currentVersionId: { not: null } },
      select: {
        id: true,
        questionType: true,
        currentVersion: {
          include: {
            options: { orderBy: { displayOrder: 'asc' } },
            media: { orderBy: { displayOrder: 'asc' } },
          },
        },
      },
    });
  }

  getBlueprintItems(blueprintId: string): Promise<
    { label: string; knowledgeNodeId: string | null; weightPercent: number; difficultyMix: Prisma.JsonValue }[]
  > {
    return this.prisma.examBlueprintItem.findMany({
      where: { blueprintId },
      select: { label: true, knowledgeNodeId: true, weightPercent: true, difficultyMix: true },
      orderBy: { weightPercent: 'desc' },
    });
  }

  async findPublishedCandidates(filter: PoolFilter, cap: number): Promise<string[]> {
    const where: Prisma.QuestionWhereInput = {
      deletedAt: null,
      status: 'PUBLISHED',
      currentVersionId: { not: null },
      ...(filter.difficulty ? { authorDifficulty: filter.difficulty } : {}),
      ...(filter.knowledgeNodeIds?.length
        ? { knowledgeMappings: { some: { knowledgeNodeId: { in: filter.knowledgeNodeIds } } } }
        : {}),
      ...(filter.examProfileId ? { examMappings: { some: { examProfileId: filter.examProfileId } } } : {}),
    };
    const rows = await this.prisma.question.findMany({
      where,
      select: { id: true },
      take: cap,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => r.id);
  }
}
