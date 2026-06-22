import { Injectable } from '@nestjs/common';
import type { MailMessage, MailerPort } from '../../identity/ports/mailer.port';
import { NotificationService } from '../notification.service';

/**
 * Bridges Identity's `MailerPort` to the Notification domain: auth emails (verification,
 * password reset) are dispatched through the notification pipeline (EMAIL channel).
 */
@Injectable()
export class NotificationMailer implements MailerPort {
  constructor(private readonly notifications: NotificationService) {}

  async send(message: MailMessage): Promise<void> {
    await this.notifications.sendTransactional({
      to: message.to,
      channel: 'EMAIL',
      subject: message.subject,
      body: message.text,
    });
  }
}
