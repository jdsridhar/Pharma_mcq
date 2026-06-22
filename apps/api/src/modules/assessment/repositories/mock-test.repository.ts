import { Injectable } from '@nestjs/common';
import {
  type ContentStatus,
  type MockTest,
  type MockTestMode,
  type MockTestQuestion,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';

const detailInclude = Prisma.validator<Prisma.MockTestInclude>()({
  questions: { orderBy: { displayOrder: 'asc' } },
});
export type MockTestWithQuestions = Prisma.MockTestGetPayload<{ include: typeof detailInclude }>;

export interface CreateMockTestData {
  code: string;
  title: string;
  description?: string;
  mode: MockTestMode;
  durationMinutes: number;
  totalQuestions: number;
  status: ContentStatus;
  examProfileId?: string;
  blueprintId?: string;
  opensAt?: Date;
  closesAt?: Date;
  createdById?: string;
  /** Tenant owner. null = platform-shared; set = private to an institution. */
  organizationId?: string | null;
}

@Injectable()
export class MockTestRepository {
  constructor(private readonly prisma: PrismaService) {}

  createMockTest(data: CreateMockTestData): Promise<MockTest> {
    return this.prisma.mockTest.create({
      data: {
        code: data.code,
        title: data.title,
        description: data.description,
        mode: data.mode,
        durationMinutes: data.durationMinutes,
        totalQuestions: data.totalQuestions,
        status: data.status,
        createdById: data.createdById,
        organizationId: data.organizationId ?? null,
        opensAt: data.opensAt,
        closesAt: data.closesAt,
        ...(data.examProfileId ? { examProfile: { connect: { id: data.examProfileId } } } : {}),
        ...(data.blueprintId ? { blueprint: { connect: { id: data.blueprintId } } } : {}),
      },
    });
  }

  findMockTestById(id: string): Promise<MockTest | null> {
    return this.prisma.mockTest.findUnique({ where: { id } });
  }

  findMockTestDetail(id: string): Promise<MockTestWithQuestions | null> {
    return this.prisma.mockTest.findUnique({ where: { id }, include: detailInclude });
  }

  async listMockTests(
    filter: { status?: ContentStatus; mode?: MockTestMode; examProfileId?: string; search?: string },
    skip: number,
    take: number,
    viewerOrg?: string | null,
  ): Promise<{ items: MockTest[]; total: number }> {
    const and: Prisma.MockTestWhereInput[] = [];
    // Inclusive read scope: viewers see platform-shared (null) + their own org. `undefined` = all
    // (Super Admin). (A 4th arg of `undefined` skips the filter entirely.)
    if (viewerOrg !== undefined) {
      and.push({ OR: [{ organizationId: null }, { organizationId: viewerOrg }] });
    }
    if (filter.search) {
      and.push({
        OR: [
          { title: { contains: filter.search, mode: 'insensitive' } },
          { code: { contains: filter.search, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.MockTestWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.mode ? { mode: filter.mode } : {}),
      ...(filter.examProfileId ? { examProfileId: filter.examProfileId } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.mockTest.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.mockTest.count({ where }),
    ]);
    return { items, total };
  }

  updateMockTest(id: string, data: Prisma.MockTestUpdateInput): Promise<MockTest> {
    return this.prisma.mockTest.update({ where: { id }, data });
  }

  getMockTestQuestions(mockTestId: string): Promise<MockTestQuestion[]> {
    return this.prisma.mockTestQuestion.findMany({
      where: { mockTestId },
      orderBy: { displayOrder: 'asc' },
    });
  }

  async setQuestions(
    mockTestId: string,
    items: { questionId: string; marks: number; negativeMarks: number }[],
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.mockTestQuestion.deleteMany({ where: { mockTestId } }),
      this.prisma.mockTestQuestion.createMany({
        data: items.map((it, index) => ({
          mockTestId,
          questionId: it.questionId,
          marks: it.marks,
          negativeMarks: it.negativeMarks,
          displayOrder: index,
        })),
        skipDuplicates: true,
      }),
      // A FIXED mock's question count IS its attached set — keep them in lockstep atomically.
      this.prisma.mockTest.update({ where: { id: mockTestId }, data: { totalQuestions: items.length } }),
    ]);
  }

  async findPublishedQuestionIds(ids: string[]): Promise<Set<string>> {
    const rows = await this.prisma.question.findMany({
      where: { id: { in: ids }, status: 'PUBLISHED', deletedAt: null, currentVersionId: { not: null } },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }
}
