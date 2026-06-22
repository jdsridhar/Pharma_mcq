/**
 * Outbound email port. The Identity domain depends on this abstraction, never on a
 * concrete transport. Phase 15 (Notification domain) provides an SMTP/queue-backed
 * adapter; until then `LogMailer` records messages to the log (dev transport).
 */
export const MAILER = 'IDENTITY_MAILER';

export interface MailMessage {
  to: string;
  subject: string;
  /** Plain-text body. Templated HTML is introduced with the Notification domain. */
  text: string;
}

export interface MailerPort {
  send(message: MailMessage): Promise<void>;
}
