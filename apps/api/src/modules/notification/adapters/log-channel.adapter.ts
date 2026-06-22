import { Logger } from '@nestjs/common';
import type { NotificationChannel } from '@prisma/client';
import type { ChannelMessage, NotificationChannelPort } from '../ports/notification-channel.port';

/**
 * Development channel transport: records the message to the log instead of sending it.
 * Production swaps in SMTP/Twilio/FCM adapters by re-keying the channel registry.
 */
export class LogChannelAdapter implements NotificationChannelPort {
  private readonly logger = new Logger('Notification');

  constructor(readonly channel: NotificationChannel) {}

  async send(message: ChannelMessage): Promise<void> {
    this.logger.log(`[${this.channel}->${message.to}] ${message.subject ?? ''} :: ${message.body}`);
    await Promise.resolve();
  }
}
