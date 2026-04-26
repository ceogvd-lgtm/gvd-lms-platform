#!/usr/bin/env bash
# =========================================================
# scripts/restore-full.sh — Restore từ snapshot tạo bởi backup-full.sh
#
# Usage:
#   bash /srv/lms/scripts/restore-full.sh /srv/lms/backups/auto_20260426_023000
#
# Action:
#   1. Confirm prompt (gõ "yes" mới chạy — chống nhầm tay)
#   2. Stop backend + frontend (downtime ~2 phút)
#   3. pg_restore --clean (DROP + CREATE tables, INSERT data)
#   4. Stop MinIO, wipe + extract minio-data.tar.gz vào volume
#   5. Start MinIO + backend + frontend
#   6. Hint manual restore .env / certs nếu cần
#
# KHÔNG tự động:
#   - Restore .env.production (script chỉ in path, để admin tự cp nếu muốn)
#   - Restore certs (chỉ in path, đa phần đã có cert mới hơn từ certbot renew)
#   Lý do: 2 thứ này hiếm khi cần roll back, đa phần restore là DB+MinIO data.
# =========================================================
set -Eeuo pipefail

REPO_ROOT="/srv/lms"
COMPOSE_FILE="$REPO_ROOT/docker/docker-compose.prod.yml"
ENV_FILE="$REPO_ROOT/.env.production"
POSTGRES_CONTAINER="docker-postgres-1"
MINIO_VOLUME="docker_minio_data"

LOG_PREFIX="[restore-full]"
log() { printf '%s %s\n' "$(date '+%F %T')" "$LOG_PREFIX $*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

# ------------------------------------------------------------
# Args + validation
# ------------------------------------------------------------
if [[ $# -lt 1 ]]; then
  cat <<EOT
Usage: $0 <backup_dir>

Backups khả dụng:
EOT
  ls -dt /srv/lms/backups/auto_* 2>/dev/null | head -10 | while read -r d; do
    sz=$(du -sh "$d" | cut -f1)
    printf '  %s  (%s)\n' "$d" "$sz"
  done
  exit 1
fi

BACKUP_DIR="$1"
[[ -d "$BACKUP_DIR" ]] || fail "Backup dir không tồn tại: $BACKUP_DIR"
[[ -f "$BACKUP_DIR/db.sqlc" ]] || fail "Thiếu db.sqlc trong $BACKUP_DIR"
[[ -f "$BACKUP_DIR/minio-data.tar.gz" ]] || fail "Thiếu minio-data.tar.gz trong $BACKUP_DIR"

PG_USER=$(grep '^POSTGRES_USER=' "$ENV_FILE" | cut -d= -f2)
PG_DB=$(grep '^POSTGRES_DB=' "$ENV_FILE" | cut -d= -f2)

DB_SIZE=$(du -h "$BACKUP_DIR/db.sqlc" | cut -f1)
MN_SIZE=$(du -h "$BACKUP_DIR/minio-data.tar.gz" | cut -f1)

# ------------------------------------------------------------
# Confirm
# ------------------------------------------------------------
cat <<EOT

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  RESTORE TOÀN BỘ HỆ THỐNG TỪ SNAPSHOT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Source backup : $BACKUP_DIR
DB dump       : $DB_SIZE
MinIO tarball : $MN_SIZE

⚠️  CẢNH BÁO: Lệnh này SẼ:
   - Stop backend + frontend (~2 phút downtime)
   - DROP toàn bộ tables hiện tại trong DB $PG_DB
   - WIPE toàn bộ MinIO volume rồi extract tarball
   - DỮ LIỆU HIỆN TẠI BỊ THAY THẾ HOÀN TOÀN

EOT

read -p "Gõ chính xác 'yes' để tiếp tục: " confirm
if [[ "$confirm" != "yes" ]]; then
  log "Hủy bởi user."
  exit 0
fi

START_TS=$(date +%s)
log "======== START restore ========"

# ------------------------------------------------------------
# 1. Stop backend + frontend (giữ DB + MinIO chạy để restore)
# ------------------------------------------------------------
log "[1/5] Stop backend + frontend ..."
cd "$REPO_ROOT"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" stop backend frontend

# ------------------------------------------------------------
# 2. Restore DB (pg_restore -c = DROP IF EXISTS + CREATE)
# ------------------------------------------------------------
log "[2/5] Restore database $PG_DB ..."
docker cp "$BACKUP_DIR/db.sqlc" "$POSTGRES_CONTAINER:/tmp/restore.sqlc"
# pg_restore -c có thể warn về roles không tồn tại — non-fatal
docker exec -i "$POSTGRES_CONTAINER" \
  pg_restore -U "$PG_USER" -d "$PG_DB" --clean --if-exists --no-owner --no-privileges /tmp/restore.sqlc \
  || log "  (pg_restore exit non-zero — thường là warning về roles, kiểm tra log nếu nghi)"
docker exec "$POSTGRES_CONTAINER" rm -f /tmp/restore.sqlc
log "[2/5] ✓ DB restored"

# ------------------------------------------------------------
# 3. MinIO: stop → wipe volume → extract → start
# ------------------------------------------------------------
log "[3/5] Stop MinIO + wipe + extract tarball ..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" stop minio

# Xóa nội dung volume cũ + extract tarball MỚI
docker run --rm \
  -v "${MINIO_VOLUME}:/target" \
  -v "${BACKUP_DIR}:/backup:ro" \
  alpine:3 sh -c "cd /target && rm -rf ./* ./.* 2>/dev/null || true; tar xzf /backup/minio-data.tar.gz"
log "[3/5] ✓ MinIO data extracted"

# ------------------------------------------------------------
# 4. Start MinIO trước, đợi healthy
# ------------------------------------------------------------
log "[4/5] Start MinIO + đợi healthy ..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d minio
for i in {1..30}; do
  if docker ps --filter 'name=docker-minio-1' --filter 'health=healthy' \
     --format '{{.Names}}' | grep -q docker-minio-1; then
    log "  MinIO healthy sau ${i}s"
    break
  fi
  sleep 1
done

# ------------------------------------------------------------
# 5. Start backend + frontend
# ------------------------------------------------------------
log "[5/5] Start backend + frontend ..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d backend frontend

# ------------------------------------------------------------
# Summary + manual hints
# ------------------------------------------------------------
END_TS=$(date +%s)
DURATION=$((END_TS - START_TS))

cat <<EOT

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  RESTORE HOÀN TẤT (${DURATION}s)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Verify ngay:
  curl -I https://nextgenlms.com.vn
  docker ps

⚠️  KHÔNG TỰ ĐỘNG RESTORE (cần admin quyết):
  - .env.production     → backup tại $BACKUP_DIR/.env.production.bak
                          Chỉ restore nếu secrets hiện tại sai/mất.
                          Lệnh: cp $BACKUP_DIR/.env.production.bak $ENV_FILE && chmod 600 $ENV_FILE
  - SSL certs           → backup tại $BACKUP_DIR/certs/
                          Hiếm khi cần — certbot tự renew, cert mới thường đã có.

EOT
