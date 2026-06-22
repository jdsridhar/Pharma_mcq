import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { NotificationMailer } from '../notification/adapters/notification-mailer';
import { NotificationModule } from '../notification/notification.module';
import { AccountController } from './controllers/account.controller';
import { AuthController } from './controllers/auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { RolesGuard } from './guards/roles.guard';
import { PolicyService } from './policies/policy.service';
import { OrganizationRepository } from './repositories/organization.repository';
import { UsersRepository } from './repositories/users.repository';
import { MAILER } from './ports/mailer.port';
import { AuthService } from './services/auth.service';
import { PasswordService } from './services/password.service';
import { RbacService } from './services/rbac.service';
import { TokenService } from './services/token.service';
import { VerificationService } from './services/verification.service';

/**
 * Identity domain — authentication (JWT access + rotating refresh tokens), account
 * lifecycle (verification, password reset), and RBAC.
 *
 * Registers the three global guards in authn→authz order, making the whole API
 * secure-by-default: routes are protected unless marked `@Public()`.
 * `PolicyService` + `RbacService` are exported for use by later domain modules.
 */
@Module({
  imports: [
    // Secrets/TTLs are supplied per-call (access vs refresh use different secrets).
    JwtModule.register({}),
    NotificationModule,
  ],
  controllers: [AuthController, AccountController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    RbacService,
    VerificationService,
    PolicyService,
    UsersRepository,
    OrganizationRepository,
    { provide: MAILER, useExisting: NotificationMailer },

    // Global guards — order matters: authenticate, then authorize.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [PolicyService, RbacService, JwtModule],
})
export class IdentityModule {}
