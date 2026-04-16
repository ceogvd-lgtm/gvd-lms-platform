import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';

import { Roles } from '../../common/rbac/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { TrackVideoDto } from './dto/track-video.dto';
import { VideoProgressService } from './video-progress.service';

/**
 * Video playback progress.
 *
 *   POST /video/:lessonId/progress  — heartbeat (every ~10 s) from the player
 *   GET  /video/:lessonId/progress  — initial load, for resume
 *
 * Both endpoints are gated STUDENT+, the owner check sits inside the
 * service (VideoProgress row is implicitly per-student so role is enough).
 */
@Controller('video')
export class VideoProgressController {
  constructor(private readonly video: VideoProgressService) {}

  @Post(':lessonId/progress')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  track(
    @CurrentUser() user: JwtPayload,
    @Param('lessonId') lessonId: string,
    @Body() dto: TrackVideoDto,
  ) {
    return this.video.track({ id: user.sub, role: user.role }, lessonId, dto);
  }

  @Get(':lessonId/progress')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  get(@CurrentUser() user: JwtPayload, @Param('lessonId') lessonId: string) {
    return this.video.getForStudent({ id: user.sub, role: user.role }, lessonId);
  }
}
