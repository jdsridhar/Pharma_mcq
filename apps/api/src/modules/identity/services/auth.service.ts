import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  type AuthResult,
  DEFAULT_REGISTRATION_ROLE,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
  type UserPublic,
} from '@pharmacy/contracts';
import type { ServerEnv } from '@pharmacy/config';
import { type User, UserStatus } from '@prisma/client';
import { APP_ENV } from '../../../config/app-config.module';
import { MAILER, type MailerPort } from '../ports/mailer.port';
import { OrganizationRepository } from '../repositories/organization.repository';
import { UsersRepository } from '../repositories/users.repository';
import type { RequestMeta } from './token.service';
import { PasswordService } from './password.service';
import { RbacService } from './rbac.service';
import { TokenService } from './token.service';
import { VerificationService } from './verification.service';

export interface SessionResult {
  result: AuthResult;
  /** Raw refresh token — the controller writes it to an httpOnly cookie. */
  refreshToken: string;
}

/**
 * Orchestrates the Identity domain's use-cases. Delegates hashing, tokens, RBAC and
 * verification to focused services so each concern stays independently testable.
 */
@Injectable()
export class AuthService {
  private defaultOrgId: string | null = null;
  /** Small cache of institution id → name for the auth payload (names change rarely). */
  private readonly orgNameById = new Map<string, string | null>();

  constructor(
    private readonly users: UsersRepository,
    private readonly organizations: OrganizationRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly rbac: RbacService,
    private readonly verification: VerificationService,
    @Inject(MAILER) private readonly mailer: MailerPort,
    @Inject(APP_ENV) private readonly env: ServerEnv,
  ) {}

  async register(input: RegisterInput, meta: RequestMeta): Promise<SessionResult> {
    const organizationId = await this.resolveDefaultOrgId();

    const existing = await this.users.findByEmailGlobal(input.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.users.create({
      organizationId,
      email: input.email,
      name: input.name,
      passwordHash,
      mobile: input.mobile,
    });

    const role = await this.rbac.findSystemRoleByName(DEFAULT_REGISTRATION_ROLE);
    if (role) {
      await this.users.addRole(user.id, role.id);
    }

    await this.sendEmailVerification(user);
    return this.buildSession(user, meta);
  }

  async login(input: LoginInput, meta: RequestMeta): Promise<SessionResult> {
    // Multi-tenant: resolve the account by email across ALL organizations (institution users too).
    const user = await this.users.findByEmailGlobal(input.email.trim().toLowerCase());
    // Compare against a found hash, or a throwaway to keep timing uniform.
    const hash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinv';
    const passwordOk = await this.passwords.compare(input.password, hash);
    if (!user || !passwordOk) {
      throw new UnauthorizedException('Invalid email or password');
    }

    this.assertLoginable(user);
    await this.users.update(user.id, { lastLoginAt: new Date() });
    return this.buildSession(user, meta);
  }

  async refresh(rawRefreshToken: string, meta: RequestMeta): Promise<SessionResult> {
    const rotated = await this.tokens.rotateRefreshToken(rawRefreshToken, meta);
    const user = await this.users.findActiveById(rotated.userId);
    if (!user) {
      await this.tokens.revokeAllForUser(rotated.userId);
      throw new UnauthorizedException('User no longer exists');
    }
    this.assertLoginable(user);

    const { roles, permissions } = await this.rbac.resolveAccess(user.id);
    const access = await this.tokens.signAccessToken({
      userId: user.id,
      email: user.email,
      orgId: user.organizationId,
      roles,
      permissions,
    });
    return {
      result: {
        user: await this.toPublic(user, roles, permissions),
        accessToken: access.accessToken,
        tokenType: 'Bearer',
        expiresIn: access.expiresIn,
      },
      refreshToken: rotated.rawToken,
    };
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (rawRefreshToken) {
      await this.tokens.revokeByRawToken(rawRefreshToken);
    }
  }

  async me(userId: string): Promise<UserPublic> {
    const user = await this.users.findActiveById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const { roles, permissions } = await this.rbac.resolveAccess(user.id);
    return this.toPublic(user, roles, permissions);
  }

  async verifyEmail(rawToken: string): Promise<void> {
    const userId = await this.verification.consumeEmailVerificationToken(rawToken);
    await this.users.update(userId, {
      emailVerifiedAt: new Date(),
      status: UserStatus.ACTIVE,
    });
  }

  async resendVerification(userId: string): Promise<void> {
    const user = await this.users.findActiveById(userId);
    if (user && !user.emailVerifiedAt) {
      await this.sendEmailVerification(user);
    }
  }

  /** Always succeeds (no user enumeration); only sends mail if the account exists. */
  async forgotPassword(input: ForgotPasswordInput): Promise<void> {
    const organizationId = await this.resolveDefaultOrgId();
    const user = await this.users.findByEmail(organizationId, input.email);
    if (!user) {
      return;
    }
    const token = await this.verification.issuePasswordResetToken(user.id);
    const link = `${this.env.APP_WEB_URL}/auth/reset-password?token=${token}`;
    await this.mailer.send({
      to: user.email,
      subject: 'Reset your password',
      text: `Reset your password using this link (valid for 1 hour): ${link}`,
    });
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const userId = await this.verification.consumePasswordResetToken(input.token);
    const passwordHash = await this.passwords.hash(input.password);
    await this.users.update(userId, { passwordHash });
    // Invalidate all existing sessions after a password change.
    await this.tokens.revokeAllForUser(userId);
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private assertLoginable(user: User): void {
    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException('Account suspended');
    }
    if (user.status === UserStatus.INACTIVE) {
      throw new ForbiddenException('Account inactive');
    }
  }

  private async buildSession(user: User, meta: RequestMeta): Promise<SessionResult> {
    const { roles, permissions } = await this.rbac.resolveAccess(user.id);
    const access = await this.tokens.signAccessToken({
      userId: user.id,
      email: user.email,
      orgId: user.organizationId,
      roles,
      permissions,
    });
    const refreshToken = await this.tokens.issueRefreshToken(user.id, meta);
    return {
      result: {
        user: await this.toPublic(user, roles, permissions),
        accessToken: access.accessToken,
        tokenType: 'Bearer',
        expiresIn: access.expiresIn,
      },
      refreshToken,
    };
  }

  private async sendEmailVerification(user: User): Promise<void> {
    const token = await this.verification.issueEmailVerificationToken(user.id);
    const link = `${this.env.APP_WEB_URL}/auth/verify-email?token=${token}`;
    await this.mailer.send({
      to: user.email,
      subject: 'Verify your email',
      text: `Welcome to the Pharmacy MCQ Platform. Verify your email: ${link}`,
    });
  }

  private async toPublic(user: User, roles: string[], permissions: string[]): Promise<UserPublic> {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      emailVerified: user.emailVerifiedAt !== null,
      organizationId: user.organizationId,
      organizationName: await this.resolveOrgName(user.organizationId),
      roles,
      permissions,
    };
  }

  /** Institution name for a user's org; null for the platform (default) org or no org. */
  private async resolveOrgName(organizationId: string | null): Promise<string | null> {
    if (!organizationId) {
      return null;
    }
    if (organizationId === (await this.resolveDefaultOrgId())) {
      return null;
    }
    if (this.orgNameById.has(organizationId)) {
      return this.orgNameById.get(organizationId) ?? null;
    }
    const org = await this.organizations.findById(organizationId);
    const name = org?.name ?? null;
    this.orgNameById.set(organizationId, name);
    return name;
  }

  private async resolveDefaultOrgId(): Promise<string> {
    if (this.defaultOrgId) {
      return this.defaultOrgId;
    }
    const org = await this.organizations.findBySlug(this.env.DEFAULT_ORGANIZATION_SLUG);
    if (!org) {
      throw new Error(
        `Default organization "${this.env.DEFAULT_ORGANIZATION_SLUG}" not found — run the seeder (pnpm db:seed).`,
      );
    }
    this.defaultOrgId = org.id;
    return org.id;
  }
}
