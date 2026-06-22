import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CreateCurriculumNodeInput,
  type CurriculumNodeDto,
  type CurriculumTreeNodeDto,
  type SetCurriculumNodeKnowledgeInput,
  type UpdateCurriculumNodeInput,
} from '@pharmacy/contracts';
import type { Curriculum, CurriculumNode, Prisma } from '@prisma/client';
import { TenantScopeService } from '../../common/tenancy/tenant-scope.service';
import type { AuthenticatedUser } from '../identity/types/auth.types';
import { CurriculumRepository } from './repositories/curriculum.repository';

@Injectable()
export class CurriculumNodeService {
  constructor(
    private readonly repo: CurriculumRepository,
    private readonly tenant: TenantScopeService,
  ) {}

  async createNode(
    curriculumId: string,
    input: CreateCurriculumNodeInput,
    actor: AuthenticatedUser,
  ): Promise<CurriculumNodeDto> {
    await this.requireCurriculum(curriculumId, actor, 'manage');
    if (input.parentId) {
      await this.assertParentInCurriculum(curriculumId, input.parentId);
    }
    const node = await this.repo.createNode({
      curriculumId,
      parentId: input.parentId,
      name: input.name,
      code: input.code,
      displayOrder: input.displayOrder,
    });
    return this.toNodeDto(node);
  }

  async updateNode(
    curriculumId: string,
    nodeId: string,
    input: UpdateCurriculumNodeInput,
    actor: AuthenticatedUser,
  ): Promise<CurriculumNodeDto> {
    await this.requireNode(curriculumId, nodeId, actor, 'manage');

    const data: Prisma.CurriculumNodeUpdateInput = {};
    if (input.name !== undefined) {
      data.name = input.name;
    }
    if (input.code !== undefined) {
      data.code = input.code;
    }
    if (input.displayOrder !== undefined) {
      data.displayOrder = input.displayOrder;
    }
    if (input.parentId !== undefined) {
      if (input.parentId === null) {
        data.parent = { disconnect: true };
      } else {
        if (input.parentId === nodeId) {
          throw new ConflictException('A node cannot be its own parent');
        }
        await this.assertParentInCurriculum(curriculumId, input.parentId);
        await this.assertNoCycle(curriculumId, nodeId, input.parentId);
        data.parent = { connect: { id: input.parentId } };
      }
    }

    const updated = await this.repo.updateNode(nodeId, data);
    return this.toNodeDto(updated);
  }

  async deleteNode(curriculumId: string, nodeId: string, actor: AuthenticatedUser): Promise<void> {
    await this.requireNode(curriculumId, nodeId, actor, 'manage');
    const childCount = await this.repo.countChildren(nodeId);
    if (childCount > 0) {
      throw new ConflictException('Delete or move the child nodes first');
    }
    await this.repo.deleteNode(nodeId);
  }

  async getTree(curriculumId: string, actor: AuthenticatedUser): Promise<CurriculumTreeNodeDto[]> {
    await this.requireCurriculum(curriculumId, actor, 'read');
    const nodes = await this.repo.findNodesByCurriculum(curriculumId);
    return this.buildTree(nodes);
  }

  async setNodeKnowledge(
    curriculumId: string,
    nodeId: string,
    input: SetCurriculumNodeKnowledgeInput,
    actor: AuthenticatedUser,
  ): Promise<{ knowledgeNodeIds: string[] }> {
    await this.requireNode(curriculumId, nodeId, actor, 'manage');
    const ids = input.knowledgeNodeIds;
    if (ids.length > 0) {
      const existing = await this.repo.findExistingKnowledgeNodeIds(ids);
      const missing = ids.filter((id) => !existing.has(id));
      if (missing.length > 0) {
        throw new BadRequestException(`Unknown knowledge node(s): ${missing.join(', ')}`);
      }
    }
    await this.repo.setNodeKnowledge(nodeId, ids);
    return { knowledgeNodeIds: await this.repo.getNodeKnowledgeIds(nodeId) };
  }

  // ── internals ────────────────────────────────────────────────────────────────

  /**
   * Load the parent curriculum and enforce the actor's tenant scope: cross-org reads 404 (don't
   * leak existence); `manage` additionally requires ownership (403 when readable but not owned).
   */
  private async requireCurriculum(
    id: string,
    actor: AuthenticatedUser,
    mode: 'read' | 'manage',
  ): Promise<Curriculum> {
    const curriculum = await this.repo.findCurriculumById(id);
    if (!curriculum || !this.tenant.canRead(curriculum.organizationId, actor)) {
      throw new NotFoundException(`Curriculum ${id} not found`);
    }
    if (mode === 'manage' && !(await this.tenant.canManage(curriculum.organizationId, actor))) {
      throw new ForbiddenException('You cannot modify a curriculum owned by another organization');
    }
    return curriculum;
  }

  private async requireNode(
    curriculumId: string,
    nodeId: string,
    actor: AuthenticatedUser,
    mode: 'read' | 'manage',
  ): Promise<CurriculumNode> {
    await this.requireCurriculum(curriculumId, actor, mode);
    const node = await this.repo.findNodeById(nodeId);
    if (!node || node.curriculumId !== curriculumId) {
      throw new NotFoundException(`Node ${nodeId} not found in curriculum ${curriculumId}`);
    }
    return node;
  }

  private async assertParentInCurriculum(curriculumId: string, parentId: string): Promise<void> {
    const parent = await this.repo.findNodeById(parentId);
    if (!parent || parent.curriculumId !== curriculumId) {
      throw new BadRequestException('Parent node must belong to the same curriculum');
    }
  }

  /** The new parent must not be the node itself or any of its descendants. */
  private async assertNoCycle(
    curriculumId: string,
    nodeId: string,
    newParentId: string,
  ): Promise<void> {
    const nodes = await this.repo.findNodesByCurriculum(curriculumId);
    const childrenByParent = new Map<string, string[]>();
    for (const node of nodes) {
      if (node.parentId) {
        const list = childrenByParent.get(node.parentId) ?? [];
        list.push(node.id);
        childrenByParent.set(node.parentId, list);
      }
    }

    const descendants = new Set<string>();
    const stack = [nodeId];
    while (stack.length > 0) {
      const current = stack.pop() as string;
      for (const child of childrenByParent.get(current) ?? []) {
        if (!descendants.has(child)) {
          descendants.add(child);
          stack.push(child);
        }
      }
    }

    if (descendants.has(newParentId)) {
      throw new ConflictException('Re-parenting would create a cycle in the curriculum tree');
    }
  }

  private buildTree(nodes: CurriculumNode[]): CurriculumTreeNodeDto[] {
    const byId = new Map<string, CurriculumTreeNodeDto>();
    for (const node of nodes) {
      byId.set(node.id, { ...this.toNodeDto(node), children: [] });
    }
    const roots: CurriculumTreeNodeDto[] = [];
    for (const node of nodes) {
      const dto = byId.get(node.id) as CurriculumTreeNodeDto;
      const parent = node.parentId ? byId.get(node.parentId) : undefined;
      if (parent) {
        parent.children.push(dto);
      } else {
        roots.push(dto);
      }
    }
    return roots;
  }

  private toNodeDto(node: CurriculumNode): CurriculumNodeDto {
    return {
      id: node.id,
      curriculumId: node.curriculumId,
      parentId: node.parentId ?? null,
      name: node.name,
      code: node.code ?? null,
      displayOrder: node.displayOrder,
    };
  }
}
