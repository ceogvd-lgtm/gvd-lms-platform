import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { EMAIL_QUEUE } from '../../common/queue/queue.module';

import { EmailProcessor } from './email.processor';
import { EmailService } from './email.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';

/**
 * Global module: EmailService + NotificationsService are used across the
 * app (AuthModule, AdminModule, LessonsModule, ...) so marking this @Global
 * saves every consumer from importing it.
 *
 * The WebSocket gateway + its JwtModule live here because the gateway needs
 * to verify the JWT out of band (not via the global JwtAuthGuard which is
 * HTTP-only).
 */
@Global()
@Module({
  imports: [
    BullModule.registerQueue({ name: EMAIL_QUEUE }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [NotificationsController],
  providers: [EmailService, EmailProcessor, NotificationsService, NotificationsGateway],
  exports: [EmailService, NotificationsService],
})
export class NotificationsModule {}
