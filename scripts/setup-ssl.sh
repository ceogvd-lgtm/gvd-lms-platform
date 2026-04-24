#!/usr/bin/env bash
# =========================================================
# scripts/setup-ssl.sh — Lấy SSL certificate miễn phí từ Let's Encrypt
#
# Cách dùng:
#   sudo bash scripts/setup-ssl.sh gvdsoft.com.vn
#   sudo bash scripts/setup-ssl.sh gvdsoft.com.vn www.gvdsoft.com.vn
#
# Yêu cầu:
#   1. Domain đã trỏ A record về IP VPS (dùng `dig +short <domain>` check)
#   2. Port 80 mở (firewall đã mở — setup-vps.sh làm rồi)
#   3. Chưa có webserver khác listen port 80
#
# Script làm gì:
#   1. Gọi certbot ở chế độ standalone (tự spawn server tạm trên port 80)
#   2. Lấy cert về /etc/letsencrypt/live/<domain>/
#   3. Copy cert vào docker/nginx/certs/ để nginx container đọc
#   4. Setup cron tự renew trước khi hết hạn (mỗi 90 ngày)
#
# Nếu bạn đã có cert (từ nhà cung cấp khác) → bỏ qua script này,
# tự copy cert vào docker/nginx/certs/.
# =========================================================

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
CYAN=$'\033[0;36m'
NC=$'\033[0m'

log()  { printf '%s==>%s %s\n' "$CYAN" "$NC" "$*"; }
ok()   { printf '%s✓%s %s\n' "$GREEN" "$NC" "$*"; }
warn() { printf '%s!%s %s\n' "$YELLOW" "$NC" "$*"; }
err()  { printf '%s✗%s %s\n' "$RED" "$NC" "$*" >&2; }

# --- Phải chạy root ---
if [[ $EUID -ne 0 ]]; then
  err "Phải chạy với sudo: sudo bash scripts/setup-ssl.sh <domain>"
  exit 1
fi

# --- Args ---
if [[ $# -lt 1 ]]; then
  err "Thiếu domain."
  echo "Dùng: sudo bash scripts/setup-ssl.sh <domain> [www.<domain>]"
  echo "Ví dụ: sudo bash scripts/setup-ssl.sh gvdsoft.com.vn www.gvdsoft.com.vn"
  exit 1
fi

DOMAINS=("$@")
PRIMARY_DOMAIN="${DOMAINS[0]}"

# --- Kiểm tra certbot ---
if ! command -v certbot >/dev/null 2>&1; then
  err "certbot chưa cài. Chạy scripts/setup-vps.sh trước."
  exit 1
fi

# --- Kiểm tra DNS ---
log "Kiểm tra DNS của $PRIMARY_DOMAIN..."
if ! command -v dig >/dev/null 2>&1; then
  apt-get install -yq --no-install-recommends dnsutils >/dev/null
fi

VPS_IP=$(curl -s4 ifconfig.me 2>/dev/null || curl -s4 icanhazip.com || echo "unknown")
DOMAIN_IP=$(dig +short "$PRIMARY_DOMAIN" A | head -1)

log "IP VPS hiện tại: $VPS_IP"
log "IP domain trả về: ${DOMAIN_IP:-(không có A record)}"

if [[ -z "$DOMAIN_IP" ]]; then
  err "Domain $PRIMARY_DOMAIN chưa có A record."
  echo "Vào DNS provider của bạn (Cloudflare, GoDaddy, v.v.) thêm:"
  echo "  Type: A"
  echo "  Name: @ (hoặc $PRIMARY_DOMAIN)"
  echo "  Value: $VPS_IP"
  echo "  TTL: Auto / 300"
  echo ""
  echo "Đợi 5-10 phút để DNS lan truyền, rồi chạy lại script này."
  exit 1
fi

if [[ "$DOMAIN_IP" != "$VPS_IP" ]]; then
  warn "DNS trả về IP $DOMAIN_IP ≠ IP VPS $VPS_IP"
  echo "Có thể DNS đang lan truyền (chưa cập nhật) — đợi 5-10 phút rồi thử lại."
  echo "Hoặc bạn đã trỏ về VPS khác? Tiếp tục? [y/N]"
  read -r CONFIRM
  [[ "$CONFIRM" =~ ^[Yy]$ ]] || exit 1
fi

# --- Kiểm tra port 80 không bị chiếm ---
if ss -tlnp | grep -q ':80 '; then
  warn "Port 80 đang được sử dụng. Cần tắt service đó trước khi lấy cert."
  ss -tlnp | grep ':80 '
  echo ""
  echo "Nếu là nginx đang chạy, tắt bằng:"
  echo "  docker compose -f docker/docker-compose.prod.yml --env-file .env.production stop nginx"
  echo ""
  echo "Tiếp tục? [y/N]"
  read -r CONFIRM
  [[ "$CONFIRM" =~ ^[Yy]$ ]] || exit 1
fi

# --- Lấy cert ---
log "Lấy SSL certificate cho: ${DOMAINS[*]}"

CERTBOT_DOMAINS=()
for d in "${DOMAINS[@]}"; do
  CERTBOT_DOMAINS+=(-d "$d")
done

ADMIN_EMAIL="admin@$PRIMARY_DOMAIN"
if [[ -f .env.production ]]; then
  # Đọc từ env nếu có
  eval "$(grep -E '^SEED_SUPER_ADMIN_EMAIL=' .env.production || true)"
  ADMIN_EMAIL="${SEED_SUPER_ADMIN_EMAIL:-admin@$PRIMARY_DOMAIN}"
fi

certbot certonly \
  --standalone \
  --non-interactive \
  --agree-tos \
  --email "$ADMIN_EMAIL" \
  --preferred-challenges http \
  "${CERTBOT_DOMAINS[@]}"

ok "Cert đã lấy thành công"

# --- Copy cert vào folder nginx ---
log "Copy cert vào docker/nginx/certs/..."
mkdir -p docker/nginx/certs
cp -L "/etc/letsencrypt/live/$PRIMARY_DOMAIN/fullchain.pem" "docker/nginx/certs/$PRIMARY_DOMAIN.crt"
cp -L "/etc/letsencrypt/live/$PRIMARY_DOMAIN/privkey.pem" "docker/nginx/certs/$PRIMARY_DOMAIN.key"
chmod 600 "docker/nginx/certs/$PRIMARY_DOMAIN.key"
chmod 644 "docker/nginx/certs/$PRIMARY_DOMAIN.crt"
ok "Cert copy vào docker/nginx/certs/"

# --- Cron auto-renew ---
log "Thiết lập auto-renew mỗi tháng (cron)..."
RENEW_SCRIPT="/usr/local/bin/lms-renew-ssl.sh"
cat > "$RENEW_SCRIPT" <<EOF
#!/usr/bin/env bash
# Tự chạy cron ngày 1 hàng tháng
set -e
cd $REPO_ROOT
docker compose -f docker/docker-compose.prod.yml --env-file .env.production stop nginx || true
certbot renew --standalone --non-interactive --quiet
cp -L "/etc/letsencrypt/live/$PRIMARY_DOMAIN/fullchain.pem" "docker/nginx/certs/$PRIMARY_DOMAIN.crt"
cp -L "/etc/letsencrypt/live/$PRIMARY_DOMAIN/privkey.pem" "docker/nginx/certs/$PRIMARY_DOMAIN.key"
chmod 600 "docker/nginx/certs/$PRIMARY_DOMAIN.key"
docker compose -f docker/docker-compose.prod.yml --env-file .env.production start nginx || true
EOF
chmod +x "$RENEW_SCRIPT"

# Thêm vào crontab (idempotent)
CRON_ENTRY="0 3 1 * * $RENEW_SCRIPT >> /var/log/lms-ssl-renew.log 2>&1"
(crontab -l 2>/dev/null | grep -v "lms-renew-ssl.sh"; echo "$CRON_ENTRY") | crontab -
ok "Auto-renew: ngày 1 hàng tháng, 03:00 sáng"

# --- Summary ---
echo ""
printf '%s━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%s\n' "$GREEN" "$NC"
printf '%s✅ SSL đã sẵn sàng!%s\n' "$GREEN" "$NC"
printf '%s━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%s\n\n' "$GREEN" "$NC"

echo "Cert location:"
echo "  /etc/letsencrypt/live/$PRIMARY_DOMAIN/     (canonical, do certbot quản lý)"
echo "  docker/nginx/certs/$PRIMARY_DOMAIN.crt     (copy cho nginx container)"
echo "  docker/nginx/certs/$PRIMARY_DOMAIN.key"
echo ""
echo "Expiry: $(date -d "$(certbot certificates -d "$PRIMARY_DOMAIN" 2>/dev/null | grep 'Expiry Date' | awk '{print $3,$4,$5}')" 2>/dev/null || echo 'check certbot certificates')"
echo "Renew: tự động ngày 1 hàng tháng, 03:00 sáng"
echo ""
echo "Bước tiếp theo:"
echo "  bash scripts/preflight.sh"
echo "  bash scripts/deploy.sh --first-run"
