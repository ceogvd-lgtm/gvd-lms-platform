import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogInput {
  userId: string;
  action: string;
  targetType: 'User' | 'Lesson' | 'Course' | string;
  targetId: string;
  ipAddress: string;
  oldValue?: unknown;
  newValue?: unknown;
}

/**
 * Write audit log entries for admin/super-admin/instructor-delete actions.
 *
 * Per CLAUDE.md: "Mọi hành động admin/superadmin → ghi AuditLog: userId, action,
 * target, oldValue, newValue, IP".
 *
 * Writes never throw — audit failures are logged but never block the business
 * action that triggered them. If the DB is down the caller shouldn't fail too.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditLogInput): Promise<void> {
    try {
      await this.prisma.client.auditLog.create({
        data: {
          userId: input.userId,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          ipAddress: input.ipAddress,
          oldValue: (input.oldValue ?? null) as never,
          newValue: (input.newValue ?? null) as never,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to write AuditLog (${input.action} on ${input.targetType}:${input.targetId}): ${(err as Error).message}`,
      );
    }
  }
}
