import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CreateMockTestInput,
  type ListMockTestsQuery,
  type MockTestDetailDto,
  type MockTestDto,
  type MockTestQuestionDto,
  type Paginated,
  type SetMockTestQuestionsInput,
  type UpdateMockTestInput,
  buildPaginationMeta,
  toSkipTake,
} from '@pharmacy/contracts';
import { type MockTest, Prisma } from '@prisma/client';
import { TenantScopeService } from '../../common/tenancy/tenant-scope.service';
import type { AuthenticatedUser } from '../identity/types/auth.types';
import { type MockTestWithQuestions, MockTestRepository } from './repositories/mock-test.repository';

@Injectable()
export class MockTestService {
  constructor(
    private readonly repo: MockTestRepository,
    private readonly tenant: TenantScopeService,
  ) {}

  async create(input: CreateMockTestInput, actor: AuthenticatedUser): Promise<MockTestDto> {
    try {
      const created = await this.repo.createMockTest({
        code: input.code,
        title: input.title,
        description: input.description,
        mode: input.mode,
        durationMinutes: input.durationMinutes,
        // FIXED mocks start empty (0) and derive the count from the attached set; BLUEPRINT supplies a target.
        totalQuestions: input.totalQuestions ?? 0,
        status: input.status,
        examProfileId: input.examProfileId,
        blueprintId: input.blueprintId,
        opensAt: input.opensAt ? new Date(input.opensAt) : undefined,
        closesAt: input.closesAt ? new Date(input.closesAt) : undefined,
        createdById: actor.id,
        organizationId: await this.tenant.ownerOrgFor(actor),
      });
      return this.toDto(created);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(`A mock test with code "${input.code}" already exists`);
        }
        if (error.code === 'P2025') {
          throw new BadRequestException('Referenced exam profile or blueprint does not exist');
        }
      }
      throw error;
    }
  }

  async get(id: string, actor: AuthenticatedUser): Promise<MockTestDetailDto> {
    return this.toDetailDto(await this.requireReadable(id, actor));
  }

  async list(query: ListMockTestsQuery, actor: AuthenticatedUser): Promise<Paginated<MockTestDto>> {
    const { skip, take } = toSkipTake(query);
    // Inclusive read scope: Super Admin sees all; everyone else sees platform-shared + own org.
    const viewerOrg = this.tenant.isSuper(actor) ? undefined : (actor.organizationId ?? null);
    const { items, total } = await this.repo.listMockTests(
      { status: query.status, mode: query.mode, examProfileId: query.examProfileId, search: query.search },
      skip,
      take,
      viewerOrg,
    );
    return { items: items.map((m) => this.toDto(m)), meta: buildPaginationMeta(total, query) };
  }

  async update(id: string, input: UpdateMockTestInput, actor: AuthenticatedUser): Promise<MockTestDetailDto> {
    const mockTest = await this.requireManageable(id, actor);
    // A FIXED mock must have at least one attached question before it can go live.
    if (input.status === 'PUBLISHED' && mockTest.mode === 'FIXED' && mockTest.totalQuestions < 1) {
      throw new BadRequestException('Attach at least one question before publishing this mock test');
    }
    const data: Prisma.MockTestUpdateInput = {};
    if (input.title !== undefined) {
      data.title = input.title;
    }
    if (input.description !== undefined) {
      data.description = input.description;
    }
    if (input.durationMinutes !== undefined) {
      data.durationMinutes = input.durationMinutes;
    }
    // FIXED mocks derive their count from the attached set (see setQuestions); ignore manual edits.
    if (input.totalQuestions !== undefined && mockTest.mode !== 'FIXED') {
      data.totalQuestions = input.totalQuestions;
    }
    if (input.status !== undefined) {
      data.status = input.status;
    }
    if (input.opensAt !== undefined) {
      data.opensAt = input.opensAt ? new Date(input.opensAt) : null;
    }
    if (input.closesAt !== undefined) {
      data.closesAt = input.closesAt ? new Date(input.closesAt) : null;
    }
    await this.repo.updateMockTest(id, data);
    return this.get(id, actor);
  }

  async setQuestions(
    id: string,
    input: SetMockTestQuestionsInput,
    actor: AuthenticatedUser,
  ): Promise<MockTestDetailDto> {
    const mockTest = await this.requireManageable(id, actor);
    if (mockTest.mode !== 'FIXED') {
      throw new BadRequestException(
        'Only FIXED mock tests use a hand-picked question list; BLUEPRINT mocks draw from their blueprint',
      );
    }
    const ids = input.items.map((i) => i.questionId);
    const published = await this.repo.findPublishedQuestionIds(ids);
    const invalid = ids.filter((qid) => !published.has(qid));
    if (invalid.length > 0) {
      throw new BadRequestException(`Questions not found or not published: ${invalid.join(', ')}`);
    }
    await this.repo.setQuestions(
      id,
      input.items.map((i) => ({ questionId: i.questionId, marks: i.marks, negativeMarks: i.negativeMarks })),
    );
    return this.get(id, actor);
  }

  private async requireMockTest(id: string): Promise<MockTest> {
    const mockTest = await this.repo.findMockTestById(id);
    if (!mockTest) {
      throw new NotFoundException(`Mock test ${id} not found`);
    }
    return mockTest;
  }

  private async requireDetail(id: string): Promise<MockTestWithQuestions> {
    const detail = await this.repo.findMockTestDetail(id);
    if (!detail) {
      throw new NotFoundException(`Mock test ${id} not found`);
    }
    return detail;
  }

  /** Load detail, enforcing the actor can READ it (cross-org reads 404 to avoid leaking existence). */
  private async requireReadable(id: string, actor: AuthenticatedUser): Promise<MockTestWithQuestions> {
    const detail = await this.requireDetail(id);
    if (!this.tenant.canRead(detail.organizationId, actor)) {
      throw new NotFoundException(`Mock test ${id} not found`);
    }
    return detail;
  }

  /** Load, enforcing the actor can MANAGE it: cross-org → 404; readable-but-not-owned → 403. */
  private async requireManageable(id: string, actor: AuthenticatedUser): Promise<MockTest> {
    const mockTest = await this.requireMockTest(id);
    if (!this.tenant.canRead(mockTest.organizationId, actor)) {
      throw new NotFoundException(`Mock test ${id} not found`);
    }
    if (!(await this.tenant.canManage(mockTest.organizationId, actor))) {
      throw new ForbiddenException('You cannot modify a mock test owned by another organization');
    }
    return mockTest;
  }

  private toDto(m: MockTest): MockTestDto {
    return {
      id: m.id,
      code: m.code,
      title: m.title,
      description: m.description ?? null,
      mode: m.mode,
      durationMinutes: m.durationMinutes,
      totalQuestions: m.totalQuestions,
      examProfileId: m.examProfileId ?? null,
      blueprintId: m.blueprintId ?? null,
      opensAt: m.opensAt?.toISOString() ?? null,
      closesAt: m.closesAt?.toISOString() ?? null,
      status: m.status,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    };
  }

  private toDetailDto(m: MockTestWithQuestions): MockTestDetailDto {
    const questions: MockTestQuestionDto[] = m.questions.map((q) => ({
      questionId: q.questionId,
      marks: q.marks,
      negativeMarks: q.negativeMarks,
      displayOrder: q.displayOrder,
    }));
    return { ...this.toDto(m), questions };
  }
}
