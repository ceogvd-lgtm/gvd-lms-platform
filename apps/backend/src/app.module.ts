import { join } from 'node:path';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditModule } from './common/audit/audit.module';
import { MailModule } from './common/mail/mail.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { RbacModule } from './common/rbac/rbac.module';
import { RolesGuard } from './common/rbac/roles.guard';
import { RedisModule } from './common/redis/redis.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { LessonsModule } from './modules/lessons/lessons.module';

// The shared .env file lives at the monorepo root. At runtime the compiled
// module sits in apps/backend/dist/, so we walk up three levels to reach it
// (dist → backend → apps → root). Local apps/backend/.env is checked first
// so a developer can override per-app.
const monorepoRoot = join(__dirname, '..', '..', '..');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        '.env.local',
        '.env',
        join(monorepoRoot, '.env.local'),
        join(monorepoRoot, '.env'),
      ],
    }),
    // Global default — individual controllers (e.g. AuthController) override
    // with stricter limits via @Throttle().
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 100,
      },
    ]),
    PrismaModule,
    RedisModule,
    MailModule,
    RbacModule,
    AuditModule,
    AuthModule,
    AdminModule,
    LessonsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Order of APP_GUARD providers matters — they run in registration order.
    //   1. Throttler (rate limit first, cheap reject)
    //   2. JwtAuthGuard (authn — populates req.user, honours @Public)
    //   3. RolesGuard (authz — reads req.user.role vs @Roles metadata)
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
