import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, type LearningTrack, type TrackModule, type TrackProgress } from '@prisma/client';
import type { TenantScopeService } from '../../common/tenancy/tenant-scope.service';
import type { AuthenticatedUser } from '../identity/types/auth.types';
import { LearningService } from './learning.service';
import type { LearningRepository } from './repositories/learning.repository';

const NOW = new Date('2026-01-01T00:00:00.000Z');

const actor: AuthenticatedUser = {
  id: 'u1',
  email: 'admin@b.com',
  organizationId: null,
  roles: ['Super Admin'],
  permissions: [],
};

function track(overrides: Partial<LearningTrack> = {}): LearningTrack {
  return {
    id: 't1',
    code: 'TRK',
    name: 'Track',
    description: null,
    examProfileId: null,
    status: 'DRAFT',
    organizationId: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function module(overrides: Partial<TrackModule> = {}): TrackModule {
  return {
    id: 'm1',
    trackId: 't1',
    name: 'Module',
    description: null,
    displayOrder: 0,
    createdAt: NOW,
    ...overrides,
  };
}

function progress(overrides: Partial<TrackProgress> = {}): TrackProgress {
  return {
    id: 'p1',
    userId: 'u1',
    trackModuleId: 'm1',
    status: 'COMPLETED',
    completedAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeRepoMock() {
  return {
    createTrack: jest.fn(),
    findTrackById: jest.fn(),
    listTracks: jest.fn(),
    updateTrack: jest.fn(),
    softDeleteTrack: jest.fn(),
    examProfileExists: jest.fn(),
    findModulesByTrack: jest.fn(),
    findProgressByUserAndTrack: jest.fn(),
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

describe('LearningService', () => {
  let repo: ReturnType<typeof makeRepoMock>;
  let tenant: ReturnType<typeof makeTenantMock>;
  let service: LearningService;

  beforeEach(() => {
    repo = makeRepoMock();
    tenant = makeTenantMock();
    service = new LearningService(
      repo as unknown as LearningRepository,
      tenant as unknown as TenantScopeService,
    );
  });

  it('rejects creating a track with a non-existent exam profile (400)', async () => {
    repo.examProfileExists.mockResolvedValue(false);
    await expect(
      service.create(
        {
          code: 'TRK',
          name: 'Track',
          status: 'DRAFT',
          examProfileId: '00000000-0000-0000-0000-0000000000aa',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps a duplicate code to 409', async () => {
    repo.createTrack.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
    );
    await expect(
      service.create({ code: 'TRK', name: 'Track', status: 'DRAFT' }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('merges progress over all modules, defaulting untouched ones to NOT_STARTED', async () => {
    repo.findTrackById.mockResolvedValue(track());
    repo.findModulesByTrack.mockResolvedValue([
      module({ id: 'm1', displayOrder: 0 }),
      module({ id: 'm2', displayOrder: 1 }),
    ]);
    repo.findProgressByUserAndTrack.mockResolvedValue([progress({ trackModuleId: 'm1', status: 'COMPLETED' })]);

    const result = await service.getProgress('t1', 'u1', actor);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ trackModuleId: 'm1', status: 'COMPLETED' });
    expect(result[1]).toMatchObject({ trackModuleId: 'm2', status: 'NOT_STARTED', completedAt: null });
  });
});
