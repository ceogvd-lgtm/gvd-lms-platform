#!/usr/bin/env bash
# =========================================================
# scripts/fix-slides-urls.sh — Bulk-fix slides.json on MinIO
#
# Use case:
#   Trước khi LibreOffice + PUBLIC_PREFIXES.PPT được cài/thêm, mọi
#   slides.json trên MinIO chứa URL nội bộ Docker `http://minio:9000/...`
#   Browser không resolve được → slide preview trắng. Script này:
#
#     1. Liệt kê tất cả slides.json trên bucket
#     2. Backup nội dung gốc → /srv/lms/backups/slides-fix-<TS>/
#     3. Với file có URL cũ → rewrite URL thành public dạng
#        https://nextgenlms.com.vn/minio/lms-uploads/...
#     4. Báo cáo: total / fixed / skipped / errors
#
# An toàn:
#   - JSON parse + re-serialize bằng python3 (không sed bừa)
#   - Backup mọi file trước khi sửa
#   - Idempotent: chạy lần 2 sẽ skip toàn bộ (đã clean)
#
# Chạy:
#   bash /srv/lms/scripts/fix-slides-urls.sh
#
# Rollback (chỉ 1 file):
#   docker cp <BACKUP_DIR>/<lessonId>.json docker-minio-1:/tmp/restore.json
#   docker exec docker-minio-1 mc cp /tmp/restore.json \
#     local/lms-uploads/content/ppt/<lessonId>/slides.json
# =========================================================
set -Eeuo pipefail

OLD_HOST="http://minio:9000"
NEW_BASE="https://nextgenlms.com.vn/minio"
TS=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/srv/lms/backups/slides-fix-${TS}"
LIST_TMP=$(mktemp)
PY_TMP=$(mktemp --suffix=.py)
MINIO_CONTAINER="docker-minio-1"

# Cleanup tmp files on exit (kể cả khi script lỗi).
trap 'rm -f "$LIST_TMP" "$PY_TMP"' EXIT

mkdir -p "$BACKUP_DIR"

echo "━━━ Bulk-fix slides.json URLs ━━━"
echo "Old host : $OLD_HOST"
echo "New base : $NEW_BASE"
echo "Backup   : $BACKUP_DIR"
echo

# 1. Liệt kê tất cả slides.json
echo "[1/3] Scanning bucket..."
docker exec "$MINIO_CONTAINER" mc find local/lms-uploads --name "slides.json" \
  > "$LIST_TMP" 2>/dev/null || true

TOTAL=$(grep -c . "$LIST_TMP" || echo 0)
echo "      Tìm thấy $TOTAL slides.json file(s)"
echo

if [[ "$TOTAL" -eq 0 ]]; then
  echo "Không có slides.json nào — kết thúc."
  exit 0
fi

# 2. Helper Python: rewrite imageUrl trong slides.json (preserve JSON structure).
cat > "$PY_TMP" <<'PYEOF'
import json, sys, re

OLD_HOST = sys.argv[1]
NEW_BASE = sys.argv[2]

raw = sys.stdin.read()
data = json.loads(raw)

changed = False
for slide in data.get("slides", []):
    url = slide.get("imageUrl", "")
    if url.startswith(OLD_HOST):
        # Cũ:  http://minio:9000/lms-uploads/content/ppt/.../slide-1.png?X-Amz-...
        # Mới: https://nextgenlms.com.vn/minio/lms-uploads/content/ppt/.../slide-1.png
        # Public URL không cần presigned query → strip phần ?X-Amz-...
        new_url = NEW_BASE + url[len(OLD_HOST):]
        new_url = new_url.split("?", 1)[0]
        slide["imageUrl"] = new_url
        changed = True

if changed:
    print("CHANGED")
    json.dump(data, sys.stdout, ensure_ascii=False, indent=2)
else:
    print("NOCHANGE")
PYEOF

FIXED=0
SKIPPED=0
ERRORS=0

# 3. Process từng file
echo "[2/3] Processing..."
while IFS= read -r FILE; do
  [[ -z "$FILE" ]] && continue

  # Lessons ID = thư mục cha của slides.json
  LESSON_ID=$(basename "$(dirname "$FILE")")
  REL_PATH="${FILE#local/lms-uploads/}"

  # Đọc nội dung
  CONTENT=$(docker exec "$MINIO_CONTAINER" mc cat "$FILE" 2>/dev/null || true)
  if [[ -z "$CONTENT" ]]; then
    printf '  [ERR ] %s — không đọc được\n' "$REL_PATH"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  # Backup gốc
  printf '%s' "$CONTENT" > "$BACKUP_DIR/${LESSON_ID}.json"

  # Run Python rewriter
  RESULT=$(printf '%s' "$CONTENT" | python3 "$PY_TMP" "$OLD_HOST" "$NEW_BASE" 2>/dev/null || echo "ERROR")
  STATUS=$(printf '%s' "$RESULT" | head -n1)

  case "$STATUS" in
    CHANGED)
      NEW_JSON=$(printf '%s' "$RESULT" | tail -n +2)
      # Upload qua mc pipe (giữ key cũ, overwrite nội dung)
      printf '%s' "$NEW_JSON" | docker exec -i "$MINIO_CONTAINER" \
        mc pipe "$FILE" >/dev/null 2>&1
      printf '  [FIX ] %s\n' "$REL_PATH"
      FIXED=$((FIXED + 1))
      ;;
    NOCHANGE)
      printf '  [SKIP] %s — đã OK\n' "$REL_PATH"
      SKIPPED=$((SKIPPED + 1))
      ;;
    *)
      printf '  [ERR ] %s — JSON không hợp lệ\n' "$REL_PATH"
      ERRORS=$((ERRORS + 1))
      ;;
  esac
done < "$LIST_TMP"

# 4. Tóm tắt
echo
echo "[3/3] Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
printf "  Total   : %d\n" "$TOTAL"
printf "  Fixed   : %d\n" "$FIXED"
printf "  Skipped : %d\n" "$SKIPPED"
printf "  Errors  : %d\n" "$ERRORS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Backup giữ ở: $BACKUP_DIR"

if [[ "$FIXED" -gt 0 ]]; then
  echo
  echo "Đã sửa $FIXED file. User refresh trang lesson → slides hiện ngay."
fi
if [[ "$ERRORS" -gt 0 ]]; then
  echo
  echo "⚠️ Có $ERRORS lỗi — kiểm tra log + restore từ $BACKUP_DIR nếu cần."
  exit 1
fi
