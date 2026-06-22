import { Injectable } from '@nestjs/common';
import {
  type BillingInterval,
  type Feature,
  type Organization,
  type Payment,
  type PaymentProvider,
  type PaymentStatus,
  type Plan,
  type PlanPrice,
  Prisma,
  type Subscription,
  type SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';

const planDetailInclude = Prisma.validator<Prisma.PlanInclude>()({
  prices: { orderBy: { amountMinor: 'asc' } },
  features: { include: { feature: true } },
});
export type PlanDetail = Prisma.PlanGetPayload<{ include: typeof planDetailInclude }>;

const activePlanInclude = Prisma.validator<Prisma.PlanInclude>()({
  prices: { where: { isActive: true }, orderBy: { amountMinor: 'asc' } },
  features: { include: { feature: true } },
});
export type ActivePlan = Prisma.PlanGetPayload<{ include: typeof activePlanInclude }>;

const subscriptionWithPlanInclude = Prisma.validator<Prisma.SubscriptionInclude>()({
  plan: { include: { features: { include: { feature: true } } } },
});
export type SubscriptionWithPlan = Prisma.SubscriptionGetPayload<{
  include: typeof subscriptionWithPlanInclude;
}>;

@Injectable()
export class CommerceRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Plans ──
  createPlan(data: {
    code: string;
    name: string;
    description?: string;
    isActive: boolean;
    seatLimit?: number | null;
  }): Promise<Plan> {
    return this.prisma.plan.create({ data });
  }

  findPlanById(id: string): Promise<Plan | null> {
    return this.prisma.plan.findUnique({ where: { id } });
  }

  findPlanDetail(id: string): Promise<PlanDetail | null> {
    return this.prisma.plan.findUnique({ where: { id }, include: planDetailInclude });
  }

  listActivePlans(): Promise<ActivePlan[]> {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      include: activePlanInclude,
    });
  }

  updatePlan(id: string, data: Prisma.PlanUpdateInput): Promise<Plan> {
    return this.prisma.plan.update({ where: { id }, data });
  }

  // ── Prices ──
  createPrice(data: {
    planId: string;
    billingInterval: BillingInterval;
    amountMinor: number;
    currency: string;
    isActive: boolean;
  }): Promise<PlanPrice> {
    return this.prisma.planPrice.create({ data });
  }

  findPriceById(id: string): Promise<(PlanPrice & { plan: Plan }) | null> {
    return this.prisma.planPrice.findUnique({ where: { id }, include: { plan: true } });
  }

  updatePrice(id: string, data: Prisma.PlanPriceUpdateInput): Promise<PlanPrice> {
    return this.prisma.planPrice.update({ where: { id }, data });
  }

  // ── Features ──
  createFeature(data: { key: string; name: string; description?: string }): Promise<Feature> {
    return this.prisma.feature.create({ data });
  }

  listFeatures(): Promise<Feature[]> {
    return this.prisma.feature.findMany({ orderBy: { key: 'asc' } });
  }

  findFeaturesByKeys(keys: string[]): Promise<Feature[]> {
    return this.prisma.feature.findMany({ where: { key: { in: keys } } });
  }

  async setPlanFeatures(
    planId: string,
    items: { featureId: string; limit: number | null }[],
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.planFeature.deleteMany({ where: { planId } }),
      this.prisma.planFeature.createMany({
        data: items.map((i) => ({ planId, featureId: i.featureId, limit: i.limit })),
        skipDuplicates: true,
      }),
    ]);
  }

  // ── Payments ──
  createPayment(data: {
    userId: string;
    organizationId?: string | null;
    provider: PaymentProvider;
    providerOrderId?: string;
    providerPaymentId?: string;
    amountMinor: number;
    currency: string;
    status: PaymentStatus;
    idempotencyKey: string;
    rawPayload: Prisma.InputJsonValue;
  }): Promise<Payment> {
    return this.prisma.payment.create({ data });
  }

  findPaymentByOrderId(providerOrderId: string): Promise<Payment | null> {
    return this.prisma.payment.findFirst({ where: { providerOrderId } });
  }

  updatePayment(id: string, data: Prisma.PaymentUpdateInput): Promise<Payment> {
    return this.prisma.payment.update({ where: { id }, data });
  }

  // ── Subscriptions ──
  createSubscription(data: {
    userId: string;
    planId: string;
    planPriceId: string;
    status: SubscriptionStatus;
    provider: PaymentProvider;
    currentPeriodStart: Date;
    currentPeriodEnd: Date | null;
  }): Promise<Subscription> {
    return this.prisma.subscription.create({ data });
  }

  findActiveSubscription(userId: string, now: Date): Promise<SubscriptionWithPlan | null> {
    return this.prisma.subscription.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
      include: subscriptionWithPlanInclude,
    });
  }

  listUserSubscriptions(userId: string): Promise<Subscription[]> {
    return this.prisma.subscription.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  // ── Institutional (org) subscriptions + seats ──
  createOrgSubscription(data: {
    userId: string;
    organizationId: string;
    planId: string;
    planPriceId?: string | null;
    status: SubscriptionStatus;
    provider: PaymentProvider;
    currentPeriodStart: Date;
    currentPeriodEnd: Date | null;
  }): Promise<Subscription> {
    return this.prisma.subscription.create({ data });
  }

  /** The org's current active seat subscription (period not expired), most recent first. */
  findActiveOrgSubscription(organizationId: string, now: Date): Promise<SubscriptionWithPlan | null> {
    return this.prisma.subscription.findFirst({
      where: {
        organizationId,
        status: 'ACTIVE',
        OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
      include: subscriptionWithPlanInclude,
    });
  }

  /** Cancel any active subscriptions for an org (used when (re)provisioning a plan). */
  async cancelActiveOrgSubscriptions(organizationId: string): Promise<void> {
    await this.prisma.subscription.updateMany({
      where: { organizationId, status: 'ACTIVE' },
      data: { status: 'CANCELLED' },
    });
  }

  findOrganizationById(id: string): Promise<Organization | null> {
    return this.prisma.organization.findUnique({ where: { id } });
  }

  /** Live seat usage = non-deleted member accounts in the organization. */
  countOrgMembers(organizationId: string): Promise<number> {
    return this.prisma.user.count({ where: { organizationId, deletedAt: null } });
  }
}
