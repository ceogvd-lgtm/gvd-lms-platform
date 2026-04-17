import { CourseStatus } from '@lms/database';
import { Role } from '@lms/types';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import type { CreateEnrollmentDto } from './dto/create-enrollment.dto';

interface Actor {
  id: string;
  role: Role;
}

@Injectable()
export class EnrollmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async enroll(actor: Actor, dto: CreateEnrollmentDto) {
    const course = await this.prisma.client.course.findUnique({
      where: { id: dto.courseId },
    });
    if (!course || course.isDeleted) {
      throw new NotFoundException('Không tìm thấy khoá học');
    }

    // STUDENTS: can only enroll self, and only into PUBLISHED courses.
    // ADMIN+: can enroll anyone into any non-deleted course.
    const targetStudentId = dto.studentId ?? actor.id;

    const isSelfEnroll = targetStudentId === actor.id;
    const isAdmin = actor.role === Role.ADMIN || actor.role === Role.SUPER_ADMIN;

    if (!isAdmin && !isSelfEnroll) {
      throw new ForbiddenException('Chỉ ADMIN+ mới có thể enroll cho người khác');
    }
    if (!isAdmin && course.status !== CourseStatus.PUBLISHED) {
      throw new BadRequestException('Chỉ khoá học đã xuất bản mới cho phép tự enroll');
    }

    // Verify target user exists (matters when ADMIN enrolls someone).
    if (targetStudentId !== actor.id) {
      const student = await this.prisma.client.user.findUnique({
        where: { id: targetStudentId },
        select: { id: true },
      });
      if (!student) throw new NotFoundException('Không tìm thấy học viên');
    }

    try {
      return await this.prisma.client.courseEnrollment.create({
        data: { courseId: dto.courseId, studentId: targetStudentId },
        include: {
          course: { select: { id: true, title: true } },
          student: { select: { id: true, name: true, email: true } },
        },
      });
    } catch (err) {
      // Unique constraint (courseId, studentId) — already enrolled
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException('Bạn đã ghi danh khoá học này rồi');
      }
      throw err;
    }
  }

  async remove(actor: Actor, id: string) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Chỉ ADMIN+ mới được xoá enrollment');
    }
    const enrollment = await this.prisma.client.courseEnrollment.findUnique({
      where: { id },
    });
    if (!enrollment) throw new NotFoundException('Không tìm thấy enrollment');

    await this.prisma.client.courseEnrollment.delete({ where: { id } });
    return { message: 'Đã huỷ ghi danh' };
  }

  // =====================================================
  // LIST MY ENROLLMENTS — consumed by GET /enrollments/me
  //
  // Builds the student-dashboard payload in 4 queries regardless of how
  // many courses the student is enrolled in (enrollments → chapters →
  // lessons → progress), then aggregates per-course in JS so we can emit
  // { course, progress%, nextLessonId } for each enrollment without N+1.
  // =====================================================
  async listMine(studentId: string): Promise<MyEnrollment[]> {
    const enrollments = await this.prisma.client.courseEnrollment.findMany({
      where: { studentId },
      orderBy: { enrolledAt: 'desc' },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            description: true,
            thumbnailUrl: true,
            status: true,
            isDeleted: true,
          },
        },
      },
    });

    // Drop enrollments whose course was soft-deleted — they're dangling.
    const live = enrollments.filter((e) => !e.course.isDeleted);
    if (live.length === 0) return [];

    const courseIds = live.map((e) => e.courseId);

    const chapters = await this.prisma.client.chapter.findMany({
      where: { courseId: { in: courseIds } },
      orderBy: [{ courseId: 'asc' }, { order: 'asc' }],
      select: { id: true, courseId: true, order: true },
    });
    const chapterIds = chapters.map((c) => c.id);
    const chapterIdToCourseId = new Map(chapters.map((c) => [c.id, c.courseId]));

    const lessons = await this.prisma.client.lesson.findMany({
      where: { chapterId: { in: chapterIds }, isDeleted: false },
      orderBy: [{ chapterId: 'asc' }, { order: 'asc' }],
      select: { id: true, chapterId: true, title: true, order: true },
    });

    const lessonIds = lessons.map((l) => l.id);
    const completedRows =
      lessonIds.length === 0
        ? []
        : await this.prisma.client.lessonProgress.findMany({
            where: {
              studentId,
              lessonId: { in: lessonIds },
              status: 'COMPLETED',
            },
            select: { lessonId: true },
          });
    const completedLessonIds = new Set(completedRows.map((p) => p.lessonId));

    // Group lessons by courseId for fast aggregation.
    const lessonsPerCourse = new Map<string, { id: string; title: string }[]>();
    for (const lesson of lessons) {
      const courseId = chapterIdToCourseId.get(lesson.chapterId);
      if (!courseId) continue;
      const bucket = lessonsPerCourse.get(courseId) ?? [];
      bucket.push({ id: lesson.id, title: lesson.title });
      lessonsPerCourse.set(courseId, bucket);
    }

    return live.map((e) => {
      const lessonsInCourse = lessonsPerCourse.get(e.courseId) ?? [];
      const total = lessonsInCourse.length;
      const completed = lessonsInCourse.filter((l) => completedLessonIds.has(l.id)).length;
      const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
      // First non-completed lesson in reading order — feed the
      // "Tiếp tục học" button. Falls back to the very first lesson so
      // the button still works on a brand-new enrollment.
      const nextLesson =
        lessonsInCourse.find((l) => !completedLessonIds.has(l.id)) ?? lessonsInCourse[0] ?? null;

      return {
        enrollmentId: e.id,
        enrolledAt: e.enrolledAt,
        completedAt: e.completedAt,
        course: {
          id: e.course.id,
          title: e.course.title,
          description: e.course.description,
          thumbnailUrl: e.course.thumbnailUrl,
          status: e.course.status,
        },
        totalLessons: total,
        completedLessons: completed,
        progress,
        nextLessonId: nextLesson?.id ?? null,
        nextLessonTitle: nextLesson?.title ?? null,
      };
    });
  }
}

// =====================================================
// Response shape for listMine — exported so the frontend can type the
// fetch without importing Prisma runtime types.
// =====================================================
export interface MyEnrollment {
  enrollmentId: string;
  enrolledAt: Date;
  completedAt: Date | null;
  course: {
    id: string;
    title: string;
    description: string | null;
    thumbnailUrl: string | null;
    status: string;
  };
  totalLessons: number;
  completedLessons: number;
  progress: number;
  nextLessonId: string | null;
  nextLessonTitle: string | null;
}
