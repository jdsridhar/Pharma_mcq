import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CreateTrackModuleInput,
  type SetTrackModuleKnowledgeInput,
  type SetTrackProgressInput,
  type TrackModuleDto,
  type TrackProgressDto,
  type UpdateTrackModuleInput,
} from '@pharmacy/contracts';
import type { LearningTrack, Prisma, TrackModule, TrackProgressStatus } from '@prisma/client';
import { TenantScopeService } from '../../common/tenancy/tenant-scope.service';
import type { AuthenticatedUser } from '../identity/types/auth.types';
import { LearningRepository } from './repositories/learning.repository';

@Injectable()
export class TrackModuleService {
  constructor(
    private readonly repo: LearningRepository,
    private readonly tenant: TenantScopeService,
  ) {}

  async create(
    trackId: string,
    input: CreateTrackModuleInput,
    actor: AuthenticatedUser,
  ): Promise<TrackModuleDto> {
    await this.requireTrack(trackId, actor, 'manage');
    const module = await this.repo.createModule({
      trackId,
      name: input.name,
      description: input.description,
      displayOrder: input.displayOrder,
    });
    return this.toModuleDto(module);
  }

  async update(
    trackId: string,
    moduleId: string,
    input: UpdateTrackModuleInput,
    actor: AuthenticatedUser,
  ): Promise<TrackModuleDto> {
    await this.requireModule(trackId, moduleId, actor, 'manage');
    const data: Prisma.TrackModuleUpdateInput = {};
    if (input.name !== undefined) {
      data.name = input.name;
    }
    if (input.description !== undefined) {
      data.description = input.description;
    }
    if (input.displayOrder !== undefined) {
      data.displayOrder = input.displayOrder;
    }
    const module = await this.repo.updateModule(moduleId, data);
    return this.toModuleDto(module);
  }

  async remove(trackId: string, moduleId: string, actor: AuthenticatedUser): Promise<void> {
    await this.requireModule(trackId, moduleId, actor, 'manage');
    await this.repo.deleteModule(moduleId);
  }

  async setKnowledge(
    trackId: string,
    moduleId: string,
    input: SetTrackModuleKnowledgeInput,
    actor: AuthenticatedUser,
  ): Promise<{ knowledgeNodeIds: string[] }> {
    await this.requireModule(trackId, moduleId, actor, 'manage');
    const ids = input.knowledgeNodeIds;
    if (ids.length > 0) {
      const existing = await this.repo.findExistingKnowledgeNodeIds(ids);
      const missing = ids.filter((id) => !existing.has(id));
      if (missing.length > 0) {
        throw new BadRequestException(`Unknown knowledge node(s): ${missing.join(', ')}`);
      }
    }
    await this.repo.setModuleKnowledge(moduleId, ids);
    return { knowledgeNodeIds: await this.repo.getModuleKnowledgeIds(moduleId) };
  }

  /** Upsert the current student's progress for a module. */
  async setProgress(
    trackId: string,
    moduleId: string,
    userId: string,
    input: SetTrackProgressInput,
    actor: AuthenticatedUser,
  ): Promise<TrackProgressDto> {
    // Recording progress is student-self, so only a READ scope on the track is required.
    await this.requireModule(trackId, moduleId, actor, 'read');
    const completedAt = input.status === 'COMPLETED' ? new Date() : null;
    const record = await this.repo.upsertProgress(
      userId,
      moduleId,
      input.status as TrackProgressStatus,
      completedAt,
    );
    return {
      trackModuleId: record.trackModuleId,
      status: record.status,
      completedAt: record.completedAt?.toISOString() ?? null,
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  /**
   * Load the parent track and enforce tenant scope: cross-org reads 404 (don't leak existence);
   * `manage` additionally requires ownership (403 when readable but not owned).
   */
  private async requireTrack(
    trackId: string,
    actor: AuthenticatedUser,
    mode: 'read' | 'manage',
  ): Promise<LearningTrack> {
    const track = await this.repo.findTrackById(trackId);
    if (!track || !this.tenant.canRead(track.organizationId, actor)) {
      throw new NotFoundException(`Learning track ${trackId} not found`);
    }
    if (mode === 'manage' && !(await this.tenant.canManage(track.organizationId, actor))) {
      throw new ForbiddenException('You cannot modify a learning track owned by another organization');
    }
    return track;
  }

  private async requireModule(
    trackId: string,
    moduleId: string,
    actor: AuthenticatedUser,
    mode: 'read' | 'manage',
  ): Promise<TrackModule> {
    await this.requireTrack(trackId, actor, mode);
    const module = await this.repo.findModuleById(moduleId);
    if (!module || module.trackId !== trackId) {
      throw new NotFoundException(`Module ${moduleId} not found in track ${trackId}`);
    }
    return module;
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
