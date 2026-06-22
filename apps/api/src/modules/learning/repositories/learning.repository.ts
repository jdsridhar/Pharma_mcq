import { Injectable } from '@nestjs/common';
import {
  type ContentStatus,
  type LearningTrack,
  Prisma,
  type TrackModule,
  type TrackProgress,
  type TrackProgressStatus,
} from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';

export interface CreateTrackData {
  code: string;
  name: string;
  description?: string;
  examProfileId?: string;
  status: ContentStatus;
  /** Tenant owner. null = platform-shared; set = private to an institution. */
  organizationId?: string | null;
}

export interface CreateModuleData {
  trackId: string;
  name: string;
  description?: string;
  displayOrder: number;
}

/** Persistence for learning tracks, modules, module↔knowledge mappings and progress. */
@Injectable()
export class LearningRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Tracks ─────────────────────────────────────────────────────────────────────

  createTrack(data: CreateTrackData): Promise<LearningTrack> {
    return this.prisma.learningTrack.create({
      data: {
        code: data.code,
        name: data.name,
        description: data.description,
        status: data.status,
        organizationId: data.organizationId ?? null,
        ...(data.examProfileId ? { examProfile: { connect: { id: data.examProfileId } } } : {}),
      },
    });
  }

  findTrackById(id: string): Promise<LearningTrack | null> {
    return this.prisma.learningTrack.findFirst({ where: { id, deletedAt: null } });
  }

  async listTracks(
    filter: { status?: ContentStatus; examProfileId?: string; search?: string },
    skip: number,
    take: number,
    viewerOrg?: string | null,
  ): Promise<{ items: LearningTrack[]; total: number }> {
    const and: Prisma.LearningTrackWhereInput[] = [];
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
    const where: Prisma.LearningTrackWhereInput = {
      deletedAt: null,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.examProfileId ? { examProfileId: filter.examProfileId } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.learningTrack.findMany({ where, skip, take, orderBy: { name: 'asc' } }),
      this.prisma.learningTrack.count({ where }),
    ]);
    return { items, total };
  }

  updateTrack(id: string, data: Prisma.LearningTrackUpdateInput): Promise<LearningTrack> {
    return this.prisma.learningTrack.update({ where: { id }, data });
  }

  async softDeleteTrack(id: string): Promise<void> {
    await this.prisma.learningTrack.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async examProfileExists(id: string): Promise<boolean> {
    const found = await this.prisma.examProfile.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    return found !== null;
  }

  // ── Modules ──────────────────────────────────────────────────────────────────

  createModule(data: CreateModuleData): Promise<TrackModule> {
    return this.prisma.trackModule.create({ data });
  }

  findModuleById(id: string): Promise<TrackModule | null> {
    return this.prisma.trackModule.findUnique({ where: { id } });
  }

  findModulesByTrack(trackId: string): Promise<TrackModule[]> {
    return this.prisma.trackModule.findMany({
      where: { trackId },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
  }

  updateModule(id: string, data: Prisma.TrackModuleUpdateInput): Promise<TrackModule> {
    return this.prisma.trackModule.update({ where: { id }, data });
  }

  async deleteModule(id: string): Promise<void> {
    await this.prisma.trackModule.delete({ where: { id } });
  }

  // ── Module ↔ knowledge ─────────────────────────────────────────────────────────

  async findExistingKnowledgeNodeIds(ids: string[]): Promise<Set<string>> {
    const rows = await this.prisma.knowledgeNode.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  async setModuleKnowledge(trackModuleId: string, knowledgeNodeIds: string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.trackKnowledgeMapping.deleteMany({ where: { trackModuleId } }),
      this.prisma.trackKnowledgeMapping.createMany({
        data: knowledgeNodeIds.map((knowledgeNodeId) => ({ trackModuleId, knowledgeNodeId })),
        skipDuplicates: true,
      }),
    ]);
  }

  async getModuleKnowledgeIds(trackModuleId: string): Promise<string[]> {
    const rows = await this.prisma.trackKnowledgeMapping.findMany({
      where: { trackModuleId },
      select: { knowledgeNodeId: true },
    });
    return rows.map((r) => r.knowledgeNodeId);
  }

  // ── Progress ─────────────────────────────────────────────────────────────────

  upsertProgress(
    userId: string,
    trackModuleId: string,
    status: TrackProgressStatus,
    completedAt: Date | null,
  ): Promise<TrackProgress> {
    return this.prisma.trackProgress.upsert({
      where: { userId_trackModuleId: { userId, trackModuleId } },
      update: { status, completedAt },
      create: { userId, trackModuleId, status, completedAt },
    });
  }

  findProgressByUserAndTrack(userId: string, trackId: string): Promise<TrackProgress[]> {
    return this.prisma.trackProgress.findMany({
      where: { userId, trackModule: { trackId } },
    });
  }
}
