/**
 * @lms/database — Prisma client singleton.
 *
 * Usage:
 *   import { prisma } from '@lms/database';
 */
import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __lmsPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__lmsPrisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__lmsPrisma = prisma;
}

export * from '@prisma/client';
