import { BadRequestException } from '@nestjs/common';
import type { MockTest } from '@prisma/client';
import type { TenantScopeService } from '../../common/tenancy/tenant-scope.service';
import type { AuthenticatedUser } from '../identity/types/auth.types';
import { MockTestService } from './mock-test.service';
import type { MockTestRepository, MockTestWithQuestions } from './repositories/mock-test.repository';

const NOW = new Date('2026-01-01T00:00:00.000Z');

const actor: AuthenticatedUser = {
  id: 'u1',
  email: 'admin@b.com',
  organizationId: null,
  roles: ['Super Admin'],
  permissions: [],
};

function mock(overrides: Partial<MockTest> = {}): MockTest {
  return {
    id: 'mt1',
    code: 'MT-01',
    title: 'Mock 1',
    description: null,
    mode: 'FIXED',
    durationMinutes: 60,
    totalQuestions: 0,
    examProfileId: null,
    blueprintId: null,
    opensAt: null,
    closesAt: null,
    status: 'DRAFT',
    organizationId: null,
    createdById: 'u1',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as MockTest;
}

function makeRepoMock() {
  return {
    findMockTestById: jest.fn(),
    findMockTestDetail: jest.fn(),
    updateMockTest: jest.fn().mockResolvedValue(mock()),
    setQuestions: jest.fn().mockResolvedValue(undefined),
    findPublishedQuestionIds: jest.fn(),
  };
}

function makeTenantMock() {
  return {
    ownerOrgFor: jest.fn().mockResolvedValue(null),
    isSuper: jest.fn().mockReturnValue(true),
    canRead: jest.fn().mockReturnValue(true),
    canManage: jest.fn().mockResolvedValue(true),
  };
}

describe('MockTestService', () => {
  let repo: ReturnType<typeof makeRepoMock>;
  let tenant: ReturnType<typeof makeTenantMock>;
  let service: MockTestService;

  beforeEach(() => {
    repo = makeRepoMock();
    tenant = makeTenantMock();
    service = new MockTestService(
      repo as unknown as MockTestRepository,
      tenant as unknown as TenantScopeService,
    );
  });

  const detail = (m: MockTest): MockTestWithQuestions => ({ ...m, questions: [] }) as MockTestWithQuestions;

  it('rejects setQuestions on a BLUEPRINT mock (hand-picked list is FIXED-only)', async () => {
    repo.findMockTestById.mockResolvedValue(mock({ mode: 'BLUEPRINT', blueprintId: 'bp1' }));
    await expect(
      service.setQuestions('mt1', { items: [{ questionId: 'q1', marks: 1, negativeMarks: 0 }] }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.setQuestions).not.toHaveBeenCalled();
  });

  it('derives the count from the attached set (FIXED): setQuestions persists items.length', async () => {
    repo.findMockTestById.mockResolvedValue(mock({ mode: 'FIXED' }));
    repo.findPublishedQuestionIds.mockResolvedValue(new Set(['q1', 'q2']));
    repo.findMockTestDetail.mockResolvedValue(detail(mock({ totalQuestions: 2 })));
    await service.setQuestions(
      'mt1',
      { items: [{ questionId: 'q1', marks: 1, negativeMarks: 0 }, { questionId: 'q2', marks: 1, negativeMarks: 0 }] },
      actor,
    );
    // The repo persists the attached set; totalQuestions is derived from it inside setQuestions.
    expect(repo.setQuestions).toHaveBeenCalledWith('mt1', [
      { questionId: 'q1', marks: 1, negativeMarks: 0 },
      { questionId: 'q2', marks: 1, negativeMarks: 0 },
    ]);
  });

  it('blocks publishing a FIXED mock with no attached questions (400)', async () => {
    repo.findMockTestById.mockResolvedValue(mock({ mode: 'FIXED', totalQuestions: 0 }));
    await expect(service.update('mt1', { status: 'PUBLISHED' }, actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.updateMockTest).not.toHaveBeenCalled();
  });

  it('allows publishing a FIXED mock once questions are attached', async () => {
    repo.findMockTestById.mockResolvedValue(mock({ mode: 'FIXED', totalQuestions: 3 }));
    repo.findMockTestDetail.mockResolvedValue(detail(mock({ totalQuestions: 3, status: 'PUBLISHED' })));
    await service.update('mt1', { status: 'PUBLISHED' }, actor);
    expect(repo.updateMockTest).toHaveBeenCalledWith('mt1', expect.objectContaining({ status: 'PUBLISHED' }));
  });

  it('ignores manual totalQuestions edits on a FIXED mock (count is derived)', async () => {
    repo.findMockTestById.mockResolvedValue(mock({ mode: 'FIXED', totalQuestions: 3 }));
    repo.findMockTestDetail.mockResolvedValue(detail(mock({ totalQuestions: 3 })));
    await service.update('mt1', { totalQuestions: 99 }, actor);
    const data = repo.updateMockTest.mock.calls[0]?.[1] ?? {};
    expect(data).not.toHaveProperty('totalQuestions');
  });
});
