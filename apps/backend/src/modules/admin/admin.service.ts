import { Role } from '@lms/types';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import ExcelJS from 'exceljs';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AdminRulesService } from '../../common/rbac/admin-rules.service';

import { BlockUserDto } from './dto/block-user.dto';
import { BulkBlockDto } from './dto/bulk-block.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
import { ExportUsersDto } from './dto/export-users.dto';
import { ListAuditLogDto } from './dto/list-audit-log.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

const BCRYPT_SALT_ROUNDS = 12;

interface RequestMeta {
  ip: string;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Fields safe to return to an admin listing — never includes password. */
const USER_SAFE_SELECT = {
  id: true,
  email: true,
  name: true,
  phone: true,
  avatar: true,
  role: true,
  emailVerified: true,
  is2FAEnabled: true,
  isBlocked: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: AdminRulesService,
    private readonly audit: AuditService,
  ) {}

  // =====================================================
  // READ
  // =====================================================
  async listUsers(dto: ListUsersDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const where = this.buildUserWhere(dto);

    const [total, data] = await Promise.all([
      this.prisma.client.user.count({ where }),
      this.prisma.client.user.findMany({
        where,
        select: USER_SAFE_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Shared where-clause builder used by `listUsers` and `exportUsers` so the
   * two stay consistent — filter in the UI produces the same result set as
   * the export button.
   */
  private buildUserWhere(
    dto: Pick<ListUsersDto, 'q' | 'role' | 'status'>,
  ): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    if (dto.q) {
      where.OR = [
        { email: { contains: dto.q, mode: 'insensitive' } },
        { name: { contains: dto.q, mode: 'insensitive' } },
      ];
    }
    if (dto.role) where.role = dto.role;
    if (dto.status === 'active') where.isBlocked = false;
    if (dto.status === 'blocked') where.isBlocked = true;
    return where;
  }

  /**
   * Detailed user view for /admin/users/:id — includes aggregate stats
   * that the admin detail panel needs (enrollments, certificates, last 5 logins).
   *
   * Does NOT enforce LAW 2/3/4 — any ADMIN+ can READ any user. Mutations
   * (block/role/delete) still go through the enforced endpoints.
   */
  async getUserDetail(id: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id },
      select: {
        ...USER_SAFE_SELECT,
        _count: {
          select: {
            enrollments: true,
            certificates: true,
            instructedCourses: true,
            loginLogs: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');

    const loginHistory = await this.prisma.client.loginLog.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        success: true,
        createdAt: true,
      },
    });

    return { ...user, loginHistory };
  }

  async listAuditLog(dto: ListAuditLogDto): Promise<Paginated<unknown>> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const where: Record<string, unknown> = {};

    if (dto.action) where.action = dto.action;
    else if (dto.q) where.action = { contains: dto.q, mode: 'insensitive' };
    if (dto.targetType) where.targetType = dto.targetType;
    if (dto.userId) where.userId = dto.userId;

    const [total, data] = await Promise.all([
      this.prisma.client.auditLog.count({ where }),
      this.prisma.client.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, email: true, name: true, role: true } },
        },
      }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // =====================================================
  // CREATE ADMIN  (LAW 1 — SUPER_ADMIN only)
  // =====================================================
  async createAdmin(actor: { id: string; role: Role }, dto: CreateAdminDto, meta: RequestMeta) {
    // LAW 1 is also enforced by @Roles(SUPER_ADMIN) on the controller, but we
    // double-check at the service layer so programmatic callers can't bypass.
    await this.rules.check(actor, null, 'CREATE_ADMIN');

    const existing = await this.prisma.client.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('Email đã được sử dụng');
    }

    const hashed = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    const user = await this.prisma.client.user.create({
      data: {
        email: dto.email.toLowerCase(),
        name: dto.name,
        password: hashed,
        role: Role.ADMIN,
        emailVerified: true, // admin-provisioned accounts skip verify
      },
      select: USER_SAFE_SELECT,
    });

    await this.audit.log({
      userId: actor.id,
      action: 'ADMIN_CREATE_ADMIN',
      targetType: 'User',
      targetId: user.id,
      ipAddress: meta.ip,
      newValue: { email: user.email, name: user.name, role: user.role },
    });

    return user;
  }

  // =====================================================
  // DELETE USER  (LAW 1/2/3/4 — all apply)
  // =====================================================
  async deleteUser(actor: { id: string; role: Role }, targetId: string, meta: RequestMeta) {
    const target = await this.rules.checkById(actor, targetId, 'DELETE_USER');

    const before = await this.prisma.client.user.findUnique({
      where: { id: targetId },
      select: USER_SAFE_SELECT,
    });
    if (!before) throw new NotFoundException('Không tìm thấy người dùng');

    // Hard delete — user model has no soft-delete flag in the schema. Cascade
    // relations (loginLogs, notifications) will follow via Prisma onDelete.
    // Note: AuditLog uses the actor's userId so it survives a target deletion.
    await this.prisma.client.user.delete({ where: { id: targetId } });

    await this.audit.log({
      userId: actor.id,
      action: 'ADMIN_DELETE_USER',
      targetType: 'User',
      targetId: target.id,
      ipAddress: meta.ip,
      oldValue: { email: before.email, role: before.role },
    });

    return { message: 'Đã xoá người dùng' };
  }

  // =====================================================
  // UPDATE ROLE  (LAW 1/2/3/4 — all apply)
  // =====================================================
  async updateRole(
    actor: { id: string; role: Role },
    targetId: string,
    dto: UpdateRoleDto,
    meta: RequestMeta,
  ) {
    const target = await this.rules.checkById(actor, targetId, 'UPDATE_ROLE');

    // Law 4 extra: if we're DEMOTING the last super admin, also forbid.
    if (target.role === Role.SUPER_ADMIN && dto.role !== Role.SUPER_ADMIN) {
      const count = await this.prisma.client.user.count({
        where: { role: Role.SUPER_ADMIN },
      });
      if (count <= 1) {
        throw new BadRequestException('Không thể hạ cấp Super Admin duy nhất');
      }
    }

    const updated = await this.prisma.client.user.update({
      where: { id: targetId },
      data: { role: dto.role },
      select: USER_SAFE_SELECT,
    });

    await this.audit.log({
      userId: actor.id,
      action: 'ADMIN_UPDATE_ROLE',
      targetType: 'User',
      targetId: target.id,
      ipAddress: meta.ip,
      oldValue: { role: target.role },
      newValue: { role: dto.role },
    });

    return updated;
  }

  // =====================================================
  // BLOCK / UNBLOCK USER  (LAW 2/3 apply — ADMIN can block STUDENT/INSTRUCTOR)
  // =====================================================
  async setBlocked(
    actor: { id: string; role: Role },
    targetId: string,
    dto: BlockUserDto,
    meta: RequestMeta,
  ) {
    const target = await this.rules.checkById(actor, targetId, 'BLOCK_USER');

    const updated = await this.prisma.client.user.update({
      where: { id: targetId },
      data: { isBlocked: dto.blocked },
      select: USER_SAFE_SELECT,
    });

    await this.audit.log({
      userId: actor.id,
      action: dto.blocked ? 'ADMIN_BLOCK_USER' : 'ADMIN_UNBLOCK_USER',
      targetType: 'User',
      targetId: target.id,
      ipAddress: meta.ip,
      oldValue: { isBlocked: !dto.blocked },
      newValue: { isBlocked: dto.blocked },
    });

    return updated;
  }

  // =====================================================
  // BULK BLOCK/UNBLOCK — loops over setBlocked() so each id goes through
  // the full 4 Immutable Laws + audit pipeline. Returns per-id result so
  // the UI can show partial failures (e.g. "3 ok, 1 skipped: cannot block
  // yourself").
  // =====================================================
  async bulkSetBlocked(actor: { id: string; role: Role }, dto: BulkBlockDto, meta: RequestMeta) {
    const ok: string[] = [];
    const failed: Array<{ id: string; reason: string }> = [];

    for (const id of dto.ids) {
      try {
        await this.setBlocked(actor, id, { blocked: dto.blocked }, meta);
        ok.push(id);
      } catch (err) {
        failed.push({
          id,
          reason: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return { ok, failed, total: dto.ids.length };
  }

  // =====================================================
  // EXPORT USERS — CSV or XLSX. Applies the same filter as listUsers.
  // Never includes password. Returns { buffer, contentType, filename }.
  // =====================================================
  async exportUsers(
    dto: ExportUsersDto,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const where = this.buildUserWhere(dto);
    const users = await this.prisma.client.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        emailVerified: true,
        is2FAEnabled: true,
        isBlocked: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const timestamp = new Date().toISOString().split('T')[0];

    if (dto.format === 'csv') {
      const header = [
        'ID',
        'Email',
        'Họ tên',
        'SĐT',
        'Vai trò',
        'Đã xác minh email',
        '2FA',
        'Bị khoá',
        'Đăng nhập gần nhất',
        'Ngày tạo',
      ];
      const rows = users.map((u) => [
        u.id,
        u.email,
        u.name,
        u.phone ?? '',
        u.role,
        u.emailVerified ? 'Có' : 'Không',
        u.is2FAEnabled ? 'Có' : 'Không',
        u.isBlocked ? 'Có' : 'Không',
        u.lastLoginAt ? u.lastLoginAt.toISOString() : '',
        u.createdAt.toISOString(),
      ]);
      const csv = [header, ...rows]
        .map((r) => r.map((cell) => csvEscape(String(cell))).join(','))
        .join('\r\n');
      // UTF-8 BOM so Excel opens Vietnamese correctly.
      const buffer = Buffer.concat([Buffer.from('\uFEFF', 'utf8'), Buffer.from(csv, 'utf8')]);
      return {
        buffer,
        contentType: 'text/csv; charset=utf-8',
        filename: `users-${timestamp}.csv`,
      };
    }

    // XLSX
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Users');
    sheet.columns = [
      { header: 'ID', key: 'id', width: 26 },
      { header: 'Email', key: 'email', width: 32 },
      { header: 'Họ tên', key: 'name', width: 24 },
      { header: 'SĐT', key: 'phone', width: 16 },
      { header: 'Vai trò', key: 'role', width: 14 },
      { header: 'Xác minh email', key: 'emailVerified', width: 14 },
      { header: '2FA', key: 'is2FAEnabled', width: 8 },
      { header: 'Bị khoá', key: 'isBlocked', width: 10 },
      { header: 'Đăng nhập gần nhất', key: 'lastLoginAt', width: 22 },
      { header: 'Ngày tạo', key: 'createdAt', width: 22 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const u of users) {
      sheet.addRow({
        id: u.id,
        email: u.email,
        name: u.name,
        phone: u.phone ?? '',
        role: u.role,
        emailVerified: u.emailVerified ? 'Có' : 'Không',
        is2FAEnabled: u.is2FAEnabled ? 'Có' : 'Không',
        isBlocked: u.isBlocked ? 'Có' : 'Không',
        lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : '',
        createdAt: u.createdAt.toISOString(),
      });
    }
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `users-${timestamp}.xlsx`,
    };
  }
}

/**
 * Escape a single CSV field: wrap in quotes if it contains a comma,
 * quote or CRLF; double any internal quotes.
 */
function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
