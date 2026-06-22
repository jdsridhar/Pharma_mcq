import { ForbiddenException } from '@nestjs/common';
import type { Notification } from '@prisma/client';
import type { NotificationProducer } from './notification.producer';
import { NotificationService } from './notification.service';
import type { NotificationRepository } from './repositories/notification.repository';

const NOW = new Date('2026-01-01T00:00:00.000Z');

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'n1',
    organizationId: null,
    userId: 'u1',
    channel: 'EMAIL',
    template: 'welcome',
    payload: { name: 'Asha' },
    status: 'PENDING',
    sentAt: null,
    readAt: null,
    error: null,
    createdAt: NOW,
    ...overrides,
  } as Notification;
}

function makeRepoMock() {
  return {
    findUserContact: jest.fn(),
    create: jest.fn(),
    markFailed: jest.fn().mockResolvedValue(undefined),
    markSent: jest.fn(),
    findById: jest.fn(),
    updateRead: jest.fn(),
    markAllRead: jest.fn(),
    listByUser: jest.fn(),
  };
}

describe('NotificationService', () => {
  let repo: ReturnType<typeof makeRepoMock>;
  let producer: { enqueue: jest.Mock };
  let service: NotificationService;

  beforeEach(() => {
    repo = makeRepoMock();
    producer = { enqueue: jest.fn().mockResolvedValue(undefined) };
    service = new NotificationService(
      repo as unknown as NotificationRepository,
      producer as unknown as NotificationProducer,
    );
  });

  it('creates a notification and enqueues delivery with the rendered template', async () => {
    repo.findUserContact.mockResolvedValue({ email: 'a@b.com', mobile: null });
    repo.create.mockResolvedValue(notification());

    const dto = await service.notify({ userId: 'u1', channel: 'EMAIL', template: 'welcome', payload: { name: 'Asha' } });
    expect(dto.title).toContain('Welcome');
    expect(producer.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ notificationId: 'n1', channel: 'EMAIL', to: 'a@b.com' }),
    );
  });

  it('fails the notification when the channel has no recipient', async () => {
    repo.findUserContact.mockResolvedValue({ email: 'a@b.com', mobile: null });
    repo.create.mockResolvedValue(notification({ channel: 'SMS', template: 'revision_due' }));

    const dto = await service.notify({ userId: 'u1', channel: 'SMS', template: 'revision_due', payload: { count: 3 } });
    expect(repo.markFailed).toHaveBeenCalledWith('n1', expect.stringContaining('No recipient'));
    expect(producer.enqueue).not.toHaveBeenCalled();
    expect(dto.status).toBe('FAILED');
  });

  it('forbids marking another user’s notification as read', async () => {
    repo.findById.mockResolvedValue(notification({ userId: 'someone-else' }));
    await expect(service.markRead('u1', 'n1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('marks a notification read', async () => {
    repo.findById.mockResolvedValue(notification());
    repo.updateRead.mockResolvedValue(notification({ status: 'READ', readAt: NOW }));
    const dto = await service.markRead('u1', 'n1');
    expect(dto.status).toBe('READ');
    expect(dto.readAt).toBe(NOW.toISOString());
  });
});
