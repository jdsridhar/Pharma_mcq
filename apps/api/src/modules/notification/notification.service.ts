import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type ListNotificationsQuery,
  type MarkAllReadResultDto,
  type NotificationDto,
  type Paginated,
  type SendNotificationInput,
  buildPaginationMeta,
  toSkipTake,
} from '@pharmacy/contracts';
import { type Notification, type NotificationChannel, Prisma } from '@prisma/client';
import { NotificationProducer } from './notification.producer';
import { NotificationRepository } from './repositories/notification.repository';
import { renderTemplate } from './templates/templates';

@Injectable()
export class NotificationService {
  constructor(
    private readonly repo: NotificationRepository,
    private readonly producer: NotificationProducer,
  ) {}

  /** Create a persisted notification (in-app feed) and enqueue channel delivery. */
  async notify(input: SendNotificationInput): Promise<NotificationDto> {
    const contact = await this.repo.findUserContact(input.userId);
    if (!contact) {
      throw new NotFoundException(`User ${input.userId} not found`);
    }

    const payload = (input.payload ?? {}) as Record<string, unknown>;
    const notification = await this.repo.create({
      userId: input.userId,
      channel: input.channel,
      template: input.template,
      payload: payload as Prisma.InputJsonValue,
    });

    const recipient = this.recipientFor(input.channel, contact, input.userId);
    if (!recipient) {
      await this.repo.markFailed(notification.id, `No recipient for channel ${input.channel}`);
      return this.toDto({ ...notification, status: 'FAILED' });
    }

    const rendered = renderTemplate(input.template, payload);
    await this.producer.enqueue({
      notificationId: notification.id,
      channel: input.channel,
      to: recipient,
      subject: rendered.subject,
      body: rendered.body,
    });
    return this.toDto(notification);
  }

  /** Transactional one-off (no in-app row) — used by Identity for auth emails. */
  async sendTransactional(input: {
    to: string;
    channel: NotificationChannel;
    subject?: string;
    body: string;
  }): Promise<void> {
    await this.producer.enqueue({
      channel: input.channel,
      to: input.to,
      subject: input.subject ?? null,
      body: input.body,
    });
  }

  async listMine(userId: string, query: ListNotificationsQuery): Promise<Paginated<NotificationDto>> {
    const { skip, take } = toSkipTake(query);
    const { items, total } = await this.repo.listByUser(userId, query.unreadOnly, skip, take);
    return { items: items.map((n) => this.toDto(n)), meta: buildPaginationMeta(total, query) };
  }

  async markRead(userId: string, id: string): Promise<NotificationDto> {
    const notification = await this.repo.findById(id);
    if (!notification) {
      throw new NotFoundException(`Notification ${id} not found`);
    }
    if (notification.userId !== userId) {
      throw new ForbiddenException('Not your notification');
    }
    return this.toDto(await this.repo.updateRead(id));
  }

  async markAllRead(userId: string): Promise<MarkAllReadResultDto> {
    return { updated: await this.repo.markAllRead(userId) };
  }

  private recipientFor(
    channel: NotificationChannel,
    contact: { email: string; mobile: string | null },
    userId: string,
  ): string | null {
    switch (channel) {
      case 'EMAIL':
        return contact.email;
      case 'SMS':
      case 'WHATSAPP':
        return contact.mobile;
      case 'PUSH':
        return userId; // device-token registry is a future enhancement
      default:
        return null;
    }
  }

  private toDto(notification: Notification): NotificationDto {
    const rendered = renderTemplate(
      notification.template,
      (notification.payload ?? {}) as Record<string, unknown>,
    );
    return {
      id: notification.id,
      channel: notification.channel,
      template: notification.template,
      status: notification.status,
      title: rendered.subject,
      body: rendered.body,
      createdAt: notification.createdAt.toISOString(),
      sentAt: notification.sentAt?.toISOString() ?? null,
      readAt: notification.readAt?.toISOString() ?? null,
    };
  }
}
