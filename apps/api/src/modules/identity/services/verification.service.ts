import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../../infra/prisma/prisma.service';

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1h

/**
 * Manages opaque, single-use tokens for email verification and password reset.
 * Tokens are random 32-byte values; only their SHA-256 hash is stored. The raw value is
 * returned once (for the email link) and can never be recovered from the database.
 */
@Injectable()
export class VerificationService {
  constructor(private readonly prisma: PrismaService) {}

  async issueEmailVerificationToken(userId: string): Promise<string> {
    const raw = this.generateToken();
    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: this.hash(raw),
        expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
      },
    });
    return raw;
  }

  /** Validate + consume an email-verification token, returning the owning user id. */
  async consumeEmailVerificationToken(raw: string): Promise<string> {
    const token = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: this.hash(raw) },
    });
    if (!token || token.consumedAt || token.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }
    await this.prisma.emailVerificationToken.update({
      where: { id: token.id },
      data: { consumedAt: new Date() },
    });
    return token.userId;
  }

  async issuePasswordResetToken(userId: string): Promise<string> {
    const raw = this.generateToken();
    await this.prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: this.hash(raw),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });
    return raw;
  }

  /** Validate + consume a password-reset token, returning the owning user id. */
  async consumePasswordResetToken(raw: string): Promise<string> {
    const token = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hash(raw) },
    });
    if (!token || token.consumedAt || token.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }
    await this.prisma.passwordResetToken.update({
      where: { id: token.id },
      data: { consumedAt: new Date() },
    });
    return token.userId;
  }

  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  private hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
