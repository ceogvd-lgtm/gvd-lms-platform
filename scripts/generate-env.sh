#!/usr/bin/env bash
# =========================================================
# scripts/generate-env.sh — tự động sinh .env.production
#
# Script này hỏi vài thông tin cơ bản (domain, email, SMTP...) rồi:
#   - Tự sinh JWT_SECRET, REFRESH_TOKEN_SECRET (openssl rand)
#   - Tự sinh POSTGRES_PASSWORD, REDIS_PASSWORD, MINIO keys
#   - Ghép lại thành file .env.production hoàn chỉnh
#
# Mục đích: tránh bạn tự gõ / nhớ các secret — dễ sai, dễ quên.
#
# Cách dùng:
#   cd /srv/lms
#   bash scripts/generate-env.sh
#
# Script tương tác (hỏi đáp) — đọc từng câu và trả lời.
#
# An toàn:
#   - Nếu .env.production đã tồn tại → hỏi xác nhận trước khi ghi đè
#   - Secret in ra terminal duy nhất 1 lần — lưu lại cẩn thận
# =========================================================

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# --- Colors ---
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
CYAN=$'\033[0;36m'
GREY=$'\033[0;90m'
BOLD=$'\033[1m'
NC=$'\033[0m'

header() { printf '\n%s━━━ %s ━━━%s\n' "$CYAN" "$1" "$NC"; }
ask()    { printf '%s?%s %s ' "$YELLOW" "$NC" "$1"; }
info()   { printf '  %s→%s %s\n' "$GREY" "$NC" "$1"; }

# --- Check openssl ---
if ! command -v openssl >/dev/null 2>&1; then
  printf '%s✗ openssl không có sẵn%s — cần để sinh secret\n' "$RED" "$NC"
  echo "Cài: sudo apt install openssl"
  exit 1
fi

# --- Check xem .env.production đã tồn tại chưa ---
if [[ -f .env.production ]]; then
  printf '%s⚠  .env.production đã tồn tại%s\n' "$YELLOW" "$NC"
  ask "Ghi đè? (sẽ backup bản cũ thành .env.production.bak) [y/N]:"
  read -r CONFIRM
  if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "Huỷ. Không thay đổi gì."
    exit 0
  fi
  cp .env.production .env.production.bak
  info "Đã backup → .env.production.bak"
fi

printf '\n%s╔════════════════════════════════════════════════╗%s\n' "$CYAN" "$NC"
printf '%s║  GENERATE .env.production cho GVD next gen LMS ║%s\n' "$CYAN" "$NC"
printf '%s╚════════════════════════════════════════════════╝%s\n' "$CYAN" "$NC"

echo ""
echo "Script này sẽ hỏi 5-6 câu cơ bản + tự sinh các secret phức tạp."
echo "Mỗi câu có ví dụ hoặc giá trị mặc định (gõ Enter để chấp nhận)."
echo ""

# ============================================================
# 1. Domain
# ============================================================
header "1. Tên miền (domain)"
echo "Domain bạn đã mua và đã trỏ A record về IP của VPS này."
echo "Ví dụ: gvdsoft.com.vn / lms.truongdientu.edu.vn"
ask "Domain chính [nextgenlms.com.vn]:"
read -r DOMAIN
DOMAIN="${DOMAIN:-nextgenlms.com.vn}"
info "Sử dụng: $DOMAIN"

# ============================================================
# 2. Admin email
# ============================================================
header "2. Email Super Admin đầu tiên"
echo "Tài khoản quản trị cao nhất. Bạn sẽ dùng để login lần đầu."
ask "Email Super Admin [admin@${DOMAIN}]:"
read -r ADMIN_EMAIL
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@${DOMAIN}}"

ask "Mật khẩu Super Admin (để trống = sinh tự động 16 ký tự):"
read -rs ADMIN_PASS
echo ""
if [[ -z "$ADMIN_PASS" ]]; then
  ADMIN_PASS=$(openssl rand -base64 16 | tr -d '/+=' | head -c 16)
  info "Sinh mật khẩu: $ADMIN_PASS"
  info "LƯU LẠI NGAY — không hiện lại lần nữa!"
fi

# ============================================================
# 3. SMTP
# ============================================================
header "3. Cấu hình email (SMTP)"
echo "LMS gửi email qua SMTP provider (SendGrid / Gmail / Mailgun)."
echo ""
echo "Nếu CHƯA có, bỏ qua bước này (bấm Enter) — lúc deploy xong vào"
echo "/admin/settings điền sau cũng được. LMS sẽ KHÔNG gửi được email"
echo "cho tới khi điền."
echo ""
ask "SMTP Host [smtp.sendgrid.net]:"
read -r SMTP_HOST
SMTP_HOST="${SMTP_HOST:-smtp.sendgrid.net}"

ask "SMTP Port [587]:"
read -r SMTP_PORT
SMTP_PORT="${SMTP_PORT:-587}"

ask "SMTP User [apikey]:"
read -r SMTP_USER
SMTP_USER="${SMTP_USER:-apikey}"

ask "SMTP Password (dán API key hoặc app password):"
read -rs SMTP_PASS
echo ""
if [[ -z "$SMTP_PASS" ]]; then
  SMTP_PASS="CHANGE_ME_LATER"
  info "Để CHANGE_ME — nhớ điền trong /admin/settings sau deploy"
fi

ask "Email 'From' hiển thị [no-reply@${DOMAIN}]:"
read -r SMTP_FROM_EMAIL
SMTP_FROM_EMAIL="${SMTP_FROM_EMAIL:-no-reply@${DOMAIN}}"

# ============================================================
# 4. Gemini API key
# ============================================================
header "4. Gemini API key (AI chat)"
echo "Lấy key miễn phí tại: https://aistudio.google.com/app/apikey"
echo "Free tier: 1500 request/ngày."
echo ""
ask "Gemini API key (để trống nếu chưa có, điền sau):"
read -r GEMINI_KEY
if [[ -z "$GEMINI_KEY" ]]; then
  GEMINI_KEY="CHANGE_ME_LATER"
  info "AI chat sẽ tạm tắt cho tới khi điền"
fi

# ============================================================
# 5. Google OAuth (optional)
# ============================================================
header "5. Google OAuth (tuỳ chọn)"
echo "Cho phép user đăng nhập bằng Google. Để trống nếu không dùng."
ask "Google Client ID (để trống để skip):"
read -r GOOGLE_ID
ask "Google Client Secret (để trống để skip):"
read -r GOOGLE_SECRET
GOOGLE_ID="${GOOGLE_ID:-your-client-id.apps.googleusercontent.com}"
GOOGLE_SECRET="${GOOGLE_SECRET:-CHANGE_ME}"

# ============================================================
# 6. Sinh secrets
# ============================================================
header "Sinh secrets an toàn..."
JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')
REFRESH_TOKEN_SECRET=$(openssl rand -base64 64 | tr -d '\n')
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
MINIO_ACCESS_KEY=$(openssl rand -hex 12)
MINIO_SECRET_KEY=$(openssl rand -base64 32 | tr -d '/+=' | head -c 40)
info "JWT_SECRET            (64 bytes base64)"
info "REFRESH_TOKEN_SECRET  (64 bytes base64)"
info "POSTGRES_PASSWORD     (32 chars)"
info "REDIS_PASSWORD        (32 chars)"
info "MINIO_ACCESS_KEY      (24 hex)"
info "MINIO_SECRET_KEY      (40 chars)"

# ============================================================
# Ghép lại .env.production
# ============================================================
header "Tạo .env.production..."

cat > .env.production <<EOF
# =========================================================
# GVD next gen LMS — .env.production
# Auto-generated by scripts/generate-env.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# DO NOT COMMIT THIS FILE TO GIT.
# =========================================================

# ---------- App ----------
APP_VERSION=1.0.15
DOMAIN=${DOMAIN}
NODE_ENV=production

# ---------- Database (Postgres 16) ----------
POSTGRES_USER=lms
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=lms_prod
DATABASE_URL=postgresql://lms:${POSTGRES_PASSWORD}@postgres:5432/lms_prod?schema=public

# ---------- Redis 7 ----------
REDIS_PASSWORD=${REDIS_PASSWORD}
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379

# ---------- JWT ----------
JWT_SECRET=${JWT_SECRET}
REFRESH_TOKEN_SECRET=${REFRESH_TOKEN_SECRET}
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

# ---------- URLs ----------
NEXT_PUBLIC_API_URL=https://${DOMAIN}/api/v1
APP_BASE_URL=https://${DOMAIN}
FRONTEND_URL=https://${DOMAIN}
ALLOWED_ORIGINS=https://${DOMAIN},https://www.${DOMAIN}

# ---------- Google OAuth ----------
GOOGLE_CLIENT_ID=${GOOGLE_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_SECRET}
GOOGLE_CALLBACK_URL=https://${DOMAIN}/api/v1/auth/google/callback

# ---------- MinIO ----------
MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY}
MINIO_SECRET_KEY=${MINIO_SECRET_KEY}
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_PUBLIC_BASE_URL=https://${DOMAIN}/minio/lms-uploads

# ---------- SMTP ----------
SMTP_HOST=${SMTP_HOST}
SMTP_PORT=${SMTP_PORT}
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}
SMTP_FROM="GVD next gen LMS <${SMTP_FROM_EMAIL}>"
SMTP_SECURE=false

# ---------- Gemini AI ----------
GEMINI_API_KEY=${GEMINI_KEY}
GEMINI_MODEL=gemini-2.5-flash
GEMINI_MODEL_LITE=gemini-flash-lite-latest
GEMINI_MODEL_EMBEDDING=gemini-embedding-001

# ---------- ChromaDB ----------
CHROMA_HOST=chromadb
CHROMA_PORT=8000
CHROMA_COLLECTION=lms_docs

# ---------- Sentry (optional) ----------
SENTRY_DSN=
SENTRY_ENVIRONMENT=production

# ---------- Backups ----------
S3_BUCKET=
AWS_DEFAULT_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
RETENTION_DAYS=30

# ---------- First-run seed ----------
SEED_SUPER_ADMIN_EMAIL=${ADMIN_EMAIL}
SEED_SUPER_ADMIN_PASSWORD=${ADMIN_PASS}
EOF

chmod 600 .env.production
info "Permission 600 (chỉ owner đọc được)"

# ============================================================
# Summary + save credentials
# ============================================================
CREDS_FILE="credentials-$(date +%Y%m%d-%H%M%S).txt"
cat > "$CREDS_FILE" <<EOF
╔══════════════════════════════════════════════════════════╗
║         GVD next gen LMS — Deploy Credentials            ║
║         Tạo lúc: $(date)
║         Domain:  ${DOMAIN}
╚══════════════════════════════════════════════════════════╝

⚠️  LƯU FILE NÀY Ở NƠI AN TOÀN (password manager, USB encrypted…)
⚠️  XOÁ FILE SAU KHI ĐÃ LƯU VÀO NƠI KHÁC
⚠️  KHÔNG COMMIT LÊN GIT

━━━ SUPER ADMIN (để login lần đầu) ━━━
Email:     ${ADMIN_EMAIL}
Password:  ${ADMIN_PASS}
URL:       https://${DOMAIN}/login

━━━ DATABASE ━━━
Postgres user:       lms
Postgres password:   ${POSTGRES_PASSWORD}
Postgres database:   lms_prod

━━━ REDIS ━━━
Password:  ${REDIS_PASSWORD}

━━━ MINIO (file storage) ━━━
Access key:  ${MINIO_ACCESS_KEY}
Secret key:  ${MINIO_SECRET_KEY}

━━━ JWT (token ký) ━━━
JWT_SECRET:
${JWT_SECRET}

REFRESH_TOKEN_SECRET:
${REFRESH_TOKEN_SECRET}

━━━ SMTP ━━━
Host:      ${SMTP_HOST}
Port:      ${SMTP_PORT}
User:      ${SMTP_USER}
Password:  ${SMTP_PASS}
From:      no-reply@${DOMAIN}

━━━ Gemini API ━━━
Key: ${GEMINI_KEY}

━━━ Google OAuth ━━━
Client ID:      ${GOOGLE_ID}
Client Secret:  ${GOOGLE_SECRET}
Callback URL:   https://${DOMAIN}/api/v1/auth/google/callback

Sau khi lưu xong, xoá file này:
  rm ${CREDS_FILE}
EOF
chmod 600 "$CREDS_FILE"

echo ""
printf '%s━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%s\n' "$GREEN" "$NC"
printf '%s✅ .env.production đã sẵn sàng!%s\n' "$GREEN" "$NC"
printf '%s━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%s\n\n' "$GREEN" "$NC"

echo "Credentials đã lưu vào: $CREDS_FILE"
echo ""
printf '%s⚠️  QUAN TRỌNG:%s\n' "$YELLOW" "$NC"
echo "   1. Mở file $CREDS_FILE và copy vào password manager của bạn"
echo "   2. Sau đó XOÁ file này (rm $CREDS_FILE) để tránh lộ"
echo "   3. File .env.production giữ trên VPS — không commit git"
echo ""
echo "Bước tiếp theo:"
echo "   sudo bash scripts/setup-ssl.sh ${DOMAIN}"
echo "   bash scripts/preflight.sh"
echo "   bash scripts/deploy.sh --first-run"
