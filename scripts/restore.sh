#!/usr/bin/env bash
# =========================================================
# Phase 18 — Postgres restore from backup.
# ---------------------------------------------------------
# Usage:
#   ./scripts/restore.sh backups/lms_20260420_020000.sql.gz
#
# Destructive: runs `psql` with `--clean --if-exists` so every table in
# the target DB is dropped first. Require explicit confirmation on the
# CLI before we proceed.
# =========================================================
set -Eeuo pipefail

FILE="${1:-}"
if [[ -z "$FILE" ]]; then
  echo "Usage: $0 <backup.sql.gz>" >&2
  exit 1
fi
if [[ ! -f "$FILE" ]]; then
  echo "Backup file not found: $FILE" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

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

echo "============================================="
echo "RESTORE — this will wipe the target database!"
echo "  host : $POSTGRES_HOST:$POSTGRES_PORT"
echo "  db   : $POSTGRES_DB"
echo "  file : $FILE"
echo "============================================="
read -r -p 'Type "YES I UNDERSTAND" to continue: ' ACK
if [[ "$ACK" != "YES I UNDERSTAND" ]]; then
  echo "Aborted."
  exit 1
fi

echo "[restore] Piping gunzip → psql..."
gunzip -c "$FILE" | PGPASSWORD="$POSTGRES_PASSWORD" psql \
  --host="$POSTGRES_HOST" \
  --port="$POSTGRES_PORT" \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" \
  --set ON_ERROR_STOP=on

echo "[restore] OK"
echo "[restore] Running a quick sanity check (SELECT count FROM users)..."
PGPASSWORD="$POSTGRES_PASSWORD" psql \
  --host="$POSTGRES_HOST" --port="$POSTGRES_PORT" \
  --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
  -c 'SELECT COUNT(*) AS users_count FROM users;'
