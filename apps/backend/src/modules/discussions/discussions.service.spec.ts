import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

import { DiscussionsService } from './discussions.service';

/**
 * Unit tests for the Phase 14 discussions service.
 *
 * Covers:
 *   - createThread: notifies course instructor when a STUDENT asks
 *   - softDeleteThread: owner can delete
 *   - softDeleteThread: ADMIN can delete
 *   - softDeleteThread: non-owner non-ADMIN → 403
 */
describe('DiscussionsService', () => {
  let service: DiscussionsService;
  let prisma: {
    client: {
      lesson: { findUnique: jest.Mock };
      discussion: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
      discussionReply: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    };
  };
  let notifications: { create: jest.Mock };

  beforeEach(async () => {
    prisma = {
      client: {
        lesson: { findUnique: jest.fn() },
        discussion: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
        discussionReply: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      },
    };
    notifications = { create: jest.fn().mockResolvedValue(undefined) };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        DiscussionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    service = mod.get(DiscussionsService);
  });

  it('createThread: notifies the course instructor when a STUDENT asks', async () => {
    prisma.client.lesson.findUnique.mockResolvedValue({
      id: 'L1',
      title: 'Bài 1',
      isDeleted: false,
      chapter: {
        course: { id: 'C1', title: 'Course', instructorId: 'instructor-1' },
      },
    });
    prisma.client.discussion.create.mockResolvedValue({
      id: 'D1',
      lessonId: 'L1',
      content: 'Question?',
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false,
      author: { id: 'student-1', name: 'Student', avatar: null, role: 'STUDENT' },
      replies: [],
    });

    await service.createThread({ id: 'student-1', role: 'STUDENT' as never }, 'L1', {
      content: 'Question?',
    });

    // Flush microtasks so the fire-and-forget notifications.create runs.
    await new Promise((r) => setImmediate(r));
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'instructor-1', type: 'DISCUSSION_MENTION' }),
    );
  });

  it('softDeleteThread: owner can delete', async () => {
    prisma.client.discussion.findUnique.mockResolvedValue({
      id: 'D1',
      authorId: 'u1',
      isDeleted: false,
    });
    prisma.client.discussion.update.mockResolvedValue({});

    await expect(
      service.softDeleteThread({ id: 'u1', role: 'STUDENT' as never }, 'D1'),
    ).resolves.toEqual(expect.objectContaining({ message: expect.any(String) }));
  });

  it('softDeleteThread: ADMIN (non-owner) can delete', async () => {
    prisma.client.discussion.findUnique.mockResolvedValue({
      id: 'D1',
      authorId: 'other',
      isDeleted: false,
    });
    prisma.client.discussion.update.mockResolvedValue({});

    await expect(
      service.softDeleteThread({ id: 'admin', role: 'ADMIN' as never }, 'D1'),
    ).resolves.toEqual(expect.objectContaining({ message: expect.any(String) }));
  });

  it('softDeleteThread: non-owner non-ADMIN → ForbiddenException', async () => {
    prisma.client.discussion.findUnique.mockResolvedValue({
      id: 'D1',
      authorId: 'other',
      isDeleted: false,
    });

    await expect(
      service.softDeleteThread({ id: 'attacker', role: 'STUDENT' as never }, 'D1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('softDeleteThread: already-deleted → NotFoundException', async () => {
    prisma.client.discussion.findUnique.mockResolvedValue({
      id: 'D1',
      authorId: 'u1',
      isDeleted: true,
    });
    await expect(
      service.softDeleteThread({ id: 'u1', role: 'STUDENT' as never }, 'D1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
