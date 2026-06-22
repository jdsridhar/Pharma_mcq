import { Inject, Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import type { ServerEnv } from '@pharmacy/config';
import { APP_ENV } from '../../../config/app-config.module';

/** Password hashing/verification using bcrypt with the configured cost factor. */
@Injectable()
export class PasswordService {
  constructor(@Inject(APP_ENV) private readonly env: ServerEnv) {}

  hash(plain: string): Promise<string> {
    return hash(plain, this.env.BCRYPT_ROUNDS);
  }

  compare(plain: string, hashed: string): Promise<boolean> {
    return compare(plain, hashed);
  }
}
