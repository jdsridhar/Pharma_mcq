import { Module } from '@nestjs/common';
import { CommerceModule } from '../commerce/commerce.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';
import { AdminRepository } from './repositories/admin.repository';

/**
 * Admin domain — user/role administration, the question review queue, and append-only audit
 * logging (with an interceptor that records mutating admin actions). Imports `CommerceModule`
 * for `OrgSubscriptionService` (institution seat provisioning + onboarding seat enforcement).
 * `AuditService` is exported so other domains can record audit entries.
 */
@Module({
  imports: [CommerceModule],
  controllers: [AdminController],
  providers: [AdminService, AuditService, AdminRepository, AuditInterceptor],
  exports: [AuditService],
})
export class AdminModule {}
