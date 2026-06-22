import { Injectable, Logger } from '@nestjs/common';
import type { MailMessage, MailerPort } from '../ports/mailer.port';

/**
 * Development mail transport: records the message (including any verification/reset link)
 * to the application log instead of sending it. Swapped for a real SMTP/queue adapter in
 * the Notification domain (Phase 15) by re-binding the `MAILER` token.
 */
@Injectable()
export class LogMailer implements MailerPort {
  private readonly logger = new Logger('Mailer');

  async send(message: MailMessage): Promise<void> {
    this.logger.log(`[email->${message.to}] ${message.subject} :: ${message.text}`);
    await Promise.resolve();
  }
}
