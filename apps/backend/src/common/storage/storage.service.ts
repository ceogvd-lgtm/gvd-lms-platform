import type { Readable } from 'node:stream';

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';

import { PUBLIC_PREFIXES, ROOT_BUCKET } from './storage.constants';

/**
 * Low-level MinIO wrapper — upload, delete, presign, public URL resolution.
 *
 * Higher-level upload logic (image resize, content routing, extraction) lives
 * in `apps/backend/src/modules/storage/upload.service.ts`. This class stays
 * agnostic to business rules so it can be reused by other features later
 * (certificate PDF generator, avatar pre-cache, etc.).
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client!: Client;
  private publicBaseUrl!: string;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const endpoint = this.config.get<string>('MINIO_ENDPOINT') ?? 'localhost';
    const port = Number(this.config.get<string>('MINIO_PORT') ?? 9000);
    const useSSL = (this.config.get<string>('MINIO_USE_SSL') ?? 'false') === 'true';
    const accessKey = this.config.get<string>('MINIO_ACCESS_KEY') ?? 'minioadmin';
    const secretKey = this.config.get<string>('MINIO_SECRET_KEY') ?? 'minioadmin';

    this.client = new Client({
      endPoint: endpoint,
      port,
      useSSL,
      accessKey,
      secretKey,
    });

    // Public URLs point at the MinIO endpoint directly — in production you'd
    // put CloudFront/Nginx in front and set PUBLIC_BASE_URL, but for dev the
    // endpoint host:port is reachable from the browser.
    const publicBase = this.config.get<string>('MINIO_PUBLIC_BASE_URL');
    this.publicBaseUrl =
      publicBase ?? `${useSSL ? 'https' : 'http'}://${endpoint}:${port}/${ROOT_BUCKET}`;

    try {
      await this.ensureBucket();
      await this.setPublicReadPolicy();
      this.logger.log(`MinIO ready — bucket=${ROOT_BUCKET} endpoint=${endpoint}:${port}`);
    } catch (err) {
      this.logger.warn(
        `MinIO init failed — uploads will 500 until resolved: ${(err as Error).message}`,
      );
    }
  }

  /** Create the root bucket if it doesn't already exist. */
  async ensureBucket(): Promise<void> {
    const exists = await this.client.bucketExists(ROOT_BUCKET);
    if (!exists) {
      await this.client.makeBucket(ROOT_BUCKET);
      this.logger.log(`Created bucket ${ROOT_BUCKET}`);
    }
  }

  /**
   * Bucket policy: public GET for `avatars/*` and `thumbnails/*`, everything
   * else requires a presigned URL. Re-applied on every boot because MinIO
   * policy state is editable and we want the declared policy to win.
   */
  private async setPublicReadPolicy(): Promise<void> {
    const statements = PUBLIC_PREFIXES.map((prefix) => ({
      Effect: 'Allow',
      Principal: { AWS: ['*'] },
      Action: ['s3:GetObject'],
      Resource: [`arn:aws:s3:::${ROOT_BUCKET}/${prefix}/*`],
    }));
    const policy = {
      Version: '2012-10-17',
      Statement: statements,
    };
    try {
      await this.client.setBucketPolicy(ROOT_BUCKET, JSON.stringify(policy));
    } catch (err) {
      this.logger.warn(`Failed to set public read policy: ${(err as Error).message}`);
    }
  }

  /**
   * Upload a buffer or readable stream to `key`.
   * Caller is responsible for routing `key` under the correct prefix.
   *
   * `extraHeaders` is for cases where the uploader needs to set additional
   * response metadata (e.g. `Content-Encoding: gzip` for Unity WebGL
   * `.wasm.gz` / `.js.gz` / `.data.gz` files so the browser transparently
   * decompresses them on fetch — without it Unity's loader throws
   * "Unable to load file …").
   */
  async upload(
    key: string,
    body: Buffer | Readable,
    size: number,
    contentType: string,
    extraHeaders?: Record<string, string>,
  ): Promise<void> {
    await this.client.putObject(ROOT_BUCKET, key, body, size, {
      'Content-Type': contentType,
      ...extraHeaders,
    });
  }

  async delete(key: string): Promise<void> {
    await this.client.removeObject(ROOT_BUCKET, key);
  }

  /** Remove every object under a given prefix — used when replacing a WebGL build. */
  async deletePrefix(prefix: string): Promise<void> {
    const objects: string[] = [];
    const stream = this.client.listObjectsV2(ROOT_BUCKET, prefix, true);
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (obj) => {
        if (obj.name) objects.push(obj.name);
      });
      stream.on('end', () => resolve());
      stream.on('error', reject);
    });
    if (objects.length > 0) {
      await this.client.removeObjects(ROOT_BUCKET, objects);
    }
  }

  /**
   * Phase 18 — liệt kê tất cả key dưới 1 prefix. Dùng cho job cleanup
   * weekly: so sánh `listKeys()` với tập URL đang dùng trong DB để tìm
   * orphan. Recursive (true) → bao cả sub-folder như content/webgl/<id>/*.
   */
  async listKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    const stream = this.client.listObjectsV2(ROOT_BUCKET, prefix, true);
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (obj) => {
        if (obj.name) keys.push(obj.name);
      });
      stream.on('end', () => resolve());
      stream.on('error', reject);
    });
    return keys;
  }

  /**
   * Generate a time-limited URL for GET access to a private object.
   * Default TTL 1 hour per Phase 06 spec.
   */
  async getPresignedUrl(key: string, ttlSeconds = 3600): Promise<string> {
    return this.client.presignedGetObject(ROOT_BUCKET, key, ttlSeconds);
  }

  /** Directly-reachable URL for a PUBLIC_PREFIX object (no signature). */
  getPublicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }

  /** Return the best URL for a key: public if in a public prefix, otherwise presigned. */
  async getUrl(key: string, ttlSeconds = 3600): Promise<string> {
    if (PUBLIC_PREFIXES.some((p) => key.startsWith(`${p}/`))) {
      return this.getPublicUrl(key);
    }
    return this.getPresignedUrl(key, ttlSeconds);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.statObject(ROOT_BUCKET, key);
      return true;
    } catch {
      return false;
    }
  }

  /** Read an object as a readable stream. Used by the WebGL extract worker. */
  async streamDownload(key: string): Promise<Readable> {
    return this.client.getObject(ROOT_BUCKET, key);
  }
}
