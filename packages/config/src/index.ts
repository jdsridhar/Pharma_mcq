import { z } from 'zod';

/**
 * @pharmacy/config — the single source of truth for server-side environment variables.
 *
 * Validated with Zod at process start so the API fails fast on misconfiguration
 * instead of erroring deep in a request. Keep this in sync with `.env.example`
 * and `docker-compose.yml`.
 */

const nodeEnv = z.enum(['development', 'test', 'production']);

export const serverEnvSchema = z
  .object({
    NODE_ENV: nodeEnv.default('development'),

    // HTTP
    API_PORT: z.coerce.number().int().positive().default(4000),
    API_GLOBAL_PREFIX: z.string().default('api'),
    APP_WEB_URL: z.string().url().default('http://localhost:3000'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    // Datastores (always required)
    DATABASE_URL: z.string().url(),
    // Optional least-privilege runtime connection (role `pharmacy_app`) that RLS applies to. When
    // set, the API connects with it and enforces Postgres Row-Level Security per request; when
    // unset, the API uses DATABASE_URL (RLS bypassed — owner/superuser). Migrations/seeds always
    // use DATABASE_URL. See apps/api/prisma/sql/rls.sql.
    APP_DATABASE_URL: z.string().url().optional(),
    REDIS_URL: z.string().url(),

    // Auth — secrets required; long random values in production
    JWT_ACCESS_SECRET: z.string().min(16),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_SECRET: z.string().min(16),
    JWT_REFRESH_TTL: z.string().default('30d'),
    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

    // Rate limiting (per IP, sliding window seconds)
    RATE_LIMIT_TTL: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_LIMIT: z.coerce.number().int().positive().default(120),

    // Object storage (S3-compatible; MinIO in dev)
    S3_ENDPOINT: z.string().url().optional(),
    S3_REGION: z.string().default('us-east-1'),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_BUCKET: z.string().default('pharmacy-media'),
    S3_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),

    // Mail (SMTP; MailHog in dev)
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().default('Pharmacy MCQ <no-reply@pharmacy-mcq.local>'),

    // Payments (Razorpay first; optional in dev — see ARCHITECTURE_REVIEW.md §7-C)
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

    // Multi-tenancy (single-tenant runtime; see §7-A). Default org used until activated.
    DEFAULT_ORGANIZATION_SLUG: z.string().default('default'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      const placeholders = ['changeme', 'dev-secret', 'secret', 'please-change'];
      for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
        const value = env[key].toLowerCase();
        if (env[key].length < 32 || placeholders.some((p) => value.includes(p))) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} must be a strong (>=32 char) non-placeholder secret in production`,
          });
        }
      }
      if (!env.RAZORPAY_KEY_SECRET || !env.RAZORPAY_WEBHOOK_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['RAZORPAY_KEY_SECRET'],
          message: 'Razorpay credentials are required in production',
        });
      }
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Parse + validate environment. Throws a readable aggregated error on failure.
 */
export function loadServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const parsed = serverEnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid server environment configuration:\n${issues}`);
  }
  return parsed.data;
}
