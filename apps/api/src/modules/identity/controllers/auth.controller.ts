import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthResult, UserPublic } from '@pharmacy/contracts';
import type { ServerEnv } from '@pharmacy/config';
import type { CookieOptions, Request, Response } from 'express';
import { APP_ENV } from '../../../config/app-config.module';
import { Public } from '../../../common/decorators/public.decorator';
import { Throttle } from '../../../common/throttler/throttle.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { LoginDto } from '../dto/login.dto';
import { RefreshDto } from '../dto/refresh.dto';
import { RegisterDto } from '../dto/register.dto';
import { REFRESH_COOKIE_NAME } from '../identity.constants';
import { AuthService } from '../services/auth.service';
import type { RequestMeta } from '../services/token.service';
import { TokenService } from '../services/token.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokens: TokenService,
    @Inject(APP_ENV) private readonly env: ServerEnv,
  ) {}

  @Public()
  @Throttle({ limit: 10, ttl: 60 })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new account (auto-login) and send a verification email' })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResult> {
    const { result, refreshToken } = await this.authService.register(dto, this.meta(req));
    this.setRefreshCookie(res, refreshToken);
    return result;
  }

  @Public()
  @Throttle({ limit: 10, ttl: 60 })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email + password' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResult> {
    const { result, refreshToken } = await this.authService.login(dto, this.meta(req));
    this.setRefreshCookie(res, refreshToken);
    return result;
  }

  @Public()
  @Throttle({ limit: 10, ttl: 60 })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the refresh token and issue a new access token' })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResult> {
    const raw = this.readRefreshToken(req, dto);
    const { result, refreshToken } = await this.authService.refresh(raw, this.meta(req));
    this.setRefreshCookie(res, refreshToken);
    return result;
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the current refresh-token family and clear the cookie' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const raw = this.readRefreshTokenOptional(req);
    await this.authService.logout(raw);
    this.clearRefreshCookie(res);
  }

  @Get('me')
  @ApiOperation({ summary: 'Return the authenticated user with roles + permissions' })
  me(@CurrentUser('id') userId: string): Promise<UserPublic> {
    return this.authService.me(userId);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private meta(req: Request): RequestMeta {
    return { userAgent: req.headers['user-agent'], ip: req.ip };
  }

  private readRefreshToken(req: Request, dto: RefreshDto): string {
    const raw = this.readRefreshTokenOptional(req) ?? dto.refreshToken;
    if (!raw) {
      // Surfaced as 401 by the service layer on rotation; guard here for clarity.
      return '';
    }
    return raw;
  }

  private readRefreshTokenOptional(req: Request): string | undefined {
    const cookies = req.cookies as Record<string, string> | undefined;
    return cookies?.[REFRESH_COOKIE_NAME];
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    };
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE_NAME, token, {
      ...this.cookieOptions(),
      maxAge: this.tokens.getRefreshTtlSeconds() * 1000,
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions());
  }
}
