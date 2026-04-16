import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import { Body, Controller, Get, Param, Patch, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { Roles } from '../../common/rbac/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { CertificatesService } from './certificates.service';
import { ListCertificatesDto } from './dto/list-certificates.dto';
import { RevokeCertificateDto } from './dto/revoke-certificate.dto';

/**
 * /admin/certificates/* — ADMIN+ only. All mutations write an audit log
 * via CertificatesService.
 */
@Controller('admin/certificates')
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  // Static paths declared BEFORE dynamic `:id` so Nest's router
  // never mistakes "stats" for a certificate id.
  @Get('stats/summary')
  getStatsSummary() {
    return this.certificates.getStatsSummary();
  }

  @Get('stats/pass-rate')
  getPassRate() {
    return this.certificates.getPassRateByCourse();
  }

  @Get()
  list(@Query() dto: ListCertificatesDto) {
    return this.certificates.list(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.certificates.findOne(id);
  }

  @Patch(':id/revoke')
  revoke(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RevokeCertificateDto,
    @Req() req: Request,
  ) {
    return this.certificates.revoke({ id: user.sub, role: user.role }, id, dto, {
      ip: getClientIp(req),
    });
  }
}

function getClientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]!.trim();
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
