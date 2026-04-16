import { CourseStatus, Role } from '@lms/database';
import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AuditService } from '../../../common/audit/audit.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CoursesService } from '../../courses/courses.service';
import { LessonsService } from '../../lessons/lessons.service';

import { ContentService } from './content.service';

/**
 * Unit tests for ContentService — verifies moderation delegates to
 * CoursesService / LessonsService and writes CONTENT_* audit entries
 * on top of the default actions.
 */
describe('ContentService', () => {
  let service: ContentService;
  let coursesMock: {
    list: jest.Mock;
    updateStatus: jest.Mock;
    softDelete: jest.Mock;
  };
  let lessonsMock: { softDelete: jest.Mock };
  let auditMock: { log: jest.Mock };
  let prismaMock: {
    client: {
      course: { findUnique: jest.Mock };
      certificate: { count: jest.Mock };
      lesson: { count: jest.Mock; findUnique: jest.Mock; findMany: jest.Mock };
    };
  };

  const ADMIN = { id: 'u-admin', role: Role.ADMIN };
  const META = { ip: '127.0.0.1' };

  beforeEach(async () => {
    coursesMock = {
      list: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
      updateStatus: jest.fn(),
      softDelete: jest.fn().mockResolvedValue({ message: 'Đã xoá khoá học' }),
    };
    lessonsMock = {
      softDelete: jest.fn().mockResolvedValue({ message: 'Đã xoá bài giảng' }),
    };
    auditMock = { log: jest.fn().mockResolvedValue(undefined) };
    prismaMock = {
      client: {
        course: { findUnique: jest.fn() },
        certificate: { count: jest.fn() },
        lesson: { count: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CoursesService, useValue: coursesMock },
        { provide: LessonsService, useValue: lessonsMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();

    service = module.get<ContentService>(ContentService);
  });

  // =====================================================
  // listCourses
  // =====================================================
  describe('listCourses', () => {
    it('delegates to CoursesService.list with includeDeleted=false', async () => {
      await service.listCourses(ADMIN, { status: CourseStatus.PENDING_REVIEW, page: 1, limit: 20 });
      expect(coursesMock.list).toHaveBeenCalledWith(
        ADMIN,
        expect.objectContaining({
          status: CourseStatus.PENDING_REVIEW,
          includeDeleted: 'false',
        }),
      );
    });
  });

  // =====================================================
  // getCourseImpact
  // =====================================================
  describe('getCourseImpact', () => {
    it('returns course stats with separate active-certificate count', async () => {
      prismaMock.client.course.findUnique.mockResolvedValue({
        id: 'c1',
        title: 'Safety',
        status: CourseStatus.PUBLISHED,
        isDeleted: false,
        _count: { enrollments: 42, chapters: 5, certificates: 20 },
      });
      prismaMock.client.certificate.count.mockResolvedValue(18);
      prismaMock.client.lesson.count.mockResolvedValue(15);

      const impact = await service.getCourseImpact('c1');
      expect(impact.enrollmentCount).toBe(42);
      expect(impact.activeCertificates).toBe(18);
      expect(impact.totalCertificates).toBe(20);
      expect(impact.lessonCount).toBe(15);
    });

    it('throws NotFoundException when course is missing', async () => {
      prismaMock.client.course.findUnique.mockResolvedValue(null);
      await expect(service.getCourseImpact('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // =====================================================
  // approveCourse
  // =====================================================
  describe('approveCourse', () => {
    it('delegates APPROVE action and writes CONTENT_APPROVE audit', async () => {
      coursesMock.updateStatus.mockResolvedValue({ id: 'c1', status: CourseStatus.PUBLISHED });
      await service.approveCourse(ADMIN, 'c1', META);
      expect(coursesMock.updateStatus).toHaveBeenCalledWith(
        ADMIN,
        'c1',
        { action: 'APPROVE' },
        META,
      );
      expect(auditMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CONTENT_APPROVE',
          targetType: 'Course',
          targetId: 'c1',
        }),
      );
    });
  });

  // =====================================================
  // rejectCourse
  // =====================================================
  describe('rejectCourse', () => {
    it('requires reason and delegates REJECT action', async () => {
      coursesMock.updateStatus.mockResolvedValue({ id: 'c1', status: CourseStatus.DRAFT });
      await service.rejectCourse(ADMIN, 'c1', { reason: 'Thiếu nội dung an toàn' }, META);
      expect(coursesMock.updateStatus).toHaveBeenCalledWith(
        ADMIN,
        'c1',
        { action: 'REJECT', reason: 'Thiếu nội dung an toàn' },
        META,
      );
      expect(auditMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CONTENT_REJECT',
          newValue: expect.objectContaining({ reason: 'Thiếu nội dung an toàn' }),
        }),
      );
    });
  });

  // =====================================================
  // deleteCourse
  // =====================================================
  describe('deleteCourse', () => {
    it('delegates to CoursesService.softDelete and writes CONTENT_DELETE audit', async () => {
      await service.deleteCourse(ADMIN, 'c1', META);
      expect(coursesMock.softDelete).toHaveBeenCalledWith(ADMIN, 'c1', META);
      expect(auditMock.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CONTENT_DELETE', targetId: 'c1' }),
      );
    });
  });

  // =====================================================
  // listLessons — state filter
  // =====================================================
  describe('listLessons', () => {
    beforeEach(() => {
      prismaMock.client.lesson.count.mockResolvedValue(0);
      prismaMock.client.lesson.findMany.mockResolvedValue([]);
    });

    it('filters state=pending → isPublished=false, isDeleted=false', async () => {
      await service.listLessons({ state: 'pending', page: 1, limit: 20 });
      expect(prismaMock.client.lesson.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isPublished: false, isDeleted: false }),
        }),
      );
    });

    it('filters state=deleted → isDeleted=true', async () => {
      await service.listLessons({ state: 'deleted', page: 1, limit: 20 });
      expect(prismaMock.client.lesson.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isDeleted: true }),
        }),
      );
    });

    it('defaults to excluding deleted when state is omitted', async () => {
      await service.listLessons({ page: 1, limit: 20 });
      expect(prismaMock.client.lesson.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isDeleted: false }),
        }),
      );
    });

    it('combines courseId and q filters', async () => {
      await service.listLessons({ courseId: 'c1', q: 'intro', page: 1, limit: 20 });
      const call = prismaMock.client.lesson.findMany.mock.calls[0]![0];
      expect(call.where.chapter).toEqual({ courseId: 'c1' });
      expect(call.where.title).toEqual({ contains: 'intro', mode: 'insensitive' });
    });
  });

  // =====================================================
  // flagLesson
  // =====================================================
  describe('flagLesson', () => {
    it('writes CONTENT_FLAG_LESSON audit with reason', async () => {
      prismaMock.client.lesson.findUnique.mockResolvedValue({
        id: 'l1',
        title: 'Intro',
      });
      const res = await service.flagLesson(ADMIN, 'l1', 'Cần review lại', META);
      expect(res.message).toBe('Đã gắn cờ bài giảng');
      expect(auditMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CONTENT_FLAG_LESSON',
          targetId: 'l1',
          newValue: expect.objectContaining({ reason: 'Cần review lại' }),
        }),
      );
    });

    it('throws NotFoundException when lesson does not exist', async () => {
      prismaMock.client.lesson.findUnique.mockResolvedValue(null);
      await expect(service.flagLesson(ADMIN, 'missing', 'x', META)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =====================================================
  // deleteLesson
  // =====================================================
  describe('deleteLesson', () => {
    it('delegates to LessonsService.softDelete (which enforces ADMIN+)', async () => {
      await service.deleteLesson(ADMIN, 'l1', META);
      expect(lessonsMock.softDelete).toHaveBeenCalledWith(ADMIN, 'l1', META);
      expect(auditMock.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CONTENT_DELETE_LESSON', targetId: 'l1' }),
      );
    });
  });
});
