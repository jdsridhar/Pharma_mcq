import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { ServerEnv } from '@pharmacy/config';
import { createHash, randomUUID } from 'node:crypto';
import { APP_ENV } from '../../../config/app-config.module';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { JwtAccessPayload, JwtRefreshPayload } from '../types/auth.types';
import { parseDurationToSeconds } from '../utils/duration.util';

export interface RequestMeta {
  userAgent?: string;
  ip?: string;
}

export interface AccessToken {
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
}

export interface RotatedRefresh {
  userId: string;
  familyId: string;
  rawToken: string;
}

interface SignAccessArgs {
  userId: string;
  email: string;
  orgId: string | null;
  roles: string[];
  permissions: string[];
}

/**
 * Issues access tokens and manages the refresh-token lifecycle with **family rotation
 * and reuse detection** (ARCHITECTURE_REVIEW §SEC-3):
 *  - Each login starts a new token *family*.
 *  - Every refresh rotates the token: the old one is revoked and points at its successor.
 *  - Refresh tokens are stored only as SHA-256 hashes (never in plaintext).
 *  - Presenting an already-revoked refresh token ⇒ a stolen/replayed token ⇒ the entire
 *    family is revoked, forcing re-authentication.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Inject(APP_ENV) private readonly env: ServerEnv,
  ) {}

  async signAccessToken(args: SignAccessArgs): Promise<AccessToken> {
    const payload: JwtAccessPayload = {
      sub: args.userId,
      email: args.email,
      orgId: args.orgId,
      roles: args.roles,
      permissions: args.permissions,
      type: 'access',
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.env.JWT_ACCESS_SECRET,
      expiresIn: this.env.JWT_ACCESS_TTL,
    });
    return { accessToken, expiresIn: parseDurationToSeconds(this.env.JWT_ACCESS_TTL) };
  }

  getRefreshTtlSeconds(): number {
    return parseDurationToSeconds(this.env.JWT_REFRESH_TTL);
  }

  /** Issue a refresh token, persisting its hash. A new family is started unless one is given. */
  async issueRefreshToken(userId: string, meta: RequestMeta, familyId?: string): Promise<string> {
    const jti = randomUUID();
    const family = familyId ?? randomUUID();
    const payload: JwtRefreshPayload = { sub: userId, familyId: family, jti, type: 'refresh' };

    const rawToken = await this.jwt.signAsync(payload, {
      secret: this.env.JWT_REFRESH_SECRET,
      expiresIn: this.env.JWT_REFRESH_TTL,
    });

    await this.prisma.refreshToken.create({
      data: {
        id: jti,
        userId,
        familyId: family,
        tokenHash: this.hash(rawToken),
        expiresAt: new Date(Date.now() + this.getRefreshTtlSeconds() * 1000),
        userAgent: meta.userAgent,
        ip: meta.ip,
      },
    });

    return rawToken;
  }

  /** Verify + rotate a refresh token, detecting reuse. Throws on any invalidity. */
  async rotateRefreshToken(rawToken: string, meta: RequestMeta): Promise<RotatedRefresh> {
    let payload: JwtRefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtRefreshPayload>(rawToken, {
        secret: this.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Wrong token type');
    }

    const tokenHash = this.hash(rawToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!existing) {
      throw new UnauthorizedException('Unknown refresh token');
    }

    if (existing.revokedAt) {
      // Reuse of a rotated token — revoke the whole family as a precaution.
      await this.revokeFamily(existing.familyId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const newRaw = await this.issueRefreshToken(existing.userId, meta, existing.familyId);
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedByTokenHash: this.hash(newRaw) },
    });

    return { userId: existing.userId, familyId: existing.familyId, rawToken: newRaw };
  }

  /** Revoke the family of the presented refresh token (logout). Idempotent. */
  async revokeByRawToken(rawToken: string): Promise<void> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(rawToken) },
    });
    if (!existing) {
      return;
    }
    await this.revokeFamily(existing.familyId);
  }

  /** Revoke every active refresh token for a user (e.g. after a password reset). */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
