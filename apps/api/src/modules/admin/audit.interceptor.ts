import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { type Observable, tap } from 'rxjs';
import type { AuthenticatedUser } from '../identity/types/auth.types';
import { AuditService } from './audit.service';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Records mutating admin requests to the audit log (after success). Apply with
 * `@UseInterceptors(AuditInterceptor)` on admin controllers — GETs are not audited.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<
      Request & { user?: AuthenticatedUser; route?: { path?: string } }
    >();

    if (!MUTATING.has(request.method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        const user = request.user;
        const params = request.params as Record<string, string | undefined>;
        void this.audit.record({
          actorUserId: user?.id ?? null,
          organizationId: user?.organizationId ?? null,
          action: `${request.method} ${request.route?.path ?? request.url}`,
          entityType: 'admin',
          entityId: params?.id ?? null,
          ip: request.ip ?? null,
          userAgent: request.headers['user-agent'] ?? null,
        });
      }),
    );
  }
}
