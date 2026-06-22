import type { ServerEnv } from '@pharmacy/config';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  // Lower rounds keep the test fast while exercising the real bcrypt path.
  const service = new PasswordService({ BCRYPT_ROUNDS: 10 } as unknown as ServerEnv);

  it('hashes a password to a non-plaintext bcrypt digest', async () => {
    const hash = await service.hash('S3cretPassw0rd');
    expect(hash).not.toBe('S3cretPassw0rd');
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  it('verifies a correct password and rejects an incorrect one', async () => {
    const hash = await service.hash('S3cretPassw0rd');
    await expect(service.compare('S3cretPassw0rd', hash)).resolves.toBe(true);
    await expect(service.compare('wrong-password', hash)).resolves.toBe(false);
  });
});
