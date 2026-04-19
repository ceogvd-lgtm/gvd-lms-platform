import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { EmailService } from '../notifications/email.service';

import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  const prismaMock = {
    client: {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      loginLog: { create: jest.fn() },
    },
  };
  const redisMock = {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    exists: jest.fn().mockResolvedValue(false),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn(),
    ttl: jest.fn().mockResolvedValue(0),
  };
  const jwtMock = {
    signAsync: jest.fn().mockResolvedValue('signed-token'),
    verifyAsync: jest.fn(),
  };
  // Phase 07: AuthService now uses the queue-backed EmailService instead of
  // calling MailService directly. The test double just records the calls.
  const emailMock = {
    sendVerifyEmail: jest.fn().mockResolvedValue({ jobId: 'job-1' }),
    send2FACode: jest.fn().mockResolvedValue({ jobId: 'job-2' }),
  };
  const configMock = {
    get: jest.fn((key: string) => {
      if (key === 'FRONTEND_URL') return 'http://localhost:3000';
      if (key === 'REFRESH_TOKEN_SECRET') return 'refresh-secret';
      return undefined;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: RedisService, useValue: redisMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: EmailService, useValue: emailMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('throws if email already exists', async () => {
      prismaMock.client.user.findUnique.mockResolvedValueOnce({ id: 'u1' });
      await expect(
        service.register({
          email: 'a@b.com',
          name: 'Test',
          password: 'Aa1!aaaa',
        }),
      ).rejects.toThrow('Email đã được đăng ký');
    });

    it('creates user, stores verify token in redis, enqueues email', async () => {
      prismaMock.client.user.findUnique.mockResolvedValueOnce(null);
      prismaMock.client.user.create.mockResolvedValueOnce({
        id: 'u1',
        email: 'a@b.com',
        name: 'Test',
      });

      const res = await service.register({
        email: 'a@b.com',
        name: 'Test',
        password: 'Aa1!aaaa',
      });

      expect(prismaMock.client.user.create).toHaveBeenCalled();
      expect(redisMock.set).toHaveBeenCalledWith(
        expect.stringMatching(/^auth:email-verify:/),
        'u1',
        24 * 60 * 60,
      );
      expect(emailMock.sendVerifyEmail).toHaveBeenCalledWith(
        'a@b.com',
        'Test',
        expect.stringMatching(/^http:\/\/localhost:3000\/auth\/verify-email\?token=/),
      );
      expect(res.message).toContain('Đăng ký thành công');
    });
  });

  describe('changePassword', () => {
    // bcrypt hash của "OldPass1!" — pre-computed offline để test
    // chạy bcrypt.compare thật (không mock), đảm bảo flow verify
    // password chạy end-to-end.
    const OLD_HASH = '$2b$12$Iz/ACpdSaRjtSYMSeLVri.4W.UNgHuJlNo.k2FbFPyrWgR/.ApHtG';

    beforeEach(() => {
      prismaMock.client.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        password: OLD_HASH,
      });
      prismaMock.client.user.update.mockResolvedValue({ id: 'u1' });
    });

    it('đổi mật khẩu thành công với oldPassword đúng', async () => {
      const res = await service.changePassword('u1', {
        oldPassword: 'OldPass1!',
        newPassword: 'NewPass1!',
      });

      expect(res.message).toContain('thành công');
      // Password lưu xuống DB phải là hash (không phải plaintext)
      const updateCall = prismaMock.client.user.update.mock.calls[0][0];
      expect(updateCall.where).toEqual({ id: 'u1' });
      expect(updateCall.data.password).not.toBe('NewPass1!');
      expect(updateCall.data.password).toMatch(/^\$2[aby]\$/);
    });

    it('ném UnauthorizedException khi oldPassword sai', async () => {
      await expect(
        service.changePassword('u1', {
          oldPassword: 'WrongPass1!',
          newPassword: 'NewPass1!',
        }),
      ).rejects.toThrow('Mật khẩu cũ không đúng');
      expect(prismaMock.client.user.update).not.toHaveBeenCalled();
    });

    it('ném BadRequestException khi newPassword trùng oldPassword', async () => {
      await expect(
        service.changePassword('u1', {
          oldPassword: 'OldPass1!',
          newPassword: 'OldPass1!',
        }),
      ).rejects.toThrow('phải khác mật khẩu cũ');
      expect(prismaMock.client.user.update).not.toHaveBeenCalled();
    });

    it('ném UnauthorizedException khi user không tồn tại', async () => {
      prismaMock.client.user.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.changePassword('ghost', {
          oldPassword: 'X',
          newPassword: 'NewPass1!',
        }),
      ).rejects.toThrow('không tồn tại');
    });
  });
});
