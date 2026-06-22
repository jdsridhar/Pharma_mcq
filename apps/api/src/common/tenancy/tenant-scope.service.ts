import { Injectable } from '@nestjs/common';
import { SystemRole } from '@pharmacy/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthenticatedUser } from '../../modules/identity/types/auth.types';

/**
 * Multi-tenant content scoping helper (shared across content domains).
 *
 * Ownership model: a content row's `organizationId` is `null` for **platform-shared** content
 * (authored by the platform team / Super Admin) or an org id for **institution-private** content.
 *  - Super Admin sees & manages everything.
 *  - Platform staff (members of the default/platform org) own + manage the shared (null) content.
 *  - Institution staff own + manage only their own org's content.
 *  - Everyone can READ shared content; institutions additionally read their own.
 */
@Injectable()
export class TenantScopeService {
  /** Cached platform org id (`undefined` = not yet resolved). */
  private platformOrgId: string | null | undefined;

  constructor(private readonly prisma: PrismaService) {}

  isSuper(actor: AuthenticatedUser): boolean {
    return actor.roles.includes(SystemRole.SUPER_ADMIN);
  }

  async platformOrg(): Promise<string | null> {
    if (this.platformOrgId === undefined) {
      const slug = process.env.DEFAULT_ORGANIZATION_SLUG ?? 'default';
      const org = await this.prisma.organization.findUnique({ where: { slug }, select: { id: true } });
      this.platformOrgId = org?.id ?? null;
    }
    return this.platformOrgId;
  }

  /** Owner org for newly created content: null (shared) for platform staff/super, else own org. */
  async ownerOrgFor(actor: AuthenticatedUser): Promise<string | null> {
    if (!actor.organizationId) return null;
    const platform = await this.platformOrg();
    return actor.organizationId === platform ? null : actor.organizationId;
  }

  /**
   * Exclusive management list filter:
   *  - `undefined` → no filter (Super Admin: all orgs)
   *  - `null` → platform-shared only (platform staff)
   *  - org id → that institution only
   */
  async manageFilter(actor: AuthenticatedUser): Promise<string | null | undefined> {
    if (this.isSuper(actor)) return undefined;
    const platform = await this.platformOrg();
    return actor.organizationId && actor.organizationId !== platform ? actor.organizationId : null;
  }

  /** Can the actor READ this content? Shared (null) is readable by all; else must be the same org. */
  canRead(entityOrgId: string | null, actor: AuthenticatedUser): boolean {
    if (this.isSuper(actor)) return true;
    if (entityOrgId === null) return true;
    return entityOrgId === actor.organizationId;
  }

  /** Can the actor MANAGE this content? Own org; shared only by platform staff; Super Admin = all. */
  async canManage(entityOrgId: string | null, actor: AuthenticatedUser): Promise<boolean> {
    if (this.isSuper(actor)) return true;
    if (entityOrgId === null) return actor.organizationId === (await this.platformOrg());
    return entityOrgId === actor.organizationId;
  }
}
