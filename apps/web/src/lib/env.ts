import { z } from 'zod';

/**
 * Client-side env validation. Only NEXT_PUBLIC_* values are available in the browser;
 * Next.js inlines them at build time, so we read them explicitly (not via a loop).
 */
const clientEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:4000/api'),
  // Show the one-click demo-login buttons on the sign-in page. Default on; set to "false"
  // (e.g. in production) to hide them.
  NEXT_PUBLIC_ENABLE_DEMO_LOGINS: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),
});

export const clientEnv = clientEnvSchema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_ENABLE_DEMO_LOGINS: process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGINS,
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
