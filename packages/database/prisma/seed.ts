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

interface SettingSeed {
  key: string;
  value: unknown;
  description: string;
}

/**
 * Default system settings (Phase 09). Each row is upserted with `create`
 * only — we NEVER overwrite an existing value so a SUPER_ADMIN can safely
 * tweak these via /admin/settings without losing their changes when the
 * seed is re-run.
 */
const DEFAULT_SETTINGS: SettingSeed[] = [
  {
    key: 'org.name',
    value: 'GVD next-gen LMS',
    description: 'Tên tổ chức hiển thị trên header và email',
  },
  { key: 'org.logoUrl', value: '/logo-gvd.svg', description: 'URL logo tổ chức' },
  { key: 'org.primaryColor', value: '#1E40AF', description: 'Màu thương hiệu chính' },
  { key: 'org.secondaryColor', value: '#7C3AED', description: 'Màu thương hiệu phụ' },
  { key: 'smtp.host', value: process.env.SMTP_HOST ?? 'smtp.gmail.com', description: 'SMTP host' },
  { key: 'smtp.port', value: Number(process.env.SMTP_PORT ?? 587), description: 'SMTP port' },
  { key: 'smtp.user', value: process.env.SMTP_USER ?? '', description: 'SMTP username' },
  {
    key: 'smtp.from',
    value: process.env.SMTP_FROM ?? 'GVD next-gen LMS <no-reply@gvd.local>',
    description: 'Địa chỉ người gửi mặc định',
  },
  { key: 'security.passwordMinLength', value: 8, description: 'Độ dài tối thiểu của mật khẩu' },
  { key: 'security.require2FAAdmin', value: true, description: 'Yêu cầu 2FA cho ADMIN+' },
  {
    key: 'security.sessionTimeoutMin',
    value: 15,
    description: 'Thời gian access token hiệu lực (phút)',
  },
  { key: 'storage.maxPerUserMB', value: 500, description: 'Dung lượng tối đa mỗi user (MB)' },
  {
    key: 'storage.maxPerCourseMB',
    value: 2048,
    description: 'Dung lượng tối đa mỗi khoá học (MB)',
  },
];

async function seedSystemSettings(): Promise<number> {
  let created = 0;
  for (const setting of DEFAULT_SETTINGS) {
    // Use `upsert` with an empty update block so existing rows are never
    // overwritten — we only want to seed missing defaults.
    const before = await prisma.systemSetting.findUnique({ where: { key: setting.key } });
    if (before) continue;

    await prisma.systemSetting.create({
      data: {
        key: setting.key,
        value: setting.value as never,
        description: setting.description,
      },
    });
    created += 1;
  }
  return created;
}

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

  const seededSettings = await seedSystemSettings();

  /* eslint-disable no-console */
  console.log(`[seed] ✓ SUPER_ADMIN ready`);
  console.log(`        id:          ${user.id}`);
  console.log(`        email:       ${user.email}`);
  console.log(`        role:        ${user.role}`);
  console.log(`        createdAt:   ${user.createdAt.toISOString()}`);
  console.log(`        totalSupers: ${count}`);
  console.log('');
  console.log(`[seed] ✓ SystemSettings: ${seededSettings} new default(s) inserted`);
  console.log(`        (${DEFAULT_SETTINGS.length - seededSettings} already existed, not touched)`);
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
