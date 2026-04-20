import type { Role } from '@lms/types';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Reflector , APP_GUARD } from '@nestjs/core';
import { JwtService , JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import { PrismaService } from '../../../src/common/prisma/prisma.service';
import { RedisService } from '../../../src/common/redis/redis.service';
import { AuthController } from '../../../src/modules/auth/auth.controller';
import { AuthService } from '../../../src/modules/auth/auth.service';
import { JwtAuthGuard } from '../../../src/modules/auth/guards/jwt-auth.guard';
import { JwtStrategy } from '../../../src/modules/auth/strategies/jwt.strategy';
import { EmailService } from '../../../src/modules/notifications/email.service';


import { InMemoryRedis } from './in-memory-redis';
import { createPrismaStub } from './prisma-stub';

export interface AuthTestCtx {
  app: INestApplication;
  prisma: ReturnType<typeof createPrismaStub>;
  redis: InMemoryRedis;
  email: { enqueue: jest.Mock; [k: string]: jest.Mock };
  jwt: JwtService;
  close: () => Promise<void>;
}

export async function createAuthTestApp(): Promise<AuthTestCtx> {
  const prisma = createPrismaStub();
  const redis = new InMemoryRedis();
  const email = {
    enqueue: jest.fn().mockResolvedValue({ jobId: 'test' }),
    sendVerifyEmail: jest.fn().mockResolvedValue({ jobId: 'test' }),
    send2FACode: jest.fn().mockResolvedValue({ jobId: 'test' }),
    sendResetPassword: jest.fn().mockResolvedValue({ jobId: 'test' }),
    sendWelcome: jest.fn().mockResolvedValue({ jobId: 'test' }),
  };

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [
          () => ({
            JWT_SECRET: 'test-jwt-secret-integration',
            REFRESH_TOKEN_SECRET: 'test-refresh-secret-integration',
            JWT_ACCESS_TTL: '15m',
            FRONTEND_URL: 'http://localhost:3000',
          }),
        ],
      }),
      PassportModule,
      JwtModule.registerAsync({
        inject: [ConfigService],
        useFactory: (c: ConfigService) => ({
          secret: c.get<string>('JWT_SECRET'),
          signOptions: { expiresIn: '15m' },
        }),
      }),
      ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 1000 }]),
    ],
    controllers: [AuthController],
    providers: [
      AuthService,
      JwtStrategy,
      Reflector,
      { provide: PrismaService, useValue: prisma },
      { provide: RedisService, useValue: redis },
      { provide: EmailService, useValue: email },
      { provide: APP_GUARD, useClass: ThrottlerGuard },
      { provide: APP_GUARD, useClass: JwtAuthGuard },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  await app.init();

  const jwt = app.get(JwtService);

  return {
    app,
    prisma,
    redis,
    email,
    jwt,
    close: async () => {
      await app.close();
    },
  };
}

export async function signAccessToken(
  jwt: JwtService,
  user: { id: string; email: string; role: Role },
): Promise<string> {
  return jwt.signAsync({
    sub: user.id,
    email: user.email,
    role: user.role,
    scope: 'access',
  });
}
