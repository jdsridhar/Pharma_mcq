import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SystemRole } from '@pharmacy/contracts';
import type { OrgSubscriptionService } from '../commerce/org-subscription.service';
import type { AuthenticatedUser } from '../identity/types/auth.types';
import { AdminService } from './admin.service';
import type { AdminRepository, UserWithRoles } from './repositories/admin.repository';

const NOW = new Date('2026-01-01T00:00:00.000Z');

const superActor: AuthenticatedUser = {
  id: 'super',
  email: 'super@x.com',
  organizationId: null,
  roles: [SystemRole.SUPER_ADMIN],
  permissions: [],
};
const orgActor: AuthenticatedUser = {
  id: 'admin1',
  email: 'admin@org1.com',
  organizationId: 'org1',
  roles: [SystemRole.ADMIN],
  permissions: [],
};

function userWithRoles(overrides: Partial<UserWithRoles> = {}): UserWithRoles {
  return {
    id: 'u1',
    organizationId: 'org1',
    email: 'u1@b.com',
    mobile: null,
    name: 'User One',
    passwordHash: 'x',
    status: 'ACTIVE',
    emailVerifiedAt: null,
    lastLoginAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    userRoles: [{ role: { name: 'Student' } }],
    ...overrides,
  } as UserWithRoles;
}

function makeRepoMock() {
  return {
    listUsers: jest.fn(),
    findUserWithRoles: jest.fn(),
    findUserByEmail: jest.fn().mockResolvedValue(null),
    createUser: jest.fn(),
    roleExists: jest.fn(),
    addRole: jest.fn().mockResolvedValue(undefined),
    removeRole: jest.fn().mockResolvedValue(undefined),
    setStatus: jest.fn().mockResolvedValue(undefined),
    listRoles: jest.fn(),
    listReviewQuestions: jest.fn(),
    createOrganization: jest.fn(),
    findOrganizationBySlug: jest.fn(),
    listOrganizations: jest.fn(),
  };
}

function makeOrgSubMock() {
  return {
    assertCanOnboard: jest.fn().mockResolvedValue(undefined),
    provision: jest.fn(),
    getForOrg: jest.fn(),
  };
}

describe('AdminService', () => {
  let repo: ReturnType<typeof makeRepoMock>;
  let orgSub: ReturnType<typeof makeOrgSubMock>;
  let service: AdminService;

  beforeEach(() => {
    repo = makeRepoMock();
    orgSub = makeOrgSubMock();
    service = new AdminService(
      repo as unknown as AdminRepository,
      orgSub as unknown as OrgSubscriptionService,
    );
  });

  it('maps a user with role names', async () => {
    repo.findUserWithRoles.mockResolvedValue(userWithRoles());
    const dto = await service.getUser('u1', superActor);
    expect(dto).toMatchObject({ id: 'u1', email: 'u1@b.com', status: 'ACTIVE', roles: ['Student'] });
  });

  it('404s for a missing user', async () => {
    repo.findUserWithRoles.mockResolvedValue(null);
    await expect(service.getUser('missing', superActor)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assigns a role after validating it exists', async () => {
    repo.findUserWithRoles.mockResolvedValue(userWithRoles());
    repo.roleExists.mockResolvedValue({ id: 'role1' });
    await service.assignRole('u1', 'role1', superActor);
    expect(repo.addRole).toHaveBeenCalledWith('u1', 'role1');
  });

  it('rejects assigning a non-existent role (400)', async () => {
    repo.findUserWithRoles.mockResolvedValue(userWithRoles());
    repo.roleExists.mockResolvedValue(null);
    await expect(service.assignRole('u1', 'nope', superActor)).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.addRole).not.toHaveBeenCalled();
  });

  it('sets user status', async () => {
    repo.findUserWithRoles.mockResolvedValue(userWithRoles());
    await service.setStatus('u1', { status: 'SUSPENDED' }, superActor);
    expect(repo.setStatus).toHaveBeenCalledWith('u1', 'SUSPENDED');
  });

  // ── Multi-tenancy: org scoping ──
  it('hides a cross-org user from an org-scoped admin (404)', async () => {
    repo.findUserWithRoles.mockResolvedValue(userWithRoles({ organizationId: 'org2' }));
    await expect(service.getUser('u1', orgActor)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets an org-scoped admin act on a user in their own org', async () => {
    repo.findUserWithRoles.mockResolvedValue(userWithRoles({ organizationId: 'org1' }));
    const dto = await service.getUser('u1', orgActor);
    expect(dto.id).toBe('u1');
  });

  it('scopes listUsers to the actor org and excludes higher tiers for non-super-admins', async () => {
    repo.listUsers.mockResolvedValue({ items: [], total: 0 });
    await service.listUsers({ page: 1, pageSize: 20 } as never, orgActor);
    // Admin (rank 4) is scoped to org1 and never sees Super Admins.
    expect(repo.listUsers).toHaveBeenCalledWith(undefined, 0, 20, 'org1', [SystemRole.SUPER_ADMIN]);
  });

  it('does NOT scope listUsers (or exclude any tier) for super-admin', async () => {
    repo.listUsers.mockResolvedValue({ items: [], total: 0 });
    await service.listUsers({ page: 1, pageSize: 20 } as never, superActor);
    expect(repo.listUsers).toHaveBeenCalledWith(undefined, 0, 20, undefined, []);
  });

  // ── Privilege-tier guard: hide higher tiers ──
  it('hides a higher-tier user from a lower-tier admin (404)', async () => {
    repo.findUserWithRoles.mockResolvedValue(
      userWithRoles({ organizationId: 'org1', userRoles: [{ role: { name: SystemRole.SUPER_ADMIN } }] as UserWithRoles['userRoles'] }),
    );
    await expect(service.getUser('u1', orgActor)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets a super-admin view a super-admin account', async () => {
    repo.findUserWithRoles.mockResolvedValue(
      userWithRoles({ userRoles: [{ role: { name: SystemRole.SUPER_ADMIN } }] as UserWithRoles['userRoles'] }),
    );
    const dto = await service.getUser('u1', superActor);
    expect(dto.roles).toEqual([SystemRole.SUPER_ADMIN]);
  });

  it('blocks an admin from granting a role above their own rank (403)', async () => {
    repo.findUserWithRoles.mockResolvedValue(userWithRoles());
    repo.roleExists.mockResolvedValue({ id: 'rSuper', name: SystemRole.SUPER_ADMIN });
    await expect(service.assignRole('u1', 'rSuper', orgActor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.addRole).not.toHaveBeenCalled();
  });

  it('lets an admin grant a role at or below their own rank', async () => {
    repo.findUserWithRoles.mockResolvedValue(userWithRoles());
    repo.roleExists.mockResolvedValue({ id: 'rRev', name: SystemRole.REVIEWER });
    await service.assignRole('u1', 'rRev', orgActor);
    expect(repo.addRole).toHaveBeenCalledWith('u1', 'rRev');
  });

  it('blocks an admin from creating a user with a role above their rank (403)', async () => {
    repo.roleExists.mockResolvedValue({ id: 'rSuper', name: SystemRole.SUPER_ADMIN });
    await expect(
      service.createUser({ name: 'X', email: 'x@x.com', password: 'Password123', roleId: 'rSuper' }, orgActor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.createUser).not.toHaveBeenCalled();
  });

  it('createUser pins a non-super-admin to their own org (ignores input org)', async () => {
    repo.createUser.mockResolvedValue(userWithRoles());
    await service.createUser({ name: 'New', email: 'new@x.com', password: 'Password123', organizationId: 'other' }, orgActor);
    expect(repo.createUser).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'org1' }));
  });

  it('createUser lets super-admin target a specific org', async () => {
    repo.createUser.mockResolvedValue(userWithRoles());
    await service.createUser({ name: 'New', email: 'new@x.com', password: 'Password123', organizationId: 'org9' }, superActor);
    expect(repo.createUser).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'org9' }));
  });

  it('createUser enforces the org seat cap before creating (409 when full)', async () => {
    orgSub.assertCanOnboard.mockRejectedValue(new ConflictException('Seat limit reached'));
    await expect(
      service.createUser({ name: 'New', email: 'new@x.com', password: 'Password123' }, orgActor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(orgSub.assertCanOnboard).toHaveBeenCalledWith('org1');
    expect(repo.createUser).not.toHaveBeenCalled();
  });

  // ── Organizations ──
  it('creates an organization', async () => {
    repo.findOrganizationBySlug.mockResolvedValue(null);
    repo.createOrganization.mockResolvedValue({ id: 'o1', slug: 'acme', name: 'Acme', isActive: true, createdAt: NOW, updatedAt: NOW });
    const dto = await service.createOrganization({ name: 'Acme', slug: 'acme' });
    expect(dto).toMatchObject({ id: 'o1', slug: 'acme', name: 'Acme', userCount: 0 });
  });

  it('rejects a duplicate organization slug (409)', async () => {
    repo.findOrganizationBySlug.mockResolvedValue({ id: 'existing' });
    await expect(service.createOrganization({ name: 'Acme', slug: 'acme' })).rejects.toBeInstanceOf(ConflictException);
    expect(repo.createOrganization).not.toHaveBeenCalled();
  });

  it('lists organizations with user counts', async () => {
    repo.listOrganizations.mockResolvedValue({
      orgs: [{ id: 'o1', slug: 'acme', name: 'Acme', isActive: true, createdAt: NOW, updatedAt: NOW }],
      userCounts: { o1: 5 },
    });
    const list = await service.listOrganizations();
    expect(list).toEqual([expect.objectContaining({ id: 'o1', userCount: 5 })]);
  });
});
