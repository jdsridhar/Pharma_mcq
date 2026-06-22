import type { PaymentProvider } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { CreateOrderInput, CreatedOrder, PaymentPort, WebhookEvent } from '../ports/payment.port';

/**
 * Development/manual payment adapter: "orders" settle immediately (no external gateway).
 * Used when Razorpay credentials are absent. Never use in production.
 */
export class ManualPaymentAdapter implements PaymentPort {
  readonly provider: PaymentProvider = 'MANUAL';
  readonly publicKey: string | null = null;

  async createOrder(_input: CreateOrderInput): Promise<CreatedOrder> {
    await Promise.resolve();
    return {
      providerOrderId: `manual_${randomUUID()}`,
      providerPaymentId: `mpay_${randomUUID()}`,
      captured: true,
      raw: { manual: true },
    };
  }

  verifyAndParseWebhook(rawBody: string, _signature: string | undefined): WebhookEvent {
    const data = JSON.parse(rawBody || '{}') as {
      orderId?: string;
      paymentId?: string;
      captured?: boolean;
    };
    return {
      providerOrderId: data.orderId ?? null,
      providerPaymentId: data.paymentId ?? null,
      captured: data.captured === true,
      raw: data,
    };
  }
}
