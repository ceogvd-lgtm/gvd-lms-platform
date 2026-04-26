#!/usr/bin/env bash
# =========================================================
# scripts/backup-full.sh — Full snapshot của LMS production:
#   - PostgreSQL DB (pg_dump custom format)
#   - MinIO data volume (tar.gz toàn bộ buckets)
#   - .env.production (secrets)
#   - SSL certificates (docker/nginx/certs)
#
# Khác với app-level cron `database-backup-daily` (chỉ backup DB vào
# MinIO prefix `backups/`), script này tạo snapshot OFFLINE-RECOVERABLE
# trên disk VPS để rollback toàn bộ hệ thống khi:
#   - VPS provider lỗi disk
#   - DB corrupt
#   - User upload mất file (tar volume capture được mọi thứ)
#   - Hacker xóa data (cần restore từ snapshot trước event)
#
# Usage:
#   bash /srv/lms/scripts/backup-full.sh
#   /srv/lms/scripts/backup-full.sh              # cron
#
# Env override (optional):
#   BACKUP_ROOT=/some/path        — mặc định /srv/lms/backups
#   RETENTION_DAYS=14             — mặc định 7
#
# Cron đề xuất: 30 02 * * *  (02:30 hàng đêm, stagger với app-level 02:00)
# =========================================================
set -Eeuo pipefail

# ------------------------------------------------------------
# Config
# ------------------------------------------------------------
BACKUP_ROOT="${BACKUP_ROOT:-/srv/lms/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="$BACKUP_ROOT/auto_$TIMESTAMP"

REPO_ROOT="/srv/lms"
ENV_FILE="$REPO_ROOT/.env.production"
CERTS_DIR="$REPO_ROOT/docker/nginx/certs"

POSTGRES_CONTAINER="docker-postgres-1"
MINIO_VOLUME="docker_minio_data"

LOG_PREFIX="[backup-full]"

log() { printf '%s %s\n' "$(date '+%F %T')" "$LOG_PREFIX $*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

# ------------------------------------------------------------
# Pre-flight
# ------------------------------------------------------------
log "======== START backup =$TIMESTAMP ========"

[[ -f "$ENV_FILE" ]] || fail "Không tìm thấy $ENV_FILE"
[[ -d "$CERTS_DIR" ]] || fail "Không tìm thấy $CERTS_DIR"
docker ps --format '{{.Names}}' | grep -q "^${POSTGRES_CONTAINER}$" \
  || fail "Container $POSTGRES_CONTAINER không chạy"
docker volume ls --format '{{.Name}}' | grep -q "^${MINIO_VOLUME}$" \
  || fail "Volume $MINIO_VOLUME không tồn tại"

# Đọc DB credentials từ env (không hardcode)
PG_USER=$(grep '^POSTGRES_USER=' "$ENV_FILE" | cut -d= -f2)
PG_DB=$(grep '^POSTGRES_DB=' "$ENV_FILE" | cut -d= -f2)
[[ -n "$PG_USER" && -n "$PG_DB" ]] || fail "POSTGRES_USER/DB không có trong .env.production"

mkdir -p "$BACKUP_DIR"
log "Backup dir: $BACKUP_DIR"

# ------------------------------------------------------------
# 1. Database
# ------------------------------------------------------------
log "[1/4] pg_dump $PG_DB ..."
docker exec "$POSTGRES_CONTAINER" pg_dump \
  -U "$PG_USER" -d "$PG_DB" --format=custom -f "/tmp/db_${TIMESTAMP}.sqlc"
docker cp "$POSTGRES_CONTAINER:/tmp/db_${TIMESTAMP}.sqlc" "$BACKUP_DIR/db.sqlc"
docker exec "$POSTGRES_CONTAINER" rm -f "/tmp/db_${TIMESTAMP}.sqlc"
DB_SIZE=$(du -h "$BACKUP_DIR/db.sqlc" | cut -f1)
log "[1/4] ✓ DB dump → $DB_SIZE"

# ------------------------------------------------------------
# 2. MinIO data (hot tar — MinIO vẫn chạy)
# ------------------------------------------------------------
# Chạy alpine container tạm, mount volume read-only + thư mục backup
# để tar trực tiếp. Hot backup (không stop MinIO) chấp nhận được vì:
#   - Mỗi object MinIO ghi qua write-then-rename (atomic)
#   - In-flight uploads sẽ hoàn thành trong vài giây trước khi tar đến
#   - Restore sẽ stop MinIO trước khi extract → consistency on read side
log "[2/4] tar MinIO volume $MINIO_VOLUME ..."
docker run --rm \
  -v "${MINIO_VOLUME}:/source:ro" \
  -v "${BACKUP_DIR}:/backup" \
  alpine:3 sh -c "cd /source && tar czf /backup/minio-data.tar.gz . 2>/dev/null"
MINIO_SIZE=$(du -h "$BACKUP_DIR/minio-data.tar.gz" | cut -f1)
log "[2/4] ✓ MinIO tar → $MINIO_SIZE"

# ------------------------------------------------------------
# 3. .env.production
# ------------------------------------------------------------
log "[3/4] Copy .env.production ..."
cp "$ENV_FILE" "$BACKUP_DIR/.env.production.bak"
chmod 600 "$BACKUP_DIR/.env.production.bak"  # đồng bộ permission gốc
log "[3/4] ✓ .env saved (perm 600)"

# ------------------------------------------------------------
# 4. SSL certs
# ------------------------------------------------------------
log "[4/4] Copy SSL certs ..."
cp -r "$CERTS_DIR" "$BACKUP_DIR/certs"
log "[4/4] ✓ certs saved"

# ------------------------------------------------------------
# Retention — xóa backup cũ hơn $RETENTION_DAYS ngày
# ------------------------------------------------------------
DELETED=$(find "$BACKUP_ROOT" -maxdepth 1 -type d -name 'auto_*' -mtime "+$RETENTION_DAYS" -print -exec rm -rf {} +)
if [[ -n "$DELETED" ]]; then
  log "Cleanup: xóa backup cũ hơn $RETENTION_DAYS ngày:"
  printf '  %s\n' $DELETED
fi

# ------------------------------------------------------------
# Summary
# ------------------------------------------------------------
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
ALL_BACKUPS=$(du -sh "$BACKUP_ROOT" | cut -f1)
DISK_FREE=$(df -h / | awk 'NR==2 {print $4}')

log "======== DONE ========"
log "  Backup này   : $TOTAL_SIZE  ($BACKUP_DIR)"
log "  Tổng backups : $ALL_BACKUPS  (retention $RETENTION_DAYS ngày)"
log "  Disk free    : $DISK_FREE"
log ""
