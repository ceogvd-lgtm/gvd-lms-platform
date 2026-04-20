/**
 * Integration tests for auth flow.
 *
 * Exercises real controllers + guards + pipes + JWT signing, with Prisma and
 * Redis stubbed at the adapter layer. No network, no DB, no Redis required.
 */
import { Role } from '@lms/types';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import type { AuthTestCtx} from './helpers/test-auth-app';
import { createAuthTestApp, signAccessToken } from './helpers/test-auth-app';

function fakeUserRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'user-1',
    email: 'alice@lms.local',
    name: 'Alice',
    phone: null,
    avatar: null,
    role: Role.STUDENT,
    password: bcrypt.hashSync('Password@123', 4),
    is2FAEnabled: false,
    emailVerified: true,
    isBlocked: false,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('Auth integration', () => {
  let ctx: AuthTestCtx;

  beforeEach(async () => {
    ctx = await createAuthTestApp();
  });

  afterEach(async () => {
    await ctx.close();
    ctx.redis.reset();
  });

  // ============================================================
  // REGISTER → LOGIN → ACCESS PROTECTED
  // ============================================================
  describe('register → login → /auth/me', () => {
    it('registers, logs in, then hits protected route', async () => {
      ctx.prisma.client.user.findUnique.mockResolvedValueOnce(null); // email not taken
      const created = { id: 'user-new', email: 'new@lms.local', name: 'New' };
      ctx.prisma.client.user.create.mockResolvedValueOnce(created);

      const reg = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'new@lms.local', name: 'New User', password: 'Password@123' });

      expect(reg.status).toBe(201);
      expect(reg.body.message).toContain('Đăng ký');
      expect(ctx.email.sendVerifyEmail).toHaveBeenCalledWith(
        'new@lms.local',
        'New',
        expect.stringContaining('/auth/verify-email?token='),
      );

      // Now simulate login flow (email already verified)
      const u = fakeUserRow();
      ctx.prisma.client.user.findUnique.mockResolvedValue(u);
      ctx.prisma.client.user.update.mockResolvedValue(u);

      const login = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: u.email, password: 'Password@123' });

      expect(login.status).toBe(200);
      expect(login.body.accessToken).toBeDefined();
      expect(login.body.refreshToken).toBeDefined();
      expect(login.body.user.password).toBeUndefined();

      const me = await request(ctx.app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${login.body.accessToken}`);

      expect(me.status).toBe(200);
      expect(me.body.email).toBe(u.email);
    });

    it('rejects /auth/me without token → 401', async () => {
      const res = await request(ctx.app.getHttpServer()).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });

    it('rejects /auth/me with tampered token → 401', async () => {
      const tok = await signAccessToken(ctx.jwt, {
        id: 'user-1',
        email: 'x@y',
        role: Role.STUDENT,
      });
      const tampered = tok.slice(0, -4) + 'xxxx';
      const res = await request(ctx.app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tampered}`);
      expect(res.status).toBe(401);
    });
  });

  // ============================================================
  // 2FA FLOW
  // ============================================================
  describe('2FA flow', () => {
    it('requires2FA=true when user has 2FA enabled, then verify unlocks tokens', async () => {
      const u = fakeUserRow({ is2FAEnabled: true });
      ctx.prisma.client.user.findUnique.mockResolvedValue(u);
      ctx.prisma.client.user.update.mockResolvedValue(u);

      const login = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: u.email, password: 'Password@123' });

      expect(login.status).toBe(200);
      expect(login.body.requires2FA).toBe(true);
      expect(login.body.tempToken).toBeDefined();
      expect(login.body.accessToken).toBeUndefined();

      // Send OTP
      const send = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/2fa/send')
        .send({ tempToken: login.body.tempToken });
      expect(send.status).toBe(200);
      expect(ctx.email.send2FACode).toHaveBeenCalled();

      // Grab OTP out of in-memory redis (real service writes it there)
      const otp = await ctx.redis.get(`auth:2fa:otp:${u.id}`);
      expect(otp).toMatch(/^\d{6}$/);

      const verify = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/2fa/verify')
        .send({ tempToken: login.body.tempToken, otp });

      expect(verify.status).toBe(200);
      expect(verify.body.accessToken).toBeDefined();
      expect(verify.body.refreshToken).toBeDefined();
    });

    it('wrong OTP → 401', async () => {
      const u = fakeUserRow({ is2FAEnabled: true });
      ctx.prisma.client.user.findUnique.mockResolvedValue(u);
      ctx.prisma.client.user.update.mockResolvedValue(u);

      const login = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: u.email, password: 'Password@123' });

      await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/2fa/send')
        .send({ tempToken: login.body.tempToken });

      const bad = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/2fa/verify')
        .send({ tempToken: login.body.tempToken, otp: '000000' });

      expect(bad.status).toBe(401);
    });
  });

  // ============================================================
  // REFRESH → NEW ACCESS TOKEN
  // ============================================================
  describe('refresh token', () => {
    it('returns new access token with valid refresh', async () => {
      const u = fakeUserRow();
      ctx.prisma.client.user.findUnique.mockResolvedValue(u);
      ctx.prisma.client.user.update.mockResolvedValue(u);

      const login = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: u.email, password: 'Password@123' });

      const refresh = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: login.body.refreshToken });

      expect(refresh.status).toBe(200);
      expect(refresh.body.accessToken).toBeDefined();
      // New token must be valid and carry the same subject as login token.
      const decoded = await ctx.jwt.verifyAsync(refresh.body.accessToken);
      expect(decoded.sub).toBe(u.id);
      expect(decoded.scope).toBe('access');
    });

    it('rejects refresh after logout (token blacklisted)', async () => {
      const u = fakeUserRow();
      ctx.prisma.client.user.findUnique.mockResolvedValue(u);
      ctx.prisma.client.user.update.mockResolvedValue(u);

      const login = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: u.email, password: 'Password@123' });

      await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .send({ refreshToken: login.body.refreshToken });

      const refresh = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: login.body.refreshToken });

      expect(refresh.status).toBe(401);
    });

    it('rejects garbage refresh token', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'not-a-jwt' });
      expect(res.status).toBe(401);
    });
  });

  // ============================================================
  // LOGIN GUARDS
  // ============================================================
  describe('login guards', () => {
    it('wrong password → 401', async () => {
      const u = fakeUserRow();
      ctx.prisma.client.user.findUnique.mockResolvedValue(u);
      const res = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: u.email, password: 'Wrong@123' });
      expect(res.status).toBe(401);
    });

    it('email not verified → 403', async () => {
      const u = fakeUserRow({ emailVerified: false });
      ctx.prisma.client.user.findUnique.mockResolvedValue(u);
      const res = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: u.email, password: 'Password@123' });
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('xác thực email');
    });

    it('blocked user → 403', async () => {
      const u = fakeUserRow({ isBlocked: true });
      ctx.prisma.client.user.findUnique.mockResolvedValue(u);
      const res = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: u.email, password: 'Password@123' });
      expect(res.status).toBe(403);
    });

    it('5 wrong passwords → account locked', async () => {
      const u = fakeUserRow();
      ctx.prisma.client.user.findUnique.mockResolvedValue(u);
      for (let i = 0; i < 5; i++) {
        await request(ctx.app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: u.email, password: 'WrongEveryTime@1' });
      }
      const locked = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: u.email, password: 'Password@123' }); // even correct pwd
      expect(locked.status).toBe(403);
      expect(locked.body.message).toContain('khóa');
    });
  });

  // ============================================================
  // GOOGLE OAUTH ROUTES
  // ============================================================
  describe('google oauth', () => {
    it('GET /auth/google redirects (or 302) — route is public', async () => {
      const res = await request(ctx.app.getHttpServer()).get('/api/v1/auth/google');
      expect([302, 500]).toContain(res.status);
      // 302 when creds configured, 500 when placeholder "not-configured".
      // Either way, it's a public route and did not 401.
      expect(res.status).not.toBe(401);
    });
  });
});
