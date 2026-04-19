#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * GVD LMS — Auto restore script.
 *
 * Chạy sau khi `git clone` để dựng lại môi trường dev từ đầu:
 *   1. Kiểm tra prerequisites (docker, pnpm, node version)
 *   2. Copy .env.example → .env (nếu chưa có) + auto-gen JWT secrets
 *   3. pnpm install
 *   4. Prisma generate
 *   5. Khởi động Docker containers (postgres/redis/minio/mailpit/chromadb)
 *   6. Đợi Postgres ready
 *   7. Chạy migrations
 *   8. Seed super admin + demo data
 *   9. Báo cáo URL dev + tài khoản test
 *
 * Usage:
 *   pnpm run restore
 *   pnpm run restore -- --skip-install     (bỏ qua pnpm install)
 *   pnpm run restore -- --skip-seed        (bỏ qua seed demo)
 *   pnpm run restore -- --skip-docker      (khi Docker đã chạy sẵn)
 *
 * Mỗi bước ghi rõ kết quả; nếu fail ở bước nào, script dừng và chỉ ra
 * cách fix thủ công.
 */

'use strict';

const { execSync, spawnSync } = require('node:child_process');
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const { randomBytes } = require('node:crypto');
const { resolve } = require('node:path');

// =====================================================
// CLI args
// =====================================================
const args = new Set(process.argv.slice(2));
const SKIP_INSTALL = args.has('--skip-install');
const SKIP_SEED = args.has('--skip-seed');
const SKIP_DOCKER = args.has('--skip-docker');

// =====================================================
// Pretty output
// =====================================================
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};
const ok = (msg) => console.log(`${c.green}✓${c.reset} ${msg}`);
const warn = (msg) => console.log(`${c.yellow}⚠${c.reset} ${msg}`);
const err = (msg) => console.log(`${c.red}✗${c.reset} ${msg}`);
const step = (n, msg) =>
  console.log(`\n${c.bold}${c.cyan}[${n}]${c.reset} ${c.bold}${msg}${c.reset}`);
const hint = (msg) => console.log(`  ${c.dim}${msg}${c.reset}`);

const ROOT = resolve(__dirname, '..');

// =====================================================
// Helpers
// =====================================================
function run(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'inherit', cwd: ROOT, shell: true, ...opts });
}

function runCapture(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, shell: true, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/**
 * Parse root .env và trả về map key=value. Prisma CLI chỉ tự nạp .env
 * trong working dir của lệnh (packages/database), không tự lên root.
 * Cần đọc + inject vào env khi spawn Prisma.
 */
function loadRootEnv() {
  const envPath = resolve(ROOT, '.env');
  if (!existsSync(envPath)) return {};
  const content = readFileSync(envPath, 'utf8');
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/** Run command with root .env merged vào process.env. */
function runWithEnv(cmd) {
  return execSync(cmd, {
    stdio: 'inherit',
    cwd: ROOT,
    shell: true,
    env: { ...process.env, ...loadRootEnv() },
  });
}

function has(bin) {
  const cmd = process.platform === 'win32' ? `where ${bin}` : `command -v ${bin}`;
  try {
    execSync(cmd, { stdio: 'ignore', shell: true });
    return true;
  } catch {
    return false;
  }
}

function fail(msg, fixHint) {
  err(msg);
  if (fixHint) {
    console.log(`\n  ${c.yellow}Cách khắc phục:${c.reset} ${fixHint}`);
  }
  process.exit(1);
}

// =====================================================
// Step 1 — Prerequisites
// =====================================================
function checkPrereq() {
  step(1, 'Kiểm tra prerequisites');

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor < 20) {
    fail(`Node ${process.versions.node} quá cũ (cần ≥ 20)`, 'cài Node 20+ từ https://nodejs.org');
  }
  ok(`Node ${process.versions.node}`);

  if (!has('pnpm')) fail('pnpm chưa cài', 'chạy `npm install -g pnpm`');
  ok(`pnpm ${runCapture('pnpm --version') ?? '?'}`);

  if (!SKIP_DOCKER) {
    if (!has('docker')) fail('docker chưa cài', 'cài Docker Desktop từ https://docker.com');
    // `docker info` xác nhận daemon đang chạy, không phải chỉ CLI
    const info = runCapture('docker info --format {{.ServerVersion}}');
    if (!info) {
      fail('Docker daemon chưa chạy', 'mở Docker Desktop rồi chạy lại');
    }
    ok(`Docker daemon ${info}`);
  } else {
    warn('Bỏ qua kiểm tra Docker (--skip-docker)');
  }

  if (!has('git')) fail('git chưa cài', 'cài từ https://git-scm.com');
  ok('git có sẵn');
}

// =====================================================
// Step 2 — .env file
// =====================================================
function ensureEnv() {
  step(2, 'Kiểm tra / tạo .env');

  const envPath = resolve(ROOT, '.env');
  const examplePath = resolve(ROOT, '.env.example');

  if (existsSync(envPath)) {
    ok('.env đã tồn tại — giữ nguyên');
    return;
  }

  if (!existsSync(examplePath)) {
    fail('.env.example không tồn tại', 'repo hỏng — re-clone');
  }

  let content = readFileSync(examplePath, 'utf8');

  // Auto-generate JWT secrets bằng 64 ký tự ngẫu nhiên
  const jwt = randomBytes(48).toString('base64url');
  const refresh = randomBytes(48).toString('base64url');
  content = content
    .replace(/^JWT_SECRET=.*/m, `JWT_SECRET=${jwt}`)
    .replace(/^REFRESH_TOKEN_SECRET=.*/m, `REFRESH_TOKEN_SECRET=${refresh}`);

  writeFileSync(envPath, content, 'utf8');
  ok('Tạo .env mới từ .env.example');
  ok('Auto-generate JWT_SECRET + REFRESH_TOKEN_SECRET (64 ký tự random)');
  warn('Các secret sau VẪN PHẢI điền thủ công trước khi dùng tính năng tương ứng:');
  hint('- GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (cho Google OAuth)');
  hint('- GEMINI_API_KEY (cho AI chatbot Phase 17)');
  hint('- SMTP_* (nếu không dùng Mailpit)');
  hint('Mở C:/GVD-lms-platform/.env và điền các giá trị còn thiếu.');
}

// =====================================================
// Step 3 — pnpm install
// =====================================================
function installDeps() {
  step(3, 'pnpm install');
  if (SKIP_INSTALL) {
    warn('Bỏ qua (--skip-install)');
    return;
  }
  run('pnpm install --frozen-lockfile');
  ok('Dependencies đã cài');
}

// =====================================================
// Step 4 — Prisma generate
// =====================================================
function prismaGenerate() {
  step(4, 'Prisma generate');
  runWithEnv('pnpm --filter @lms/database exec prisma generate');
  ok('Prisma client đã generate');
}

// =====================================================
// Step 5 — Docker up
// =====================================================
function dockerUp() {
  step(5, 'Khởi động Docker containers');
  if (SKIP_DOCKER) {
    warn('Bỏ qua (--skip-docker)');
    return;
  }

  // Include override nếu có (máy cũ dev có 5433:5432 mapping để tránh
  // đụng Postgres local đang chạy 5432). Clone mới không có override →
  // dùng default dev.yml với 5432:5432.
  const overridePath = resolve(ROOT, 'docker/docker-compose.override.yml');
  const dockerCmd = existsSync(overridePath)
    ? 'docker compose -f docker/docker-compose.dev.yml -f docker/docker-compose.override.yml up -d'
    : 'docker compose -f docker/docker-compose.dev.yml up -d';
  run(dockerCmd);

  // Verify 5 containers lên
  const needed = ['postgres', 'redis', 'minio', 'mailpit', 'chromadb'];
  for (const svc of needed) {
    const running = runCapture(`docker ps --filter name=lms-${svc}-dev --format {{.Status}}`);
    if (!running || !running.startsWith('Up')) {
      fail(
        `Container lms-${svc}-dev chưa lên (status=${running ?? 'missing'})`,
        `chạy \`docker compose -f docker/docker-compose.dev.yml logs ${svc}\` để xem lỗi`,
      );
    }
  }
  ok('5 containers đang chạy');
}

// =====================================================
// Step 6 — Đợi Postgres ready
// =====================================================
function waitPostgres() {
  step(6, 'Đợi Postgres ready');
  const maxAttempts = 30; // 30 × 1s = 30s
  for (let i = 1; i <= maxAttempts; i++) {
    const res = spawnSync(
      'docker',
      ['exec', 'lms-postgres-dev', 'pg_isready', '-U', 'lms', '-d', 'lms'],
      { stdio: 'ignore' },
    );
    if (res.status === 0) {
      ok(`Postgres ready sau ${i}s`);
      return;
    }
    process.stdout.write(`  ${c.dim}... đợi ${i}/${maxAttempts}${c.reset}\r`);
    // Block 1 giây
    const t = Date.now() + 1000;
    while (Date.now() < t) {}
  }
  fail('Postgres không ready sau 30s', 'kiểm tra `docker logs lms-postgres-dev`');
}

// =====================================================
// Step 7 — Migrations
// =====================================================
function runMigrations() {
  step(7, 'Chạy Prisma migrations');
  runWithEnv('pnpm --filter @lms/database exec prisma migrate deploy');
  ok('Migrations đã apply');
}

// =====================================================
// Step 8 — Seed
// =====================================================
function runSeed() {
  step(8, 'Seed dữ liệu');
  if (SKIP_SEED) {
    warn('Bỏ qua (--skip-seed)');
    return;
  }

  // Seed super admin (idempotent — OK chạy nhiều lần)
  try {
    runWithEnv('pnpm --filter @lms/database exec tsx prisma/seed.ts');
    ok('Seed super admin');
  } catch {
    warn('Seed super admin lỗi — có thể đã tồn tại, bỏ qua');
  }

  // Seed demo (idempotent)
  try {
    runWithEnv('pnpm --filter @lms/database exec tsx prisma/seed-demo.ts');
    ok('Seed demo data (instructor + student + PPE course)');
  } catch {
    warn('Seed demo lỗi — có thể đã tồn tại, bỏ qua');
  }
}

// =====================================================
// Step 9 — Final report
// =====================================================
function report() {
  step(9, 'Hoàn tất ✅');
  console.log(`
${c.bold}${c.green}GVD LMS đã được khôi phục thành công!${c.reset}

${c.bold}Chạy dev server:${c.reset}
  pnpm dev

${c.bold}URL sẽ có khi dev chạy:${c.reset}
  - Backend:     ${c.blue}http://localhost:4000/api/v1/health${c.reset}
  - Frontend:    ${c.blue}http://localhost:3000/login${c.reset}
  - MinIO UI:    ${c.blue}http://localhost:9001${c.reset}  (user: minioadmin / minioadmin)
  - Mailpit UI:  ${c.blue}http://localhost:8025${c.reset}
  - Prisma Studio: ${c.blue}pnpm db:studio${c.reset} → http://localhost:5555

${c.bold}Tài khoản test:${c.reset}
  SUPER_ADMIN:  admin@lms.local       / Admin@123456
  INSTRUCTOR:   instructor@lms.local  / Instructor@123456
  STUDENT:      student@lms.local     / Student@123456

${c.bold}${c.yellow}Kiểm tra .env trước khi demo:${c.reset}
  - GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (nếu test Google OAuth)
  - GEMINI_API_KEY (nếu test AI chatbot Phase 17)
`);
}

// =====================================================
// Main
// =====================================================
(async function main() {
  const start = Date.now();
  console.log(
    `${c.bold}${c.cyan}GVD LMS — Restore Script${c.reset} ${c.dim}(scripts/restore.js)${c.reset}\n`,
  );
  try {
    checkPrereq();
    ensureEnv();
    installDeps();
    prismaGenerate();
    dockerUp();
    waitPostgres();
    runMigrations();
    runSeed();
    report();
    const dur = ((Date.now() - start) / 1000).toFixed(1);
    ok(`Tổng thời gian: ${dur}s`);
  } catch (e) {
    err(`Restore thất bại: ${e.message}`);
    process.exit(1);
  }
})();
