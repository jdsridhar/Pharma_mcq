import type { PaymentProvider } from '@prisma/client';

/**
 * Provider-agnostic payment port (§7-C). The Commerce domain depends only on this; concrete
 * adapters (Manual for dev, Razorpay for prod) are bound by an env factory.
 */
export const PAYMENT_PORT = 'COMMERCE_PAYMENT_PORT';

export interface CreateOrderInput {
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  userId: string;
  notes?: Record<string, string>;
}

export interface CreatedOrder {
  providerOrderId: string;
  providerPaymentId?: string;
  /** True when payment is already settled at order time (manual/dev). */
  captured: boolean;
  raw: unknown;
}

export interface WebhookEvent {
  providerOrderId: string | null;
  providerPaymentId: string | null;
  captured: boolean;
  raw: unknown;
}

export interface PaymentPort {
  readonly provider: PaymentProvider;
  /** Public/publishable key for client-side checkout (null for providers that don't need it). */
  readonly publicKey: string | null;
  createOrder(input: CreateOrderInput): Promise<CreatedOrder>;
  /** Verify the webhook signature and parse it; throws if the signature is invalid. */
  verifyAndParseWebhook(rawBody: string, signature: string | undefined): WebhookEvent;
}
