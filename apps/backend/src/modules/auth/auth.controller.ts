import type { JwtPayload } from '@lms/types';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Send2FADto } from './dto/send-2fa.dto';
import { Toggle2FADto } from './dto/toggle-2fa.dto';
import { Verify2FADto } from './dto/verify-2fa.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { GoogleUserPayload } from './strategies/google.strategy';

/**
 * All /auth/* endpoints are throttled at 10 req/min per IP (spec).
 * The global `skip` throttler default (set in AppModule) is overridden here.
 */
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  // ---------- REGISTER ----------
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Get('verify-email')
  verifyEmail(@Query('token') token: string) {
    return this.auth.verifyEmail(token);
  }

  // ---------- FORGOT / RESET PASSWORD ----------
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.newPassword);
  }

  // ---------- LOGIN ----------
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, {
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] ?? 'unknown',
    });
  }

  // ---------- CURRENT USER ----------
  // Frontend callback pages + the Zustand rehydrate call this to turn a
  // bare access token into a usable { id, email, name, role, avatar, … }
  // profile. Requires the default JwtAuthGuard (no @Public).
  @Get('me')
  getMe(@CurrentUser() user: JwtPayload) {
    return this.auth.getCurrentUser(user.sub);
  }

  // ---------- GOOGLE OAUTH ----------
  @Public()
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuth(): void {
    // Passport redirects to Google. This handler body never runs.
  }

  @Public()
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const profile = req.user as GoogleUserPayload;
    const tokens = await this.auth.googleLogin(profile, {
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] ?? 'unknown',
    });

    const frontend = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    // Next route group (auth)/callback/page.tsx maps to /callback — the
    // parenthesised segment is purely organisational and never appears
    // in the URL. Redirecting to /auth/callback gives 404.
    const url = new URL('/callback', frontend);
    url.searchParams.set('accessToken', tokens.accessToken);
    url.searchParams.set('refreshToken', tokens.refreshToken);
    res.redirect(url.toString());
  }

  // ---------- 2FA ----------
  @Public()
  @Post('2fa/send')
  @HttpCode(HttpStatus.OK)
  send2FA(@Body() dto: Send2FADto) {
    return this.auth.send2FA(dto.tempToken);
  }

  @Public()
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  verify2FA(@Body() dto: Verify2FADto, @Req() req: Request) {
    return this.auth.verify2FA(dto.tempToken, dto.otp, {
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] ?? 'unknown',
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/toggle')
  @HttpCode(HttpStatus.OK)
  toggle2FA(@CurrentUser() user: JwtPayload, @Body() dto: Toggle2FADto) {
    return this.auth.toggle2FA(user.sub, dto);
  }

  // ---------- REFRESH / LOGOUT ----------
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Body() dto: LogoutDto) {
    return this.auth.logout(dto.refreshToken);
  }

  // ---------- CHANGE PASSWORD ----------
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(@CurrentUser() user: JwtPayload, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.sub, dto);
  }
}

function getClientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]!.trim();
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
