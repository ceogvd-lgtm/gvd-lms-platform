import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { Roles } from '../../common/rbac/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { UpsertPracticeDto } from './dto/upsert-practice.dto';
import { PracticeContentsService } from './practice-contents.service';
import { WebGLUploadService } from './webgl-upload.service';

/**
 * Two route shapes sharing one module:
 *
 *   /lessons/:lessonId/practice           — the Phase-10 CRUD (keep as-is)
 *   /practice-contents/:lessonId/...      — Phase-13 additions
 *
 * We intentionally use `:lessonId` on the Phase-13 paths too (not the
 * PracticeContent PK) because lessons own the content 1:1 and the
 * frontend already tracks lessonId throughout.
 */
@Controller()
export class PracticeContentsController {
  constructor(
    private readonly practice: PracticeContentsService,
    private readonly webgl: WebGLUploadService,
  ) {}

  // ---------- Phase 10 (unchanged) ----------
  @Get('lessons/:lessonId/practice')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  get(@CurrentUser() user: JwtPayload, @Param('lessonId') lessonId: string) {
    return this.practice.findByLesson({ id: user.sub, role: user.role }, lessonId);
  }

  @Put('lessons/:lessonId/practice')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  upsert(
    @CurrentUser() user: JwtPayload,
    @Param('lessonId') lessonId: string,
    @Body() dto: UpsertPracticeDto,
  ) {
    return this.practice.upsert({ id: user.sub, role: user.role }, lessonId, dto);
  }

  // ---------- Phase 13: WebGL upload ----------
  @Post('practice-contents/:lessonId/upload-webgl')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.ACCEPTED)
  uploadWebGL(
    @CurrentUser() user: JwtPayload,
    @Param('lessonId') lessonId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.webgl.upload({ id: user.sub, role: user.role }, lessonId, file);
  }

  @Get('practice-contents/:lessonId/extract-status')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  extractStatus(@Query('jobId') jobId: string) {
    return this.webgl.getJobStatus(jobId);
  }
}
