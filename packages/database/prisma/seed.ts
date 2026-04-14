/**
 * Prisma seed — Phase 01 placeholder.
 * Tạo 1 SUPER_ADMIN gốc để khởi động hệ thống (sẽ bổ sung password hash ở Phase auth).
 */
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const superAdminEmail = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@lms.local';

  await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: {},
    create: {
      email: superAdminEmail,
      name: 'Super Admin',
      role: Role.SUPER_ADMIN,
      emailVerified: true,
    },
  });

  // eslint-disable-next-line no-console
  console.log(`Seed OK — SUPER_ADMIN = ${superAdminEmail}`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
