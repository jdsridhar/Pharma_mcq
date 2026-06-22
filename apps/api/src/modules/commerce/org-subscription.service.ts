import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AssignOrgSubscriptionInput, OrgSubscriptionDto } from '@pharmacy/contracts';
import { computePeriodEnd } from './billing/period';
import { CommerceRepository, type SubscriptionWithPlan } from './repositories/commerce.repository';

/**
 * Institutional (org) seat billing. A Super Admin provisions an **institution plan** (one whose
 * `seatLimit` is set) to an organization; the active org subscription then caps how many member
 * accounts that org may have. Individual (per-user) plans and orgs without an institution
 * subscription are unconstrained. Provisioning is `MANUAL` (the platform sells seats directly);
 * Razorpay-driven org checkout can layer on later via the existing payment port.
 */
@Injectable()
export class OrgSubscriptionService {
  constructor(private readonly repo: CommerceRepository) {}

  /** (Re)provision an institution plan for an org, replacing any current active subscription. */
  async provision(
    organizationId: string,
    input: AssignOrgSubscriptionInput,
    actorUserId: string,
  ): Promise<OrgSubscriptionDto> {
    const org = await this.repo.findOrganizationById(organizationId);
    if (!org) {
      throw new NotFoundException(`Organization ${organizationId} not found`);
    }

    const plan = await this.repo.findPlanById(input.planId);
    if (!plan) {
      throw new NotFoundException(`Plan ${input.planId} not found`);
    }
    if (!plan.isActive) {
      throw new BadRequestException('Plan is not active');
    }
    if (plan.seatLimit == null) {
      throw new BadRequestException('Plan is not an institutional (seat-based) plan');
    }

    const start = new Date();
    let currentPeriodEnd: Date | null = null;
    let planPriceId: string | null = null;
    if (input.planPriceId) {
      const price = await this.repo.findPriceById(input.planPriceId);
      if (!price || price.planId !== plan.id) {
        throw new BadRequestException('Plan price not found for this plan');
      }
      if (!price.isActive) {
        throw new BadRequestException('Plan price is not active');
      }
      planPriceId = price.id;
      currentPeriodEnd = computePeriodEnd(start, price.billingInterval);
    }

    await this.repo.cancelActiveOrgSubscriptions(organizationId);
    await this.repo.createOrgSubscription({
      userId: actorUserId,
      organizationId,
      planId: plan.id,
      planPriceId,
      status: 'ACTIVE',
      provider: 'MANUAL',
      currentPeriodStart: start,
      currentPeriodEnd,
    });

    const dto = await this.getForOrg(organizationId);
    if (!dto) {
      // Unreachable: we just created an active subscription. Guards against a race/logic error.
      throw new ConflictException('Failed to provision the institution subscription');
    }
    return dto;
  }

  /** The org's active seat subscription + live usage, or null when none is provisioned. */
  async getForOrg(organizationId: string): Promise<OrgSubscriptionDto | null> {
    const sub = await this.repo.findActiveOrgSubscription(organizationId, new Date());
    if (!sub) {
      return null;
    }
    const seatsUsed = await this.repo.countOrgMembers(organizationId);
    return this.toDto(sub, seatsUsed);
  }

  /**
   * Enforce the org's seat cap before onboarding a new member. No-op when the org has no active
   * institution subscription or the plan has no seat cap. Throws 409 when the cap is reached.
   */
  async assertCanOnboard(organizationId: string): Promise<void> {
    const sub = await this.repo.findActiveOrgSubscription(organizationId, new Date());
    const seatLimit = sub?.plan.seatLimit ?? null;
    if (!sub || seatLimit == null) {
      return;
    }
    const seatsUsed = await this.repo.countOrgMembers(organizationId);
    if (seatsUsed >= seatLimit) {
      throw new ConflictException(
        `Seat limit reached for this institution (${seatsUsed}/${seatLimit}). ` +
          'Upgrade the plan to add seats.',
      );
    }
  }

  private toDto(sub: SubscriptionWithPlan, seatsUsed: number): OrgSubscriptionDto {
    const seatLimit = sub.plan.seatLimit ?? null;
    return {
      organizationId: sub.organizationId as string,
      subscriptionId: sub.id,
      planId: sub.planId,
      planCode: sub.plan.code,
      planName: sub.plan.name,
      status: sub.status,
      currentPeriodStart: sub.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
      seatLimit,
      seatsUsed,
      seatsAvailable: seatLimit == null ? null : Math.max(0, seatLimit - seatsUsed),
    };
  }
}
