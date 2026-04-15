import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { Roles } from '../../common/rbac/roles.decorator';
import { MAX_SIZE } from '../../common/storage/storage.constants';
import { StorageService } from '../../common/storage/storage.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { PresignedUrlDto } from './dto/presigned-url.dto';
import { ContentKindDto, UploadContentDto } from './dto/upload-content.dto';
import { UploadService, type UploadResult } from './upload.service';

/**
 * /api/v1/upload/* and /api/v1/storage/* endpoints.
 *
 * All routes require JWT (global guard). Role restrictions:
 *   - /upload/avatar               any authenticated user
 *   - /upload/thumbnail            INSTRUCTOR+
 *   - /upload/attachment           INSTRUCTOR+
 *   - /upload/content              INSTRUCTOR+
 *   - /storage/presigned           any authenticated user
 *   - /storage/object/:key         ADMIN+ (DELETE)
 */
@Controller()
export class StorageController {
  constructor(
    private readonly uploads: UploadService,
    private readonly storage: StorageService,
  ) {}

  // ------------------- AVATAR -------------------
  @Post('upload/avatar')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SIZE.AVATAR },
    }),
  )
  async uploadAvatar(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadResult> {
    assertFile(file);
    return this.uploads.uploadAvatar(user.sub, file);
  }

  // ------------------- THUMBNAIL -------------------
  @Post('upload/thumbnail')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SIZE.THUMBNAIL },
    }),
  )
  async uploadThumbnail(@UploadedFile() file: Express.Multer.File): Promise<UploadResult> {
    assertFile(file);
    return this.uploads.uploadThumbnail(file);
  }

  // ------------------- ATTACHMENT -------------------
  @Post('upload/attachment')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SIZE.ATTACHMENT },
    }),
  )
  async uploadAttachment(@UploadedFile() file: Express.Multer.File): Promise<UploadResult> {
    assertFile(file);
    return this.uploads.uploadAttachment(file);
  }

  // ------------------- CONTENT (SCORM / PPT / VIDEO / WEBGL) -------------------
  //
  // NOTE: multer buffers the upload in memory up to MAX_SIZE.CONTENT. For real
  // 2 GB uploads we must switch to presigned multipart direct-to-MinIO. See
  // upload.service.ts uploadContent() comment.
  @Post('upload/content')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SIZE.CONTENT },
    }),
  )
  async uploadContent(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UploadContentDto,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadResult> {
    assertFile(file);
    return this.uploads.uploadContent(
      user.sub,
      dto.contentType as unknown as Exclude<keyof typeof ContentKindDto, never>,
      dto.lessonId,
      file,
    );
  }

  // ------------------- PRESIGNED URL -------------------
  @Get('storage/presigned')
  async getPresigned(@Query() dto: PresignedUrlDto) {
    // Any authenticated user can request a presigned URL for any key — this
    // mirrors how GCS/S3 signed URL patterns work in most LMS systems.
    // Authorisation for which key a user CAN access lives in the feature that
    // owns the asset (Courses/Lessons), not here.
    const url = await this.storage.getPresignedUrl(dto.key, dto.ttl ?? 3600);
    return { url, key: dto.key, ttl: dto.ttl ?? 3600 };
  }

  // ------------------- DELETE -------------------
  // Key may contain slashes — encode as base64url on the client OR use a
  // wildcard route. We pick the wildcard: `/storage/object/*` captures the
  // trailing path as `key`.
  @Delete('storage/object/*')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  async deleteObject(@Param('0') key: string) {
    if (!key) {
      throw new ForbiddenException('Missing key');
    }
    await this.storage.delete(key);
    return { message: 'Đã xoá', key };
  }
}

function assertFile(file: Express.Multer.File | undefined): asserts file is Express.Multer.File {
  if (!file) {
    // Throw a 400 if multer couldn't find the expected `file` field.
    throw new ForbiddenException('Thiếu file trong multipart field "file"');
  }
}
