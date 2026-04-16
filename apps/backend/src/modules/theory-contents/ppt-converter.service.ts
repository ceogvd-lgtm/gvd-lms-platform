import { exec } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { Injectable, Logger } from '@nestjs/common';

import { STORAGE_PREFIXES } from '../../common/storage/storage.constants';
import { StorageService } from '../../common/storage/storage.service';

const execAsync = promisify(exec);

export interface SlideItem {
  /** 1-based slide number. */
  index: number;
  /** URL to the rendered slide image (PNG). */
  imageUrl: string;
  /** Optional extracted text (best-effort from pptx XML). */
  notes?: string;
}

export interface SlideDeck {
  /** Lesson that owns this deck. */
  lessonId: string;
  /** MinIO key of the original .pptx file. */
  sourceKey: string;
  /** Conversion timestamp (ISO). */
  convertedAt: string;
  /** How the deck was produced — 'libreoffice' or 'fallback' (no converter). */
  converter: 'libreoffice' | 'fallback';
  /** Total slide count. */
  total: number;
  /** Rendered slides. Empty when converter === 'fallback'. */
  slides: SlideItem[];
  /** Human message shown to the user when converter === 'fallback'. */
  message?: string;
}

/**
 * Convert an uploaded .pptx into a deck of slide images.
 *
 * **Happy path** — LibreOffice is installed (host or inside the backend
 * container):
 *   1. download raw .pptx from MinIO to a temp dir
 *   2. `libreoffice --headless --convert-to pdf ...` → deck.pdf
 *   3. `pdftoppm -png -r 144 deck.pdf slide` → slide-1.png, slide-2.png, …
 *   4. upload each PNG back to MinIO under
 *      `content/ppt/{lessonId}/slide-{n}.png`
 *   5. write a `slides.json` manifest alongside the PNGs
 *
 * **Fallback** — neither binary is present:
 *   returns a deck with `converter: 'fallback'`, empty `slides[]`, and a
 *   human-readable `message` the frontend surfaces as "Đang xử lý slides,
 *   vui lòng thử lại sau". The raw .pptx is still downloadable.
 *
 * The fallback keeps Phase 12 shippable on dev machines without
 * LibreOffice; operators can enable real conversion later by installing
 * LibreOffice + poppler in the backend image without any app changes.
 */
@Injectable()
export class PptConverterService {
  private readonly logger = new Logger(PptConverterService.name);

  constructor(private readonly storage: StorageService) {}

  async convert(lessonId: string, sourceKey: string): Promise<SlideDeck> {
    // Short-circuit on missing source file — a fake / stale key would
    // otherwise surface as a 500 from the inner stream read. The
    // controller wraps us in NotFoundException so the client gets 404.
    if (!(await this.storage.exists(sourceKey))) {
      throw new Error(
        `Source PPT not found in storage: ${sourceKey}. Hãy upload file qua /upload trước.`,
      );
    }
    const workdir = await this.makeWorkdir(lessonId);
    try {
      // Pull the raw .pptx down to disk so the converter can read it.
      const pptPath = join(workdir, 'input.pptx');
      await this.downloadTo(sourceKey, pptPath);

      // Probe for the binaries. If either is missing, bail gracefully.
      const hasLibre = await this.checkBinary('libreoffice');
      const hasPdftoppm = await this.checkBinary('pdftoppm');
      if (!hasLibre || !hasPdftoppm) {
        this.logger.warn(
          `PPT convert fallback for ${lessonId} — libreoffice=${hasLibre} pdftoppm=${hasPdftoppm}`,
        );
        return this.fallbackDeck(lessonId, sourceKey);
      }

      // Step 1: pptx → pdf
      await execAsync(
        `libreoffice --headless --convert-to pdf --outdir "${workdir}" "${pptPath}"`,
        { timeout: 120_000 },
      );

      // Step 2: pdf → one PNG per page. `pdftoppm` emits slide-1.png,
      // slide-2.png, … with padding that depends on the total. We use
      // `-r 144` (2x 72 dpi) for a crisp preview without ballooning size.
      await execAsync(`pdftoppm -png -r 144 "${workdir}/input.pdf" "${workdir}/slide"`, {
        timeout: 120_000,
      });

      // Step 3: upload each PNG back to MinIO.
      const files = (await readdir(workdir))
        .filter((f) => f.startsWith('slide-') && f.endsWith('.png'))
        .sort((a, b) => this.pageNumber(a) - this.pageNumber(b));

      const slides: SlideItem[] = [];
      for (const filename of files) {
        const localPath = join(workdir, filename);
        const buf = await readFile(localPath);
        const pageNum = this.pageNumber(filename);
        const key = `${STORAGE_PREFIXES.PPT}/${lessonId}/slide-${pageNum}.png`;
        await this.storage.upload(key, buf, buf.length, 'image/png');
        slides.push({
          index: pageNum,
          imageUrl: await this.storage.getUrl(key, 24 * 3600),
        });
      }

      const deck: SlideDeck = {
        lessonId,
        sourceKey,
        convertedAt: new Date().toISOString(),
        converter: 'libreoffice',
        total: slides.length,
        slides,
      };

      await this.writeManifest(lessonId, deck);
      return deck;
    } finally {
      // Always clean the temp dir — slides live in MinIO now.
      await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** Read `slides.json` back from MinIO. Returns null if never converted. */
  async getDeck(lessonId: string): Promise<SlideDeck | null> {
    const key = `${STORAGE_PREFIXES.PPT}/${lessonId}/slides.json`;
    if (!(await this.storage.exists(key))) return null;
    const stream = await this.storage.streamDownload(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    const text = Buffer.concat(chunks).toString('utf-8');
    try {
      return JSON.parse(text) as SlideDeck;
    } catch {
      return null;
    }
  }

  // =====================================================
  // Private helpers
  // =====================================================

  private async makeWorkdir(lessonId: string): Promise<string> {
    const dir = join(tmpdir(), `ppt-${lessonId}-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  private async downloadTo(key: string, dest: string): Promise<void> {
    const stream = await this.storage.streamDownload(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    await writeFile(dest, Buffer.concat(chunks));
  }

  private async checkBinary(name: string): Promise<boolean> {
    try {
      const cmd = process.platform === 'win32' ? `where ${name}` : `command -v ${name}`;
      await execAsync(cmd, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  private pageNumber(filename: string): number {
    const m = filename.match(/slide-(\d+)\.png$/);
    return m ? Number(m[1]) : 0;
  }

  private async writeManifest(lessonId: string, deck: SlideDeck): Promise<void> {
    const key = `${STORAGE_PREFIXES.PPT}/${lessonId}/slides.json`;
    const body = Buffer.from(JSON.stringify(deck, null, 2), 'utf-8');
    await this.storage.upload(key, body, body.length, 'application/json');
  }

  /**
   * Build the "we can't convert this" deck. The manifest is still saved
   * so repeat calls don't try to re-convert; operators can re-run after
   * installing LibreOffice.
   */
  private async fallbackDeck(lessonId: string, sourceKey: string): Promise<SlideDeck> {
    const deck: SlideDeck = {
      lessonId,
      sourceKey,
      convertedAt: new Date().toISOString(),
      converter: 'fallback',
      total: 0,
      slides: [],
      message:
        'Đang xử lý slides, vui lòng thử lại sau. (LibreOffice chưa được cài trên máy chủ để chuyển đổi PowerPoint.)',
    };
    await this.writeManifest(lessonId, deck);
    return deck;
  }
}
