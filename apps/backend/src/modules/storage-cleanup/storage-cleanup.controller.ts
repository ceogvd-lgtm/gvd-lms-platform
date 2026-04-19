import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import { Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { Roles } from '../../common/rbac/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { StorageCleanupService } from './storage-cleanup.service';

/**
 * Phase 18 — Manual trigger cho storage cleanup job.
 *
 * Dùng để:
 *   - Test flow dọn orphan ngay (không đợi 03:00 CN)
 *   - Force-clean sau khi migrate data lớn
 *
 * Chỉ SUPER_ADMIN mới được kích hoạt vì:
 *   - Tốn I/O (list toàn bộ bucket + delete objects)
 *   - Có rủi ro xoá nhầm nếu logic extractMinioKey không đúng
 */
@Controller('admin/storage-cleanup')
@Roles(Role.SUPER_ADMIN)
export class StorageCleanupController {
  constructor(private readonly cleanup: StorageCleanupService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async trigger(@CurrentUser() user: JwtPayload, @Req() req: Request) {
    const ip = getClientIp(req);
    const report = await this.cleanup.runCleanup(user.sub, ip);
    return report;
  }
}

function getClientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]!.trim();
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
