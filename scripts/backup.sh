#!/usr/bin/env bash
# =========================================================
# Phase 18 — Postgres daily backup script.
# ---------------------------------------------------------
# Usage (cron): 0 2 * * * /srv/lms/scripts/backup.sh
#
# Behaviour:
#   - pg_dump the LMS database to /srv/lms/backups/<date>.sql.gz
#   - keep 30 days of rolling backups, delete anything older
#   - if S3_BUCKET env is set, also upload to s3://$S3_BUCKET/lms/
#   - non-zero exit + stderr log if dump fails
# =========================================================
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load env if present (prod env file lives at repo root)
if [[ -f "$REPO_ROOT/.env.production" ]]; then
  set -o allexport
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.env.production"
  set +o allexport
fi

: "${POSTGRES_USER:?POSTGRES_USER not set}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD not set}"
: "${POSTGRES_DB:?POSTGRES_DB not set}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/lms_${TIMESTAMP}.sql.gz"

echo "[backup] Dumping $POSTGRES_DB → $OUT"
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
  --host="$POSTGRES_HOST" \
  --port="$POSTGRES_PORT" \
  --username="$POSTGRES_USER" \
  --format=plain \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  "$POSTGRES_DB" | gzip -9 > "$OUT"

SIZE=$(du -h "$OUT" | cut -f1)
echo "[backup] OK — size=$SIZE"

# Rotate: delete backups older than RETENTION_DAYS.
find "$BACKUP_DIR" -type f -name 'lms_*.sql.gz' -mtime +"$RETENTION_DAYS" -delete
echo "[backup] Rotated backups older than $RETENTION_DAYS days"

# Optional S3 upload — skip silently if S3_BUCKET not set.
if [[ -n "${S3_BUCKET:-}" ]]; then
  if ! command -v aws >/dev/null 2>&1; then
    echo "[backup] aws CLI not installed — skipping S3 upload"
    exit 0
  fi
  echo "[backup] Uploading to s3://$S3_BUCKET/lms/$(basename "$OUT")"
  aws s3 cp "$OUT" "s3://$S3_BUCKET/lms/" --only-show-errors
  echo "[backup] S3 upload OK"
fi
