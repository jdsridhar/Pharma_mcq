import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, type Curriculum } from '@prisma/client';
import type { TenantScopeService } from '../../common/tenancy/tenant-scope.service';
import type { AuthenticatedUser } from '../identity/types/auth.types';
import { CurriculumService } from './curriculum.service';
import type { CurriculumRepository } from './repositories/curriculum.repository';

const NOW = new Date('2026-01-01T00:00:00.000Z');

const actor: AuthenticatedUser = {
  id: 'u1',
  email: 'admin@b.com',
  organizationId: null,
  roles: ['Super Admin'],
  permissions: [],
};

function curriculum(overrides: Partial<Curriculum> = {}): Curriculum {
  return {
    id: 'c1',
    code: 'GPAT',
    name: 'GPAT Syllabus',
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
    createCurriculum: jest.fn(),
    findCurriculumById: jest.fn(),
    listCurriculums: jest.fn(),
    updateCurriculum: jest.fn(),
    softDeleteCurriculum: jest.fn(),
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

describe('CurriculumService', () => {
  let repo: ReturnType<typeof makeRepoMock>;
  let tenant: ReturnType<typeof makeTenantMock>;
  let service: CurriculumService;

  beforeEach(() => {
    repo = makeRepoMock();
    tenant = makeTenantMock();
    service = new CurriculumService(
      repo as unknown as CurriculumRepository,
      tenant as unknown as TenantScopeService,
    );
  });

  it('creates and maps a curriculum to a DTO', async () => {
    repo.createCurriculum.mockResolvedValue(curriculum());
    const dto = await service.create({ code: 'GPAT', name: 'GPAT Syllabus', status: 'DRAFT' }, actor);
    expect(dto).toMatchObject({ code: 'GPAT', status: 'DRAFT', description: null });
    expect(dto.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('maps a duplicate code to 409', async () => {
    repo.createCurriculum.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
    );
    await expect(
      service.create({ code: 'GPAT', name: 'GPAT Syllabus', status: 'DRAFT' }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws 404 for a missing curriculum', async () => {
    repo.findCurriculumById.mockResolvedValue(null);
    await expect(
      service.get('00000000-0000-0000-0000-0000000000ff', actor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
