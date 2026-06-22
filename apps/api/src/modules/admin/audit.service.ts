import { Injectable, Logger } from '@nestjs/common';
import {
  type AuditLogDto,
  type ListAuditLogsQuery,
  type Paginated,
  buildPaginationMeta,
  toSkipTake,
} from '@pharmacy/contracts';
import type { AuditLog } from '@prisma/client';
import { AdminRepository, type AuditEntry } from './repositories/admin.repository';

/**
 * Append-only audit logging. Writes never UPDATE/DELETE (enforced by a DB trigger). Recording
 * is resilient — an audit failure must never break the audited request.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly repo: AdminRepository) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.repo.createAudit(entry);
    } catch (error) {
      this.logger.warn(`Failed to write audit log: ${String(error)}`);
    }
  }

  async list(query: ListAuditLogsQuery): Promise<Paginated<AuditLogDto>> {
    const { skip, take } = toSkipTake(query);
    const { items, total } = await this.repo.listAudit(
      { entityType: query.entityType, actorUserId: query.actorUserId },
      skip,
      take,
    );
    return { items: items.map((a) => this.toDto(a)), meta: buildPaginationMeta(total, query) };
  }

  async listByEntity(entityType: string, entityId: string): Promise<AuditLogDto[]> {
    const rows = await this.repo.listAuditByEntity(entityType, entityId);
    return rows.map((a) => this.toDto(a));
  }

  private toDto(a: AuditLog): AuditLogDto {
    return {
      id: a.id,
      actorUserId: a.actorUserId ?? null,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId ?? null,
      ip: a.ip ?? null,
      createdAt: a.createdAt.toISOString(),
    };
  }
}
