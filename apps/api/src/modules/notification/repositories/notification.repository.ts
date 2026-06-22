import { Injectable } from '@nestjs/common';
import {
  type Notification,
  type NotificationChannel,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';

@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    userId: string;
    organizationId?: string | null;
    channel: NotificationChannel;
    template: string;
    payload: Prisma.InputJsonValue;
  }): Promise<Notification> {
    return this.prisma.notification.create({ data: { ...data, status: 'PENDING' } });
  }

  findById(id: string): Promise<Notification | null> {
    return this.prisma.notification.findUnique({ where: { id } });
  }

  async listByUser(
    userId: string,
    unreadOnly: boolean | undefined,
    skip: number,
    take: number,
  ): Promise<{ items: Notification[]; total: number }> {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(unreadOnly ? { readAt: null } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.notification.count({ where }),
    ]);
    return { items, total };
  }

  async markSent(id: string): Promise<void> {
    await this.prisma.notification.update({ where: { id }, data: { status: 'SENT', sentAt: new Date() } });
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.prisma.notification.update({ where: { id }, data: { status: 'FAILED', error } });
  }

  updateRead(id: string): Promise<Notification> {
    return this.prisma.notification.update({
      where: { id },
      data: { status: 'READ', readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { status: 'READ', readAt: new Date() },
    });
    return result.count;
  }

  findUserContact(userId: string): Promise<{ email: string; mobile: string | null } | null> {
    return this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, mobile: true } });
  }
}
