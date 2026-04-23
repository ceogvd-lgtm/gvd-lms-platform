#!/usr/bin/env bash
# =========================================================
# scripts/preflight.sh — verify environment config + service
# reachability BEFORE ./scripts/deploy.sh performs a real deploy.
#
# Runs 5 checks against .env.production:
#   1. SMTP      — connect + EHLO + AUTH LOGIN handshake (via docker swaks)
#   2. MinIO     — bring up container + /minio/health/live + bucket access
#   3. Gemini    — GET /v1beta/models with GEMINI_API_KEY (detects 403/429)
#   4. Database  — bring up postgres + pg_isready
#   5. Redis     — bring up redis + redis-cli PING
#
# Exit codes:
#   0 — all checks passed, safe to deploy
#   1 — one or more checks failed (output explains which)
#   2 — missing prerequisites (.env, docker CLI, etc.)
#
# Usage:
#   ./scripts/preflight.sh
#   ENV_FILE=.env.staging ./scripts/preflight.sh
#   PREFLIGHT_TIMEOUT=30 ./scripts/preflight.sh
#
# Works on:
#   - Linux VPS (production)
#   - Windows WSL / Git Bash (local verification)
# =========================================================

set -Eeuo pipefail

# ------------------------------------------------------------
# Config
# ------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

ENV_FILE="${ENV_FILE:-.env.production}"
TIMEOUT="${PREFLIGHT_TIMEOUT:-10}"

# ------------------------------------------------------------
# Colour palette (auto-disables when not attached to a TTY)
# ------------------------------------------------------------
if [[ -t 1 ]]; then
  RED=$'\033[0;31m'
  GREEN=$'\033[0;32m'
  YELLOW=$'\033[1;33m'
  CYAN=$'\033[0;36m'
  GREY=$'\033[0;90m'
  BOLD=$'\033[1m'
  NC=$'\033[0m'
else
  RED="" GREEN="" YELLOW="" CYAN="" GREY="" BOLD="" NC=""
fi

# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------
ok()   { printf '%s✅ OK%s\n' "$GREEN" "$NC"; }
warn() { printf '%s⚠️  WARN%s\n' "$YELLOW" "$NC"; }
fail() { printf '%s❌ FAIL%s\n' "$RED" "$NC"; }

hint() {
  local msg
  for msg in "$@"; do
    printf '      %s→%s %s\n' "$GREY" "$NC" "$msg"
  done
}

check_start() {
  local num="$1" label="$2"
  # 4-digit label width so the status column lines up.
  printf '[%s/5] 🔍 Test %-14s' "$num" "$label..."
}

banner() {
  printf '\n%s━━━ Preflight checks%s %s(env=%s, timeout=%ss)%s\n\n' \
    "$CYAN" "$NC" "$GREY" "$ENV_FILE" "$TIMEOUT" "$NC"
}

# Load a .env file safely — only accept lines shaped like `KEY=...`, strip
# optional surrounding quotes. Avoids `source` executing shell metacharacters
# inside values (e.g. `$` or backticks) that the sample file may contain.
load_env() {
  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    # Skip comments + blank lines.
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    # Must look like KEY=...
    [[ "$line" =~ ^[[:space:]]*([A-Z_][A-Z0-9_]*)=(.*)$ ]] || continue
    key="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"
    # Strip a single pair of surrounding quotes if present.
    if [[ ("${value:0:1}" == '"' && "${value: -1}" == '"') ||
          ("${value:0:1}" == "'" && "${value: -1}" == "'") ]]; then
      value="${value:1:${#value}-2}"
    fi
    export "$key=$value"
  done < "$1"
}

# Returns 0 if the value looks like the template placeholder (contains
# CHANGE_ME or equivalent) — those should always fail preflight.
is_placeholder() {
  local v="${1:-}"
  [[ "$v" == *CHANGE_ME* || "$v" == *your-client-id* || "$v" == *your-domain* ]]
}

# Extract the bare email address from an "Name <email>" SMTP_FROM header.
extract_email() {
  local raw="$1"
  if [[ "$raw" == *"<"*">"* ]]; then
    echo "$raw" | sed -E 's/.*<([^>]+)>.*/\1/'
  else
    echo "$raw"
  fi
}

# ------------------------------------------------------------
# Prerequisites
# ------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  printf '%s❌ docker CLI not found%s — install Docker Engine / Desktop first.\n' "$RED" "$NC"
  exit 2
fi
if ! docker compose version >/dev/null 2>&1; then
  printf '%s❌ docker compose v2 unavailable%s — upgrade to Compose v2.\n' "$RED" "$NC"
  exit 2
fi
if [[ ! -f "$ENV_FILE" ]]; then
  printf '%s❌ %s not found%s\n' "$RED" "$ENV_FILE" "$NC"
  hint "Copy .env.production.example to $ENV_FILE and fill in the real values."
  exit 2
fi

load_env "$ENV_FILE"

COMPOSE=(docker compose -f docker/docker-compose.prod.yml --env-file "$ENV_FILE")

banner
FAILED=0

# ============================================================
# Check 1 — SMTP
# ============================================================
# Strategy: run `swaks` inside a disposable alpine container. It speaks
# real SMTP, does STARTTLS, authenticates via AUTH LOGIN, validates the
# recipient, and `--quit-after RCPT` disconnects BEFORE the DATA stage —
# so no actual email is sent. That keeps the check idempotent + silent
# (no "Preflight OK" emails spamming the admin inbox on every run).
check_start 1 "SMTP"
if [[ -z "${SMTP_HOST:-}" || -z "${SMTP_PORT:-}" \
      || -z "${SMTP_USER:-}" || -z "${SMTP_PASS:-}" ]]; then
  fail
  hint "Missing SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS in $ENV_FILE"
  FAILED=1
elif is_placeholder "$SMTP_PASS" || is_placeholder "$SMTP_USER"; then
  fail
  hint "SMTP credentials still contain the \"CHANGE_ME\" placeholder"
  hint "Edit $ENV_FILE and fill in the real SendGrid / Mailgun / Gmail secret"
  FAILED=1
else
  SMTP_LOG="$(mktemp)"
  SMTP_FROM_EMAIL="$(extract_email "${SMTP_FROM:-$SMTP_USER}")"
  if timeout "$TIMEOUT" docker run --rm \
        -e "SMTP_HOST=$SMTP_HOST" \
        -e "SMTP_PORT=$SMTP_PORT" \
        -e "SMTP_USER=$SMTP_USER" \
        -e "SMTP_PASS=$SMTP_PASS" \
        -e "FROM_EMAIL=$SMTP_FROM_EMAIL" \
        alpine:3.19 sh -eu -c '
          apk add -q --no-cache swaks perl-net-ssleay >/dev/null 2>&1
          exec swaks \
            --to "$SMTP_USER" \
            --from "$FROM_EMAIL" \
            --server "$SMTP_HOST:$SMTP_PORT" \
            --auth LOGIN --auth-user "$SMTP_USER" --auth-password "$SMTP_PASS" \
            --tls \
            --quit-after RCPT \
            --timeout 8 \
            --hide-all \
            -S
        ' >"$SMTP_LOG" 2>&1; then
    ok
  else
    fail
    # Surface the most useful line from the swaks transcript.
    err="$(grep -Ei 'Authentication|5[0-9][0-9] |<- 5|refused|timed? out|network is unreachable' "$SMTP_LOG" \
             | head -1 | sed 's/^[[:space:]]*//')"
    [[ -n "$err" ]] && hint "Server said: $err"
    hint "Check SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS in $ENV_FILE"
    hint "Full log saved to $SMTP_LOG"
    FAILED=1
  fi
  # Only clean up on success — on failure we keep the log for debugging.
  [[ "$FAILED" -eq 0 ]] && rm -f "$SMTP_LOG"
fi

# ============================================================
# Check 2 — MinIO
# ============================================================
# MinIO runs as a docker compose service; it isn't reachable from the
# host until `up -d minio` has started it. We bring it up silently
# (idempotent on re-runs) and verify the built-in health endpoint
# responds + the access key works.
check_start 2 "MinIO"
if [[ -z "${MINIO_ACCESS_KEY:-}" || -z "${MINIO_SECRET_KEY:-}" ]]; then
  fail
  hint "MINIO_ACCESS_KEY / MINIO_SECRET_KEY missing in $ENV_FILE"
  FAILED=1
elif is_placeholder "$MINIO_ACCESS_KEY" || is_placeholder "$MINIO_SECRET_KEY"; then
  fail
  hint "MinIO credentials still contain the \"CHANGE_ME\" placeholder"
  FAILED=1
else
  if ! "${COMPOSE[@]}" up -d minio >/dev/null 2>&1; then
    fail
    hint "Failed to start the 'minio' container"
    hint "Run: ${COMPOSE[*]} up -d minio"
    FAILED=1
  else
    minio_ready=0
    for ((i=0; i<TIMEOUT; i++)); do
      if "${COMPOSE[@]}" exec -T minio \
          wget -q -O- http://localhost:9000/minio/health/live >/dev/null 2>&1; then
        minio_ready=1
        break
      fi
      sleep 1
    done
    if [[ "$minio_ready" -eq 1 ]]; then
      # Bonus: verify the access key actually works by listing buckets.
      if "${COMPOSE[@]}" exec -T minio sh -c "
          mc alias set local http://localhost:9000 \"$MINIO_ACCESS_KEY\" \"$MINIO_SECRET_KEY\" >/dev/null 2>&1 &&
          mc ls local >/dev/null 2>&1
        " >/dev/null 2>&1; then
        ok
      else
        fail
        hint "MinIO is up but rejected MINIO_ACCESS_KEY / MINIO_SECRET_KEY"
        hint "Either the key pair is wrong, or the container was seeded with a different pair"
        hint "On a fresh host: docker volume rm lms-platform_minio_data && re-run"
        FAILED=1
      fi
    else
      fail
      hint "MinIO didn't become healthy within ${TIMEOUT}s"
      hint "Check container logs: ${COMPOSE[*]} logs minio"
      FAILED=1
    fi
  fi
fi

# ============================================================
# Check 3 — Gemini API
# ============================================================
check_start 3 "Gemini API"
if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  fail
  hint "GEMINI_API_KEY missing in $ENV_FILE"
  FAILED=1
elif is_placeholder "$GEMINI_API_KEY"; then
  fail
  hint "GEMINI_API_KEY still contains the \"CHANGE_ME\" placeholder"
  hint "Get one at https://aistudio.google.com/app/apikey"
  FAILED=1
else
  GEMINI_LOG="$(mktemp)"
  HTTP_STATUS="$(timeout "$TIMEOUT" curl -s -o "$GEMINI_LOG" -w '%{http_code}' \
    -H "x-goog-api-key: $GEMINI_API_KEY" \
    'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1' \
    2>/dev/null || echo 000)"
  case "$HTTP_STATUS" in
    200)
      ok
      ;;
    400|401|403)
      fail
      hint "Gemini rejected the key (HTTP $HTTP_STATUS) — revoked, typo, or wrong project"
      hint "Get a fresh key at https://aistudio.google.com/app/apikey"
      FAILED=1
      ;;
    429)
      fail
      hint "Gemini quota exhausted (HTTP 429) — free tier is 1500 req/day, resets 00:00 PST"
      hint "Wait for reset OR upgrade to paid tier at https://aistudio.google.com/"
      FAILED=1
      ;;
    000)
      fail
      hint "Timed out after ${TIMEOUT}s — no route to generativelanguage.googleapis.com"
      hint "Check firewall / DNS on the VPS"
      FAILED=1
      ;;
    *)
      fail
      hint "Unexpected Gemini response: HTTP $HTTP_STATUS"
      hint "Body: $(head -c 200 "$GEMINI_LOG" 2>/dev/null)"
      FAILED=1
      ;;
  esac
  rm -f "$GEMINI_LOG"
fi

# ============================================================
# Check 4 — Postgres
# ============================================================
check_start 4 "Database"
if [[ -z "${POSTGRES_USER:-}" || -z "${POSTGRES_PASSWORD:-}" || -z "${POSTGRES_DB:-}" ]]; then
  fail
  hint "POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB missing in $ENV_FILE"
  FAILED=1
elif is_placeholder "$POSTGRES_PASSWORD"; then
  fail
  hint "POSTGRES_PASSWORD still contains the \"CHANGE_ME\" placeholder"
  hint "Generate one with: openssl rand -base64 32"
  FAILED=1
else
  if ! "${COMPOSE[@]}" up -d postgres >/dev/null 2>&1; then
    fail
    hint "Failed to start the 'postgres' container"
    hint "Run: ${COMPOSE[*]} up -d postgres"
    FAILED=1
  else
    pg_ready=0
    for ((i=0; i<TIMEOUT; i++)); do
      if "${COMPOSE[@]}" exec -T postgres \
          pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
        pg_ready=1
        break
      fi
      sleep 1
    done
    if [[ "$pg_ready" -eq 1 ]]; then
      ok
    else
      fail
      hint "Postgres didn't accept connections within ${TIMEOUT}s"
      hint "Check POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB in $ENV_FILE"
      hint "Logs: ${COMPOSE[*]} logs postgres"
      FAILED=1
    fi
  fi
fi

# ============================================================
# Check 5 — Redis
# ============================================================
check_start 5 "Redis"
if [[ -z "${REDIS_PASSWORD:-}" ]]; then
  fail
  hint "REDIS_PASSWORD missing in $ENV_FILE"
  FAILED=1
elif is_placeholder "$REDIS_PASSWORD"; then
  fail
  hint "REDIS_PASSWORD still contains the \"CHANGE_ME\" placeholder"
  hint "Generate one with: openssl rand -base64 32"
  FAILED=1
else
  if ! "${COMPOSE[@]}" up -d redis >/dev/null 2>&1; then
    fail
    hint "Failed to start the 'redis' container"
    FAILED=1
  else
    redis_ready=0
    for ((i=0; i<TIMEOUT; i++)); do
      pong="$("${COMPOSE[@]}" exec -T redis \
               redis-cli -a "$REDIS_PASSWORD" --no-auth-warning ping 2>/dev/null || true)"
      if [[ "$pong" == *PONG* ]]; then
        redis_ready=1
        break
      fi
      sleep 1
    done
    if [[ "$redis_ready" -eq 1 ]]; then
      ok
    else
      fail
      hint "Redis didn't respond with PONG within ${TIMEOUT}s"
      hint "Check REDIS_PASSWORD in $ENV_FILE"
      hint "Logs: ${COMPOSE[*]} logs redis"
      FAILED=1
    fi
  fi
fi

# ============================================================
# Summary
# ============================================================
echo ""
if [[ "$FAILED" -eq 0 ]]; then
  printf '%s✅ All checks passed! Safe to deploy.%s\n\n' "$BOLD$GREEN" "$NC"
  exit 0
else
  printf '%s❌ Preflight failed. Aborting deploy.%s\n' "$BOLD$RED" "$NC"
  printf '   %sFix the issues above and re-run %s./scripts/preflight.sh%s\n\n' \
    "$GREY" "$YELLOW" "$NC"
  exit 1
fi
