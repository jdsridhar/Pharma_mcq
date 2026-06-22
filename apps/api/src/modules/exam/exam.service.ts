import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CreateExamProfileInput,
  type ExamKnowledgeMappingDto,
  type ExamProfileDto,
  type ListExamProfilesQuery,
  type Paginated,
  type SetExamKnowledgeInput,
  type UpdateExamProfileInput,
  buildPaginationMeta,
  toSkipTake,
} from '@pharmacy/contracts';
import { type ExamProfile, Prisma } from '@prisma/client';
import { TenantScopeService } from '../../common/tenancy/tenant-scope.service';
import type { AuthenticatedUser } from '../identity/types/auth.types';
import { ExamRepository } from './repositories/exam.repository';

@Injectable()
export class ExamService {
  constructor(
    private readonly repo: ExamRepository,
    private readonly tenant: TenantScopeService,
  ) {}

  async create(input: CreateExamProfileInput, actor: AuthenticatedUser): Promise<ExamProfileDto> {
    try {
      const profile = await this.repo.createProfile({
        code: input.code,
        name: input.name,
        description: input.description,
        status: input.status,
        organizationId: await this.tenant.ownerOrgFor(actor),
      });
      return this.toDto(profile);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`An exam profile with code "${input.code}" already exists`);
      }
      throw error;
    }
  }

  async get(id: string, actor: AuthenticatedUser): Promise<ExamProfileDto> {
    return this.toDto(await this.requireReadable(id, actor));
  }

  async list(query: ListExamProfilesQuery, actor: AuthenticatedUser): Promise<Paginated<ExamProfileDto>> {
    const { skip, take } = toSkipTake(query);
    const viewerOrg = this.tenant.isSuper(actor) ? undefined : (actor.organizationId ?? null);
    const { items, total } = await this.repo.listProfiles(
      { status: query.status, search: query.search },
      skip,
      take,
      viewerOrg,
    );
    return { items: items.map((p) => this.toDto(p)), meta: buildPaginationMeta(total, query) };
  }

  async update(id: string, input: UpdateExamProfileInput, actor: AuthenticatedUser): Promise<ExamProfileDto> {
    await this.requireManageable(id, actor);
    const updated = await this.repo.updateProfile(id, {
      name: input.name,
      description: input.description,
      status: input.status,
    });
    return this.toDto(updated);
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    await this.requireManageable(id, actor);
    await this.repo.softDeleteProfile(id);
  }

  async setKnowledge(
    id: string,
    input: SetExamKnowledgeInput,
    actor: AuthenticatedUser,
  ): Promise<{ items: ExamKnowledgeMappingDto[] }> {
    await this.requireManageable(id, actor);
    const ids = input.items.map((i) => i.knowledgeNodeId);
    if (ids.length > 0) {
      const existing = await this.repo.findExistingKnowledgeNodeIds(ids);
      const missing = ids.filter((nid) => !existing.has(nid));
      if (missing.length > 0) {
        throw new BadRequestException(`Unknown knowledge node(s): ${missing.join(', ')}`);
      }
    }
    await this.repo.setProfileKnowledge(id, input.items);
    const mappings = await this.repo.getProfileKnowledge(id);
    return { items: mappings.map((m) => ({ knowledgeNodeId: m.knowledgeNodeId, importance: m.importance ?? null })) };
  }

  private async requireProfile(id: string): Promise<ExamProfile> {
    const profile = await this.repo.findProfileById(id);
    if (!profile) {
      throw new NotFoundException(`Exam profile ${id} not found`);
    }
    return profile;
  }

  /** Load, enforcing the actor can READ it (cross-org → 404 to avoid leaking existence). */
  private async requireReadable(id: string, actor: AuthenticatedUser): Promise<ExamProfile> {
    const profile = await this.requireProfile(id);
    if (!this.tenant.canRead(profile.organizationId, actor)) {
      throw new NotFoundException(`Exam profile ${id} not found`);
    }
    return profile;
  }

  /** Load, enforcing the actor can MANAGE it: cross-org → 404; readable-but-not-owned → 403. */
  private async requireManageable(id: string, actor: AuthenticatedUser): Promise<ExamProfile> {
    const profile = await this.requireProfile(id);
    if (!this.tenant.canRead(profile.organizationId, actor)) {
      throw new NotFoundException(`Exam profile ${id} not found`);
    }
    if (!(await this.tenant.canManage(profile.organizationId, actor))) {
      throw new ForbiddenException('You cannot modify an exam profile owned by another organization');
    }
    return profile;
  }

  private toDto(p: ExamProfile): ExamProfileDto {
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description ?? null,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}
