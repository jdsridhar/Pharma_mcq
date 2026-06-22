/**
 * Notification template registry. Pure render functions (key + payload → subject + body) —
 * no I/O, so they are unit-testable and shared by the dispatcher and the in-app feed.
 */
export interface RenderedTemplate {
  subject: string | null;
  body: string;
}

type Renderer = (payload: Record<string, unknown>) => RenderedTemplate;

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : fallback;
}

const TEMPLATES: Record<string, Renderer> = {
  welcome: (p) => ({
    subject: 'Welcome to the Pharmacy MCQ Platform',
    body: `Hi ${str(p.name, 'there')}, welcome aboard! Start practicing to track your mastery.`,
  }),
  email_verification: (p) => ({ subject: 'Verify your email', body: `Verify your email: ${str(p.link)}` }),
  password_reset: (p) => ({ subject: 'Reset your password', body: `Reset your password: ${str(p.link)}` }),
  subscription_active: (p) => ({
    subject: 'Your subscription is active',
    body: `Your ${str(p.plan, 'subscription')} is now active.`,
  }),
  revision_due: (p) => ({
    subject: 'Revision due',
    body: `You have ${str(p.count, '0')} item(s) due for revision.`,
  }),
  announcement: (p) => ({ subject: str(p.subject, 'Announcement'), body: str(p.body) }),
  generic: (p) => ({ subject: typeof p.subject === 'string' ? p.subject : null, body: str(p.body) }),
};

export function renderTemplate(key: string, payload: Record<string, unknown> | null | undefined): RenderedTemplate {
  const renderer = TEMPLATES[key] ?? TEMPLATES.generic;
  const safePayload = payload ?? {};
  return renderer ? renderer(safePayload) : { subject: null, body: str(safePayload.body) };
}
