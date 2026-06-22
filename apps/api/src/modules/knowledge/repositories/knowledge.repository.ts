import { Injectable } from '@nestjs/common';
import { Prisma, type KnowledgeEdge, type KnowledgeNode } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';

/** Raw row shape returned by the graph-traversal queries (excludes soft-deleted columns). */
export interface KnowledgeNodeRow {
  id: string;
  code: string;
  name: string;
  type: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateNodeData {
  code: string;
  name: string;
  type: string;
  description?: string;
}

export interface CreateEdgeData {
  parentNodeId: string;
  childNodeId: string;
  relationshipType: KnowledgeEdge['relationshipType'];
  weight?: number;
}

const NODE_COLUMNS = Prisma.sql`n.id, n.code, n.name, n.type, n.description, n."createdAt", n."updatedAt"`;

/**
 * Persistence for the knowledge graph. Hierarchical traversals and the cycle check use
 * recursive CTEs over `knowledge_edges`; everything else uses the Prisma client.
 */
@Injectable()
export class KnowledgeRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Nodes ──────────────────────────────────────────────────────────────────

  createNode(data: CreateNodeData): Promise<KnowledgeNode> {
    return this.prisma.knowledgeNode.create({ data });
  }

  findNodeById(id: string): Promise<KnowledgeNode | null> {
    return this.prisma.knowledgeNode.findFirst({ where: { id, deletedAt: null } });
  }

  findNodeByCode(code: string): Promise<KnowledgeNode | null> {
    return this.prisma.knowledgeNode.findFirst({ where: { code, deletedAt: null } });
  }

  async listNodes(params: {
    skip: number;
    take: number;
    type?: string;
    search?: string;
  }): Promise<{ items: KnowledgeNode[]; total: number }> {
    const where: Prisma.KnowledgeNodeWhereInput = {
      deletedAt: null,
      ...(params.type ? { type: params.type } : {}),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' } },
              { code: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.knowledgeNode.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { name: 'asc' },
      }),
      this.prisma.knowledgeNode.count({ where }),
    ]);
    return { items, total };
  }

  updateNode(id: string, data: Prisma.KnowledgeNodeUpdateInput): Promise<KnowledgeNode> {
    return this.prisma.knowledgeNode.update({ where: { id }, data });
  }

  /** Soft-delete a node and hard-delete its edges so the graph has no dangling references. */
  async softDeleteNode(id: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.knowledgeEdge.deleteMany({
        where: { OR: [{ parentNodeId: id }, { childNodeId: id }] },
      }),
      this.prisma.knowledgeNode.update({ where: { id }, data: { deletedAt: new Date() } }),
    ]);
  }

  // ── Edges ──────────────────────────────────────────────────────────────────

  createEdge(data: CreateEdgeData): Promise<KnowledgeEdge> {
    return this.prisma.knowledgeEdge.create({ data });
  }

  findEdgeById(id: string): Promise<KnowledgeEdge | null> {
    return this.prisma.knowledgeEdge.findUnique({ where: { id } });
  }

  async deleteEdge(id: string): Promise<void> {
    await this.prisma.knowledgeEdge.delete({ where: { id } });
  }

  // ── Graph traversal (recursive CTEs) ─────────────────────────────────────────

  /** Nodes reachable downward (parent → child) from `rootId` within `depth` hops. */
  descendants(rootId: string, types: string[], depth: number): Promise<KnowledgeNodeRow[]> {
    return this.prisma.$queryRaw<KnowledgeNodeRow[]>`
      WITH RECURSIVE walk AS (
        SELECT e."childNodeId" AS id, 1 AS depth
        FROM knowledge_edges e
        WHERE e."parentNodeId" = ${rootId}::uuid
          AND e."relationshipType"::text = ANY(${types})
        UNION
        SELECT e."childNodeId", w.depth + 1
        FROM knowledge_edges e
        JOIN walk w ON e."parentNodeId" = w.id
        WHERE e."relationshipType"::text = ANY(${types})
          AND w.depth < ${depth}
      )
      SELECT DISTINCT ${NODE_COLUMNS}
      FROM knowledge_nodes n
      JOIN walk ON n.id = walk.id
      WHERE n."deletedAt" IS NULL
      ORDER BY n.name ASC
    `;
  }

  /** Nodes reachable upward (child → parent) from `rootId` within `depth` hops. */
  ancestors(rootId: string, types: string[], depth: number): Promise<KnowledgeNodeRow[]> {
    return this.prisma.$queryRaw<KnowledgeNodeRow[]>`
      WITH RECURSIVE walk AS (
        SELECT e."parentNodeId" AS id, 1 AS depth
        FROM knowledge_edges e
        WHERE e."childNodeId" = ${rootId}::uuid
          AND e."relationshipType"::text = ANY(${types})
        UNION
        SELECT e."parentNodeId", w.depth + 1
        FROM knowledge_edges e
        JOIN walk w ON e."childNodeId" = w.id
        WHERE e."relationshipType"::text = ANY(${types})
          AND w.depth < ${depth}
      )
      SELECT DISTINCT ${NODE_COLUMNS}
      FROM knowledge_nodes n
      JOIN walk ON n.id = walk.id
      WHERE n."deletedAt" IS NULL
      ORDER BY n.name ASC
    `;
  }

  /** Direct neighbours (depth 1, either direction) of `rootId`. */
  neighbors(rootId: string, types: string[]): Promise<KnowledgeNodeRow[]> {
    return this.prisma.$queryRaw<KnowledgeNodeRow[]>`
      SELECT DISTINCT ${NODE_COLUMNS}
      FROM knowledge_edges e
      JOIN knowledge_nodes n
        ON n.id = CASE WHEN e."parentNodeId" = ${rootId}::uuid
                       THEN e."childNodeId" ELSE e."parentNodeId" END
      WHERE (e."parentNodeId" = ${rootId}::uuid OR e."childNodeId" = ${rootId}::uuid)
        AND e."relationshipType"::text = ANY(${types})
        AND n."deletedAt" IS NULL
      ORDER BY n.name ASC
    `;
  }

  /** True if `toId` is reachable downward from `fromId` over the given relationship types. */
  async canReach(fromId: string, toId: string, types: string[]): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ reachable: boolean }[]>`
      WITH RECURSIVE walk AS (
        SELECT e."childNodeId" AS id
        FROM knowledge_edges e
        WHERE e."parentNodeId" = ${fromId}::uuid
          AND e."relationshipType"::text = ANY(${types})
        UNION
        SELECT e."childNodeId"
        FROM knowledge_edges e
        JOIN walk w ON e."parentNodeId" = w.id
        WHERE e."relationshipType"::text = ANY(${types})
      )
      SELECT EXISTS(SELECT 1 FROM walk WHERE id = ${toId}::uuid) AS reachable
    `;
    return rows[0]?.reachable ?? false;
  }
}
