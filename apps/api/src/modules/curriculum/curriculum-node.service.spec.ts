import { BadRequestException, ConflictException } from '@nestjs/common';
import type { CurriculumNode } from '@prisma/client';
import type { TenantScopeService } from '../../common/tenancy/tenant-scope.service';
import type { AuthenticatedUser } from '../identity/types/auth.types';
import { CurriculumNodeService } from './curriculum-node.service';
import type { CurriculumRepository } from './repositories/curriculum.repository';

const NOW = new Date('2026-01-01T00:00:00.000Z');

const actor: AuthenticatedUser = {
  id: 'u1',
  email: 'admin@b.com',
  organizationId: null,
  roles: ['Super Admin'],
  permissions: [],
};

function node(overrides: Partial<CurriculumNode> = {}): CurriculumNode {
  return {
    id: 'n1',
    curriculumId: 'c1',
    parentId: null,
    name: 'Node',
    code: null,
    displayOrder: 0,
    createdAt: NOW,
    ...overrides,
  };
}

function makeRepoMock() {
  return {
    findCurriculumById: jest.fn().mockResolvedValue({ id: 'c1', organizationId: null }),
    findNodeById: jest.fn(),
    findNodesByCurriculum: jest.fn(),
    createNode: jest.fn(),
    updateNode: jest.fn(),
    deleteNode: jest.fn(),
    countChildren: jest.fn(),
    findExistingKnowledgeNodeIds: jest.fn(),
    setNodeKnowledge: jest.fn(),
    getNodeKnowledgeIds: jest.fn(),
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

describe('CurriculumNodeService', () => {
  let repo: ReturnType<typeof makeRepoMock>;
  let tenant: ReturnType<typeof makeTenantMock>;
  let service: CurriculumNodeService;

  beforeEach(() => {
    repo = makeRepoMock();
    tenant = makeTenantMock();
    service = new CurriculumNodeService(
      repo as unknown as CurriculumRepository,
      tenant as unknown as TenantScopeService,
    );
  });

  it('rejects a parent from a different curriculum (400)', async () => {
    repo.findNodeById.mockResolvedValue(node({ id: 'p1', curriculumId: 'OTHER' }));
    await expect(
      service.createNode('c1', { name: 'Child', parentId: 'p1', displayOrder: 0 }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects making a node its own parent (409)', async () => {
    repo.findNodeById.mockResolvedValue(node({ id: 'n1' }));
    await expect(
      service.updateNode('c1', 'n1', { parentId: 'n1' }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a re-parent that would create a cycle (409)', async () => {
    // Tree: n1 → n2 → n3. Re-parenting n1 under n3 (its descendant) is a cycle.
    repo.findNodeById.mockImplementation((id: string) =>
      Promise.resolve(node({ id, curriculumId: 'c1' })),
    );
    repo.findNodesByCurriculum.mockResolvedValue([
      node({ id: 'n1', parentId: null }),
      node({ id: 'n2', parentId: 'n1' }),
      node({ id: 'n3', parentId: 'n2' }),
    ]);
    await expect(
      service.updateNode('c1', 'n1', { parentId: 'n3' }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects deleting a node that has children (409)', async () => {
    repo.findNodeById.mockResolvedValue(node({ id: 'n1' }));
    repo.countChildren.mockResolvedValue(2);
    await expect(service.deleteNode('c1', 'n1', actor)).rejects.toBeInstanceOf(ConflictException);
  });

  it('builds a nested tree from flat nodes', async () => {
    repo.findNodesByCurriculum.mockResolvedValue([
      node({ id: 'r1', parentId: null, displayOrder: 0, name: 'Root 1' }),
      node({ id: 'c1n', parentId: 'r1', displayOrder: 0, name: 'Child' }),
      node({ id: 'r2', parentId: null, displayOrder: 1, name: 'Root 2' }),
    ]);
    const tree = await service.getTree('c1', actor);
    expect(tree).toHaveLength(2);
    expect(tree[0]?.id).toBe('r1');
    expect(tree[0]?.children[0]?.id).toBe('c1n');
    expect(tree[1]?.id).toBe('r2');
  });

  it('rejects mapping to an unknown knowledge node (400)', async () => {
    repo.findNodeById.mockResolvedValue(node({ id: 'n1' }));
    repo.findExistingKnowledgeNodeIds.mockResolvedValue(new Set<string>());
    await expect(
      service.setNodeKnowledge(
        'c1',
        'n1',
        { knowledgeNodeIds: ['00000000-0000-0000-0000-0000000000aa'] },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
