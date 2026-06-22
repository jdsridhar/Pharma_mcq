import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { TrackModule, TrackProgress } from '@prisma/client';
import type { TenantScopeService } from '../../common/tenancy/tenant-scope.service';
import type { AuthenticatedUser } from '../identity/types/auth.types';
import type { LearningRepository } from './repositories/learning.repository';
import { TrackModuleService } from './track-module.service';

const NOW = new Date('2026-01-01T00:00:00.000Z');

const actor: AuthenticatedUser = {
  id: 'u1',
  email: 'admin@b.com',
  organizationId: null,
  roles: ['Super Admin'],
  permissions: [],
};

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

function makeRepoMock() {
  return {
    findTrackById: jest.fn().mockResolvedValue({ id: 't1', organizationId: null }),
    findModuleById: jest.fn(),
    createModule: jest.fn(),
    updateModule: jest.fn(),
    deleteModule: jest.fn(),
    findExistingKnowledgeNodeIds: jest.fn(),
    setModuleKnowledge: jest.fn(),
    getModuleKnowledgeIds: jest.fn(),
    upsertProgress: jest.fn(),
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

describe('TrackModuleService', () => {
  let repo: ReturnType<typeof makeRepoMock>;
  let tenant: ReturnType<typeof makeTenantMock>;
  let service: TrackModuleService;

  beforeEach(() => {
    repo = makeRepoMock();
    tenant = makeTenantMock();
    service = new TrackModuleService(
      repo as unknown as LearningRepository,
      tenant as unknown as TenantScopeService,
    );
  });

  it('404s when the module does not belong to the track', async () => {
    repo.findModuleById.mockResolvedValue(module({ trackId: 'OTHER' }));
    await expect(service.update('t1', 'm1', { name: 'X' }, actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects mapping to an unknown knowledge node (400)', async () => {
    repo.findModuleById.mockResolvedValue(module());
    repo.findExistingKnowledgeNodeIds.mockResolvedValue(new Set<string>());
    await expect(
      service.setKnowledge(
        't1',
        'm1',
        { knowledgeNodeIds: ['00000000-0000-0000-0000-0000000000aa'] },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sets completedAt when progress is COMPLETED', async () => {
    repo.findModuleById.mockResolvedValue(module());
    repo.upsertProgress.mockResolvedValue({
      trackModuleId: 'm1',
      status: 'COMPLETED',
      completedAt: NOW,
      updatedAt: NOW,
    } as TrackProgress);

    const dto = await service.setProgress('t1', 'm1', 'u1', { status: 'COMPLETED' }, actor);
    expect(dto.status).toBe('COMPLETED');
    expect(repo.upsertProgress).toHaveBeenCalledWith('u1', 'm1', 'COMPLETED', expect.any(Date));
  });

  it('leaves completedAt null for IN_PROGRESS', async () => {
    repo.findModuleById.mockResolvedValue(module());
    repo.upsertProgress.mockResolvedValue({
      trackModuleId: 'm1',
      status: 'IN_PROGRESS',
      completedAt: null,
      updatedAt: NOW,
    } as TrackProgress);

    await service.setProgress('t1', 'm1', 'u1', { status: 'IN_PROGRESS' }, actor);
    expect(repo.upsertProgress).toHaveBeenCalledWith('u1', 'm1', 'IN_PROGRESS', null);
  });
});
