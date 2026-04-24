#!/usr/bin/env bash
# =========================================================
# scripts/setup-vps.sh — ONE-SHOT bootstrap cho VPS Ubuntu mới toanh.
#
# Dùng khi nào:
#   Bạn vừa mua VPS Ubuntu 22.04 LTS hoặc 24.04 LTS, mới SSH vào
#   lần đầu (mặc định là user root). Script này sẽ chuẩn bị mọi
#   thứ cần thiết để deploy LMS: Docker, firewall, swap, Node.js,
#   certbot (cho SSL).
#
# Cách dùng (trên VPS, chạy với quyền root):
#
#   curl -fsSL https://raw.githubusercontent.com/ceogvd-lgtm/gvd-lms-platform/main/scripts/setup-vps.sh | bash
#
# Hoặc clone repo trước rồi chạy:
#
#   git clone https://github.com/ceogvd-lgtm/gvd-lms-platform.git /srv/lms
#   cd /srv/lms
#   sudo bash scripts/setup-vps.sh
#
# Tương thích:
#   - Ubuntu 22.04 LTS  ✓ (khuyên dùng)
#   - Ubuntu 24.04 LTS  ✓
#   - Debian 12         ✓ (Docker hoạt động như nhau)
#   - CentOS / Rocky    ✗ (package manager khác, cần script riêng)
#
# Thời gian chạy: ~5-10 phút tuỳ tốc độ mạng VPS.
#
# An toàn: script idempotent — chạy lần thứ 2 không phá gì.
# =========================================================

set -Eeuo pipefail

# --- Colors ---
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
CYAN=$'\033[0;36m'
NC=$'\033[0m'

log()  { printf '%s==>%s %s\n' "$CYAN" "$NC" "$*"; }
ok()   { printf '%s✓%s %s\n' "$GREEN" "$NC" "$*"; }
warn() { printf '%s!%s %s\n' "$YELLOW" "$NC" "$*"; }
err()  { printf '%s✗%s %s\n' "$RED" "$NC" "$*" >&2; }

# --- Must be root ---
if [[ $EUID -ne 0 ]]; then
  err "Script phải chạy với quyền root. Dùng: sudo bash scripts/setup-vps.sh"
  exit 1
fi

# --- Detect OS ---
if [[ ! -f /etc/os-release ]]; then
  err "Không xác định được hệ điều hành. Script chỉ hỗ trợ Ubuntu / Debian."
  exit 1
fi
. /etc/os-release
if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
  err "Hệ điều hành $ID không được hỗ trợ. Dùng Ubuntu 22.04+ hoặc Debian 12+."
  exit 1
fi

log "Hệ điều hành: $PRETTY_NAME"
log "Kernel: $(uname -r)"
log "CPU: $(nproc) cores  ·  RAM: $(free -h | awk '/^Mem:/ {print $2}')  ·  Disk: $(df -h / | awk 'NR==2 {print $4}') free"

# ============================================================
# 1. System update
# ============================================================
log "1/8 — Cập nhật hệ thống (apt update + upgrade)..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -yq \
  -o Dpkg::Options::="--force-confdef" \
  -o Dpkg::Options::="--force-confold" \
  >/dev/null 2>&1 || warn "apt upgrade có vài gói skip — không sao"
apt-get install -yq --no-install-recommends \
  ca-certificates curl gnupg lsb-release \
  git unzip jq \
  ufw fail2ban \
  software-properties-common >/dev/null
ok "Hệ thống up-to-date"

# ============================================================
# 2. Timezone (Asia/Ho_Chi_Minh)
# ============================================================
log "2/8 — Đặt timezone Asia/Ho_Chi_Minh..."
timedatectl set-timezone Asia/Ho_Chi_Minh
ok "Timezone: $(timedatectl | grep 'Time zone' | awk '{print $3}')"

# ============================================================
# 3. Swap file (cho VPS RAM thấp)
# ============================================================
TOTAL_RAM_MB=$(free -m | awk '/^Mem:/ {print $2}')
if [[ $TOTAL_RAM_MB -lt 4000 ]]; then
  log "3/8 — Tạo swap 2GB (RAM thấp: ${TOTAL_RAM_MB}MB)..."
  if [[ ! -f /swapfile ]]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    if ! grep -q '/swapfile' /etc/fstab; then
      echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi
    sysctl vm.swappiness=10 >/dev/null
    echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
    ok "Swap 2GB đã bật"
  else
    ok "Swap file đã tồn tại"
  fi
else
  log "3/8 — RAM >= 4GB, bỏ qua swap file"
fi

# ============================================================
# 4. Firewall (UFW)
# ============================================================
log "4/8 — Cấu hình firewall UFW..."
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp    comment 'SSH' >/dev/null
ufw allow 80/tcp    comment "HTTP (Lets Encrypt)" >/dev/null
ufw allow 443/tcp   comment 'HTTPS' >/dev/null
ufw --force enable >/dev/null
ok "Firewall bật — chỉ mở 22 / 80 / 443"

# ============================================================
# 5. fail2ban (chống brute-force SSH)
# ============================================================
log "5/8 — Bật fail2ban (chặn brute-force SSH)..."
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
EOF
systemctl enable --now fail2ban >/dev/null 2>&1
ok "fail2ban: 5 lần SSH sai → ban 1 tiếng"

# ============================================================
# 6. Docker + Docker Compose v2
# ============================================================
log "6/8 — Cài Docker Engine + Compose v2..."
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/${ID} $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -yq --no-install-recommends \
    docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin >/dev/null
  ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"
  ok "Compose $(docker compose version --short)"
else
  ok "Docker đã cài: $(docker --version | awk '{print $3}' | tr -d ',')"
fi

systemctl enable --now docker >/dev/null
# Log rotation cho Docker (tránh /var/lib/docker đầy ổ)
if [[ ! -f /etc/docker/daemon.json ]]; then
  cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF
  systemctl restart docker
  ok "Docker log rotation: 10MB × 3 file"
fi

# ============================================================
# 7. Tạo user 'lms' (tránh chạy mọi thứ bằng root)
# ============================================================
log "7/8 — Tạo user 'lms' để chạy ứng dụng..."
if ! id lms >/dev/null 2>&1; then
  useradd -m -s /bin/bash lms
  usermod -aG docker lms
  ok "User 'lms' đã tạo + thêm vào nhóm docker"
else
  usermod -aG docker lms 2>/dev/null || true
  ok "User 'lms' đã tồn tại"
fi

# Mount point cho repo
mkdir -p /srv/lms
chown -R lms:lms /srv/lms
ok "Mount point: /srv/lms (owner: lms)"

# ============================================================
# 8. Certbot cho SSL (Let's Encrypt)
# ============================================================
log "8/8 — Cài certbot (Let's Encrypt SSL)..."
if ! command -v certbot >/dev/null 2>&1; then
  apt-get install -yq --no-install-recommends certbot >/dev/null
  ok "certbot $(certbot --version 2>&1 | awk '{print $2}')"
else
  ok "certbot đã cài"
fi

# ============================================================
# Summary
# ============================================================
echo ""
printf '%s━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%s\n' "$GREEN" "$NC"
printf '%s✅ VPS đã sẵn sàng để deploy LMS!%s\n' "$GREEN" "$NC"
printf '%s━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%s\n\n' "$GREEN" "$NC"

cat <<'EOF'
Bước tiếp theo:

1. Chuyển sang user lms:
     su - lms

2. Clone repo về /srv/lms:
     git clone https://github.com/ceogvd-lgtm/gvd-lms-platform.git /srv/lms
     cd /srv/lms
     git checkout v1.0.15   # hoặc tag mới nhất

3. Tạo file .env.production tự động (script giúp):
     bash scripts/generate-env.sh

4. Lấy SSL cert (thay your-domain.com):
     sudo bash scripts/setup-ssl.sh your-domain.com

5. Preflight check:
     bash scripts/preflight.sh

6. Deploy thực sự:
     bash scripts/deploy.sh --first-run

Xem tài liệu đầy đủ: docs/DEPLOYMENT.md
EOF
