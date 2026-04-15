/**
 * Database seed — idempotent.
 *
 * Creates a single SUPER_ADMIN user so that admin flows can be exercised
 * without a chicken-and-egg bootstrap. Re-running the script is safe: it
 * uses upsert on the email so no duplicates are created, and it never
 * overwrites an existing password.
 *
 * Credentials are read from env vars with development-only defaults:
 *   SEED_SUPER_ADMIN_EMAIL    (default: admin@lms.local)
 *   SEED_SUPER_ADMIN_PASSWORD (default: Admin@123456)
 *   SEED_SUPER_ADMIN_NAME     (default: Super Admin)
 *
 * Invoke with:
 *   pnpm --filter @lms/database db:seed
 */
// IMPORTANT: side-effect import MUST come first so DATABASE_URL is loaded
// before Prisma's module reads process.env at import time.
import './load-env';

import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const BCRYPT_SALT_ROUNDS = 12;

async function main(): Promise<void> {
  const email = (process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@lms.local').toLowerCase();
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'Admin@123456';
  const name = process.env.SEED_SUPER_ADMIN_NAME ?? 'Super Admin';

  // eslint-disable-next-line no-console
  console.log(`[seed] Ensuring SUPER_ADMIN exists: ${email}`);

  const hashed = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  // On re-run: only promote role + re-verify email if somehow changed.
  // Do NOT overwrite the password — the admin may have changed it.
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      role: Role.SUPER_ADMIN,
      emailVerified: true,
      isBlocked: false,
    },
    create: {
      email,
      name,
      password: hashed,
      role: Role.SUPER_ADMIN,
      emailVerified: true,
    },
    select: { id: true, email: true, role: true, createdAt: true },
  });

  const count = await prisma.user.count({
    where: { role: Role.SUPER_ADMIN },
  });

  /* eslint-disable no-console */
  console.log(`[seed] ✓ SUPER_ADMIN ready`);
  console.log(`        id:          ${user.id}`);
  console.log(`        email:       ${user.email}`);
  console.log(`        role:        ${user.role}`);
  console.log(`        createdAt:   ${user.createdAt.toISOString()}`);
  console.log(`        totalSupers: ${count}`);
  console.log('');
  console.log('        ⚠️  Default password is "Admin@123456" — change it immediately');
  console.log('            after first login in production environments.');
  /* eslint-enable no-console */
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[seed] ✗ Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
