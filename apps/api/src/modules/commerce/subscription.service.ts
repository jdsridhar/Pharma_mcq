import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  BillingIntervalT,
  CheckoutResultDto,
  SubscribeInput,
  SubscriptionDto,
} from '@pharmacy/contracts';
import { type BillingInterval, type PaymentProvider, Prisma, type Subscription } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { computePeriodEnd } from './billing/period';
import { PAYMENT_PORT, type PaymentPort, type WebhookEvent } from './ports/payment.port';
import { CommerceRepository } from './repositories/commerce.repository';

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly repo: CommerceRepository,
    @Inject(PAYMENT_PORT) private readonly payment: PaymentPort,
  ) {}

  async subscribe(
    userId: string,
    organizationId: string | null,
    input: SubscribeInput,
  ): Promise<CheckoutResultDto> {
    const price = await this.repo.findPriceById(input.planPriceId);
    if (!price || !price.isActive) {
      throw new NotFoundException('Plan price not found or inactive');
    }
    if (!price.plan.isActive) {
      throw new BadRequestException('Plan is not active');
    }

    const idempotencyKey = randomUUID();
    const order = await this.payment.createOrder({
      amountMinor: price.amountMinor,
      currency: price.currency,
      idempotencyKey,
      userId,
    });

    const payment = await this.repo.createPayment({
      userId,
      organizationId,
      provider: this.payment.provider,
      providerOrderId: order.providerOrderId,
      providerPaymentId: order.providerPaymentId,
      amountMinor: price.amountMinor,
      currency: price.currency,
      status: order.captured ? 'CAPTURED' : 'CREATED',
      idempotencyKey,
      rawPayload: {
        planId: price.planId,
        planPriceId: price.id,
        billingInterval: price.billingInterval,
      } as Prisma.InputJsonValue,
    });

    const orderDto = {
      provider: this.payment.provider,
      providerOrderId: order.providerOrderId,
      amountMinor: price.amountMinor,
      currency: price.currency,
      keyId: this.payment.publicKey,
    };

    if (order.captured) {
      const subscription = await this.activate(
        payment.id,
        userId,
        price.planId,
        price.id,
        price.billingInterval,
        this.payment.provider,
      );
      return { status: 'ACTIVE', subscription: this.toDto(subscription), order: orderDto };
    }

    return { status: 'PENDING', subscription: null, order: orderDto };
  }

  /** Provider webhook → capture payment + activate the subscription. Idempotent. */
  async handleWebhook(
    provider: string,
    rawBody: string,
    signature: string | undefined,
  ): Promise<{ ok: true }> {
    if (provider.toUpperCase() !== this.payment.provider) {
      throw new NotFoundException(`Unsupported payment provider: ${provider}`);
    }

    let event: WebhookEvent;
    try {
      event = this.payment.verifyAndParseWebhook(rawBody, signature);
    } catch {
      throw new BadRequestException('Invalid webhook signature');
    }
    if (!event.captured || !event.providerOrderId) {
      return { ok: true };
    }

    const payment = await this.repo.findPaymentByOrderId(event.providerOrderId);
    if (!payment || payment.status === 'CAPTURED') {
      return { ok: true }; // unknown or already processed
    }

    await this.repo.updatePayment(payment.id, {
      status: 'CAPTURED',
      providerPaymentId: event.providerPaymentId ?? payment.providerPaymentId,
      rawPayload: event.raw as Prisma.InputJsonValue,
    });

    const meta = (payment.rawPayload ?? {}) as {
      planId?: string;
      planPriceId?: string;
      billingInterval?: BillingIntervalT;
    };
    if (meta.planId && meta.planPriceId && meta.billingInterval) {
      await this.activate(
        payment.id,
        payment.userId,
        meta.planId,
        meta.planPriceId,
        meta.billingInterval,
        payment.provider,
      );
    }
    return { ok: true };
  }

  async listMine(userId: string): Promise<SubscriptionDto[]> {
    const subs = await this.repo.listUserSubscriptions(userId);
    return subs.map((s) => this.toDto(s));
  }

  private async activate(
    paymentId: string,
    userId: string,
    planId: string,
    planPriceId: string,
    interval: BillingInterval,
    provider: PaymentProvider,
  ): Promise<Subscription> {
    const start = new Date();
    const subscription = await this.repo.createSubscription({
      userId,
      planId,
      planPriceId,
      status: 'ACTIVE',
      provider,
      currentPeriodStart: start,
      currentPeriodEnd: computePeriodEnd(start, interval),
    });
    await this.repo.updatePayment(paymentId, { subscription: { connect: { id: subscription.id } } });
    return subscription;
  }

  private toDto(s: Subscription): SubscriptionDto {
    return {
      id: s.id,
      planId: s.planId,
      planPriceId: s.planPriceId ?? null,
      status: s.status,
      provider: s.provider,
      currentPeriodStart: s.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      createdAt: s.createdAt.toISOString(),
    };
  }
}
