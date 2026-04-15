import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import * as unzipper from 'unzipper';

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

function mimeFor(name: string): string {
  const lower = name.toLowerCase();
  // Check for compound `.js.gz` / `.wasm.gz` etc. — Unity builds use these.
  if (lower.endsWith('.gz')) return 'application/gzip';
  if (lower.endsWith('.br')) return 'application/brotli';
  const idx = lower.lastIndexOf('.');
  if (idx < 0) return 'application/octet-stream';
  return EXT_MIME[lower.slice(idx)] ?? 'application/octet-stream';
}

import { STORAGE_PREFIXES, WEBGL_EXTRACT_QUEUE } from '../../common/storage/storage.constants';
import { StorageService } from '../../common/storage/storage.service';

export interface WebglExtractJob {
  /** Object key of the uploaded .zip in MinIO, e.g. content/webgl/_raw/abc.zip */
  zipKey: string;
  /** Where to extract — becomes content/webgl/{lessonId}/ */
  lessonId: string;
  /** Actor userId for audit. */
  userId: string;
}

/**
 * Worker: download .zip from MinIO → tmp dir → extract → upload each file
 * back under `content/webgl/{lessonId}/` → verify index.html → delete raw zip.
 *
 * Runs on the same Node process as the API (single-machine deployment).
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
      // 1. Download zip from MinIO to local temp file.
      const readStream = await this.storage.streamDownload(zipKey);
      await pipeline(readStream, createWriteStream(zipPath));
      await job.updateProgress(20);

      // 2. Extract into tmpDir/extracted/
      const extractDir = join(tmpDir, 'extracted');
      await fs.mkdir(extractDir, { recursive: true });
      await pipeline(createReadStream(zipPath), unzipper.Extract({ path: extractDir }));
      await job.updateProgress(50);

      // 3. Clear any previous extraction at the target prefix, then upload new.
      const destPrefix = `${STORAGE_PREFIXES.WEBGL}/${lessonId}`;
      await this.storage.deletePrefix(destPrefix);

      const files = await walk(extractDir);
      if (files.length === 0) {
        throw new Error('Empty zip — no files extracted');
      }

      let hasIndex = false;
      let uploaded = 0;
      for (const absPath of files) {
        const rel = absPath.slice(extractDir.length + 1).replace(/\\/g, '/');
        const destKey = `${destPrefix}/${rel}`;
        const stat = await fs.stat(absPath);
        const mime = mimeFor(rel);
        await this.storage.upload(destKey, createReadStream(absPath), stat.size, mime);
        uploaded += 1;
        if (rel === 'index.html' || rel.endsWith('/index.html')) {
          hasIndex = true;
        }
        // Spread 50-95% across the upload loop.
        await job.updateProgress(50 + Math.round((uploaded / files.length) * 45));
      }

      if (!hasIndex) {
        throw new Error('index.html not found in extracted WebGL build');
      }

      // 4. Delete the raw zip — we don't need it once extraction succeeded.
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

/** Recursively walk a directory and return a flat list of absolute file paths. */
async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function recurse(current: string) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = join(current, entry.name);
      if (entry.isDirectory()) {
        await recurse(abs);
      } else if (entry.isFile()) {
        out.push(abs);
      }
    }
  }
  await recurse(dir);
  return out;
}
