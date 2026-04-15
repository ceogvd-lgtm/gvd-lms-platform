import { Role } from '@lms/types';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AdminRulesService } from '../../common/rbac/admin-rules.service';

import { BlockUserDto } from './dto/block-user.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
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
    const where: Record<string, unknown> = {};

    if (dto.q) {
      where.OR = [
        { email: { contains: dto.q, mode: 'insensitive' } },
        { name: { contains: dto.q, mode: 'insensitive' } },
      ];
    }
    if (dto.role) {
      where.role = dto.role;
    }

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
}
