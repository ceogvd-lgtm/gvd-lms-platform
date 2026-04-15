import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');

  // Security headers
  app.use(helmet());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Conforms every error response to { statusCode, message, error, timestamp, path }.
  app.useGlobalFilters(new HttpExceptionFilter());

  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim());

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // Trust proxy so req.ip honours X-Forwarded-For (needed for rate limiting +
  // LoginLog behind a reverse proxy).
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Explicit Socket.io adapter — NestJS WILL auto-detect @nestjs/platform-
  // socket.io in most setups, but pinning it here avoids the silent
  // fall-through that sometimes happens under ts-node-dev transpile-only.
  app.useWebSocketAdapter(new IoAdapter(app));

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);

  // eslint-disable-next-line no-console
  console.log(`[LMS Backend] running on http://localhost:${port}/api/v1`);
}

bootstrap();
