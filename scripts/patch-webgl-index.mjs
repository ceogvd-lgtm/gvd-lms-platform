#!/usr/bin/env node
/**
 * One-shot: patch an existing WebGL lesson's index.html in MinIO to
 * neutralise a Unity PWA ServiceWorker uploaded before the extractor
 * fix (commit b721105 / v1.0.2). Use when a student still sees
 * "stuck at 30%" because their browser has a stale SW registered
 * against the lesson's MinIO origin.
 *
 * Usage:
 *   node scripts/patch-webgl-index.mjs <lessonId>
 *
 * Env:
 *   MINIO_ENDPOINT (default: localhost)
 *   MINIO_PORT     (default: 9000)
 *   MINIO_ACCESS_KEY / MINIO_SECRET_KEY (default: minioadmin/minioadmin)
 */
import { Client } from 'minio';

const CLEANUP = `<script>
// LMS extractor — neutralises Unity PWA ServiceWorker to prevent the
// stale-SW "stuck at 30%" failure mode. Safe to run every page load.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function (regs) {
    regs.forEach(function (r) { r.unregister(); });
  }).catch(function () {});
  if (window.caches && caches.keys) {
    caches.keys().then(function (keys) {
      keys.forEach(function (k) { caches.delete(k); });
    }).catch(function () {});
  }
}
</script>`;

function patchIndexHtml(html) {
  const swBlockRe =
    /window\.addEventListener\s*\(\s*["']load["']\s*,\s*function\s*\(\s*\)\s*\{\s*if\s*\(\s*["']serviceWorker["']\s+in\s+navigator\s*\)\s*\{[^}]*serviceWorker\.register\([^)]+\)\s*;?\s*\}\s*\}\s*\)\s*;?/;
  let out = html.replace(
    swBlockRe,
    '/* SW registration stripped by LMS extractor — see patchIndexHtml() */',
  );
  if (!out.includes('LMS extractor — neutralises Unity PWA ServiceWorker')) {
    out = out.replace(/<body([^>]*)>/i, `<body$1>\n  ${CLEANUP}`);
  }
  return out;
}

async function main() {
  const lessonId = process.argv[2];
  if (!lessonId) {
    console.error('usage: node scripts/patch-webgl-index.mjs <lessonId>');
    process.exit(1);
  }
  const client = new Client({
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: (process.env.MINIO_USE_SSL || 'false') === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
  });
  const bucket = 'lms-uploads';
  const key = `content/webgl/${lessonId}/index.html`;

  console.log(`Fetching ${key} …`);
  const chunks = [];
  const stream = await client.getObject(bucket, key);
  for await (const c of stream) chunks.push(c);
  const original = Buffer.concat(chunks).toString('utf8');

  const patched = patchIndexHtml(original);
  if (patched === original) {
    console.log('index.html already patched — no change needed.');
    return;
  }

  console.log('Uploading patched index.html …');
  const buf = Buffer.from(patched, 'utf8');
  await client.putObject(bucket, key, buf, buf.length, {
    'Content-Type': 'text/html; charset=utf-8',
  });
  console.log(`✓ Patched ${key} (${original.length} → ${buf.length} bytes).`);
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
