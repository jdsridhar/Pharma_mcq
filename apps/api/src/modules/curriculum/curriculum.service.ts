import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CreateCurriculumInput,
  type CurriculumDto,
  type ListCurriculumsQuery,
  type Paginated,
  type UpdateCurriculumInput,
  buildPaginationMeta,
  toSkipTake,
} from '@pharmacy/contracts';
import { type Curriculum, Prisma } from '@prisma/client';
import { TenantScopeService } from '../../common/tenancy/tenant-scope.service';
import type { AuthenticatedUser } from '../identity/types/auth.types';
import { CurriculumRepository } from './repositories/curriculum.repository';

@Injectable()
export class CurriculumService {
  constructor(
    private readonly repo: CurriculumRepository,
    private readonly tenant: TenantScopeService,
  ) {}

  async create(input: CreateCurriculumInput, actor: AuthenticatedUser): Promise<CurriculumDto> {
    try {
      const curriculum = await this.repo.createCurriculum({
        code: input.code,
        name: input.name,
        description: input.description,
        status: input.status,
        organizationId: await this.tenant.ownerOrgFor(actor),
      });
      return this.toDto(curriculum);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`A curriculum with code "${input.code}" already exists`);
      }
      throw error;
    }
  }

  async get(id: string, actor: AuthenticatedUser): Promise<CurriculumDto> {
    return this.toDto(await this.requireReadable(id, actor));
  }

  async list(query: ListCurriculumsQuery, actor: AuthenticatedUser): Promise<Paginated<CurriculumDto>> {
    const { skip, take } = toSkipTake(query);
    const viewerOrg = this.tenant.isSuper(actor) ? undefined : (actor.organizationId ?? null);
    const { items, total } = await this.repo.listCurriculums(
      { status: query.status, search: query.search },
      skip,
      take,
      viewerOrg,
    );
    return { items: items.map((c) => this.toDto(c)), meta: buildPaginationMeta(total, query) };
  }

  async update(id: string, input: UpdateCurriculumInput, actor: AuthenticatedUser): Promise<CurriculumDto> {
    await this.requireManageable(id, actor);
    const updated = await this.repo.updateCurriculum(id, {
      name: input.name,
      description: input.description,
      status: input.status,
    });
    return this.toDto(updated);
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    await this.requireManageable(id, actor);
    await this.repo.softDeleteCurriculum(id);
  }

  private async requireCurriculum(id: string): Promise<Curriculum> {
    const curriculum = await this.repo.findCurriculumById(id);
    if (!curriculum) {
      throw new NotFoundException(`Curriculum ${id} not found`);
    }
    return curriculum;
  }

  /** Load, enforcing the actor can READ it (cross-org → 404 to avoid leaking existence). */
  private async requireReadable(id: string, actor: AuthenticatedUser): Promise<Curriculum> {
    const curriculum = await this.requireCurriculum(id);
    if (!this.tenant.canRead(curriculum.organizationId, actor)) {
      throw new NotFoundException(`Curriculum ${id} not found`);
    }
    return curriculum;
  }

  /** Load, enforcing the actor can MANAGE it: cross-org → 404; readable-but-not-owned → 403. */
  private async requireManageable(id: string, actor: AuthenticatedUser): Promise<Curriculum> {
    const curriculum = await this.requireCurriculum(id);
    if (!this.tenant.canRead(curriculum.organizationId, actor)) {
      throw new NotFoundException(`Curriculum ${id} not found`);
    }
    if (!(await this.tenant.canManage(curriculum.organizationId, actor))) {
      throw new ForbiddenException('You cannot modify a curriculum owned by another organization');
    }
    return curriculum;
  }

  private toDto(c: Curriculum): CurriculumDto {
    return {
      id: c.id,
      code: c.code,
      name: c.name,
      description: c.description ?? null,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}
