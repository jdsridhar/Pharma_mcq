import { Injectable } from '@nestjs/common';
import type { ContentStatus, Curriculum, CurriculumNode, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';

export interface CreateCurriculumData {
  code: string;
  name: string;
  description?: string;
  status: ContentStatus;
  /** Tenant owner. null = platform-shared; set = private to an institution. */
  organizationId?: string | null;
}

export interface ListCurriculumsFilter {
  status?: ContentStatus;
  search?: string;
}

export interface CreateNodeData {
  curriculumId: string;
  parentId?: string;
  name: string;
  code?: string;
  displayOrder: number;
}

/** Persistence for curriculums and their node trees. */
@Injectable()
export class CurriculumRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Curriculum ───────────────────────────────────────────────────────────────

  createCurriculum(data: CreateCurriculumData): Promise<Curriculum> {
    return this.prisma.curriculum.create({
      data: {
        code: data.code,
        name: data.name,
        description: data.description,
        status: data.status,
        organizationId: data.organizationId ?? null,
      },
    });
  }

  findCurriculumById(id: string): Promise<Curriculum | null> {
    return this.prisma.curriculum.findFirst({ where: { id, deletedAt: null } });
  }

  async listCurriculums(
    filter: ListCurriculumsFilter,
    skip: number,
    take: number,
    viewerOrg?: string | null,
  ): Promise<{ items: Curriculum[]; total: number }> {
    const and: Prisma.CurriculumWhereInput[] = [];
    // Inclusive read scope: viewers see platform-shared (null) + their own org. `undefined` = all.
    if (viewerOrg !== undefined) {
      and.push({ OR: [{ organizationId: null }, { organizationId: viewerOrg }] });
    }
    if (filter.search) {
      and.push({
        OR: [
          { name: { contains: filter.search, mode: 'insensitive' } },
          { code: { contains: filter.search, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.CurriculumWhereInput = {
      deletedAt: null,
      ...(filter.status ? { status: filter.status } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.curriculum.findMany({ where, skip, take, orderBy: { name: 'asc' } }),
      this.prisma.curriculum.count({ where }),
    ]);
    return { items, total };
  }

  updateCurriculum(id: string, data: Prisma.CurriculumUpdateInput): Promise<Curriculum> {
    return this.prisma.curriculum.update({ where: { id }, data });
  }

  async softDeleteCurriculum(id: string): Promise<void> {
    await this.prisma.curriculum.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // ── Nodes ─────────────────────────────────────────────────────────────────────

  createNode(data: CreateNodeData): Promise<CurriculumNode> {
    return this.prisma.curriculumNode.create({ data });
  }

  findNodeById(id: string): Promise<CurriculumNode | null> {
    return this.prisma.curriculumNode.findUnique({ where: { id } });
  }

  findNodesByCurriculum(curriculumId: string): Promise<CurriculumNode[]> {
    return this.prisma.curriculumNode.findMany({
      where: { curriculumId },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
  }

  updateNode(id: string, data: Prisma.CurriculumNodeUpdateInput): Promise<CurriculumNode> {
    return this.prisma.curriculumNode.update({ where: { id }, data });
  }

  async deleteNode(id: string): Promise<void> {
    await this.prisma.curriculumNode.delete({ where: { id } });
  }

  async countChildren(nodeId: string): Promise<number> {
    return this.prisma.curriculumNode.count({ where: { parentId: nodeId } });
  }

  // ── Node ↔ knowledge mapping ───────────────────────────────────────────────────

  async findExistingKnowledgeNodeIds(ids: string[]): Promise<Set<string>> {
    const rows = await this.prisma.knowledgeNode.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  async setNodeKnowledge(curriculumNodeId: string, knowledgeNodeIds: string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.curriculumKnowledgeMapping.deleteMany({ where: { curriculumNodeId } }),
      this.prisma.curriculumKnowledgeMapping.createMany({
        data: knowledgeNodeIds.map((knowledgeNodeId) => ({ curriculumNodeId, knowledgeNodeId })),
        skipDuplicates: true,
      }),
    ]);
  }

  async getNodeKnowledgeIds(curriculumNodeId: string): Promise<string[]> {
    const rows = await this.prisma.curriculumKnowledgeMapping.findMany({
      where: { curriculumNodeId },
      select: { knowledgeNodeId: true },
    });
    return rows.map((r) => r.knowledgeNodeId);
  }
}
