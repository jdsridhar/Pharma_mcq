import { z } from 'zod';
import { paginationQuerySchema } from '../common/pagination';

/**
 * Notification contracts. Notifications are persisted (the in-app feed) and dispatched over a
 * channel (email/SMS/push/WhatsApp) by a queue worker. Templates render subject + body.
 */

export const NOTIFICATION_CHANNELS = ['EMAIL', 'SMS', 'PUSH', 'WHATSAPP'] as const;
export const notificationChannelSchema = z.enum(NOTIFICATION_CHANNELS);
export type NotificationChannelT = z.infer<typeof notificationChannelSchema>;

export const notificationStatusSchema = z.enum(['PENDING', 'SENT', 'FAILED', 'READ']);
export type NotificationStatusT = z.infer<typeof notificationStatusSchema>;

/** Admin/internal: send a templated notification to a user. */
export const sendNotificationSchema = z.object({
  userId: z.string().uuid(),
  channel: notificationChannelSchema.default('PUSH'),
  template: z.string().trim().min(1).max(64),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type SendNotificationInput = z.infer<typeof sendNotificationSchema>;

export const listNotificationsQuerySchema = paginationQuerySchema.extend({
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

// ── Response DTOs ──
export interface NotificationDto {
  id: string;
  channel: NotificationChannelT;
  template: string;
  status: NotificationStatusT;
  title: string | null;
  body: string;
  createdAt: string;
  sentAt: string | null;
  readAt: string | null;
}

export interface MarkAllReadResultDto {
  updated: number;
}
