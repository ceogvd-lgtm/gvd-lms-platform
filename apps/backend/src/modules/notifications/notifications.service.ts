import { Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import type { ListNotificationsDto } from './dto/list-notifications.dto';
import { NotificationsGateway } from './notifications.gateway';

/**
 * Notification types emitted by various features. Stored as `Notification.type`
 * string in Prisma so we keep the set here as a const tuple for autocomplete.
 */
export const NOTIFICATION_TYPES = [
  'COURSE_ENROLLED',
  'LESSON_COMPLETED',
  'CERTIFICATE_ISSUED',
  'QUIZ_GRADED',
  'INSTRUCTOR_FEEDBACK',
  'SYSTEM_ALERT',
  // Phase 14 — Q&A threads
  'DISCUSSION_MENTION',
  'DISCUSSION_REPLY',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    // Gateway holds a ref to this service too — forwardRef breaks the cycle.
    @Inject(forwardRef(() => NotificationsGateway))
    private readonly gateway: NotificationsGateway,
  ) {}

  /**
   * Create an in-app notification row AND push it live to any active Socket.io
   * sessions owned by the target user. Called from other features when
   * something noteworthy happens.
   */
  async create(input: CreateNotificationInput): Promise<unknown> {
    const notification = await this.prisma.client.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        data: (input.data ?? null) as never,
      },
    });
    // Non-blocking push — fire and forget. If no socket is connected, the
    // client will fetch via REST when it next polls or mounts.
    this.gateway.emitToUser(input.userId, 'notification', notification);
    return notification;
  }

  async list(userId: string, dto: ListNotificationsDto): Promise<Paginated<unknown>> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const where: Record<string, unknown> = { userId };
    if (dto.unreadOnly) where.isRead = false;
    if (dto.type) where.type = dto.type;

    const [total, data] = await Promise.all([
      this.prisma.client.notification.count({ where }),
      this.prisma.client.notification.findMany({
        where,
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

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.client.notification.count({
      where: { userId, isRead: false },
    });
  }

  async markRead(userId: string, id: string): Promise<void> {
    const notif = await this.prisma.client.notification.findUnique({
      where: { id },
    });
    if (!notif || notif.userId !== userId) {
      throw new NotFoundException('Không tìm thấy notification');
    }
    if (!notif.isRead) {
      await this.prisma.client.notification.update({
        where: { id },
        data: { isRead: true },
      });
    }
  }

  async markAllRead(userId: string): Promise<{ count: number }> {
    const result = await this.prisma.client.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { count: result.count };
  }
}
