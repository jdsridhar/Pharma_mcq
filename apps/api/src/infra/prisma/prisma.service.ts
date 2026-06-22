import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { ServerEnv } from '@pharmacy/config';
import { type Prisma, PrismaClient } from '@prisma/client';
import { APP_ENV } from '../../config/app-config.module';
import { TenantContextService } from './tenant-context.service';

/**
 * PrismaClient wrapper wired into Nest's lifecycle. All repositories depend on this service.
 *
 * Multi-tenancy (MT-4): when `APP_DATABASE_URL` is set the API connects as the least-privilege
 * `pharmacy_app` role that Postgres Row-Level Security applies to. For authenticated non-super
 * requests, {@link RlsInterceptor} opens a transaction, sets the tenant GUCs, and stores it in
 * {@link TenantContextService}; this service then transparently routes model/raw operations to
 * that transaction so RLS scopes them. With no active store (Super Admin, public/auth routes,
 * BullMQ workers, seeders) it behaves exactly like the base client (RLS bypass-by-default).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(
    @Inject(APP_ENV) env: ServerEnv,
    private readonly tenant: TenantContextService,
  ) {
    super(env.APP_DATABASE_URL ? { datasources: { db: { url: env.APP_DATABASE_URL } } } : undefined);

    // Transparent RLS routing. Functions are bound to their owner (never to the proxy) so
    // PrismaClient's internal private fields keep working.
    return new Proxy(this, {
      get: (target, prop, receiver) => {
        if (prop === '$transaction') {
          return (arg: unknown, opts?: unknown): unknown => {
            const active = this.tenant.get()?.tx;
            if (!active) {
              return (target.$transaction as (a: unknown, o?: unknown) => unknown)(arg, opts);
            }
            // Already inside the request's RLS transaction — reuse it (no nesting).
            if (typeof arg === 'function') {
              return (arg as (c: Prisma.TransactionClient) => unknown)(active);
            }
            return (async (): Promise<unknown[]> => {
              const out: unknown[] = [];
              for (const p of arg as Promise<unknown>[]) out.push(await p);
              return out;
            })();
          };
        }
        const tx = this.tenant.get()?.tx as Record<string | symbol, unknown> | undefined;
        if (tx && prop in tx) {
          const value = tx[prop];
          return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(tx) : value;
        }
        const own = (target as unknown as Record<string | symbol, unknown>)[prop];
        if (typeof own === 'function') {
          return own.bind(target);
        }
        // Fall back to default semantics for getters/accessors that aren't plain data props.
        return own ?? Reflect.get(target, prop, receiver);
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
