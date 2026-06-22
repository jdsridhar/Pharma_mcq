import type { NotificationChannel } from '@prisma/client';

/** A delivery channel (email/SMS/push/WhatsApp). Adapters are dev Log transports until real
 * providers are wired (SMTP, Twilio, FCM, …). */
export interface ChannelMessage {
  to: string;
  subject?: string;
  body: string;
}

export interface NotificationChannelPort {
  readonly channel: NotificationChannel;
  send(message: ChannelMessage): Promise<void>;
}

/** DI token for the channel registry: a Map keyed by channel. */
export const CHANNEL_REGISTRY = 'NOTIFICATION_CHANNEL_REGISTRY';
export type ChannelRegistry = Map<NotificationChannel, NotificationChannelPort>;
