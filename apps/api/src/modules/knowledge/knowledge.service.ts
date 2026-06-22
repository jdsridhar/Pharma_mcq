import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CreateKnowledgeEdgeInput,
  type CreateKnowledgeNodeInput,
  type GraphTraversalQuery,
  HIERARCHICAL_RELATIONSHIP_TYPES,
  KNOWLEDGE_RELATIONSHIP_TYPES,
  type KnowledgeEdgeDto,
  type KnowledgeNodeDto,
  type ListKnowledgeNodesQuery,
  type Paginated,
  type UpdateKnowledgeNodeInput,
  buildPaginationMeta,
  toSkipTake,
} from '@pharmacy/contracts';
import { type KnowledgeEdge, type KnowledgeNode, Prisma } from '@prisma/client';
import {
  type KnowledgeNodeRow,
  KnowledgeRepository,
} from './repositories/knowledge.repository';

const HIERARCHICAL: string[] = [...HIERARCHICAL_RELATIONSHIP_TYPES];
const ALL_TYPES: string[] = [...KNOWLEDGE_RELATIONSHIP_TYPES];

/** Business logic for the knowledge graph: node/edge CRUD, traversal and cycle prevention. */
@Injectable()
export class KnowledgeService {
  constructor(private readonly repo: KnowledgeRepository) {}

  // ── Nodes ──────────────────────────────────────────────────────────────────

  async createNode(input: CreateKnowledgeNodeInput): Promise<KnowledgeNodeDto> {
    try {
      const node = await this.repo.createNode(input);
      return this.toNodeDto(node);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(`A node with code "${input.code}" already exists`);
      }
      throw error;
    }
  }

  async getNode(id: string): Promise<KnowledgeNodeDto> {
    return this.toNodeDto(await this.requireNode(id));
  }

  async listNodes(query: ListKnowledgeNodesQuery): Promise<Paginated<KnowledgeNodeDto>> {
    const { skip, take } = toSkipTake(query);
    const { items, total } = await this.repo.listNodes({
      skip,
      take,
      type: query.type,
      search: query.search,
    });
    return { items: items.map((node) => this.toNodeDto(node)), meta: buildPaginationMeta(total, query) };
  }

  async updateNode(id: string, input: UpdateKnowledgeNodeInput): Promise<KnowledgeNodeDto> {
    await this.requireNode(id);
    const node = await this.repo.updateNode(id, {
      name: input.name,
      type: input.type,
      description: input.description,
    });
    return this.toNodeDto(node);
  }

  async deleteNode(id: string): Promise<void> {
    await this.requireNode(id);
    await this.repo.softDeleteNode(id);
  }

  // ── Edges ──────────────────────────────────────────────────────────────────

  async createEdge(input: CreateKnowledgeEdgeInput): Promise<KnowledgeEdgeDto> {
    const [parent, child] = await Promise.all([
      this.repo.findNodeById(input.parentNodeId),
      this.repo.findNodeById(input.childNodeId),
    ]);
    if (!parent) {
      throw new NotFoundException(`Parent node ${input.parentNodeId} not found`);
    }
    if (!child) {
      throw new NotFoundException(`Child node ${input.childNodeId} not found`);
    }

    // App-level DAG guard: a hierarchical edge parent→child is a cycle if the child can
    // already reach the parent. Caught here for a clean 409 (the DB trigger is the backstop).
    if (HIERARCHICAL.includes(input.relationshipType)) {
      const createsCycle = await this.repo.canReach(input.childNodeId, input.parentNodeId, HIERARCHICAL);
      if (createsCycle) {
        throw new ConflictException(
          'This edge would create a cycle in the knowledge hierarchy',
        );
      }
    }

    try {
      const edge = await this.repo.createEdge({
        parentNodeId: input.parentNodeId,
        childNodeId: input.childNodeId,
        relationshipType: input.relationshipType,
        weight: input.weight,
      });
      return this.toEdgeDto(edge);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('An identical edge already exists');
      }
      throw error;
    }
  }

  async deleteEdge(id: string): Promise<void> {
    const edge = await this.repo.findEdgeById(id);
    if (!edge) {
      throw new NotFoundException(`Edge ${id} not found`);
    }
    await this.repo.deleteEdge(id);
  }

  // ── Graph traversal ──────────────────────────────────────────────────────────

  async descendants(id: string, query: GraphTraversalQuery): Promise<KnowledgeNodeDto[]> {
    await this.requireNode(id);
    const types = query.relationshipTypes ? [...query.relationshipTypes] : HIERARCHICAL;
    const rows = await this.repo.descendants(id, types, query.depth);
    return rows.map((row) => this.toNodeDto(row));
  }

  async ancestors(id: string, query: GraphTraversalQuery): Promise<KnowledgeNodeDto[]> {
    await this.requireNode(id);
    const types = query.relationshipTypes ? [...query.relationshipTypes] : HIERARCHICAL;
    const rows = await this.repo.ancestors(id, types, query.depth);
    return rows.map((row) => this.toNodeDto(row));
  }

  async neighbors(id: string, query: GraphTraversalQuery): Promise<KnowledgeNodeDto[]> {
    await this.requireNode(id);
    const types = query.relationshipTypes ? [...query.relationshipTypes] : ALL_TYPES;
    const rows = await this.repo.neighbors(id, types);
    return rows.map((row) => this.toNodeDto(row));
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private async requireNode(id: string): Promise<KnowledgeNode> {
    const node = await this.repo.findNodeById(id);
    if (!node) {
      throw new NotFoundException(`Knowledge node ${id} not found`);
    }
    return node;
  }

  private toNodeDto(node: KnowledgeNode | KnowledgeNodeRow): KnowledgeNodeDto {
    return {
      id: node.id,
      code: node.code,
      name: node.name,
      type: node.type,
      description: node.description ?? null,
      createdAt: node.createdAt.toISOString(),
      updatedAt: node.updatedAt.toISOString(),
    };
  }

  private toEdgeDto(edge: KnowledgeEdge): KnowledgeEdgeDto {
    return {
      id: edge.id,
      parentNodeId: edge.parentNodeId,
      childNodeId: edge.childNodeId,
      relationshipType: edge.relationshipType,
      weight: edge.weight ?? null,
      createdAt: edge.createdAt.toISOString(),
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
