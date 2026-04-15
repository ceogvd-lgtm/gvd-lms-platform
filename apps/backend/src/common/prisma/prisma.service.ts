import { prisma, PrismaClient } from '@lms/database';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

/**
 * Thin NestJS wrapper around the shared `@lms/database` Prisma singleton.
 *
 * We do NOT `extends PrismaClient` here — we delegate to the shared instance so
 * the whole monorepo uses exactly one connection pool.
 *
 * The explicit `PrismaClient` type annotation on `client` is required —
 * without it, TS would try to emit `.d.ts` referencing `@prisma/client/runtime/library`
 * by relative path (non-portable) and fail.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient = prisma;

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
