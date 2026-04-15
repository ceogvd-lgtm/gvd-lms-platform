import { randomBytes, randomInt, randomUUID } from 'node:crypto';

import type { AuthTokens, JwtPayload, User as SharedUser } from '@lms/types';
import { Role } from '@lms/types';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { EmailService } from '../notifications/email.service';

import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Toggle2FADto } from './dto/toggle-2fa.dto';
import type { GoogleUserPayload } from './strategies/google.strategy';

// ---------- Constants ----------
const BCRYPT_SALT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_TTL_SECONDS = 15 * 60; // 15 min
const EMAIL_VERIFY_TTL_SECONDS = 24 * 60 * 60; // 24h
const OTP_TTL_SECONDS = 10 * 60; // 10 min
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const TEMP_TOKEN_TTL_SECONDS = 5 * 60; // 5 min
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7d
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 min

// Redis key helpers — kept here so the schema is discoverable alongside use.
const K = {
  emailVerify: (token: string) => `auth:email-verify:${token}`,
  refresh: (jti: string) => `auth:refresh:${jti}`,
  loginFail: (email: string) => `auth:login:fail:${email.toLowerCase()}`,
  loginLock: (email: string) => `auth:login:lock:${email.toLowerCase()}`,
  otp: (userId: string) => `auth:2fa:otp:${userId}`,
  otpResend: (userId: string) => `auth:2fa:resend:${userId}`,
};

/** Shape sent back to clients — never includes `password`. */
type SafeUser = Omit<SharedUser, never>;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  // =====================================================
  // REGISTER
  // =====================================================
  async register(dto: RegisterDto): Promise<{ message: string }> {
    const existing = await this.prisma.client.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new BadRequestException('Email đã được đăng ký');
    }

    const hashed = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    const user = await this.prisma.client.user.create({
      data: {
        email: dto.email.toLowerCase(),
        name: dto.name,
        password: hashed,
        role: Role.STUDENT,
      },
      select: { id: true, email: true, name: true },
    });

    // Email verification link (token stored in Redis, TTL 24h)
    const token = randomBytes(32).toString('hex');
    await this.redis.set(K.emailVerify(token), user.id, EMAIL_VERIFY_TTL_SECONDS);

    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const link = `${frontendUrl}/auth/verify-email?token=${token}`;

    try {
      await this.email.sendVerifyEmail(user.email, user.name, link);
    } catch (err) {
      // Don't 500 the registration if the queue is unreachable — just log.
      this.logger.warn(
        `Registered ${user.email} but verify-email enqueue failed: ${(err as Error).message}`,
      );
    }

    return {
      message: 'Đăng ký thành công. Vui lòng kiểm tra email để kích hoạt tài khoản.',
    };
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    const userId = await this.redis.get(K.emailVerify(token));
    if (!userId) {
      throw new BadRequestException('Token xác thực không hợp lệ hoặc đã hết hạn');
    }

    await this.prisma.client.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });
    await this.redis.del(K.emailVerify(token));

    return { message: 'Xác thực email thành công' };
  }

  // =====================================================
  // LOGIN
  // =====================================================
  async login(
    dto: LoginDto,
    meta: { ip: string; userAgent: string },
  ): Promise<
    | { accessToken: string; refreshToken: string; user: SafeUser }
    | { requires2FA: true; tempToken: string }
  > {
    const emailLower = dto.email.toLowerCase();

    // 1. Brute-force lock check
    if (await this.redis.exists(K.loginLock(emailLower))) {
      const ttl = await this.redis.ttl(K.loginLock(emailLower));
      throw new ForbiddenException(
        `Tài khoản bị khóa do đăng nhập sai quá nhiều lần. Thử lại sau ${Math.ceil(
          ttl / 60,
        )} phút.`,
      );
    }

    const user = await this.prisma.client.user.findUnique({
      where: { email: emailLower },
    });
    if (!user || !user.password) {
      await this.registerLoginFailure(emailLower);
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    // 2. Email verified?
    if (!user.emailVerified) {
      throw new ForbiddenException('Tài khoản chưa xác thực email. Vui lòng kiểm tra hộp thư.');
    }

    // 3. Blocked?
    if (user.isBlocked) {
      throw new ForbiddenException('Tài khoản đã bị khóa');
    }

    // 4. Password match
    const ok = await bcrypt.compare(dto.password, user.password);
    if (!ok) {
      await this.registerLoginFailure(emailLower);
      await this.writeLoginLog(user.id, meta, false);
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    // Password correct — clear brute-force counter
    await this.redis.del(K.loginFail(emailLower));

    // 5. 2FA branch
    if (user.is2FAEnabled) {
      const tempToken = await this.jwt.signAsync(
        {
          sub: user.id,
          email: user.email,
          role: user.role,
          scope: '2fa',
        } satisfies JwtPayload,
        { expiresIn: TEMP_TOKEN_TTL_SECONDS },
      );
      return { requires2FA: true, tempToken };
    }

    // 6. Issue access + refresh
    const tokens = await this.issueTokens(user);
    await this.writeLoginLog(user.id, meta, true);
    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.stripPassword(user),
    };
  }

  // =====================================================
  // GOOGLE OAUTH
  // =====================================================
  async googleLogin(
    profile: GoogleUserPayload,
    meta: { ip: string; userAgent: string },
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const emailLower = profile.email.toLowerCase();
    let user = await this.prisma.client.user.findUnique({
      where: { email: emailLower },
    });

    if (!user) {
      // New account — emailVerified=true (Google already verified it)
      user = await this.prisma.client.user.create({
        data: {
          email: emailLower,
          name: profile.name,
          avatar: profile.avatar,
          role: Role.STUDENT,
          emailVerified: true,
          password: null,
        },
      });
    } else {
      // Existing account — merge: mark verified, fill avatar if missing.
      // Preserve existing role.
      const patch: Record<string, unknown> = {};
      if (!user.emailVerified) patch.emailVerified = true;
      if (!user.avatar && profile.avatar) patch.avatar = profile.avatar;
      if (Object.keys(patch).length > 0) {
        user = await this.prisma.client.user.update({
          where: { id: user.id },
          data: patch,
        });
      }
    }

    if (user.isBlocked) {
      throw new ForbiddenException('Tài khoản đã bị khóa');
    }

    const tokens = await this.issueTokens(user);
    await this.writeLoginLog(user.id, meta, true);
    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  // =====================================================
  // 2FA — SEND
  // =====================================================
  async send2FA(tempToken: string): Promise<{ message: string }> {
    const payload = await this.verifyTempToken(tempToken);

    // Resend cooldown
    if (await this.redis.exists(K.otpResend(payload.sub))) {
      const ttl = await this.redis.ttl(K.otpResend(payload.sub));
      throw new BadRequestException(`Vui lòng chờ ${ttl} giây trước khi gửi lại mã`);
    }

    const otp = randomInt(100_000, 1_000_000).toString();
    await this.redis.set(K.otp(payload.sub), otp, OTP_TTL_SECONDS);
    await this.redis.set(K.otpResend(payload.sub), '1', OTP_RESEND_COOLDOWN_SECONDS);

    const user = await this.prisma.client.user.findUnique({
      where: { id: payload.sub },
      select: { email: true, name: true },
    });
    if (!user) throw new UnauthorizedException('Người dùng không tồn tại');

    await this.email.send2FACode(user.email, user.name, otp);
    return { message: 'Mã OTP đã được gửi đến email của bạn' };
  }

  // =====================================================
  // 2FA — VERIFY
  // =====================================================
  async verify2FA(
    tempToken: string,
    otp: string,
    meta: { ip: string; userAgent: string },
  ): Promise<{ accessToken: string; refreshToken: string; user: SafeUser }> {
    const payload = await this.verifyTempToken(tempToken);

    const stored = await this.redis.get(K.otp(payload.sub));
    if (!stored || stored !== otp) {
      throw new UnauthorizedException('Mã OTP không đúng hoặc đã hết hạn');
    }
    await this.redis.del(K.otp(payload.sub));

    const user = await this.prisma.client.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) throw new UnauthorizedException('Người dùng không tồn tại');
    if (user.isBlocked) throw new ForbiddenException('Tài khoản đã bị khóa');

    const tokens = await this.issueTokens(user);
    await this.writeLoginLog(user.id, meta, true);
    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.stripPassword(user),
    };
  }

  // =====================================================
  // REFRESH
  // =====================================================
  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('REFRESH_TOKEN_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }

    if (payload.scope !== 'refresh' || !payload.jti) {
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }

    // Check allowlist (deleted on logout)
    const stored = await this.redis.get(K.refresh(payload.jti));
    if (!stored || stored !== payload.sub) {
      throw new UnauthorizedException('Refresh token đã bị thu hồi');
    }

    const accessToken = await this.jwt.signAsync(
      {
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
        scope: 'access',
      } satisfies JwtPayload,
      { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    );
    return { accessToken };
  }

  // =====================================================
  // LOGOUT
  // =====================================================
  async logout(refreshToken: string): Promise<{ message: string }> {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('REFRESH_TOKEN_SECRET'),
      });
      if (payload.jti) {
        await this.redis.del(K.refresh(payload.jti));
      }
    } catch {
      // Silently succeed — we don't want logout to error if the token is already invalid.
    }
    return { message: 'Đăng xuất thành công' };
  }

  // =====================================================
  // 2FA TOGGLE
  // =====================================================
  async toggle2FA(
    userId: string,
    dto: Toggle2FADto,
  ): Promise<{ message: string; is2FAEnabled: boolean }> {
    const user = await this.prisma.client.user.findUnique({ where: { id: userId } });
    if (!user || !user.password) {
      throw new UnauthorizedException('Người dùng không tồn tại hoặc chưa có mật khẩu');
    }
    const ok = await bcrypt.compare(dto.password, user.password);
    if (!ok) throw new UnauthorizedException('Mật khẩu không đúng');

    const updated = await this.prisma.client.user.update({
      where: { id: userId },
      data: { is2FAEnabled: dto.enable },
      select: { is2FAEnabled: true },
    });

    return {
      message: dto.enable ? 'Đã bật xác thực 2 lớp' : 'Đã tắt xác thực 2 lớp',
      is2FAEnabled: updated.is2FAEnabled,
    };
  }

  // =====================================================
  // Internals
  // =====================================================

  private async issueTokens(user: { id: string; email: string; role: Role }): Promise<AuthTokens> {
    const jti = randomUUID();

    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        scope: 'access',
      } satisfies JwtPayload,
      { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    );

    const refreshToken = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        scope: 'refresh',
        jti,
      } satisfies JwtPayload,
      {
        secret: this.config.get<string>('REFRESH_TOKEN_SECRET'),
        expiresIn: REFRESH_TOKEN_TTL_SECONDS,
      },
    );

    // Allowlist refresh token — deleted on logout
    await this.redis.set(K.refresh(jti), user.id, REFRESH_TOKEN_TTL_SECONDS);

    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  private async verifyTempToken(token: string): Promise<JwtPayload> {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      if (payload.scope !== '2fa') {
        throw new UnauthorizedException('Temp token không hợp lệ');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Temp token không hợp lệ hoặc đã hết hạn');
    }
  }

  private async registerLoginFailure(email: string): Promise<void> {
    const key = K.loginFail(email);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, LOGIN_LOCK_TTL_SECONDS);
    }
    if (count >= MAX_LOGIN_ATTEMPTS) {
      await this.redis.set(K.loginLock(email), '1', LOGIN_LOCK_TTL_SECONDS);
      await this.redis.del(key);
    }
  }

  private async writeLoginLog(
    userId: string,
    meta: { ip: string; userAgent: string },
    success: boolean,
  ): Promise<void> {
    try {
      await this.prisma.client.loginLog.create({
        data: {
          userId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          success,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to write LoginLog: ${(err as Error).message}`);
    }
  }

  private stripPassword(user: {
    id: string;
    email: string;
    name: string;
    phone: string | null;
    avatar: string | null;
    role: Role;
    is2FAEnabled: boolean;
    emailVerified: boolean;
    isBlocked: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): SafeUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      avatar: user.avatar,
      role: user.role,
      is2FAEnabled: user.is2FAEnabled,
      emailVerified: user.emailVerified,
      isBlocked: user.isBlocked,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
