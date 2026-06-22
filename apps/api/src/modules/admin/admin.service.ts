import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AdminRoleDto,
  type AdminUserDto,
  type AssignOrgSubscriptionInput,
  type CreateOrganizationInput,
  type CreateUserInput,
  type ListUsersQuery,
  type OrganizationDto,
  type OrgSubscriptionDto,
  type Paginated,
  type ReviewQuestionDto,
  type SetUserStatusInput,
  SystemRole,
  buildPaginationMeta,
  roleRank,
  rolesAboveRank,
  toSkipTake,
} from '@pharmacy/contracts';
import type { Organization, Question, Role, UserStatus } from '@prisma/client';
import { hash } from 'bcryptjs';
import { OrgSubscriptionService } from '../commerce/org-subscription.service';
import type { AuthenticatedUser } from '../identity/types/auth.types';
import { AdminRepository, type UserWithRoles } from './repositories/admin.repository';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AdminService {
  constructor(
    private readonly repo: AdminRepository,
    private readonly orgSubscriptions: OrgSubscriptionService,
  ) {}

  /** Super Admin operates across all organizations; everyone else is scoped to their own org. */
  private scopeOrgId(actor: AuthenticatedUser): string | undefined {
    if (actor.roles.includes(SystemRole.SUPER_ADMIN)) return undefined;
    return actor.organizationId ?? undefined;
  }

  /** Highest privilege rank the actor holds — the ceiling for what they may see and manage. */
  private actorRank(actor: AuthenticatedUser): number {
    return roleRank(actor.roles);
  }

  async listUsers(query: ListUsersQuery, actor: AuthenticatedUser): Promise<Paginated<AdminUserDto>> {
    const { skip, take } = toSkipTake(query);
    // Hide higher tiers: exclude users holding any role ranked above the actor's own rank.
    const excludeRoles = rolesAboveRank(this.actorRank(actor));
    const { items, total } = await this.repo.listUsers(
      query.search,
      skip,
      take,
      this.scopeOrgId(actor),
      excludeRoles,
    );
    return { items: items.map((u) => this.toUserDto(u)), meta: buildPaginationMeta(total, query) };
  }

  async getUser(id: string, actor: AuthenticatedUser): Promise<AdminUserDto> {
    return this.toUserDto(await this.requireUser(id, actor));
  }

  /** Admin-creates a user (active + email pre-verified) and optionally assigns a role. */
  async createUser(input: CreateUserInput, actor: AuthenticatedUser): Promise<AdminUserDto> {
    const isSuper = actor.roles.includes(SystemRole.SUPER_ADMIN);
    // Super admin may target any org (input.organizationId); everyone else is pinned to their own.
    let organizationId = isSuper ? (input.organizationId ?? actor.organizationId) : actor.organizationId;
    if (!organizationId) {
      const slug = process.env.DEFAULT_ORGANIZATION_SLUG ?? 'default';
      const org = await this.repo.findOrganizationBySlug(slug);
      if (!org) {
        throw new BadRequestException('Default organization not found — run the seeder');
      }
      organizationId = org.id;
    }

    // Enforce the institution's seat cap (no-op for the platform org / orgs without a seat plan).
    await this.orgSubscriptions.assertCanOnboard(organizationId);

    const email = input.email.trim().toLowerCase();
    if (await this.repo.findUserByEmail(email)) {
      throw new ConflictException('An account with this email already exists');
    }
    if (input.roleId) {
      const role = await this.repo.roleExists(input.roleId);
      if (!role) {
        throw new BadRequestException(`Role ${input.roleId} not found`);
      }
      this.assertCanGrantRole(role.name, actor);
    }

    const passwordHash = await hash(input.password, BCRYPT_ROUNDS);
    const user = await this.repo.createUser({
      organizationId,
      email,
      name: input.name.trim(),
      passwordHash,
      roleId: input.roleId,
    });
    return this.toUserDto(user);
  }

  async assignRole(userId: string, roleId: string, actor: AuthenticatedUser): Promise<AdminUserDto> {
    await this.requireUser(userId, actor);
    const role = await this.repo.roleExists(roleId);
    if (!role) {
      throw new BadRequestException(`Role ${roleId} not found`);
    }
    this.assertCanGrantRole(role.name, actor);
    await this.repo.addRole(userId, roleId);
    return this.getUser(userId, actor);
  }

  async removeRole(userId: string, roleId: string, actor: AuthenticatedUser): Promise<AdminUserDto> {
    await this.requireUser(userId, actor);
    await this.repo.removeRole(userId, roleId);
    return this.getUser(userId, actor);
  }

  async setStatus(userId: string, input: SetUserStatusInput, actor: AuthenticatedUser): Promise<AdminUserDto> {
    await this.requireUser(userId, actor);
    await this.repo.setStatus(userId, input.status as UserStatus);
    return this.getUser(userId, actor);
  }

  async listRoles(): Promise<AdminRoleDto[]> {
    return (await this.repo.listRoles()).map((r) => this.toRoleDto(r));
  }

  async reviewQueue(query: ListUsersQuery): Promise<Paginated<ReviewQuestionDto>> {
    const { skip, take } = toSkipTake(query);
    const { items, total } = await this.repo.listReviewQuestions(skip, take);
    return { items: items.map((q) => this.toReviewDto(q)), meta: buildPaginationMeta(total, query) };
  }

  // ── Organizations (multi-tenancy) ──
  async createOrganization(input: CreateOrganizationInput): Promise<OrganizationDto> {
    const slug = input.slug.trim().toLowerCase();
    if (await this.repo.findOrganizationBySlug(slug)) {
      throw new ConflictException(`An organization with slug "${slug}" already exists`);
    }
    const org = await this.repo.createOrganization({ name: input.name.trim(), slug });
    return this.toOrgDto(org, 0);
  }

  async listOrganizations(): Promise<OrganizationDto[]> {
    const { orgs, userCounts } = await this.repo.listOrganizations();
    return orgs.map((o) => this.toOrgDto(o, userCounts[o.id] ?? 0));
  }

  // ── Institutional seat subscription (Super-Admin provisions seats for an org) ──
  async provisionOrgSubscription(
    organizationId: string,
    input: AssignOrgSubscriptionInput,
    actor: AuthenticatedUser,
  ): Promise<OrgSubscriptionDto> {
    return this.orgSubscriptions.provision(organizationId, input, actor.id);
  }

  /** The org's active seat subscription + live usage, or null when none is provisioned. */
  async getOrgSubscription(organizationId: string): Promise<OrgSubscriptionDto | null> {
    return this.orgSubscriptions.getForOrg(organizationId);
  }

  private async requireUser(id: string, actor: AuthenticatedUser): Promise<UserWithRoles> {
    const user = await this.repo.findUserWithRoles(id);
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    const scope = this.scopeOrgId(actor);
    if (scope !== undefined && user.organizationId !== scope) {
      // Org-scoped admins must not see or act on users outside their organization.
      throw new NotFoundException(`User ${id} not found`);
    }
    // Hide higher tiers: a user above the actor's rank is treated as non-existent (no view/suspend/re-role).
    if (roleRank(user.userRoles.map((ur) => ur.role.name)) > this.actorRank(actor)) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  /** A non-super admin may only grant roles at or below their own rank (no privilege escalation). */
  private assertCanGrantRole(roleName: string, actor: AuthenticatedUser): void {
    if (roleRank([roleName]) > this.actorRank(actor)) {
      throw new ForbiddenException('You cannot grant a role above your own privilege level');
    }
  }

  private toUserDto(user: UserWithRoles): AdminUserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      roles: user.userRoles.map((ur) => ur.role.name),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private toRoleDto(role: Role): AdminRoleDto {
    return { id: role.id, name: role.name, description: role.description ?? null, isSystem: role.isSystem };
  }

  private toOrgDto(org: Organization, userCount: number): OrganizationDto {
    return {
      id: org.id,
      slug: org.slug,
      name: org.name,
      isActive: org.isActive,
      userCount,
      createdAt: org.createdAt.toISOString(),
    };
  }

  private toReviewDto(q: Question): ReviewQuestionDto {
    return {
      id: q.id,
      questionCode: q.questionCode,
      questionType: q.questionType,
      status: q.status,
      authorDifficulty: q.authorDifficulty,
      createdAt: q.createdAt.toISOString(),
    };
  }
}
