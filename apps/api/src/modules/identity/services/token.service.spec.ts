import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { ServerEnv } from '@pharmacy/config';
import type { PrismaService } from '../../../infra/prisma/prisma.service';
import { TokenService } from './token.service';

const env = {
  JWT_ACCESS_SECRET: 'access-secret-access-secret-1234',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_SECRET: 'refresh-secret-refresh-secret-1234',
  JWT_REFRESH_TTL: '30d',
} as unknown as ServerEnv;

function makePrismaMock() {
  return {
    refreshToken: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe('TokenService', () => {
  const jwt = new JwtService({});
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let service: TokenService;

  beforeEach(() => {
    prismaMock = makePrismaMock();
    service = new TokenService(jwt, prismaMock as unknown as PrismaService, env);
  });

  it('signs an access token carrying roles + permissions', async () => {
    const { accessToken, expiresIn } = await service.signAccessToken({
      userId: 'u1',
      email: 'a@b.com',
      orgId: null,
      roles: ['Student'],
      permissions: ['question:read'],
    });
    expect(expiresIn).toBe(900);
    const decoded = await jwt.verifyAsync<Record<string, unknown>>(accessToken, {
      secret: env.JWT_ACCESS_SECRET,
    });
    expect(decoded.sub).toBe('u1');
    expect(decoded.type).toBe('access');
    expect(decoded.permissions).toContain('question:read');
  });

  it('persists a hashed refresh token and returns a verifiable JWT', async () => {
    const raw = await service.issueRefreshToken('u1', { userAgent: 'jest', ip: '127.0.0.1' });
    expect(prismaMock.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'u1' }) }),
    );
    // The stored value is a hash, never the raw token.
    const stored = prismaMock.refreshToken.create.mock.calls[0][0].data.tokenHash as string;
    expect(stored).not.toBe(raw);
    expect(stored).toHaveLength(64); // sha256 hex
    const decoded = await jwt.verifyAsync<Record<string, unknown>>(raw, {
      secret: env.JWT_REFRESH_SECRET,
    });
    expect(decoded.type).toBe('refresh');
  });

  it('rotates a valid refresh token, revoking the old one', async () => {
    const raw = await jwt.signAsync(
      { sub: 'u1', familyId: 'f1', jti: 'j1', type: 'refresh' },
      { secret: env.JWT_REFRESH_SECRET, expiresIn: '30d' },
    );
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: 'j1',
      userId: 'u1',
      familyId: 'f1',
      tokenHash: 'stored',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 1_000_000),
    });

    const result = await service.rotateRefreshToken(raw, {});
    expect(result.userId).toBe('u1');
    expect(result.familyId).toBe('f1');
    expect(prismaMock.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'j1' } }),
    );
    const decoded = await jwt.verifyAsync<Record<string, unknown>>(result.rawToken, {
      secret: env.JWT_REFRESH_SECRET,
    });
    expect(decoded.type).toBe('refresh');
  });

  it('detects reuse of a revoked token and revokes the whole family', async () => {
    const raw = await jwt.signAsync(
      { sub: 'u1', familyId: 'f1', jti: 'j1', type: 'refresh' },
      { secret: env.JWT_REFRESH_SECRET, expiresIn: '30d' },
    );
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: 'j1',
      userId: 'u1',
      familyId: 'f1',
      tokenHash: 'stored',
      revokedAt: new Date(), // already rotated → reuse
      expiresAt: new Date(Date.now() + 1_000_000),
    });

    await expect(service.rotateRefreshToken(raw, {})).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId: 'f1', revokedAt: null } }),
    );
  });

  it('rejects an unknown refresh token', async () => {
    const raw = await jwt.signAsync(
      { sub: 'u1', familyId: 'f1', jti: 'j1', type: 'refresh' },
      { secret: env.JWT_REFRESH_SECRET, expiresIn: '30d' },
    );
    prismaMock.refreshToken.findUnique.mockResolvedValue(null);
    await expect(service.rotateRefreshToken(raw, {})).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
