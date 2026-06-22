import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AnswerSpec,
  type ListPracticeSessionsQuery,
  type Paginated,
  type PracticeAnswerResultDto,
  type PracticeAvailableDto,
  type PracticeAvailableQuery,
  type PracticeQuestionDto,
  type PracticeSessionDetailDto,
  type PracticeSessionDto,
  type PracticeSummaryDto,
  type StartPracticeSessionInput,
  type SubmitPracticeAnswerInput,
  PRACTICE_MAX_QUESTIONS,
  buildPaginationMeta,
  toSkipTake,
} from '@pharmacy/contracts';
import { type PracticeSession, Prisma, type SessionStatus } from '@prisma/client';
import { evaluateAnswer } from '../../common/evaluation/answer-evaluator';
import { PracticeAnalyticsProducer } from './analytics/practice-analytics.producer';
import { PracticeRepository, type ServedVersionRow } from './repositories/practice.repository';

const POOL_CAP = 500;

@Injectable()
export class PracticeService {
  constructor(
    private readonly repo: PracticeRepository,
    private readonly analytics: PracticeAnalyticsProducer,
  ) {}

  async start(
    userId: string,
    organizationId: string | null,
    input: StartPracticeSessionInput,
  ): Promise<PracticeSessionDetailDto> {
    const candidates = await this.repo.findPublishedCandidates(
      {
        knowledgeNodeIds: input.knowledgeNodeIds,
        examProfileId: input.examProfileId,
        trackModuleId: input.trackModuleId,
        curriculumNodeId: input.curriculumNodeId,
        tagIds: input.tagIds,
        difficulty: input.difficulty,
      },
      POOL_CAP,
      organizationId,
    );
    if (candidates.length === 0) {
      throw new BadRequestException('No published questions match the selected filters');
    }

    const chosen = this.shuffle(candidates).slice(0, input.count);
    const sessionId = await this.repo.createSession({
      userId,
      organizationId,
      config: input as unknown as Prisma.InputJsonValue,
      questions: chosen.map((c) => ({ questionId: c.id, servedVersionId: c.currentVersionId })),
    });
    return this.getDetail(sessionId, userId);
  }

  async get(sessionId: string, userId: string): Promise<PracticeSessionDetailDto> {
    return this.getDetail(sessionId, userId);
  }

  /** How many published questions match the filters — drives the "Questions" count field. */
  async available(
    organizationId: string | null,
    query: PracticeAvailableQuery,
  ): Promise<PracticeAvailableDto> {
    const total = await this.repo.countPublishedCandidates(
      {
        knowledgeNodeIds: query.knowledgeNodeId ? [query.knowledgeNodeId] : undefined,
        examProfileId: query.examProfileId,
        trackModuleId: query.trackModuleId,
        curriculumNodeId: query.curriculumNodeId,
        difficulty: query.difficulty,
      },
      organizationId,
    );
    // A single session draws from at most POOL_CAP candidates, so it can never exceed that.
    return { available: Math.min(total, POOL_CAP), max: PRACTICE_MAX_QUESTIONS };
  }

  async list(
    userId: string,
    query: ListPracticeSessionsQuery,
  ): Promise<Paginated<PracticeSessionDto>> {
    const { skip, take } = toSkipTake(query);
    const { items, total } = await this.repo.listSessions(
      userId,
      query.status as SessionStatus | undefined,
      skip,
      take,
    );
    return {
      items: items.map((s) => this.toSessionDto(s, s._count.questions, s._count.answers)),
      meta: buildPaginationMeta(total, query),
    };
  }

  async submitAnswer(
    sessionId: string,
    userId: string,
    input: SubmitPracticeAnswerInput,
  ): Promise<PracticeAnswerResultDto> {
    const session = await this.requireOwnSession(sessionId, userId);
    if (session.status !== 'IN_PROGRESS') {
      throw new ConflictException('Practice session is not in progress');
    }

    const sessionQuestion = await this.repo.findSessionQuestionById(input.sessionQuestionId);
    if (!sessionQuestion || sessionQuestion.sessionId !== sessionId) {
      throw new NotFoundException('Session question not found');
    }
    if (!sessionQuestion.servedVersionId) {
      throw new ConflictException('Served version missing for this question');
    }
    const version = await this.repo.findServedVersionById(sessionQuestion.servedVersionId);
    if (!version) {
      throw new NotFoundException('Served question version not found');
    }

    const evaluation = evaluateAnswer(
      {
        questionType: version.question.questionType,
        answerSpec: version.answerSpec as unknown as AnswerSpec,
        options: version.options.map((o) => ({ id: o.id, isCorrect: o.isCorrect })),
      },
      {
        selectedOptionIds: input.selectedOptionIds,
        booleanAnswer: input.booleanAnswer,
        numericAnswer: input.numericAnswer,
        matchingAnswer: input.matchingAnswer,
      },
    );

    await this.repo.upsertAnswer(sessionId, sessionQuestion.questionId, {
      selectedOptionIds: input.selectedOptionIds as Prisma.InputJsonValue | undefined,
      answerPayload: this.buildAnswerPayload(input),
      isCorrect: evaluation.isCorrect,
      timeMs: input.timeMs,
    });

    // Best-effort async analytics (metrics + event); never blocks the answer.
    await this.analytics.recordAnswer({
      userId,
      organizationId: session.organizationId,
      questionId: sessionQuestion.questionId,
      isCorrect: evaluation.isCorrect,
      timeMs: input.timeMs ?? null,
    });

    return {
      sessionQuestionId: sessionQuestion.id,
      questionId: sessionQuestion.questionId,
      isCorrect: evaluation.isCorrect,
      correctOptionIds: evaluation.correctOptionIds,
      explanation: version.explanation ?? null,
      answeredAt: new Date().toISOString(),
    };
  }

  async complete(sessionId: string, userId: string): Promise<PracticeSummaryDto> {
    const session = await this.requireOwnSession(sessionId, userId);
    if (session.status === 'IN_PROGRESS') {
      await this.repo.updateSessionStatus(sessionId, 'COMPLETED', new Date());
    }
    return this.summary(sessionId, userId);
  }

  async abandon(sessionId: string, userId: string): Promise<PracticeSessionDto> {
    const session = await this.requireOwnSession(sessionId, userId);
    if (session.status === 'IN_PROGRESS') {
      await this.repo.updateSessionStatus(sessionId, 'ABANDONED', null);
    }
    const updated = (await this.repo.findSessionById(sessionId)) as PracticeSession;
    const questions = await this.repo.findSessionQuestions(sessionId);
    const answered = await this.repo.countAnswered(sessionId);
    return this.toSessionDto(updated, questions.length, answered);
  }

  async summary(sessionId: string, userId: string): Promise<PracticeSummaryDto> {
    await this.requireOwnSession(sessionId, userId);
    const questions = await this.repo.findSessionQuestions(sessionId);
    const answers = await this.repo.findAnswers(sessionId);

    const answered = answers.length;
    const correct = answers.filter((a) => a.isCorrect === true).length;
    const times = answers.map((a) => a.timeMs).filter((t): t is number => t !== null);
    const avgTimeMs = times.length > 0 ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : null;

    const kmap = await this.repo.getKnowledgeMapForQuestions(answers.map((a) => a.questionId));
    const answerByQuestion = new Map(answers.map((a) => [a.questionId, a]));
    const agg = new Map<string, { total: number; correct: number }>();
    for (const [questionId, nodeIds] of kmap.entries()) {
      const answer = answerByQuestion.get(questionId);
      for (const nodeId of nodeIds) {
        const entry = agg.get(nodeId) ?? { total: 0, correct: 0 };
        entry.total += 1;
        if (answer?.isCorrect) {
          entry.correct += 1;
        }
        agg.set(nodeId, entry);
      }
    }

    return {
      sessionId,
      total: questions.length,
      answered,
      correct,
      incorrect: answered - correct,
      accuracy: answered > 0 ? correct / answered : 0,
      avgTimeMs,
      byKnowledgeNode: [...agg.entries()].map(([knowledgeNodeId, v]) => ({
        knowledgeNodeId,
        total: v.total,
        correct: v.correct,
        accuracy: v.total > 0 ? v.correct / v.total : 0,
      })),
    };
  }

  // ── internals ────────────────────────────────────────────────────────────────

  private async getDetail(sessionId: string, userId: string): Promise<PracticeSessionDetailDto> {
    const session = await this.requireOwnSession(sessionId, userId);
    const questions = await this.repo.findSessionQuestions(sessionId);
    const versionIds = questions.flatMap((q) => (q.servedVersionId ? [q.servedVersionId] : []));
    const versions = await this.repo.findServedVersions(versionIds);
    const byVersion = new Map(versions.map((v) => [v.id, v]));
    const answered = await this.repo.countAnswered(sessionId);

    const served = questions.flatMap((q) => {
      const version = q.servedVersionId ? byVersion.get(q.servedVersionId) : undefined;
      return version ? [this.buildServedQuestion(q.id, q.questionId, q.displayOrder, version)] : [];
    });

    return { ...this.toSessionDto(session, questions.length, answered), questions: served };
  }

  private buildServedQuestion(
    sessionQuestionId: string,
    questionId: string,
    displayOrder: number,
    version: ServedVersionRow,
  ): PracticeQuestionDto {
    const dto: PracticeQuestionDto = {
      sessionQuestionId,
      questionId,
      displayOrder,
      questionType: version.question.questionType,
      questionText: version.questionText,
      options: version.options.map((o) => ({
        id: o.id,
        optionText: o.optionText,
        displayOrder: o.displayOrder,
      })),
      media: version.media.map((m) => ({
        id: m.id,
        mediaType: m.mediaType,
        url: m.url,
        altText: m.altText ?? null,
        displayOrder: m.displayOrder,
      })),
    };

    if (version.question.questionType === 'MATCHING') {
      const spec = version.answerSpec as unknown as AnswerSpec;
      if (spec.type === 'MATCHING') {
        dto.matchingPrompt = {
          lefts: spec.pairs.map((p) => p.left),
          rights: this.shuffle(spec.pairs.map((p) => p.right)),
        };
      }
    }
    return dto;
  }

  private buildAnswerPayload(input: SubmitPracticeAnswerInput): Prisma.InputJsonValue | undefined {
    const payload: Record<string, unknown> = {};
    if (input.booleanAnswer !== undefined) {
      payload.booleanAnswer = input.booleanAnswer;
    }
    if (input.numericAnswer !== undefined) {
      payload.numericAnswer = input.numericAnswer;
    }
    if (input.matchingAnswer !== undefined) {
      payload.matchingAnswer = input.matchingAnswer;
    }
    return Object.keys(payload).length > 0 ? (payload as Prisma.InputJsonValue) : undefined;
  }

  private async requireOwnSession(sessionId: string, userId: string): Promise<PracticeSession> {
    const session = await this.repo.findSessionById(sessionId);
    if (!session) {
      throw new NotFoundException(`Practice session ${sessionId} not found`);
    }
    if (session.userId !== userId) {
      throw new ForbiddenException('Not your practice session');
    }
    return session;
  }

  private toSessionDto(
    session: PracticeSession,
    totalQuestions: number,
    answeredCount: number,
  ): PracticeSessionDto {
    return {
      id: session.id,
      status: session.status,
      startedAt: session.startedAt.toISOString(),
      completedAt: session.completedAt?.toISOString() ?? null,
      totalQuestions,
      answeredCount,
    };
  }

  private shuffle<T>(items: T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
    }
    return copy;
  }
}
