/**
 * Idempotent seeder. Orchestrates per-domain seeders. Safe to run repeatedly.
 *   Phase 1: default organization (single-tenant runtime)
 *   Phase 3: RBAC catalog (permissions + system roles) and an optional Super Admin
 */
import { PrismaClient } from '@prisma/client';
import { seedRbac } from './seeders/rbac.seeder';
import { seedSuperAdmin } from './seeders/admin.seeder';
import { seedDemoUsers } from './seeders/demo.seeder';
import { seedDemoContent } from './seeders/demo-content.seeder';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const slug = process.env.DEFAULT_ORGANIZATION_SLUG ?? 'default';

  const org = await prisma.organization.upsert({
    where: { slug },
    update: {},
    create: { slug, name: 'Default Organization' },
  });
  // eslint-disable-next-line no-console
  console.log(`[seed] default organization ready: ${org.slug} (${org.id})`);

  await seedRbac(prisma);
  await seedSuperAdmin(prisma, org.id);
  await seedDemoUsers(prisma, org.id);
  await seedDemoContent(prisma);
}

main()
  .catch((error) => {
     
    console.error('[seed] failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
