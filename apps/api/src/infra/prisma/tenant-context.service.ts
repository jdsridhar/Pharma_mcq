import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantStore {
  /** The request-bound interactive transaction carrying the SET LOCAL tenant GUCs for RLS. */
  tx: Prisma.TransactionClient;
}

/**
 * Request-scoped tenant context for Postgres Row-Level Security, propagated via AsyncLocalStorage.
 * When a store is present, {@link PrismaService} routes all model/raw operations to its
 * transaction (which has `app.current_org` / `app.is_super` set), so RLS scopes the queries.
 */
@Injectable()
export class TenantContextService {
  private readonly als = new AsyncLocalStorage<TenantStore>();

  run<T>(store: TenantStore, fn: () => T): T {
    return this.als.run(store, fn);
  }

  get(): TenantStore | undefined {
    return this.als.getStore();
  }
}
