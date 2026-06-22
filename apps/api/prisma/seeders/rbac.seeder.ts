import { ALL_PERMISSIONS, SYSTEM_ROLE_DEFINITIONS } from '@pharmacy/contracts';
import type { PrismaClient } from '@prisma/client';

/**
 * Idempotently seeds the permission catalog and the global (org-less) system roles,
 * reconciling each role's permission set to match the contract definitions exactly.
 */
export async function seedRbac(prisma: PrismaClient): Promise<void> {
  // 1) Permissions
  for (const key of ALL_PERMISSIONS) {
    const [resource, action] = key.split(':');
    if (!resource || !action) {
      throw new Error(`Malformed permission key "${key}" — expected "resource:action"`);
    }
    await prisma.permission.upsert({
      where: { key },
      update: { resource, action },
      create: { key, resource, action },
    });
  }

  // 2) System roles + their permission assignments
  for (const def of SYSTEM_ROLE_DEFINITIONS) {
    const existing = await prisma.role.findFirst({
      where: { name: def.name, organizationId: null },
    });
    const role = existing
      ? await prisma.role.update({
          where: { id: existing.id },
          data: { description: def.description, isSystem: true },
        })
      : await prisma.role.create({
          data: { name: def.name, description: def.description, isSystem: true },
        });

    const permissions = await prisma.permission.findMany({
      where: { key: { in: [...def.permissions] } },
      select: { id: true },
    });

    // Reconcile: clear then re-create so removed permissions don't linger.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }

  // eslint-disable-next-line no-console
  console.log(
    `[seed] RBAC ready: ${ALL_PERMISSIONS.length} permissions, ${SYSTEM_ROLE_DEFINITIONS.length} system roles`,
  );
}
