import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { Roles } from '../../common/rbac/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { TestSmtpDto } from './dto/test-smtp.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SystemSettingsService } from './system-settings.service';

/**
 * /admin/settings — ADMIN+ can READ (smtp.pass masked),
 * SUPER_ADMIN only can WRITE / test SMTP.
 *
 * Backup endpoints moved to /admin/backups/* — see BackupController.
 *
 * Settings page in the UI renders a read-only form for ADMIN and
 * disables all inputs with a tooltip.
 */
@Controller('admin/settings')
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class SystemSettingsController {
  constructor(private readonly settings: SystemSettingsService) {}

  @Get()
  getAll(@CurrentUser() user: JwtPayload) {
    return this.settings.getAll({ id: user.sub, role: user.role });
  }

  @Patch()
  @Roles(Role.SUPER_ADMIN)
  update(@CurrentUser() user: JwtPayload, @Body() dto: UpdateSettingsDto, @Req() req: Request) {
    return this.settings.update({ id: user.sub, role: user.role }, dto, {
      ip: getClientIp(req),
    });
  }

  @Post('smtp/test')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  testSmtp(@Body() dto: TestSmtpDto) {
    return this.settings.testSmtp(dto);
  }

  // NOTE: Backup endpoints moved to /admin/backups/* in Phase 18B
  // (BackupController). These routes were stubs that only wrote AuditLog.
  // Keep the settings controller focused on org/SMTP/security/quota.
}

function getClientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]!.trim();
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
