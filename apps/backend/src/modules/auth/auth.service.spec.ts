import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { MailService } from '../../common/mail/mail.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';

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
  const mailMock = {
    sendVerifyEmail: jest.fn(),
    send2FACode: jest.fn(),
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
        { provide: MailService, useValue: mailMock },
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

    it('creates user, stores verify token in redis, sends email', async () => {
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
      expect(mailMock.sendVerifyEmail).toHaveBeenCalled();
      expect(res.message).toContain('Đăng ký thành công');
    });
  });
});
