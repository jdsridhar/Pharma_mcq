import type { NotificationChannel } from '@prisma/client';

/** Job name + payload for asynchronous notification delivery. */
export const NOTIFICATION_DELIVER_JOB = 'notification.deliver';

export interface NotificationJobData {
  /** Present for persisted (in-app) notifications; absent for transactional one-offs. */
  notificationId?: string;
  channel: NotificationChannel;
  to: string;
  subject: string | null;
  body: string;
}
