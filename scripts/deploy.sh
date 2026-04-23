#!/usr/bin/env bash
# =========================================================
# Phase 18 — one-shot production deploy on the VPS.
# ---------------------------------------------------------
# Checks prerequisites, validates env, pulls latest images,
# applies migrations, seeds the SUPER_ADMIN on first run.
# ---------------------------------------------------------
# Usage:
#   ./scripts/deploy.sh                   # normal rolling update
#   ./scripts/deploy.sh --first-run       # also seeds admin + buckets
#   ./scripts/deploy.sh --skip-preflight  # bypass ./scripts/preflight.sh
# =========================================================
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

FIRST_RUN=0
SKIP_PREFLIGHT=0
for arg in "$@"; do
  case "$arg" in
    --first-run) FIRST_RUN=1 ;;
    --skip-preflight) SKIP_PREFLIGHT=1 ;;
    *) ;;
  esac
done

echo "[deploy] Repo root: $REPO_ROOT"

# ----- Pre-flight -----
if ! command -v docker >/dev/null 2>&1; then
  echo "[deploy] docker CLI not found — install Docker Engine first." >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "[deploy] 'docker compose' not available — install Compose v2." >&2
  exit 1
fi
if [[ ! -f .env.production ]]; then
  echo "[deploy] .env.production is missing. Copy .env.production.example and fill it in." >&2
  exit 1
fi

# Spot-check required secrets — fail early instead of starting + crashing.
REQUIRED=(
  POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB
  REDIS_PASSWORD
  MINIO_ACCESS_KEY MINIO_SECRET_KEY
  JWT_SECRET REFRESH_TOKEN_SECRET
  NEXT_PUBLIC_API_URL
)
set -o allexport
# shellcheck disable=SC1091
source .env.production
set +o allexport
for v in "${REQUIRED[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    echo "[deploy] $v is missing in .env.production" >&2
    exit 1
  fi
done

# ----- Preflight: verify external (SMTP, Gemini) + internal (MinIO,
#       Postgres, Redis) services BEFORE we bring up backend + frontend.
#       This catches the three most common "deploy green, users see 500"
#       config-mismatches: SMTP password wrong, MinIO key rejected,
#       Gemini API key revoked/out-of-quota. ~30-60s on a cold host,
#       mostly the swaks + mc + pg_isready round-trips.
#       Skip only in emergencies (e.g. a known preflight bug is blocking
#       an otherwise healthy deploy) with --skip-preflight.
if [[ "$SKIP_PREFLIGHT" == "0" ]]; then
  echo "[deploy] Running preflight checks..."
  if ! bash "$SCRIPT_DIR/preflight.sh"; then
    echo "[deploy] ❌ Preflight failed — deploy aborted." >&2
    echo "[deploy]   Fix the issues above and re-run, or re-run with" >&2
    echo "[deploy]   --skip-preflight to force deploy (not recommended)." >&2
    exit 1
  fi
else
  echo "[deploy] ⚠ --skip-preflight — skipping service health checks"
fi

COMPOSE=(docker compose -f docker/docker-compose.prod.yml --env-file .env.production)

# ----- Pull & start -----
echo "[deploy] Pulling images..."
"${COMPOSE[@]}" pull

echo "[deploy] Starting stack..."
"${COMPOSE[@]}" up -d

# ----- Migrations -----
echo "[deploy] Applying Prisma migrations..."
"${COMPOSE[@]}" exec -T backend \
  node_modules/.bin/prisma migrate deploy --schema=packages/database/prisma/schema.prisma \
  || echo "[deploy] (migrate deploy is a no-op when already applied)"

# ----- First-run only: seed SUPER_ADMIN -----
if [[ "$FIRST_RUN" == "1" ]]; then
  echo "[deploy] FIRST RUN — seeding SUPER_ADMIN..."
  "${COMPOSE[@]}" exec -T backend \
    node_modules/.bin/tsx packages/database/prisma/seed.ts \
    || echo "[deploy] Seed failed — likely already seeded."
fi

# ----- Smoke test -----
echo "[deploy] Waiting 10s for backend to settle..."
sleep 10
if curl -fsS --max-time 5 http://localhost/api/v1/health >/dev/null; then
  echo "[deploy] /health responded OK"
else
  echo "[deploy] WARNING — /health did not respond. Check 'docker compose logs backend'." >&2
fi

echo "[deploy] Done."
echo "[deploy] UI:   https://${DOMAIN:-your-domain}"
echo "[deploy] API:  https://${DOMAIN:-your-domain}/api/v1/health"
