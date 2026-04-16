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
import { stripCommonPrefix } from '../practice-contents/webgl-validator';

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
      const entries = directory.files.filter((e) => e.type === 'File');
      if (entries.length === 0) {
        throw new Error('Empty zip — no files extracted');
      }

      // 3. Normalise paths + detect wrapper folder. The validator applies
      //    the SAME `stripCommonPrefix`, so file[i] (raw) corresponds to
      //    rel[i] (stripped).
      const rawPaths = entries.map((e) => e.path.replace(/\\/g, '/'));
      const relPaths = stripCommonPrefix(rawPaths);
      await job.updateProgress(30);

      // 4. Clear any previous extraction at the target prefix.
      const destPrefix = `${STORAGE_PREFIXES.WEBGL}/${lessonId}`;
      await this.storage.deletePrefix(destPrefix);

      // 5. Stream each zip entry directly to MinIO.
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

      // 6. Delete the raw zip — we don't need it once extraction succeeded.
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
