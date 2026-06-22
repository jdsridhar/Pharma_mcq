import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, type ExamProfile } from '@prisma/client';
import type { TenantScopeService } from '../../common/tenancy/tenant-scope.service';
import type { AuthenticatedUser } from '../identity/types/auth.types';
import { ExamService } from './exam.service';
import type { ExamRepository } from './repositories/exam.repository';

const NOW = new Date('2026-01-01T00:00:00.000Z');

const actor: AuthenticatedUser = {
  id: 'u1',
  email: 'admin@b.com',
  organizationId: null,
  roles: ['Super Admin'],
  permissions: [],
};

function profile(overrides: Partial<ExamProfile> = {}): ExamProfile {
  return {
    id: 'exam1',
    code: 'GPAT',
    name: 'GPAT',
    description: null,
    status: 'DRAFT',
    organizationId: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function makeRepoMock() {
  return {
    createProfile: jest.fn(),
    findProfileById: jest.fn(),
    listProfiles: jest.fn(),
    updateProfile: jest.fn(),
    softDeleteProfile: jest.fn(),
    findExistingKnowledgeNodeIds: jest.fn(),
    setProfileKnowledge: jest.fn(),
    getProfileKnowledge: jest.fn(),
  };
}

/** Tenant stub that behaves like a platform-wide Super Admin (every scope check passes). */
function makeTenantMock() {
  return {
    ownerOrgFor: jest.fn().mockResolvedValue(null),
    isSuper: jest.fn().mockReturnValue(true),
    canRead: jest.fn().mockReturnValue(true),
    canManage: jest.fn().mockResolvedValue(true),
  };
}

describe('ExamService', () => {
  let repo: ReturnType<typeof makeRepoMock>;
  let tenant: ReturnType<typeof makeTenantMock>;
  let service: ExamService;

  beforeEach(() => {
    repo = makeRepoMock();
    tenant = makeTenantMock();
    service = new ExamService(
      repo as unknown as ExamRepository,
      tenant as unknown as TenantScopeService,
    );
  });

  it('creates and maps an exam profile', async () => {
    repo.createProfile.mockResolvedValue(profile());
    const dto = await service.create({ code: 'GPAT', name: 'GPAT', status: 'DRAFT' }, actor);
    expect(dto).toMatchObject({ code: 'GPAT', status: 'DRAFT' });
  });

  it('maps a duplicate code to 409', async () => {
    repo.createProfile.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
    );
    await expect(
      service.create({ code: 'GPAT', name: 'GPAT', status: 'DRAFT' }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('404s for a missing profile', async () => {
    repo.findProfileById.mockResolvedValue(null);
    await expect(
      service.get('00000000-0000-0000-0000-0000000000ff', actor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects knowledge mapping to an unknown node (400)', async () => {
    repo.findProfileById.mockResolvedValue(profile());
    repo.findExistingKnowledgeNodeIds.mockResolvedValue(new Set<string>());
    await expect(
      service.setKnowledge(
        'exam1',
        { items: [{ knowledgeNodeId: '00000000-0000-0000-0000-0000000000aa' }] },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
