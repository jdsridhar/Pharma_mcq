import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { SystemRole } from '@pharmacy/contracts';
import { type Observable, from, lastValueFrom } from 'rxjs';
import type { AuthenticatedUser } from '../../modules/identity/types/auth.types';
import { PrismaService } from './prisma.service';
import { TenantContextService } from './tenant-context.service';

/** Generous ceiling so normal requests never hit Prisma's interactive-transaction timeout. */
const REQUEST_TX_TIMEOUT_MS = 20_000;

/**
 * Postgres RLS enforcement (MT-4). For authenticated **non-super** requests, runs the handler
 * inside one interactive transaction whose transaction-local GUCs (`app.current_org`,
 * `app.is_super='off'`) scope every query through the RLS policies. Super Admins, public/auth
 * routes and non-HTTP contexts (BullMQ) are not wrapped and use the bypass-by-default behaviour.
 *
 * No-op unless `APP_DATABASE_URL` is configured (otherwise the API connects as the table owner and
 * RLS is inert); the per-request transaction is still harmless in that case but adds no isolation.
 */
@Injectable()
export class RlsInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const req = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = req?.user;
    const isSuper = user?.roles?.includes(SystemRole.SUPER_ADMIN) ?? false;
    // Only scope authenticated, non-super requests; everyone else uses the bypass default.
    if (!user || isSuper) {
      return next.handle();
    }

    const org = user.organizationId ?? '';
    return from(
      this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`SELECT set_config('app.current_org', $1, true)`, org);
          await tx.$executeRawUnsafe(`SELECT set_config('app.is_super', 'off', true)`);
          return this.tenant.run({ tx }, () => lastValueFrom(next.handle()));
        },
        { timeout: REQUEST_TX_TIMEOUT_MS, maxWait: 10_000 },
      ),
    );
  }
}
