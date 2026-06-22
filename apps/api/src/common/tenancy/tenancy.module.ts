import { Global, Module } from '@nestjs/common';
import { TenantScopeService } from './tenant-scope.service';

/** Global provider of {@link TenantScopeService} so any content domain can scope by organization. */
@Global()
@Module({
  providers: [TenantScopeService],
  exports: [TenantScopeService],
})
export class TenancyModule {}
