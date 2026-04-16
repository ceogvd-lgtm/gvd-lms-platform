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
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { Roles } from '../../common/rbac/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { AdminService } from './admin.service';
import { BlockUserDto } from './dto/block-user.dto';
import { BulkBlockDto } from './dto/bulk-block.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
import { ExportUsersDto } from './dto/export-users.dto';
import { ListAuditLogDto } from './dto/list-audit-log.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

/**
 * All /admin/* routes require a valid JWT (global JwtAuthGuard) and at least
 * ADMIN role (class-level @Roles). Per-handler @Roles decorators further
 * restrict to SUPER_ADMIN where LAW 1 applies.
 */
@Controller('admin')
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  // ---------- READ ----------
  @Get('users')
  listUsers(@Query() dto: ListUsersDto) {
    return this.admin.listUsers(dto);
  }

  /**
   * Export users to CSV or XLSX. Declared BEFORE `GET users/:id` so Nest's
   * router matches the static path first (guard against the edge case
   * where a future Nest version ordered dynamic routes before static).
   */
  @Get('users/export')
  async exportUsers(@Query() dto: ExportUsersDto, @Res() res: Response) {
    const { buffer, contentType, filename } = await this.admin.exportUsers(dto);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Get('users/:id')
  getUserDetail(@Param('id') id: string) {
    return this.admin.getUserDetail(id);
  }

  @Get('audit-log')
  listAuditLog(@Query() dto: ListAuditLogDto) {
    return this.admin.listAuditLog(dto);
  }

  // ---------- CREATE ADMIN ----------
  @Post('create-admin')
  @Roles(Role.SUPER_ADMIN) // LAW 1 — route-level
  @HttpCode(HttpStatus.CREATED)
  createAdmin(@CurrentUser() user: JwtPayload, @Body() dto: CreateAdminDto, @Req() req: Request) {
    return this.admin.createAdmin({ id: user.sub, role: user.role }, dto, { ip: getClientIp(req) });
  }

  // ---------- DELETE USER ----------
  @Delete('users/:id')
  @Roles(Role.SUPER_ADMIN) // LAW 1 — route-level (strictest branch)
  deleteUser(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Req() req: Request) {
    return this.admin.deleteUser({ id: user.sub, role: user.role }, id, { ip: getClientIp(req) });
  }

  // ---------- UPDATE ROLE ----------
  @Patch('users/:id/role')
  @Roles(Role.SUPER_ADMIN) // LAW 1 — route-level
  updateRole(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @Req() req: Request,
  ) {
    return this.admin.updateRole({ id: user.sub, role: user.role }, id, dto, {
      ip: getClientIp(req),
    });
  }

  // ---------- BLOCK / UNBLOCK ----------
  @Patch('users/:id/block')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  setBlocked(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: BlockUserDto,
    @Req() req: Request,
  ) {
    return this.admin.setBlocked({ id: user.sub, role: user.role }, id, dto, {
      ip: getClientIp(req),
    });
  }

  // ---------- BULK BLOCK / UNBLOCK ----------
  @Patch('users/bulk-block')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  bulkBlock(@CurrentUser() user: JwtPayload, @Body() dto: BulkBlockDto, @Req() req: Request) {
    return this.admin.bulkSetBlocked({ id: user.sub, role: user.role }, dto, {
      ip: getClientIp(req),
    });
  }
}

function getClientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]!.trim();
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
