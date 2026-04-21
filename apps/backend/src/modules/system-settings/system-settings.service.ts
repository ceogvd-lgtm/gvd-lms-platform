import { Role } from '@lms/database';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';

import { TestSmtpDto } from './dto/test-smtp.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';

interface Actor {
  id: string;
  role: Role;
}

interface Meta {
  ip: string;
}

/**
 * Whitelist of setting keys allowed via the API. Any key not in this list
 * is rejected, so a rogue ADMIN+ can't inject arbitrary keys that might
 * be read by other code (security hardening).
 *
 * Keys are grouped by section and map 1:1 to the /admin/settings tabs.
 */
const ALLOWED_KEYS = [
  // Organisation branding
  'org.name',
  'org.logoUrl',
  'org.primaryColor',
  'org.secondaryColor',
  // Email / SMTP
  'smtp.host',
  'smtp.port',
  'smtp.user',
  'smtp.pass',
  'smtp.from',
  // Security policy
  'security.passwordMinLength',
  'security.require2FAAdmin',
  'security.sessionTimeoutMin',
  // Storage limits
  'storage.maxPerUserMB',
  'storage.maxPerCourseMB',
  // Phase 15 post-verify — scheduled analytics report subscribers.
  // Stored as a JSON array of admin emails; read by the BullMQ
  // repeat job that fires the weekly digest + daily at-risk sweep.
  'analytics.reportSubscribers',
] as const;

type AllowedKey = (typeof ALLOWED_KEYS)[number];

/** Keys whose value is considered secret — masked for non-SUPER_ADMIN. */
const SECRET_KEYS = new Set<AllowedKey>(['smtp.pass']);

export interface SettingDto {
  key: string;
  value: unknown;
  description: string | null;
  updatedBy: string | null;
  updatedAt: Date;
}

/**
 * System Settings service (Phase 09).
 *
 * Read/write runtime configuration. Whitelisted keys only. Masks secrets
 * for non-SUPER_ADMIN readers. Every mutation writes an audit entry per
 * key so /admin/audit-log can show a clean "who changed what" history.
 */
@Injectable()
export class SystemSettingsService {
  private readonly logger = new Logger(SystemSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // =====================================================
  // READ ALL — mask secrets for non-SUPER_ADMIN
  // =====================================================
  async getAll(actor: Actor): Promise<SettingDto[]> {
    const rows = await this.prisma.client.systemSetting.findMany({
      orderBy: { key: 'asc' },
    });

    const isSuper = actor.role === Role.SUPER_ADMIN;
    return rows
      .filter((r) => ALLOWED_KEYS.includes(r.key as AllowedKey))
      .map<SettingDto>((r) => ({
        key: r.key,
        value: !isSuper && SECRET_KEYS.has(r.key as AllowedKey) ? '***' : (r.value as unknown),
        description: r.description,
        updatedBy: r.updatedBy,
        updatedAt: r.updatedAt,
      }));
  }

  // =====================================================
  // READ RAW (internal) — returns a plain object keyed by setting name
  // =====================================================
  private async getRawMap(): Promise<Record<string, unknown>> {
    const rows = await this.prisma.client.systemSetting.findMany();
    const map: Record<string, unknown> = {};
    for (const r of rows) map[r.key] = r.value;
    return map;
  }

  // =====================================================
  // UPDATE — upsert each key, validate whitelist, audit per key
  // =====================================================
  async update(actor: Actor, dto: UpdateSettingsDto, meta: Meta): Promise<SettingDto[]> {
    // Validate all keys BEFORE writing anything. Fail-fast with a helpful
    // error that lists every rejected key.
    const invalidKeys = dto.updates
      .map((u) => u.key)
      .filter((k) => !ALLOWED_KEYS.includes(k as AllowedKey));
    if (invalidKeys.length > 0) {
      throw new BadRequestException(`Các key không hợp lệ: ${invalidKeys.join(', ')}`);
    }

    // Type coercion + bounds check per key family.
    for (const { key, value } of dto.updates) {
      this.assertValidValue(key, value);
    }

    // Load existing values for the audit diff.
    const existing = await this.prisma.client.systemSetting.findMany({
      where: { key: { in: dto.updates.map((u) => u.key) } },
    });
    const existingByKey = new Map(existing.map((e) => [e.key, e.value]));

    // Upsert each setting. Ideally this would be a transaction, but
    // SystemSetting rows are independent and the audit entries don't
    // need atomicity — worst case a partial failure leaves some keys
    // updated and the user sees the partial result on refresh.
    for (const { key, value } of dto.updates) {
      await this.prisma.client.systemSetting.upsert({
        where: { key },
        update: { value: value as never, updatedBy: actor.id },
        create: { value: value as never, key, updatedBy: actor.id },
      });

      await this.audit.log({
        userId: actor.id,
        action: 'SYSTEM_SETTING_UPDATE',
        targetType: 'SystemSetting',
        targetId: key,
        ipAddress: meta.ip,
        oldValue: { value: existingByKey.get(key) ?? null },
        newValue: { value: SECRET_KEYS.has(key as AllowedKey) ? '***' : value },
      });
    }

    return this.getAll(actor);
  }

  /**
   * Per-key value validation. Keeps the whitelist tight and prevents
   * garbage from reaching the DB — e.g. negative password min length
   * or non-numeric storage limits.
   */
  private assertValidValue(key: string, value: unknown): void {
    switch (key) {
      case 'org.name':
      case 'org.logoUrl':
      case 'org.primaryColor':
      case 'org.secondaryColor':
      case 'smtp.host':
      case 'smtp.user':
      case 'smtp.pass':
      case 'smtp.from':
        if (typeof value !== 'string') {
          throw new BadRequestException(`${key} phải là chuỗi`);
        }
        return;
      case 'smtp.port':
        if (typeof value !== 'number' || value < 1 || value > 65535) {
          throw new BadRequestException('smtp.port phải là số trong [1, 65535]');
        }
        return;
      case 'security.passwordMinLength':
        if (typeof value !== 'number' || value < 6 || value > 64) {
          throw new BadRequestException('Độ dài mật khẩu phải trong [6, 64]');
        }
        return;
      case 'security.require2FAAdmin':
        if (typeof value !== 'boolean') {
          throw new BadRequestException('security.require2FAAdmin phải là boolean');
        }
        return;
      case 'security.sessionTimeoutMin':
        if (typeof value !== 'number' || value < 1 || value > 1440) {
          throw new BadRequestException('Session timeout phải trong [1, 1440] phút');
        }
        return;
      case 'storage.maxPerUserMB':
      case 'storage.maxPerCourseMB':
        if (typeof value !== 'number' || value < 1) {
          throw new BadRequestException(`${key} phải là số dương`);
        }
        return;
      case 'analytics.reportSubscribers': {
        if (!Array.isArray(value)) {
          throw new BadRequestException(`${key} phải là mảng email`);
        }
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        for (const v of value) {
          if (typeof v !== 'string' || !emailRe.test(v)) {
            throw new BadRequestException(`${key}: email không hợp lệ — "${String(v)}"`);
          }
        }
        return;
      }
    }
  }

  // =====================================================
  // SMTP TEST — create a transient transporter and call verify()
  // =====================================================
  async testSmtp(override: TestSmtpDto): Promise<{ ok: boolean; error?: string }> {
    const current = await this.getRawMap();
    const host = override.host ?? (current['smtp.host'] as string | undefined);
    const port = override.port ?? (current['smtp.port'] as number | undefined) ?? 587;
    const user = override.user ?? (current['smtp.user'] as string | undefined);
    const pass = override.pass ?? (current['smtp.pass'] as string | undefined);

    if (!host) {
      return { ok: false, error: 'Chưa cấu hình SMTP host' };
    }

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user && pass ? { user, pass } : undefined,
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 5000,
      });
      await transporter.verify();
      return { ok: true };
    } catch (err) {
      this.logger.warn(`[SMTP TEST] failed: ${(err as Error).message}`);
      return { ok: false, error: (err as Error).message };
    }
  }

  // NOTE: Backup methods moved to BackupService (Phase 18B).
  //   /admin/settings/backup/trigger → /admin/backups/trigger
  //   /admin/settings/backup/history → /admin/backups
  // Real implementation uses pg_dump + MinIO + retention + cron.
}

export const SYSTEM_SETTINGS_ALLOWED_KEYS = ALLOWED_KEYS;
