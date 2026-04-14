#!/usr/bin/env bash
# LMS Platform — One-shot dev environment bootstrap
# Usage: bash scripts/setup.sh

set -euo pipefail

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${BLUE}==>${NC} $*"; }
ok()   { echo -e "${GREEN}✔${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
err()  { echo -e "${RED}✘${NC} $*" >&2; }

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "Thiếu lệnh: $1. Vui lòng cài đặt trước khi chạy lại."
    exit 1
  fi
}

log "Kiểm tra prerequisites..."
require node
require pnpm
require docker

NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "${NODE_MAJOR}" -lt 20 ]; then
  err "Cần Node.js >= 20 (đang có: $(node -v))"
  exit 1
fi
ok "Node $(node -v)"
ok "pnpm $(pnpm -v)"
ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"

log "Cài đặt dependencies (pnpm install)..."
pnpm install
ok "Dependencies đã cài"

if [ ! -f .env ]; then
  log "Tạo file .env từ .env.example..."
  cp .env.example .env
  warn "Nhớ điền các secret (GOOGLE_CLIENT_ID, GEMINI_API_KEY, SMTP_*, ...) trong .env"
else
  ok ".env đã tồn tại — bỏ qua"
fi

log "Khởi động dev stack (postgres, redis, minio)..."
pnpm docker:dev
ok "Dev stack đang chạy"

log "Đợi postgres healthy..."
for i in $(seq 1 30); do
  if docker exec lms-postgres-dev pg_isready -U lms >/dev/null 2>&1; then
    ok "postgres sẵn sàng"
    break
  fi
  sleep 1
done

log "Generate Prisma client..."
pnpm --filter @lms/database db:generate || warn "Prisma generate thất bại — có thể cần chạy migration trước"

log "Chạy migration ban đầu..."
pnpm --filter @lms/database db:migrate || warn "Migration skip (chưa có migration nào)"

log "Cài đặt husky hooks..."
pnpm prepare || warn "Husky install skip"

ok "Hoàn tất! Các bước tiếp theo:"
echo ""
echo "  1. Điền các giá trị secret trong .env"
echo "  2. Chạy dev server:         pnpm dev"
echo "  3. Mở frontend:             http://localhost:3000"
echo "  4. Mở backend (health):     http://localhost:4000/api/v1/health"
echo "  5. Mở MinIO console:        http://localhost:9001 (minioadmin / minioadmin)"
echo "  6. Mở Prisma Studio:        pnpm db:studio"
echo ""
