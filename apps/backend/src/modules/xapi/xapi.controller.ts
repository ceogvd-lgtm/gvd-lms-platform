import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';

import { Roles } from '../../common/rbac/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { XapiStatementDto } from './dto/statement.dto';
import { XapiService } from './xapi.service';

/**
 * xAPI LRS surface (Phase 12).
 *
 *   POST /xapi/statements   — content pack posts a statement
 *   GET  /xapi/statements   — UI reads back a student's lesson timeline
 *
 * Auth: the existing JWT pipeline already requires a valid token. Real
 * LRS implementations use Basic Auth over the xAPI spec — the "LRS
 * credentials" approach for content packs — but for Phase 12 we keep
 * the internal JWT. Packs run inside the LMS iframe and share the
 * student's access token; the spec writer's Basic Auth reference maps
 * cleanly to the JWT in our setup (same identity, different header).
 */
@Controller('xapi/statements')
export class XapiController {
  constructor(private readonly xapi: XapiService) {}

  @Post()
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  record(@CurrentUser() user: JwtPayload, @Body() dto: XapiStatementDto) {
    return this.xapi.recordStatement({ id: user.sub, role: user.role }, dto);
  }

  @Get()
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  list(@CurrentUser() user: JwtPayload, @Query('lessonId') lessonId: string) {
    return this.xapi.listForLesson({ id: user.sub, role: user.role }, lessonId);
  }
}
