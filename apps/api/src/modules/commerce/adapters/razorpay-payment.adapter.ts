import type { ServerEnv } from '@pharmacy/config';
import type { PaymentProvider } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CreateOrderInput, CreatedOrder, PaymentPort, WebhookEvent } from '../ports/payment.port';

/**
 * Razorpay adapter. Orders are created via the Razorpay REST API (basic auth); webhooks are
 * verified with HMAC-SHA256 over the raw body using the webhook secret. No SDK — uses global
 * `fetch` + `node:crypto`.
 */
export class RazorpayPaymentAdapter implements PaymentPort {
  readonly provider: PaymentProvider = 'RAZORPAY';

  constructor(private readonly env: ServerEnv) {}

  get publicKey(): string | null {
    return this.env.RAZORPAY_KEY_ID ?? null;
  }

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    const auth = Buffer.from(`${this.env.RAZORPAY_KEY_ID}:${this.env.RAZORPAY_KEY_SECRET}`).toString('base64');
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: input.amountMinor,
        currency: input.currency,
        receipt: input.idempotencyKey,
        notes: input.notes,
      }),
    });
    if (!response.ok) {
      throw new Error(`Razorpay order creation failed (${response.status})`);
    }
    const order = (await response.json()) as { id: string };
    return { providerOrderId: order.id, captured: false, raw: order };
  }

  verifyAndParseWebhook(rawBody: string, signature: string | undefined): WebhookEvent {
    const secret = this.env.RAZORPAY_WEBHOOK_SECRET ?? '';
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const provided = signature ?? '';
    const valid =
      provided.length === expected.length &&
      timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    if (!valid) {
      throw new Error('Invalid Razorpay webhook signature');
    }

    const event = JSON.parse(rawBody) as {
      event?: string;
      payload?: { payment?: { entity?: { id?: string; order_id?: string } } };
    };
    const entity = event.payload?.payment?.entity;
    return {
      providerOrderId: entity?.order_id ?? null,
      providerPaymentId: entity?.id ?? null,
      captured: event.event === 'payment.captured',
      raw: event,
    };
  }
}
