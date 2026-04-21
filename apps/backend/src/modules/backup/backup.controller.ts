import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { Roles } from '../../common/rbac/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { BackupService } from './backup.service';

/**
 * Phase 18B — Backup admin endpoints.
 *
 * Routes:
 *   POST /admin/backups/trigger          — manual backup (ADMIN+)
 *   GET  /admin/backups?page=1&limit=10  — lịch sử paginated
 *   POST /admin/backups/cleanup          — force retention sweep
 *   POST /admin/backups/restore/:id      — DANGEROUS, SUPER_ADMIN + confirmPhrase
 *
 * Restore yêu cầu body: `{ confirm: "YES-I-UNDERSTAND-THIS-OVERWRITES-DATABASE" }`
 * để tránh click nhầm — chỉ UI/admin test chuyên sâu mới gõ được chuỗi này.
 */
@Controller('admin/backups')
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  @Post('trigger')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  async trigger(@CurrentUser() user: JwtPayload, @Req() req: Request) {
    const row = await this.backup.triggerBackup(user.sub, getIp(req), 'MANUAL');
    return {
      id: row.id,
      filename: row.filename,
      status: row.status,
      createdAt: row.createdAt,
      message: 'Backup job đã xếp hàng — đang chạy nền.',
    };
  }

  @Get()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async list(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.backup.getBackupHistory(
      page ? Math.max(1, Number(page)) : 1,
      limit ? Math.max(1, Number(limit)) : 10,
    );
  }

  @Post('cleanup')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  async cleanup(@CurrentUser() user: JwtPayload) {
    const report = await this.backup.cleanupOldBackups(user.sub);
    return report;
  }

  /**
   * Restore — thay thế toàn bộ DB bằng nội dung backup.
   * Yêu cầu confirm phrase chính xác để tránh bấm nhầm.
   */
  @Post('restore/:id')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  async restore(
    @Param('id') id: string,
    @Body() body: { confirm?: string },
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    if (body?.confirm !== 'YES-I-UNDERSTAND-THIS-OVERWRITES-DATABASE') {
      throw new BadRequestException(
        'confirm phrase required: "YES-I-UNDERSTAND-THIS-OVERWRITES-DATABASE"',
      );
    }
    return this.backup.restore(id, user.sub, getIp(req));
  }
}

function getIp(req: Request): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]!.trim();
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
