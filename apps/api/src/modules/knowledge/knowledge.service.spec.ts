import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, type KnowledgeNode } from '@prisma/client';
import { KnowledgeRepository } from './repositories/knowledge.repository';
import { KnowledgeService } from './knowledge.service';

function makeNode(overrides: Partial<KnowledgeNode> = {}): KnowledgeNode {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: '00000000-0000-0000-0000-000000000001',
    code: 'PHARM',
    name: 'Pharmacology',
    type: 'DOMAIN',
    description: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function makeRepoMock() {
  return {
    createNode: jest.fn(),
    findNodeById: jest.fn(),
    findNodeByCode: jest.fn(),
    listNodes: jest.fn(),
    updateNode: jest.fn(),
    softDeleteNode: jest.fn(),
    createEdge: jest.fn(),
    findEdgeById: jest.fn(),
    deleteEdge: jest.fn(),
    descendants: jest.fn(),
    ancestors: jest.fn(),
    neighbors: jest.fn(),
    canReach: jest.fn(),
  };
}

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('KnowledgeService', () => {
  let repo: ReturnType<typeof makeRepoMock>;
  let service: KnowledgeService;

  beforeEach(() => {
    repo = makeRepoMock();
    service = new KnowledgeService(repo as unknown as KnowledgeRepository);
  });

  describe('createNode', () => {
    it('creates and maps a node to a DTO with ISO timestamps', async () => {
      repo.createNode.mockResolvedValue(makeNode());
      const dto = await service.createNode({ code: 'PHARM', name: 'Pharmacology', type: 'DOMAIN' });
      expect(dto).toMatchObject({ code: 'PHARM', name: 'Pharmacology', type: 'DOMAIN', description: null });
      expect(dto.createdAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('maps a unique-constraint violation to 409', async () => {
      repo.createNode.mockRejectedValue(uniqueViolation());
      await expect(
        service.createNode({ code: 'PHARM', name: 'Pharmacology', type: 'DOMAIN' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('getNode', () => {
    it('throws 404 when missing', async () => {
      repo.findNodeById.mockResolvedValue(null);
      await expect(service.getNode('00000000-0000-0000-0000-0000000000ff')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('createEdge', () => {
    const parent = makeNode({ id: 'aaaaaaaa-0000-0000-0000-000000000001', code: 'A' });
    const child = makeNode({ id: 'bbbbbbbb-0000-0000-0000-000000000002', code: 'B' });

    it('skips the cycle check for associative (RELATED_TO) edges', async () => {
      repo.findNodeById.mockImplementation((id: string) =>
        Promise.resolve(id === parent.id ? parent : child),
      );
      repo.createEdge.mockResolvedValue({
        id: 'cccccccc-0000-0000-0000-000000000003',
        parentNodeId: parent.id,
        childNodeId: child.id,
        relationshipType: 'RELATED_TO',
        weight: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const dto = await service.createEdge({
        parentNodeId: parent.id,
        childNodeId: child.id,
        relationshipType: 'RELATED_TO',
      });
      expect(dto.relationshipType).toBe('RELATED_TO');
      expect(repo.canReach).not.toHaveBeenCalled();
    });

    it('rejects a hierarchical edge that would create a cycle (409)', async () => {
      repo.findNodeById.mockImplementation((id: string) =>
        Promise.resolve(id === parent.id ? parent : child),
      );
      repo.canReach.mockResolvedValue(true);

      await expect(
        service.createEdge({
          parentNodeId: parent.id,
          childNodeId: child.id,
          relationshipType: 'IS_A',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repo.canReach).toHaveBeenCalledWith(child.id, parent.id, expect.arrayContaining(['IS_A']));
      expect(repo.createEdge).not.toHaveBeenCalled();
    });

    it('creates a hierarchical edge when there is no cycle', async () => {
      repo.findNodeById.mockImplementation((id: string) =>
        Promise.resolve(id === parent.id ? parent : child),
      );
      repo.canReach.mockResolvedValue(false);
      repo.createEdge.mockResolvedValue({
        id: 'cccccccc-0000-0000-0000-000000000004',
        parentNodeId: parent.id,
        childNodeId: child.id,
        relationshipType: 'IS_A',
        weight: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const dto = await service.createEdge({
        parentNodeId: parent.id,
        childNodeId: child.id,
        relationshipType: 'IS_A',
      });
      expect(dto.relationshipType).toBe('IS_A');
      expect(repo.createEdge).toHaveBeenCalled();
    });

    it('throws 404 when the parent node is missing', async () => {
      repo.findNodeById.mockImplementation((id: string) =>
        Promise.resolve(id === child.id ? child : null),
      );
      await expect(
        service.createEdge({
          parentNodeId: parent.id,
          childNodeId: child.id,
          relationshipType: 'IS_A',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('traversal', () => {
    it('maps descendant rows to DTOs', async () => {
      repo.findNodeById.mockResolvedValue(makeNode());
      repo.descendants.mockResolvedValue([makeNode({ id: 'd', code: 'CHILD', name: 'Child' })]);
      const result = await service.descendants(makeNode().id, { depth: 5 });
      expect(result).toHaveLength(1);
      expect(result[0]?.code).toBe('CHILD');
    });
  });
});
