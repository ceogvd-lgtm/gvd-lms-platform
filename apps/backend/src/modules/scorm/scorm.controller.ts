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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { Roles } from '../../common/rbac/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { TrackScormDto } from './dto/track-scorm.dto';
import { ScormService } from './scorm.service';

/**
 * SCORM surface.
 *
 *   POST   /scorm/upload/:lessonId   — INSTRUCTOR owner + ADMIN+
 *   GET    /scorm/:lessonId/manifest — any AUTH user (student launcher)
 *   POST   /scorm/:lessonId/track    — STUDENT (and instructors previewing)
 *   GET    /scorm/:lessonId/progress — any AUTH user
 */
@Controller('scorm')
export class ScormController {
  constructor(private readonly scorm: ScormService) {}

  @Post('upload/:lessonId')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.CREATED)
  upload(
    @CurrentUser() user: JwtPayload,
    @Param('lessonId') lessonId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.scorm.upload({ id: user.sub, role: user.role }, lessonId, file);
  }

  @Get(':lessonId/manifest')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  getManifest(@Param('lessonId') lessonId: string) {
    return this.scorm.getManifest(lessonId);
  }

  @Post(':lessonId/track')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  track(
    @CurrentUser() user: JwtPayload,
    @Param('lessonId') lessonId: string,
    @Body() dto: TrackScormDto,
  ) {
    return this.scorm.trackProgress({ id: user.sub, role: user.role }, lessonId, dto);
  }

  @Get(':lessonId/progress')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  getProgress(@CurrentUser() user: JwtPayload, @Param('lessonId') lessonId: string) {
    return this.scorm.getProgress({ id: user.sub, role: user.role }, lessonId);
  }
}
