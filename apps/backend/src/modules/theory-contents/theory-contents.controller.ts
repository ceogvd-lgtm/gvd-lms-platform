import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsIn, IsString } from 'class-validator';

import { Roles } from '../../common/rbac/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { SaveBodyDto, UpsertTheoryDto } from './dto/upsert-theory.dto';
import { TheoryContentsService } from './theory-contents.service';

/**
 * Request body accepted by POST /lessons/:lessonId/theory/upload.
 *
 * `kind` names the logical content type so the controller knows where
 * to store the blob and which contentType enum to save on the DB row.
 */
class UploadContentDto {
  @IsString()
  @IsIn(['SCORM', 'XAPI', 'POWERPOINT', 'VIDEO'])
  kind!: 'SCORM' | 'XAPI' | 'POWERPOINT' | 'VIDEO';
}

class ConvertPptDto {
  @IsString()
  sourceKey!: string;
}

/**
 * Routes for `/lessons/:lessonId/theory/*`.
 *
 * Phase 10 surface (unchanged):
 *   GET    /lessons/:lessonId/theory         — INSTRUCTOR owner + ADMIN+
 *   PUT    /lessons/:lessonId/theory         — INSTRUCTOR owner + ADMIN+
 *   PATCH  /lessons/:lessonId/theory/body    — INSTRUCTOR owner + ADMIN+ (auto-save)
 *
 * Phase 12 additions:
 *   POST   /lessons/:lessonId/theory/upload        — upload SCORM/xAPI/PPT/VIDEO blob
 *   POST   /lessons/:lessonId/theory/convert-ppt   — rasterise uploaded .pptx
 *   GET    /lessons/:lessonId/theory/slides        — any AUTH user — read deck JSON
 *
 * The `slides` endpoint is the one exception to the INSTRUCTOR+ gate
 * because the student player renders directly from the deck manifest.
 */
@Controller('lessons/:lessonId/theory')
export class TheoryContentsController {
  constructor(private readonly theory: TheoryContentsService) {}

  // ---------- Phase 10 (unchanged) ----------
  @Get()
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  get(@CurrentUser() user: JwtPayload, @Param('lessonId') lessonId: string) {
    return this.theory.findByLesson({ id: user.sub, role: user.role }, lessonId);
  }

  @Put()
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  upsert(
    @CurrentUser() user: JwtPayload,
    @Param('lessonId') lessonId: string,
    @Body() dto: UpsertTheoryDto,
  ) {
    return this.theory.upsert({ id: user.sub, role: user.role }, lessonId, dto);
  }

  @Patch('body')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  saveBody(
    @CurrentUser() user: JwtPayload,
    @Param('lessonId') lessonId: string,
    @Body() dto: SaveBodyDto,
  ) {
    return this.theory.saveBody({ id: user.sub, role: user.role }, lessonId, dto);
  }

  // ---------- Phase 12: upload ----------
  @Post('upload')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.CREATED)
  upload(
    @CurrentUser() user: JwtPayload,
    @Param('lessonId') lessonId: string,
    @Body() dto: UploadContentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.theory.uploadContent({ id: user.sub, role: user.role }, lessonId, dto.kind, file);
  }

  // ---------- Phase 12: convert PPT ----------
  @Post('convert-ppt')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  convertPpt(
    @CurrentUser() user: JwtPayload,
    @Param('lessonId') lessonId: string,
    @Body() dto: ConvertPptDto,
  ) {
    return this.theory.convertPpt({ id: user.sub, role: user.role }, lessonId, dto.sourceKey);
  }

  // ---------- Phase 12: get slides (AUTH, students read too) ----------
  @Get('slides')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  slides(@Param('lessonId') lessonId: string) {
    return this.theory.getSlides(lessonId);
  }
}
