import type { Payment, PlanPrice, Plan, Subscription } from '@prisma/client';
import type { PaymentPort } from './ports/payment.port';
import type { CommerceRepository } from './repositories/commerce.repository';
import { SubscriptionService } from './subscription.service';

const NOW = new Date('2026-01-01T00:00:00.000Z');

function price(overrides: Partial<PlanPrice & { plan: Plan }> = {}): PlanPrice & { plan: Plan } {
  return {
    id: 'price1',
    planId: 'plan1',
    billingInterval: 'MONTHLY',
    amountMinor: 10000,
    currency: 'INR',
    isActive: true,
    createdAt: NOW,
    plan: {
      id: 'plan1',
      code: 'PRO',
      name: 'Pro',
      description: null,
      isActive: true,
      createdAt: NOW,
      updatedAt: NOW,
    },
    ...overrides,
  } as PlanPrice & { plan: Plan };
}

function subscription(): Subscription {
  return {
    id: 'sub1',
    userId: 'u1',
    organizationId: null,
    planId: 'plan1',
    planPriceId: 'price1',
    status: 'ACTIVE',
    provider: 'MANUAL',
    providerSubscriptionId: null,
    currentPeriodStart: NOW,
    currentPeriodEnd: NOW,
    cancelAtPeriodEnd: false,
    createdAt: NOW,
    updatedAt: NOW,
  } as Subscription;
}

function makeRepoMock() {
  return {
    findPriceById: jest.fn(),
    createPayment: jest.fn().mockResolvedValue({ id: 'pay1' } as Payment),
    createSubscription: jest.fn().mockResolvedValue(subscription()),
    updatePayment: jest.fn().mockResolvedValue({} as Payment),
    findPaymentByOrderId: jest.fn(),
    listUserSubscriptions: jest.fn(),
  };
}

function makePortMock(captured: boolean): PaymentPort {
  return {
    provider: 'MANUAL',
    publicKey: null,
    createOrder: jest.fn().mockResolvedValue({
      providerOrderId: 'o1',
      providerPaymentId: 'p1',
      captured,
      raw: {},
    }),
    verifyAndParseWebhook: jest.fn(),
  } as unknown as PaymentPort;
}

describe('SubscriptionService', () => {
  let repo: ReturnType<typeof makeRepoMock>;

  beforeEach(() => {
    repo = makeRepoMock();
  });

  it('activates immediately when the order is captured (manual)', async () => {
    repo.findPriceById.mockResolvedValue(price());
    const service = new SubscriptionService(
      repo as unknown as CommerceRepository,
      makePortMock(true),
    );

    const result = await service.subscribe('u1', null, { planPriceId: 'price1' });
    expect(result.status).toBe('ACTIVE');
    expect(result.subscription).not.toBeNull();
    expect(repo.createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ACTIVE', planId: 'plan1', planPriceId: 'price1' }),
    );
    expect(repo.updatePayment).toHaveBeenCalled();
  });

  it('stays pending when the order is not captured (gateway)', async () => {
    repo.findPriceById.mockResolvedValue(price());
    const service = new SubscriptionService(
      repo as unknown as CommerceRepository,
      makePortMock(false),
    );

    const result = await service.subscribe('u1', null, { planPriceId: 'price1' });
    expect(result.status).toBe('PENDING');
    expect(result.subscription).toBeNull();
    expect(repo.createSubscription).not.toHaveBeenCalled();
  });

  it('webhook is idempotent for an already-captured payment', async () => {
    repo.findPaymentByOrderId.mockResolvedValue({ id: 'pay1', status: 'CAPTURED' } as Payment);
    const port = makePortMock(false);
    (port.verifyAndParseWebhook as jest.Mock).mockReturnValue({
      providerOrderId: 'o1',
      providerPaymentId: 'p1',
      captured: true,
      raw: {},
    });
    const service = new SubscriptionService(repo as unknown as CommerceRepository, port);

    await service.handleWebhook('manual', '{}', undefined);
    expect(repo.createSubscription).not.toHaveBeenCalled();
  });
});
