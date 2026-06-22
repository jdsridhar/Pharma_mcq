import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CreateLearningTrackInput,
  type LearningTrackDetailDto,
  type LearningTrackDto,
  type ListLearningTracksQuery,
  type Paginated,
  type TrackModuleDto,
  type TrackProgressDto,
  type TrackProgressStatusT,
  type UpdateLearningTrackInput,
  buildPaginationMeta,
  toSkipTake,
} from '@pharmacy/contracts';
import { type LearningTrack, Prisma, type TrackModule } from '@prisma/client';
import { TenantScopeService } from '../../common/tenancy/tenant-scope.service';
import type { AuthenticatedUser } from '../identity/types/auth.types';
import { LearningRepository } from './repositories/learning.repository';

@Injectable()
export class LearningService {
  constructor(
    private readonly repo: LearningRepository,
    private readonly tenant: TenantScopeService,
  ) {}

  async create(
    input: CreateLearningTrackInput,
    actor: AuthenticatedUser,
  ): Promise<LearningTrackDetailDto> {
    if (input.examProfileId) {
      await this.assertExamProfileExists(input.examProfileId);
    }
    try {
      const track = await this.repo.createTrack({
        code: input.code,
        name: input.name,
        description: input.description,
        examProfileId: input.examProfileId,
        status: input.status,
        organizationId: await this.tenant.ownerOrgFor(actor),
      });
      return this.toDetailDto(track, []);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`A learning track with code "${input.code}" already exists`);
      }
      throw error;
    }
  }

  async get(id: string, actor: AuthenticatedUser): Promise<LearningTrackDetailDto> {
    const track = await this.requireReadable(id, actor);
    const modules = await this.repo.findModulesByTrack(id);
    return this.toDetailDto(track, modules);
  }

  async list(
    query: ListLearningTracksQuery,
    actor: AuthenticatedUser,
  ): Promise<Paginated<LearningTrackDto>> {
    const { skip, take } = toSkipTake(query);
    const viewerOrg = this.tenant.isSuper(actor) ? undefined : (actor.organizationId ?? null);
    const { items, total } = await this.repo.listTracks(
      { status: query.status, examProfileId: query.examProfileId, search: query.search },
      skip,
      take,
      viewerOrg,
    );
    return { items: items.map((t) => this.toDto(t)), meta: buildPaginationMeta(total, query) };
  }

  async update(
    id: string,
    input: UpdateLearningTrackInput,
    actor: AuthenticatedUser,
  ): Promise<LearningTrackDetailDto> {
    await this.requireManageable(id, actor);
    if (input.examProfileId) {
      await this.assertExamProfileExists(input.examProfileId);
    }

    const data: Prisma.LearningTrackUpdateInput = {};
    if (input.name !== undefined) {
      data.name = input.name;
    }
    if (input.description !== undefined) {
      data.description = input.description;
    }
    if (input.status !== undefined) {
      data.status = input.status;
    }
    if (input.examProfileId !== undefined) {
      data.examProfile =
        input.examProfileId === null
          ? { disconnect: true }
          : { connect: { id: input.examProfileId } };
    }

    const track = await this.repo.updateTrack(id, data);
    const modules = await this.repo.findModulesByTrack(id);
    return this.toDetailDto(track, modules);
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    await this.requireManageable(id, actor);
    await this.repo.softDeleteTrack(id);
  }

  async getProgress(
    trackId: string,
    userId: string,
    actor: AuthenticatedUser,
  ): Promise<TrackProgressDto[]> {
    await this.requireReadable(trackId, actor);
    const modules = await this.repo.findModulesByTrack(trackId);
    const progress = await this.repo.findProgressByUserAndTrack(userId, trackId);
    const byModule = new Map(progress.map((p) => [p.trackModuleId, p]));
    return modules.map((m) => {
      const record = byModule.get(m.id);
      return {
        trackModuleId: m.id,
        status: (record?.status ?? 'NOT_STARTED') as TrackProgressStatusT,
        completedAt: record?.completedAt?.toISOString() ?? null,
        updatedAt: record?.updatedAt?.toISOString() ?? null,
      };
    });
  }

  private async assertExamProfileExists(examProfileId: string): Promise<void> {
    if (!(await this.repo.examProfileExists(examProfileId))) {
      throw new BadRequestException(`Exam profile ${examProfileId} not found`);
    }
  }

  private async requireTrack(id: string): Promise<LearningTrack> {
    const track = await this.repo.findTrackById(id);
    if (!track) {
      throw new NotFoundException(`Learning track ${id} not found`);
    }
    return track;
  }

  /** Load, enforcing the actor can READ it (cross-org → 404 to avoid leaking existence). */
  private async requireReadable(id: string, actor: AuthenticatedUser): Promise<LearningTrack> {
    const track = await this.requireTrack(id);
    if (!this.tenant.canRead(track.organizationId, actor)) {
      throw new NotFoundException(`Learning track ${id} not found`);
    }
    return track;
  }

  /** Load, enforcing the actor can MANAGE it: cross-org → 404; readable-but-not-owned → 403. */
  private async requireManageable(id: string, actor: AuthenticatedUser): Promise<LearningTrack> {
    const track = await this.requireTrack(id);
    if (!this.tenant.canRead(track.organizationId, actor)) {
      throw new NotFoundException(`Learning track ${id} not found`);
    }
    if (!(await this.tenant.canManage(track.organizationId, actor))) {
      throw new ForbiddenException('You cannot modify a learning track owned by another organization');
    }
    return track;
  }

  private toDto(t: LearningTrack): LearningTrackDto {
    return {
      id: t.id,
      code: t.code,
      name: t.name,
      description: t.description ?? null,
      examProfileId: t.examProfileId ?? null,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }

  private toDetailDto(t: LearningTrack, modules: TrackModule[]): LearningTrackDetailDto {
    return { ...this.toDto(t), modules: modules.map((m) => this.toModuleDto(m)) };
  }

  private toModuleDto(m: TrackModule): TrackModuleDto {
    return {
      id: m.id,
      trackId: m.trackId,
      name: m.name,
      description: m.description ?? null,
      displayOrder: m.displayOrder,
      createdAt: m.createdAt.toISOString(),
    };
  }
}
