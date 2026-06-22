import { Global, Module } from '@nestjs/common';
import { loadServerEnv, type ServerEnv } from '@pharmacy/config';

/** DI token for the validated, strongly-typed server environment. */
export const APP_ENV = 'APP_ENV';

/**
 * Global config module. Validates the environment exactly once at startup (fail-fast)
 * and exposes it as an injectable `ServerEnv`.
 *
 * Usage: `constructor(@Inject(APP_ENV) private readonly env: ServerEnv) {}`
 */
@Global()
@Module({
  providers: [{ provide: APP_ENV, useFactory: (): ServerEnv => loadServerEnv() }],
  exports: [APP_ENV],
})
export class AppConfigModule {}
