import { SystemRole } from '@pharmacy/contracts';
import { UserStatus, type PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

/**
 * Seeds a Super Admin user. In production, requires SEED_SUPER_ADMIN_EMAIL +
 * SEED_SUPER_ADMIN_PASSWORD (skipped otherwise — never a default prod credential).
 * In development, falls back to a clearly-flagged dev credential for convenience.
 */
export async function seedSuperAdmin(prisma: PrismaClient, organizationId: string): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production';
  const email = process.env.SEED_SUPER_ADMIN_EMAIL ?? (isProd ? undefined : 'admin@pharmacy-mcq.local');
  const password =
    process.env.SEED_SUPER_ADMIN_PASSWORD ?? (isProd ? undefined : 'ChangeMe_Admin1');

  if (!email || !password) {
    // eslint-disable-next-line no-console
    console.log('[seed] super admin skipped (set SEED_SUPER_ADMIN_EMAIL/PASSWORD to enable)');
    return;
  }

  const role = await prisma.role.findFirst({
    where: { name: SystemRole.SUPER_ADMIN, organizationId: null },
  });
  if (!role) {
    throw new Error('Super Admin role missing — run the RBAC seeder first');
  }

  let user = await prisma.user.findFirst({ where: { organizationId, email } });
  if (!user) {
    const passwordHash = await hash(password, 12);
    user = await prisma.user.create({
      data: {
        organizationId,
        email,
        name: 'Super Admin',
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

  if (!process.env.SEED_SUPER_ADMIN_PASSWORD && !isProd) {
     
    console.warn(`[seed] DEV super admin -> ${email} / ${password}  (change before sharing)`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[seed] super admin ready: ${email}`);
  }
}
