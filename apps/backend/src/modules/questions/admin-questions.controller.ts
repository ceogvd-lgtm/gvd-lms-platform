import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { Roles } from '../../common/rbac/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { BulkDeleteQuestionsDto } from './dto/bulk-delete-questions.dto';
import { ListAdminQuestionsDto } from './dto/list-admin-questions.dto';
import { QuestionsService } from './questions.service';

/**
 * Admin-scoped endpoints cho ngân hàng câu hỏi (Phase 18).
 *
 * Route surface:
 *   GET    /admin/questions         — list TẤT CẢ câu hỏi mọi instructor
 *                                      + filter instructorId / subjectId / difficulty
 *   DELETE /admin/questions/bulk    — xoá hàng loạt (bỏ qua câu đang dùng)
 *
 * Endpoint DELETE câu hỏi đơn lẻ đã có ở `/questions/:id` — admin dùng
 * luôn endpoint đó (service tự bypass ownership check cho ADMIN+).
 * Không duplicate ở đây để tránh code thừa + tránh drift logic.
 *
 * Class-level `@Roles(ADMIN, SUPER_ADMIN)` chặn mọi non-admin → LUẬT
 * "admin-only surface" được enforced ở cả guard và service.
 */
@Controller('admin/questions')
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class AdminQuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Query() query: ListAdminQuestionsDto) {
    return this.questions.listForAdmin({ id: user.sub, role: user.role }, query);
  }

  @Delete('bulk')
  @HttpCode(HttpStatus.OK)
  bulkDelete(
    @CurrentUser() user: JwtPayload,
    @Body() dto: BulkDeleteQuestionsDto,
    @Req() req: Request,
  ) {
    return this.questions.bulkRemove({ id: user.sub, role: user.role }, dto.ids, {
      ip: getClientIp(req),
    });
  }
}

function getClientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]!.trim();
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
