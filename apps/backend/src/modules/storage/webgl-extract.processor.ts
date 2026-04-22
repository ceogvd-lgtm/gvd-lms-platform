import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import unzipper from 'unzipper';

import { STORAGE_PREFIXES, WEBGL_EXTRACT_QUEUE } from '../../common/storage/storage.constants';
import { StorageService } from '../../common/storage/storage.service';
import { filterJunkPaths, stripCommonPrefix } from '../practice-contents/webgl-validator';

/**
 * Minimal extension → MIME map, sized for Unity WebGL build outputs.
 * Avoids an extra `mime-types` dep. Unknown → octet-stream.
 */
const EXT_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.symbols.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.gz': 'application/gzip',
  '.br': 'application/brotli',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Resolve the Content-Type + optional Content-Encoding for a file inside
 * a Unity WebGL build.
 *
 * Unity emits its runtime files pre-compressed with `.gz` or `.br`
 * extensions (Builds.framework.js.gz, Builds.wasm.gz, Builds.data.gz …).
 * Its loader expects the browser to auto-decompress them — which only
 * happens if we serve them with `Content-Encoding: gzip` (or `br`) and
 * the *decompressed* Content-Type (e.g. `application/wasm`, not
 * `application/gzip`).
 *
 * Returning `application/gzip` with no Content-Encoding breaks Unity 2022+
 * builds that ship without the decompression-fallback runtime — which is
 * the default setting.
 */
/**
 * Patch Unity's default `index.html` to defuse the PWA ServiceWorker.
 *
 * Unity 2022+ "Enable PWA" option emits a boilerplate registration at the
 * top of the `<script>` block:
 *
 *   window.addEventListener("load", function () {
 *     if ("serviceWorker" in navigator) {
 *       navigator.serviceWorker.register("ServiceWorker.js");
 *     }
 *   });
 *
 * We want TWO things:
 *   1. Never register a new SW for this origin (the extractor already
 *      omits `ServiceWorker.js` + `manifest.webmanifest`, so registration
 *      would 404 anyway — but we don't want the console error noise and
 *      we want to be explicit).
 *   2. Proactively unregister any SW that an earlier pre-fix upload may
 *      already have installed in the learner's browser, and purge its
 *      Cache Storage. Without this, browsers that already registered
 *      the old SW keep running it forever (SWs survive page closes and
 *      only self-update when their script changes — but that script is
 *      now 404) — and the old SW's `fetch` handler clones + caches every
 *      Unity asset (100+ MB) on each load, burning memory until Unity's
 *      progress bar stalls at ~30%.
 *
 * Strategy: find the Unity registration block and replace it with a
 * cleanup script that unregisters every SW and clears every Cache API
 * entry scoped to this origin. Idempotent: running it a second time
 * after cleanup is a no-op.
 *
 * If we can't find the registration block (Unity changes the template
 * between versions), we inject the cleanup at the top of `<body>`
 * anyway so at least the stale SW gets killed.
 */
export function patchIndexHtml(html: string): string {
  const cleanupScript = `<script>
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

  // Match the whole `window.addEventListener("load", function () { …SW register… })` block.
  // Tolerant to single/double quotes and extra whitespace.
  const swBlockRe =
    /window\.addEventListener\s*\(\s*["']load["']\s*,\s*function\s*\(\s*\)\s*\{\s*if\s*\(\s*["']serviceWorker["']\s+in\s+navigator\s*\)\s*\{[^}]*serviceWorker\.register\([^)]+\)\s*;?\s*\}\s*\}\s*\)\s*;?/;

  // Step 1: strip Unity's SW register block if present.
  let out = html.replace(
    swBlockRe,
    '/* SW registration stripped by LMS extractor — see patchIndexHtml() */',
  );

  // Step 2: inject cleanup script at top of <body> so stale SWs installed
  //         by a pre-fix upload self-unregister on the next page load.
  //         Idempotent: if the script ran before, the registrations list
  //         is empty and the caches are empty — the script is a no-op.
  if (!out.includes('LMS extractor — neutralises Unity PWA ServiceWorker')) {
    out = out.replace(/<body([^>]*)>/i, `<body$1>\n  ${cleanupScript}`);
  }

  return out;
}

function mimeFor(name: string): { contentType: string; contentEncoding?: 'gzip' | 'br' } {
  const lower = name.toLowerCase();

  let encoding: 'gzip' | 'br' | undefined;
  let stripped = lower;
  if (lower.endsWith('.gz')) {
    encoding = 'gzip';
    stripped = lower.slice(0, -3);
  } else if (lower.endsWith('.br')) {
    encoding = 'br';
    stripped = lower.slice(0, -3);
  }

  const idx = stripped.lastIndexOf('.');
  const ext = idx >= 0 ? stripped.slice(idx) : '';
  const contentType = EXT_MIME[ext] ?? 'application/octet-stream';
  return { contentType, contentEncoding: encoding };
}

export interface WebglExtractJob {
  /** Object key of the uploaded .zip in MinIO, e.g. content/webgl/_raw/abc.zip */
  zipKey: string;
  /** Where to extract — becomes content/webgl/{lessonId}/ */
  lessonId: string;
  /** Actor userId for audit. */
  userId: string;
}

/**
 * Worker: download .zip from MinIO → open entries (no disk extract) →
 * stream each entry to MinIO under `content/webgl/{lessonId}/` → verify
 * index.html landed → delete raw zip.
 *
 * History (bug-fix notes):
 *   - Previously used `unzipper.Extract({ path })` to extract to a tmp
 *     dir then walked the filesystem. On Windows, the streaming extract
 *     API could finish the stream before all entries were flushed to
 *     disk, causing `index.html` (typically the last entry in the
 *     central directory) to silently go missing → the validator said
 *     "valid", the extractor said "no index.html". We now iterate the
 *     parsed central directory via `Open.file` and stream each entry
 *     directly to MinIO, which is the same API the validator uses, so
 *     the two stay in agreement.
 *   - Applies the SAME `stripCommonPrefix` the validator uses, so a
 *     zip with a Unity wrapper folder (`Builds/index.html`, …) lands
 *     as `{lessonId}/index.html` — matching the predicted URL the
 *     upload service writes to the DB.
 *
 * Idempotent: running twice with the same lessonId wipes the destination
 * prefix first.
 */
@Processor(WEBGL_EXTRACT_QUEUE)
export class WebglExtractProcessor extends WorkerHost {
  private readonly logger = new Logger(WebglExtractProcessor.name);

  constructor(private readonly storage: StorageService) {
    super();
  }

  async process(job: Job<WebglExtractJob>): Promise<{
    filesExtracted: number;
    indexHtmlKey: string;
  }> {
    const { zipKey, lessonId } = job.data;
    this.logger.log(`[${job.id}] Extract WebGL: zipKey=${zipKey} lessonId=${lessonId}`);

    // Tmp workspace under OS tmp dir; cleaned on exit regardless of errors.
    const tmpDir = await mkdtemp(join(tmpdir(), 'webgl-'));
    const zipPath = join(tmpDir, 'build.zip');

    try {
      // 1. Download zip from MinIO to a local temp file. We need the file
      //    on disk (not just a stream) because unzipper needs random
      //    access to the zip's central directory, which only works on
      //    seekable sources.
      const readStream = await this.storage.streamDownload(zipKey);
      await pipeline(readStream, createWriteStream(zipPath));
      await job.updateProgress(20);

      // 2. Open the zip's central directory. This is the SAME API the
      //    pre-flight validator uses, so if validation said there's an
      //    index.html, we'll see it here too.
      const directory = await unzipper.Open.file(zipPath);
      const allEntries = directory.files.filter((e) => e.type === 'File');
      if (allEntries.length === 0) {
        throw new Error('Empty zip — no files extracted');
      }

      // 3. Drop OS junk (`__MACOSX/`, `.DS_Store`, `._*`, Windows
      //    `Thumbs.db`). Without this, a Mac-zipped build trips
      //    `stripCommonPrefix` into a no-op because it sees two
      //    top-levels (`WebGL/` + `__MACOSX/`), leaves the wrapper
      //    folder in place, and files land at `{lessonId}/WebGL/*`
      //    instead of the predicted `{lessonId}/*` → student iframe 404s.
      //
      //    Also drop Unity PWA artifacts (`ServiceWorker.js` +
      //    `manifest.webmanifest`). Unity 2022+ ships a PWA template
      //    whose `ServiceWorker.js` runs `cache.addAll(...)` on install
      //    to pre-cache the entire build (loader + framework + wasm +
      //    data — often 100+ MB). Inside a student iframe, this
      //    duplicates every file download Unity's own loader is doing,
      //    so bandwidth and memory get split 2× on the same origin and
      //    Unity's progress bar stalls partway through `.data.gz` (we
      //    saw 30% stuck in practice). The SW is pointless here
      //    (lessons load via an authenticated LMS, not as an installable
      //    PWA). Index.html's `navigator.serviceWorker.register(…)`
      //    becomes a harmless 404 and the promise rejects silently.
      const entries = allEntries.filter((e) => {
        const rel = e.path.replace(/\\/g, '/');
        if (filterJunkPaths([rel]).length === 0) return false;
        const basename = rel.slice(rel.lastIndexOf('/') + 1);
        if (basename === 'ServiceWorker.js' || basename === 'manifest.webmanifest') return false;
        return true;
      });
      if (entries.length === 0) {
        throw new Error('Zip contains only OS metadata — no real build files');
      }
      const dropped = allEntries.length - entries.length;
      if (dropped > 0) {
        this.logger.log(
          `[${job.id}] Filtered ${dropped} irrelevant entries (OS junk + Unity PWA artifacts)`,
        );
      }

      // 4. Normalise paths + detect wrapper folder. The validator applies
      //    the SAME `stripCommonPrefix`, so file[i] (raw) corresponds to
      //    rel[i] (stripped).
      const rawPaths = entries.map((e) => e.path.replace(/\\/g, '/'));
      const relPaths = stripCommonPrefix(rawPaths);
      await job.updateProgress(30);

      // 5. Clear any previous extraction at the target prefix.
      const destPrefix = `${STORAGE_PREFIXES.WEBGL}/${lessonId}`;
      await this.storage.deletePrefix(destPrefix);

      // 6. Stream each zip entry directly to MinIO.
      let hasIndex = false;
      let uploaded = 0;
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]!;
        const rel = relPaths[i];
        if (!rel) continue; // the wrapper folder itself (now empty after strip)

        const destKey = `${destPrefix}/${rel}`;
        const size =
          typeof (entry as unknown as { uncompressedSize?: number }).uncompressedSize === 'number'
            ? (entry as unknown as { uncompressedSize: number }).uncompressedSize
            : undefined;
        const { contentType, contentEncoding } = mimeFor(rel);
        const extraHeaders = contentEncoding ? { 'Content-Encoding': contentEncoding } : undefined;

        // index.html needs in-flight patching to neutralise the Unity PWA
        // ServiceWorker registration. We already skip `ServiceWorker.js` +
        // `manifest.webmanifest` above, but index.html still contains the
        // `navigator.serviceWorker.register(...)` call. That's benign on
        // first visit (404 rejects silently), but a browser that already
        // installed the SW from a pre-fix upload keeps it active: the SW
        // then intercepts every `.data.gz` / `.wasm.gz` fetch and calls
        // `cache.put(response.clone())` — doubling memory for 100+ MB
        // responses until the tab ran out and Unity's progress stalled
        // near 30%. We patch the HTML so (a) no new SW is registered, and
        // (b) any previously-registered SW on this origin self-unregisters
        // on next visit and purges its Cache Storage. Must buffer the
        // entry — we need the content as a string.
        if (rel === 'index.html' || rel.endsWith('/index.html')) {
          const originalHtml = (await entry.buffer()).toString('utf8');
          const patched = patchIndexHtml(originalHtml);
          const patchedBuf = Buffer.from(patched, 'utf8');
          await this.storage.upload(
            destKey,
            patchedBuf,
            patchedBuf.length,
            contentType,
            extraHeaders,
          );
          uploaded += 1;
          hasIndex = true;
          await job.updateProgress(30 + Math.round((uploaded / entries.length) * 65));
          continue;
        }

        // `entry.stream()` yields a Readable of the decompressed bytes.
        // If the MinIO client needs a known size we fall back to buffering
        // the entry into memory — rare and only for the case the lib
        // doesn't report uncompressedSize on this entry.
        if (typeof size === 'number') {
          await this.storage.upload(
            destKey,
            entry.stream() as Readable,
            size,
            contentType,
            extraHeaders,
          );
        } else {
          const buf = await entry.buffer();
          await this.storage.upload(destKey, buf, buf.length, contentType, extraHeaders);
        }

        uploaded += 1;
        if (rel === 'index.html' || rel.endsWith('/index.html')) {
          hasIndex = true;
        }
        // Spread 30-95% across the upload loop.
        await job.updateProgress(30 + Math.round((uploaded / entries.length) * 65));
      }

      if (!hasIndex) {
        throw new Error('index.html not found in extracted WebGL build');
      }

      // 7. Delete the raw zip — we don't need it once extraction succeeded.
      try {
        await this.storage.delete(zipKey);
      } catch (err) {
        this.logger.warn(
          `[${job.id}] Raw zip delete failed (non-fatal): ${(err as Error).message}`,
        );
      }

      await job.updateProgress(100);
      this.logger.log(`[${job.id}] Extract OK — ${uploaded} files at ${destPrefix}/`);
      return {
        filesExtracted: uploaded,
        indexHtmlKey: `${destPrefix}/index.html`,
      };
    } finally {
      // Always clean up the local tmp dir.
      await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
