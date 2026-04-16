import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';

import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import sharp from 'sharp';

import {
  ALLOWED_MIME,
  CONTENT_PREFIX_MAP,
  MAX_SIZE,
  PUBLIC_PREFIXES,
  STORAGE_PREFIXES,
  WEBGL_EXTRACT_QUEUE,
  type ContentKind,
} from '../../common/storage/storage.constants';
import { StorageService } from '../../common/storage/storage.service';

import type { WebglExtractJob } from './webgl-extract.processor';

export interface UploadResult {
  fileUrl: string;
  fileKey: string;
  fileSize: number;
  mimeType: string;
  /** Only populated for WEBGL uploads — identifies the enqueued extraction job. */
  extractionJobId?: string;
}

/**
 * Business-logic layer for every /upload/* route.
 *
 * Split from the controller so we can unit-test file validation + sharp
 * transforms without needing an Express request.
 */
@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    private readonly storage: StorageService,
    @InjectQueue(WEBGL_EXTRACT_QUEUE) private readonly webglQueue: Queue<WebglExtractJob>,
  ) {}

  // =====================================================
  // AVATAR — 5 MB, image → sharp resize 200x200 webp
  // =====================================================
  async uploadAvatar(userId: string, file: Express.Multer.File): Promise<UploadResult> {
    this.assertMime(file.mimetype, ALLOWED_MIME.AVATAR);
    this.assertSize(file.size, MAX_SIZE.AVATAR);

    // Resize to a square 200x200 webp regardless of input format.
    // webp gives ~30% smaller files than jpeg at the same quality.
    const resized = await sharp(file.buffer)
      .resize(200, 200, { fit: 'cover' })
      .webp({ quality: 82 })
      .toBuffer();

    const key = `${STORAGE_PREFIXES.AVATARS}/${userId}.webp`;
    await this.storage.upload(key, resized, resized.length, 'image/webp');
    return this.buildResult(key, resized.length, 'image/webp');
  }

  // =====================================================
  // THUMBNAIL — 10 MB, image → sharp resize 800x450 webp
  // =====================================================
  async uploadThumbnail(file: Express.Multer.File): Promise<UploadResult> {
    this.assertMime(file.mimetype, ALLOWED_MIME.THUMBNAIL);
    this.assertSize(file.size, MAX_SIZE.THUMBNAIL);

    const resized = await sharp(file.buffer)
      .resize(800, 450, { fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer();

    const key = `${STORAGE_PREFIXES.THUMBNAILS}/${randomUUID()}.webp`;
    await this.storage.upload(key, resized, resized.length, 'image/webp');
    return this.buildResult(key, resized.length, 'image/webp');
  }

  // =====================================================
  // ATTACHMENT — 50 MB, PDF only
  // =====================================================
  async uploadAttachment(file: Express.Multer.File): Promise<UploadResult> {
    this.assertMime(file.mimetype, ALLOWED_MIME.ATTACHMENT);
    this.assertSize(file.size, MAX_SIZE.ATTACHMENT);

    const ext = extname(file.originalname) || '.pdf';
    const key = `${STORAGE_PREFIXES.ATTACHMENTS}/${randomUUID()}${ext}`;
    await this.storage.upload(key, file.buffer, file.size, file.mimetype);
    return this.buildResult(key, file.size, file.mimetype);
  }

  // =====================================================
  // CONTENT — 2 GB nominal. Routes by contentType into sub-prefix.
  //
  // LIMITATION: multer memoryStorage buffers the entire file in RAM before
  // this method runs. For files > ~100 MB this will OOM the backend.
  // Production must switch to presigned S3 multipart direct from the client
  // (TODO Phase 07 — see frontend/lib/upload.ts chunkedUpload stub).
  // =====================================================
  async uploadContent(
    userId: string,
    kind: ContentKind,
    lessonId: string | undefined,
    file: Express.Multer.File,
  ): Promise<UploadResult> {
    this.assertMime(file.mimetype, ALLOWED_MIME.CONTENT);
    this.assertSize(file.size, MAX_SIZE.CONTENT);

    const prefix = CONTENT_PREFIX_MAP[kind];
    const ext = extname(file.originalname) || '';

    if (kind === 'WEBGL') {
      if (!lessonId) {
        throw new BadRequestException('WEBGL upload requires lessonId');
      }
      // Upload the raw zip to a staging path first — the extraction worker
      // reads from here, extracts, and deletes on success.
      const rawKey = `${prefix}/_raw/${lessonId}-${Date.now()}.zip`;
      await this.storage.upload(rawKey, file.buffer, file.size, file.mimetype);

      const job = await this.webglQueue.add('extract', {
        zipKey: rawKey,
        lessonId,
        userId,
      });

      this.logger.log(`WebGL extract queued — job=${job.id} lessonId=${lessonId} rawKey=${rawKey}`);

      return {
        fileUrl: rawKey, // will be replaced by the extracted index.html URL on completion
        fileKey: rawKey,
        fileSize: file.size,
        mimeType: file.mimetype,
        extractionJobId: String(job.id ?? ''),
      };
    }

    const key = `${prefix}/${randomUUID()}${ext}`;
    await this.storage.upload(key, file.buffer, file.size, file.mimetype);
    return this.buildResult(key, file.size, file.mimetype);
  }

  // =====================================================
  // Helpers
  // =====================================================
  private assertMime(mime: string, allowed: readonly string[]): void {
    if (!allowed.includes(mime)) {
      throw new UnsupportedMediaTypeException(`Định dạng file không hỗ trợ: ${mime}`);
    }
  }

  private assertSize(size: number, max: number): void {
    if (size > max) {
      throw new PayloadTooLargeException(
        `File vượt quá giới hạn ${Math.round(max / 1024 / 1024)}MB`,
      );
    }
  }

  /** Build a UploadResult with the correct URL form (public vs presigned). */
  private async buildResult(key: string, size: number, mime: string): Promise<UploadResult> {
    const isPublic = PUBLIC_PREFIXES.some((p) => key.startsWith(`${p}/`));
    const fileUrl = isPublic
      ? this.storage.getPublicUrl(key)
      : await this.storage.getPresignedUrl(key, 3600);
    return { fileUrl, fileKey: key, fileSize: size, mimeType: mime };
  }
}
