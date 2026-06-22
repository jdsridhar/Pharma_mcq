import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AssessmentQuestionDto,
  type AssessmentSnapshot,
  type ListTestSessionsQuery,
  type Paginated,
  type StartAdHocTestInput,
  type SubmitTestAnswerInput,
  type TestResultDto,
  type TestSessionDetailDto,
  type TestSessionDto,
  buildPaginationMeta,
  toSkipTake,
} from '@pharmacy/contracts';
import {
  type DifficultyLevel,
  Prisma,
  type SessionStatus,
  type TestAnswer,
  type TestQuestionSnapshot,
  type TestSession,
} from '@prisma/client';
import { type StudentAnswerInput } from '../../common/evaluation/answer-evaluator';
import { splitByRatio, targetCountsFromWeights } from '../exam/blueprint-plan.util';
import { MockTestRepository } from './repositories/mock-test.repository';
import {
  type PoolFilter,
  type SnapshotSeed,
  type SnapshotSourceRow,
  TestSessionRepository,
} from './repositories/test-session.repository';
import { computeRank, scoreAttempt, type ScorableItem } from './scoring/score-attempt';

const POOL_CAP = 1000;

interface Selection {
  questionId: string;
  marks: number;
  negativeMarks: number;
}

@Injectable()
export class TestSessionService {
  constructor(
    private readonly mockTests: MockTestRepository,
    private readonly repo: TestSessionRepository,
  ) {}

  async startForMockTest(
    mockTestId: string,
    userId: string,
    organizationId: string | null,
  ): Promise<TestSessionDetailDto> {
    const mockTest = await this.mockTests.findMockTestById(mockTestId);
    if (!mockTest) {
      throw new NotFoundException(`Mock test ${mockTestId} not found`);
    }
    // Tenant read scope: a mock test is startable only if it is platform-shared (organizationId
    // null) or owned by the viewer's own organization. Cross-org → 404 (don't leak existence).
    if (mockTest.organizationId !== null && mockTest.organizationId !== organizationId) {
      throw new NotFoundException(`Mock test ${mockTestId} not found`);
    }
    if (mockTest.status !== 'PUBLISHED') {
      throw new ConflictException('Mock test is not published');
    }
    const now = new Date();
    if (mockTest.opensAt && now < mockTest.opensAt) {
      throw new BadRequestException('Mock test is not open yet');
    }
    if (mockTest.closesAt && now > mockTest.closesAt) {
      throw new BadRequestException('Mock test is closed');
    }

    let selection: Selection[];
    if (mockTest.mode === 'FIXED') {
      const mtqs = await this.mockTests.getMockTestQuestions(mockTestId);
      selection = mtqs.map((q) => ({ questionId: q.questionId, marks: q.marks, negativeMarks: q.negativeMarks }));
    } else {
      selection = await this.generateFromBlueprint(mockTest.blueprintId, mockTest.examProfileId, mockTest.totalQuestions);
    }

    const snapshots = await this.buildSnapshotSeeds(selection);
    if (snapshots.length === 0) {
      throw new BadRequestException('No published questions are available for this mock test');
    }

    const expiresAt = new Date(now.getTime() + mockTest.durationMinutes * 60_000);
    const sessionId = await this.repo.createSessionWithSnapshots({
      userId,
      organizationId,
      mockTestId,
      expiresAt,
      snapshots,
    });
    return this.getDetail(sessionId, userId);
  }

  async startAdHoc(
    userId: string,
    organizationId: string | null,
    input: StartAdHocTestInput,
  ): Promise<TestSessionDetailDto> {
    const candidates = await this.repo.findPublishedCandidates(
      {
        knowledgeNodeIds: input.knowledgeNodeIds,
        examProfileId: input.examProfileId,
        difficulty: input.difficulty as DifficultyLevel | undefined,
      },
      POOL_CAP,
    );
    if (candidates.length === 0) {
      throw new BadRequestException('No published questions match the selected filters');
    }
    const selection: Selection[] = this.shuffle(candidates)
      .slice(0, input.count)
      .map((questionId) => ({ questionId, marks: 1, negativeMarks: 0 }));

    const snapshots = await this.buildSnapshotSeeds(selection);
    const expiresAt = new Date(Date.now() + input.durationMinutes * 60_000);
    const sessionId = await this.repo.createSessionWithSnapshots({
      userId,
      organizationId,
      expiresAt,
      snapshots,
    });
    return this.getDetail(sessionId, userId);
  }

  async get(sessionId: string, userId: string): Promise<TestSessionDetailDto> {
    return this.getDetail(sessionId, userId);
  }

  async list(userId: string, query: ListTestSessionsQuery): Promise<Paginated<TestSessionDto>> {
    const { skip, take } = toSkipTake(query);
    const { items, total } = await this.repo.listSessions(
      userId,
      query.status as SessionStatus | undefined,
      skip,
      take,
    );
    return {
      items: items.map((s) => this.toSessionDto(s, s._count.snapshots, s._count.answers)),
      meta: buildPaginationMeta(total, query),
    };
  }

  async submitAnswer(
    sessionId: string,
    userId: string,
    input: SubmitTestAnswerInput,
  ): Promise<{ snapshotId: string; saved: true }> {
    const session = await this.requireOwnSession(sessionId, userId);
    this.assertActive(session);

    const snapshot = await this.repo.findSnapshotById(input.snapshotId);
    if (!snapshot || snapshot.testSessionId !== sessionId) {
      throw new NotFoundException('Snapshot not found in this session');
    }

    await this.repo.upsertAnswer(sessionId, input.snapshotId, {
      selectedOptionIds: input.selectedOptionIds as Prisma.InputJsonValue | undefined,
      answerPayload: this.buildAnswerPayload(input),
      timeMs: input.timeMs,
    });
    return { snapshotId: input.snapshotId, saved: true };
  }

  async submit(sessionId: string, userId: string): Promise<TestResultDto> {
    const session = await this.requireOwnSession(sessionId, userId);
    if (session.status === 'COMPLETED' || session.status === 'EXPIRED') {
      return this.getResult(sessionId, userId);
    }

    const snapshots = await this.repo.findSnapshots(sessionId);
    const answers = await this.repo.findAnswers(sessionId);
    const answerBySnapshot = new Map(answers.map((a) => [a.snapshotId, a]));

    const items: ScorableItem[] = snapshots.map((s) => this.toScorableItem(s, answerBySnapshot.get(s.id)));
    const score = scoreAttempt(items);

    const now = new Date();
    const status: SessionStatus =
      session.expiresAt && now > session.expiresAt ? 'EXPIRED' : 'COMPLETED';
    const timeTakenMs = now.getTime() - session.startedAt.getTime();

    await this.repo.updateSessionStatus(sessionId, status, now);
    await this.repo.applyAnswerScores(
      score.items
        .filter((it) => it.answered)
        .map((it) => ({
          testSessionId: sessionId,
          snapshotId: it.snapshotId,
          isCorrect: it.isCorrect,
          marksAwarded: it.marksAwarded,
        })),
    );
    await this.repo.upsertResult({
      testSessionId: sessionId,
      score: score.score,
      maxScore: score.maxScore,
      accuracy: score.accuracy,
      correctCount: score.correctCount,
      wrongCount: score.wrongCount,
      skippedCount: score.skippedCount,
      timeTakenMs,
    });

    return this.getResult(sessionId, userId);
  }

  async getResult(sessionId: string, userId: string): Promise<TestResultDto> {
    const session = await this.requireOwnSession(sessionId, userId);
    const result = await this.repo.findResult(sessionId);
    if (!result) {
      throw new NotFoundException('This session has not been submitted yet');
    }

    let rank: number | null = null;
    let percentile: number | null = null;
    let cohortSize: number | null = null;
    if (session.mockTestId) {
      const scores = await this.repo.cohortScores(session.mockTestId);
      const stats = computeRank(scores, result.score);
      rank = stats.rank;
      percentile = stats.percentile;
      cohortSize = stats.cohortSize;
    }

    return {
      sessionId,
      score: result.score,
      maxScore: result.maxScore,
      accuracy: result.accuracy,
      correctCount: result.correctCount,
      wrongCount: result.wrongCount,
      skippedCount: result.skippedCount,
      timeTakenMs: result.timeTakenMs ?? null,
      rank,
      percentile,
      cohortSize,
    };
  }

  // ── internals ────────────────────────────────────────────────────────────────

  /**
   * Assemble a blueprint exam (weight-driven). Per-item question counts are *derived* from each
   * item's `weightPercent` so they reconcile with the blueprint total; each item's slice honours its
   * `difficultyMix`; and any shortfall (weights summing < 100%, or a thin section pool) is topped up
   * from the broader exam pool so the student always gets a full-length paper. Author-facing warnings
   * about an under-supplied blueprint live in the dedicated `plan` endpoint, not the student flow.
   */
  private async generateFromBlueprint(
    blueprintId: string | null,
    examProfileId: string | null,
    totalQuestions: number,
  ): Promise<Selection[]> {
    if (!blueprintId) {
      throw new ConflictException('Blueprint mock test has no blueprint');
    }
    const items = await this.repo.getBlueprintItems(blueprintId);
    const targets = targetCountsFromWeights(
      items.map((i) => i.weightPercent),
      totalQuestions,
    );
    const picked = new Map<string, Selection>();

    for (let i = 0; i < items.length; i += 1) {
      await this.drawForSection(items[i]!, examProfileId, targets[i] ?? 0, picked);
    }
    if (picked.size < totalQuestions) {
      await this.drawInto(picked, totalQuestions - picked.size, { examProfileId: examProfileId ?? undefined });
    }
    return [...picked.values()].slice(0, totalQuestions);
  }

  /** Draw one blueprint section, splitting by difficulty mix when set; backfills any shortfall. */
  private async drawForSection(
    item: { knowledgeNodeId: string | null; difficultyMix: Prisma.JsonValue },
    examProfileId: string | null,
    target: number,
    picked: Map<string, Selection>,
  ): Promise<void> {
    if (target <= 0) {
      return;
    }
    const base: PoolFilter = {
      knowledgeNodeIds: item.knowledgeNodeId ? [item.knowledgeNodeId] : undefined,
      examProfileId: examProfileId ?? undefined,
    };
    let added = 0;
    const mix = this.parseDifficultyMix(item.difficultyMix);
    if (mix) {
      const [easy, medium, hard] = splitByRatio(target, mix);
      const byLevel: [DifficultyLevel, number][] = [
        ['EASY', easy],
        ['MEDIUM', medium],
        ['HARD', hard],
      ];
      for (const [difficulty, n] of byLevel) {
        added += await this.drawInto(picked, n, { ...base, difficulty });
      }
    }
    // No mix, or a mix level ran short of supply → backfill from the section's whole pool.
    if (added < target) {
      await this.drawInto(picked, target - added, base);
    }
  }

  /** Add up to `need` new (de-duplicated) questions matching `filter` into `picked`; returns count added. */
  private async drawInto(picked: Map<string, Selection>, need: number, filter: PoolFilter): Promise<number> {
    if (need <= 0) {
      return 0;
    }
    const candidates = await this.repo.findPublishedCandidates(filter, POOL_CAP);
    let added = 0;
    for (const questionId of this.shuffle(candidates)) {
      if (added >= need) {
        break;
      }
      if (!picked.has(questionId)) {
        picked.set(questionId, { questionId, marks: 1, negativeMarks: 0 });
        added += 1;
      }
    }
    return added;
  }

  /** Coerce the stored `difficultyMix` JSON to an [EASY, MEDIUM, HARD] tuple, or null if absent/empty. */
  private parseDifficultyMix(raw: Prisma.JsonValue): [number, number, number] | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }
    const mix = raw as Record<string, unknown>;
    const easy = Number(mix.EASY ?? 0);
    const medium = Number(mix.MEDIUM ?? 0);
    const hard = Number(mix.HARD ?? 0);
    if (![easy, medium, hard].every((v) => Number.isFinite(v))) {
      return null;
    }
    return easy + medium + hard > 0 ? [easy, medium, hard] : null;
  }

  private async buildSnapshotSeeds(selection: Selection[]): Promise<SnapshotSeed[]> {
    const rows = await this.repo.findQuestionsForSnapshot(selection.map((s) => s.questionId));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const seeds: SnapshotSeed[] = [];
    let order = 0;
    for (const sel of selection) {
      const row = byId.get(sel.questionId);
      if (!row?.currentVersion) {
        continue;
      }
      seeds.push({
        questionId: sel.questionId,
        questionVersionId: row.currentVersion.id,
        displayOrder: order,
        snapshot: this.buildSnapshotJson(row) as unknown as Prisma.InputJsonValue,
        marks: sel.marks,
        negativeMarks: sel.negativeMarks,
      });
      order += 1;
    }
    return seeds;
  }

  private buildSnapshotJson(row: SnapshotSourceRow): AssessmentSnapshot {
    const version = row.currentVersion!;
    return {
      questionType: row.questionType,
      questionText: version.questionText,
      explanation: version.explanation ?? null,
      answerSpec: version.answerSpec as unknown as AssessmentSnapshot['answerSpec'],
      options: version.options.map((o) => ({
        id: o.id,
        optionText: o.optionText,
        isCorrect: o.isCorrect,
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
  }

  private async getDetail(sessionId: string, userId: string): Promise<TestSessionDetailDto> {
    const session = await this.requireOwnSession(sessionId, userId);
    const snapshots = await this.repo.findSnapshots(sessionId);
    const answered = await this.repo.countAnswered(sessionId);
    return {
      ...this.toSessionDto(session, snapshots.length, answered),
      questions: snapshots.map((s) => this.buildServedQuestion(s)),
    };
  }

  private buildServedQuestion(snapshotRow: TestQuestionSnapshot): AssessmentQuestionDto {
    const snap = snapshotRow.snapshot as unknown as AssessmentSnapshot;
    const dto: AssessmentQuestionDto = {
      snapshotId: snapshotRow.id,
      displayOrder: snapshotRow.displayOrder,
      questionType: snap.questionType,
      questionText: snap.questionText,
      marks: snapshotRow.marks,
      negativeMarks: snapshotRow.negativeMarks,
      options: snap.options.map((o) => ({ id: o.id, optionText: o.optionText, displayOrder: o.displayOrder })),
      media: snap.media,
    };
    if (snap.questionType === 'MATCHING' && snap.answerSpec.type === 'MATCHING') {
      dto.matchingPrompt = {
        lefts: snap.answerSpec.pairs.map((p) => p.left),
        rights: this.shuffle(snap.answerSpec.pairs.map((p) => p.right)),
      };
    }
    return dto;
  }

  private toScorableItem(snapshotRow: TestQuestionSnapshot, answer?: TestAnswer): ScorableItem {
    const snap = snapshotRow.snapshot as unknown as AssessmentSnapshot;
    return {
      snapshotId: snapshotRow.id,
      questionType: snap.questionType,
      answerSpec: snap.answerSpec,
      options: snap.options.map((o) => ({ id: o.id, isCorrect: o.isCorrect })),
      marks: snapshotRow.marks,
      negativeMarks: snapshotRow.negativeMarks,
      answer: answer ? this.toStudentAnswerInput(answer) : undefined,
    };
  }

  private toStudentAnswerInput(answer: TestAnswer): StudentAnswerInput {
    const payload = (answer.answerPayload ?? {}) as {
      booleanAnswer?: boolean;
      numericAnswer?: number;
      matchingAnswer?: { left: string; right: string }[];
    };
    return {
      selectedOptionIds: (answer.selectedOptionIds as string[] | null) ?? undefined,
      booleanAnswer: payload.booleanAnswer,
      numericAnswer: payload.numericAnswer,
      matchingAnswer: payload.matchingAnswer,
    };
  }

  private buildAnswerPayload(input: SubmitTestAnswerInput): Prisma.InputJsonValue | undefined {
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

  private assertActive(session: TestSession): void {
    if (session.status !== 'IN_PROGRESS') {
      throw new ConflictException('Test session is not in progress');
    }
    if (session.expiresAt && new Date() > session.expiresAt) {
      throw new ConflictException('Test session has expired; submit it to see your result');
    }
  }

  private async requireOwnSession(sessionId: string, userId: string): Promise<TestSession> {
    const session = await this.repo.findSessionById(sessionId);
    if (!session) {
      throw new NotFoundException(`Test session ${sessionId} not found`);
    }
    if (session.userId !== userId) {
      throw new ForbiddenException('Not your test session');
    }
    return session;
  }

  private toSessionDto(
    session: TestSession,
    totalQuestions: number,
    answeredCount: number,
  ): TestSessionDto {
    return {
      id: session.id,
      mockTestId: session.mockTestId ?? null,
      status: session.status,
      startedAt: session.startedAt.toISOString(),
      expiresAt: session.expiresAt?.toISOString() ?? null,
      submittedAt: session.submittedAt?.toISOString() ?? null,
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
