import { Injectable } from '@nestjs/common';
import type { EntitlementsDto } from '@pharmacy/contracts';
import { CommerceRepository } from './repositories/commerce.repository';

/**
 * Resolves a user's entitlements from their active subscription's plan features. Exported so
 * other domains can gate premium capabilities via `check(userId, featureKey)`.
 */
@Injectable()
export class EntitlementService {
  constructor(private readonly repo: CommerceRepository) {}

  async getEntitlements(userId: string, organizationId?: string | null): Promise<EntitlementsDto> {
    const now = new Date();
    const { institutionManaged, institutionName } = await this.resolveInstitution(organizationId, now);

    const subscription = await this.repo.findActiveSubscription(userId, now);
    if (!subscription) {
      return { plan: null, features: [], institutionManaged, institutionName };
    }
    return {
      plan: { code: subscription.plan.code, name: subscription.plan.name },
      features: subscription.plan.features.map((pf) => ({
        key: pf.feature.key,
        name: pf.feature.name,
        limit: pf.limit ?? null,
      })),
      institutionManaged,
      institutionName,
    };
  }

  /**
   * Whether the user's access is managed by an institution: their org must have an active
   * subscription on an institutional (seat-based, `seatLimit` set) plan. Belonging to the
   * single-tenant default org without such a plan is NOT institution-managed.
   */
  private async resolveInstitution(
    organizationId: string | null | undefined,
    now: Date,
  ): Promise<{ institutionManaged: boolean; institutionName: string | null }> {
    if (!organizationId) {
      return { institutionManaged: false, institutionName: null };
    }
    const orgSub = await this.repo.findActiveOrgSubscription(organizationId, now);
    if (!orgSub || orgSub.plan.seatLimit == null) {
      return { institutionManaged: false, institutionName: null };
    }
    const org = await this.repo.findOrganizationById(organizationId);
    return { institutionManaged: true, institutionName: org?.name ?? null };
  }

  async check(userId: string, featureKey: string): Promise<boolean> {
    const entitlements = await this.getEntitlements(userId);
    return entitlements.features.some((f) => f.key === featureKey);
  }
}
