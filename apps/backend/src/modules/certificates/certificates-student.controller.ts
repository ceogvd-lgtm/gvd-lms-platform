import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { Roles } from '../../common/rbac/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { CertificateCriteriaService } from './certificate-criteria.service';
import { CertificatesService } from './certificates.service';
import { IssueManualDto, UpsertCriteriaDto } from './dto/upsert-criteria.dto';

/**
 * Phase 16 — non-admin certificate routes.
 *
 *   GET    /certificates/criteria/:courseId      AUTH any role
 *   PUT    /certificates/criteria/:courseId      INSTRUCTOR own / ADMIN+
 *   DELETE /certificates/criteria/:courseId      ADMIN+
 *   POST   /certificates/check/:courseId         AUTH (STUDENT own)
 *   POST   /certificates/issue-manual            ADMIN+
 *   GET    /certificates/:id/download            AUTH (owner / course instructor / ADMIN+)
 */
@Controller('certificates')
export class CertificatesStudentController {
  constructor(
    private readonly certificates: CertificatesService,
    private readonly criteria: CertificateCriteriaService,
  ) {}

  // =====================================================
  // Criteria CRUD
  // =====================================================
  @Get('criteria/:courseId')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  getCriteria(@Param('courseId') courseId: string) {
    return this.criteria.get(courseId);
  }

  @Put('criteria/:courseId')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  upsertCriteria(
    @CurrentUser() user: JwtPayload,
    @Param('courseId') courseId: string,
    @Body() dto: UpsertCriteriaDto,
  ) {
    return this.criteria.upsert({ id: user.sub, role: user.role }, courseId, dto);
  }

  @Delete('criteria/:courseId')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  deleteCriteria(@CurrentUser() user: JwtPayload, @Param('courseId') courseId: string) {
    return this.criteria.remove({ id: user.sub, role: user.role }, courseId);
  }

  // =====================================================
  // Auto / manual issuance + download
  // =====================================================

  /**
   * POST /certificates/check/:courseId — manual re-check for the
   * logged-in student. Useful when the cascade hasn't caught up yet.
   */
  @Post('check/:courseId')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  check(@CurrentUser() user: JwtPayload, @Param('courseId') courseId: string) {
    return this.certificates.checkAndIssueCertificate(user.sub, courseId);
  }

  @Post('issue-manual')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  issueManual(@CurrentUser() user: JwtPayload, @Body() dto: IssueManualDto, @Req() req: Request) {
    return this.certificates.issueManual(
      { id: user.sub, role: user.role },
      dto.studentId,
      dto.courseId,
      dto.note,
      { ip: getClientIp(req) },
    );
  }

  @Get(':id/download')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  download(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.certificates.getDownloadUrl({ id: user.sub, role: user.role }, id);
  }
}

function getClientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]!.trim();
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
