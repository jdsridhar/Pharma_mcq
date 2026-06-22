import { DEMO_ACCOUNTS } from '@pharmacy/contracts';
import { UserStatus, type PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

/**
 * Seeds one demo user per system role, enabling the login page's one-click sign-in.
 * DEV ONLY — skipped in production (or when SEED_DEMO_USERS=false). Idempotent.
 */
export async function seedDemoUsers(prisma: PrismaClient, organizationId: string): Promise<void> {
  if (process.env.NODE_ENV === 'production' || process.env.SEED_DEMO_USERS === 'false') {
    // eslint-disable-next-line no-console
    console.log('[seed] demo users skipped (production or SEED_DEMO_USERS=false)');
    return;
  }

  for (const account of DEMO_ACCOUNTS) {
    const role = await prisma.role.findFirst({
      where: { name: account.role, organizationId: null },
    });
    if (!role) {
      throw new Error(`Demo seeding: role "${account.role}" missing — run the RBAC seeder first`);
    }

    let user = await prisma.user.findFirst({ where: { organizationId, email: account.email } });
    if (!user) {
      const passwordHash = await hash(account.password, 12);
      user = await prisma.user.create({
        data: {
          organizationId,
          email: account.email,
          name: `Demo ${account.label}`,
          passwordHash,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
        },
      });
    }

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }

  // eslint-disable-next-line no-console
  console.log(`[seed] demo users ready: ${DEMO_ACCOUNTS.length} accounts (one per role)`);
}
