import { STORAGE_PREFIXES } from './storage.constants';

/**
 * Tập các prefix hợp lệ theo `STORAGE_PREFIXES`. Dùng để nhận diện một
 * key có phải do hệ thống sinh ra hay không — tránh xoá nhầm object
 * "lạ" trong MinIO bucket.
 */
const VALID_PREFIXES = Object.values(STORAGE_PREFIXES);

/**
 * Tách key MinIO từ một URL (hoặc path) được lưu trong DB.
 *
 * Hệ thống có 3 dạng URL cho cùng 1 file vì proxy + config thay đổi
 * qua các phase:
 *
 *   1. Absolute:   http://localhost:9000/lms-uploads/thumbnails/abc.webp
 *                  https://cdn.example.com/lms-uploads/content/video/x.mp4
 *   2. Proxy:      /minio/thumbnails/abc.webp
 *                  /scorm-content/course-xyz/index.html
 *   3. Bare:       thumbnails/abc.webp          (pdfUrl certificate)
 *                  content/video/x.mp4
 *
 * Trả về dạng canonical "prefix/sub/path" (không dấu `/` ở đầu). Nếu
 * URL không khớp bất kỳ prefix nào đang hỗ trợ → trả `null` để caller
 * biết bỏ qua (không xoá file external, VD CDN khác).
 */
export function extractMinioKey(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // 1. Strip absolute URL nếu có. Bất kể scheme/host/bucket, phần path
  //    chứa `/<bucket>/<key>` hoặc `/<key>` — ta tìm key bằng cách match
  //    prefix đã biết thay vì parse bucket.
  let path = trimmed;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const u = new URL(trimmed);
      path = u.pathname;
    }
  } catch {
    // URL không parse được — fallback về raw string
    path = trimmed;
  }

  // 2. Strip leading slashes
  path = path.replace(/^\/+/, '');

  // 3. Bỏ bucket name nếu path bắt đầu bằng `lms-uploads/` hoặc `minio/`
  //    (proxy rewrite trong next.config.mjs). `scorm-content/` là proxy
  //    riêng — phải chuyển sang key gốc `content/scorm/*` (next.config
  //    mjs rewrite `/scorm-content/:path*` → MinIO `content/scorm/:path*`).
  if (path.startsWith('scorm-content/')) {
    path = `content/scorm/${path.slice('scorm-content/'.length)}`;
  } else {
    const strippable = ['lms-uploads', 'minio'];
    for (const p of strippable) {
      if (path.startsWith(`${p}/`)) {
        path = path.slice(p.length + 1);
        break;
      }
    }
  }

  // 3b. Strip leading slashes lần nữa — phòng case "//minio//thumbnails"
  //     sau khi bóc bucket name vẫn còn slash dư.
  path = path.replace(/^\/+/, '');

  // 4. Chỉ chấp nhận nếu path bắt đầu bằng một VALID_PREFIXES — tránh
  //    xoá nhầm nếu DB chứa URL trỏ sang domain khác.
  //    Lưu ý: `scorm-content/*` đã được bóc sang `content/scorm/*` ở
  //    bước 3 vì proxy rewrite vào MinIO key gốc.
  for (const prefix of VALID_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return path;
    }
  }

  return null;
}
