import { Role } from '@lms/database';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

import type { CreateDiscussionDto, CreateReplyDto } from './dto/create-discussion.dto';

interface Actor {
  id: string;
  role: Role;
}

export interface DiscussionAuthorRef {
  id: string;
  name: string;
  avatar: string | null;
  role: string;
}

export interface DiscussionReplyRow {
  id: string;
  discussionId: string;
  content: string;
  createdAt: Date;
  isDeleted: boolean;
  author: DiscussionAuthorRef;
}

export interface DiscussionThread {
  id: string;
  lessonId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  author: DiscussionAuthorRef;
  replies: DiscussionReplyRow[];
}

@Injectable()
export class DiscussionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // =====================================================
  // GET /lessons/:id/discussions
  // =====================================================
  async listForLesson(lessonId: string): Promise<DiscussionThread[]> {
    const lesson = await this.prisma.client.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, isDeleted: true },
    });
    if (!lesson || lesson.isDeleted) throw new NotFoundException('Không tìm thấy bài giảng');

    const threads = await this.prisma.client.discussion.findMany({
      where: { lessonId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, name: true, avatar: true, role: true } },
        replies: {
          where: { isDeleted: false },
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, name: true, avatar: true, role: true } },
          },
        },
      },
    });

    return threads.map((t) => ({
      id: t.id,
      lessonId: t.lessonId,
      content: t.content,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      isDeleted: t.isDeleted,
      author: t.author,
      replies: t.replies.map((r) => ({
        id: r.id,
        discussionId: r.discussionId,
        content: r.content,
        createdAt: r.createdAt,
        isDeleted: r.isDeleted,
        author: r.author,
      })),
    }));
  }

  // =====================================================
  // POST /lessons/:id/discussions — new thread
  // =====================================================
  async createThread(
    actor: Actor,
    lessonId: string,
    dto: CreateDiscussionDto,
  ): Promise<DiscussionThread> {
    const lesson = await this.prisma.client.lesson.findUnique({
      where: { id: lessonId },
      include: {
        chapter: {
          include: { course: { select: { id: true, title: true, instructorId: true } } },
        },
      },
    });
    if (!lesson || lesson.isDeleted) throw new NotFoundException('Không tìm thấy bài giảng');

    const row = await this.prisma.client.discussion.create({
      data: { lessonId, authorId: actor.id, content: dto.content },
      include: {
        author: { select: { id: true, name: true, avatar: true, role: true } },
        replies: true,
      },
    });

    // Mention notification — fire-and-forget; failure doesn't block the POST.
    const targets = new Set<string>(dto.mentionUserIds ?? []);
    // Always notify the course instructor if a non-instructor asked a question.
    if (
      actor.role !== Role.INSTRUCTOR &&
      actor.role !== Role.ADMIN &&
      actor.role !== Role.SUPER_ADMIN
    ) {
      targets.add(lesson.chapter.course.instructorId);
    }
    targets.delete(actor.id); // don't notify yourself
    for (const userId of targets) {
      this.notifications
        .create({
          userId,
          type: 'DISCUSSION_MENTION',
          title: 'Có câu hỏi mới trong bài giảng',
          message: `${row.author.name} vừa đặt câu hỏi trong "${lesson.title}"`,
          data: { discussionId: row.id, lessonId: lesson.id },
        })
        .catch(() => undefined);
    }

    return {
      id: row.id,
      lessonId: row.lessonId,
      content: row.content,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      isDeleted: row.isDeleted,
      author: row.author,
      replies: [],
    };
  }

  // =====================================================
  // POST /discussions/:id/replies
  // =====================================================
  async createReply(
    actor: Actor,
    discussionId: string,
    dto: CreateReplyDto,
  ): Promise<DiscussionReplyRow> {
    const thread = await this.prisma.client.discussion.findUnique({
      where: { id: discussionId },
      include: {
        author: { select: { id: true } },
        replies: { select: { authorId: true } },
        lesson: { select: { title: true } },
      },
    });
    if (!thread || thread.isDeleted) {
      throw new NotFoundException('Không tìm thấy thread thảo luận');
    }

    const row = await this.prisma.client.discussionReply.create({
      data: { discussionId, authorId: actor.id, content: dto.content },
      include: { author: { select: { id: true, name: true, avatar: true, role: true } } },
    });

    // Notify thread author + other repliers (dedup by userId, skip self)
    const targets = new Set<string>([thread.author.id, ...thread.replies.map((r) => r.authorId)]);
    targets.delete(actor.id);
    for (const userId of targets) {
      this.notifications
        .create({
          userId,
          type: 'DISCUSSION_REPLY',
          title: 'Có câu trả lời mới',
          message: `${row.author.name} đã trả lời trong "${thread.lesson.title}"`,
          data: { discussionId, replyId: row.id },
        })
        .catch(() => undefined);
    }

    return {
      id: row.id,
      discussionId: row.discussionId,
      content: row.content,
      createdAt: row.createdAt,
      isDeleted: row.isDeleted,
      author: row.author,
    };
  }

  // =====================================================
  // DELETE /discussions/:id — owner or ADMIN+
  // =====================================================
  async softDeleteThread(actor: Actor, id: string): Promise<{ message: string }> {
    const row = await this.prisma.client.discussion.findUnique({
      where: { id },
      select: { id: true, authorId: true, isDeleted: true },
    });
    if (!row || row.isDeleted) throw new NotFoundException('Không tìm thấy thread');
    this.assertCanDelete(actor, row.authorId);
    await this.prisma.client.discussion.update({
      where: { id },
      data: { isDeleted: true },
    });
    return { message: 'Đã xoá thread' };
  }

  // =====================================================
  // DELETE /discussion-replies/:id — owner or ADMIN+
  // =====================================================
  async softDeleteReply(actor: Actor, id: string): Promise<{ message: string }> {
    const row = await this.prisma.client.discussionReply.findUnique({
      where: { id },
      select: { id: true, authorId: true, isDeleted: true },
    });
    if (!row || row.isDeleted) throw new NotFoundException('Không tìm thấy reply');
    this.assertCanDelete(actor, row.authorId);
    await this.prisma.client.discussionReply.update({
      where: { id },
      data: { isDeleted: true },
    });
    return { message: 'Đã xoá reply' };
  }

  private assertCanDelete(actor: Actor, ownerId: string): void {
    if (actor.id === ownerId) return;
    if (actor.role === Role.ADMIN || actor.role === Role.SUPER_ADMIN) return;
    throw new ForbiddenException('Chỉ tác giả hoặc ADMIN+ mới được xoá');
  }
}
