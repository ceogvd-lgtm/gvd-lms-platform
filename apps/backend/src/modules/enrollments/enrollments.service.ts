import { CourseStatus } from '@lms/database';
import { Role } from '@lms/types';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';

import type { CreateEnrollmentDto } from './dto/create-enrollment.dto';

interface Actor {
  id: string;
  role: Role;
}

/**
 * Phase 18 — kết quả của auto-enroll chạy cho 1 course.
 * `enrolled`: số student mới được ghi danh
 * `skipped`: số student đã enroll từ trước (unique constraint skipDuplicates)
 * `total`: tổng số student trong department
 */
export interface AutoEnrollResult {
  courseId: string;
  courseTitle: string;
  departmentId: string | null;
  departmentName: string | null;
  enrolled: number;
  skipped: number;
  total: number;
}

@Injectable()
export class EnrollmentsService {
  private readonly logger = new Logger(EnrollmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    // Phase 18 — ghi audit log cho mỗi auto-enroll action.
    // AuditService inject optional vì tests có thể bỏ qua nếu không cần.
    private readonly audit: AuditService,
  ) {}

  // =====================================================
  // Phase 18 — AUTO-ENROLL theo Department
  //
  // Khi admin APPROVE course → course.status chuyển PUBLISHED. Hook ở
  // CoursesService.updateStatus gọi method này để ghi danh tất cả
  // student có departmentId trùng với department của course (qua
  // subject.departmentId).
  //
  // Cũng được gọi bởi CronProcessor auto-enroll-daily (6:00 AM) để
  // xử lý student mới vào phòng ban sau khi course đã PUBLISHED từ
  // trước (khi đó hook APPROVE đã chạy nhưng student chưa tồn tại).
  //
  // Idempotent: dùng `createMany + skipDuplicates: true` để bỏ qua
  // cặp (courseId, studentId) đã tồn tại. Không throw nếu course
  // không có department hoặc department không có student.
  // =====================================================
  async autoEnrollByDepartment(courseId: string): Promise<AutoEnrollResult> {
    const course = await this.prisma.client.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        subject: {
          select: {
            department: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!course) {
      throw new NotFoundException('Không tìm thấy khoá học');
    }

    const department = course.subject?.department;
    if (!department) {
      this.logger.warn(`autoEnrollByDepartment: course ${courseId} không có department → skip`);
      return {
        courseId,
        courseTitle: course.title,
        departmentId: null,
        departmentName: null,
        enrolled: 0,
        skipped: 0,
        total: 0,
      };
    }

    // Tìm TẤT CẢ student của department này (chưa bị block).
    const students = await this.prisma.client.user.findMany({
      where: {
        role: Role.STUDENT,
        departmentId: department.id,
        isBlocked: false,
      },
      select: { id: true },
    });

    if (students.length === 0) {
      this.logger.log(
        `autoEnrollByDepartment: department ${department.name} không có student nào → skip`,
      );
      return {
        courseId,
        courseTitle: course.title,
        departmentId: department.id,
        departmentName: department.name,
        enrolled: 0,
        skipped: 0,
        total: 0,
      };
    }

    // createMany + skipDuplicates: an toàn với unique(courseId, studentId).
    // Không throw P2002 khi conflict; trả về count = số row ACTUAL created.
    const result = await this.prisma.client.courseEnrollment.createMany({
      data: students.map((s) => ({ courseId, studentId: s.id })),
      skipDuplicates: true,
    });

    const enrolled = result.count;
    const skipped = students.length - enrolled;

    this.logger.log(
      `autoEnrollByDepartment done — course="${course.title}" department="${department.name}" total=${students.length} enrolled=${enrolled} skipped=${skipped}`,
    );

    return {
      courseId,
      courseTitle: course.title,
      departmentId: department.id,
      departmentName: department.name,
      enrolled,
      skipped,
      total: students.length,
    };
  }

  /**
   * Phase 18 — Auto-enroll cho TẤT CẢ course PUBLISHED. Dùng ở:
   *   1. Cron `auto-enroll-daily` (6:00 AM) — pick up student mới
   *   2. Admin manual trigger (recover sau downtime)
   *
   * Idempotent bằng cách lặp gọi autoEnrollByDepartment (skipDuplicates).
   */
  async autoEnrollAllPublished(): Promise<{
    courses: number;
    totalEnrolled: number;
    totalSkipped: number;
    details: AutoEnrollResult[];
  }> {
    const courses = await this.prisma.client.course.findMany({
      where: { status: CourseStatus.PUBLISHED, isDeleted: false },
      select: { id: true },
    });

    const details: AutoEnrollResult[] = [];
    let totalEnrolled = 0;
    let totalSkipped = 0;

    for (const c of courses) {
      try {
        const res = await this.autoEnrollByDepartment(c.id);
        details.push(res);
        totalEnrolled += res.enrolled;
        totalSkipped += res.skipped;
      } catch (err) {
        // Lỗi 1 course → log + tiếp tục với course khác (không throw).
        this.logger.warn(`autoEnrollAllPublished: course ${c.id} fail — ${(err as Error).message}`);
      }
    }

    return {
      courses: courses.length,
      totalEnrolled,
      totalSkipped,
      details,
    };
  }

  /**
   * Phase 18 — Thống kê enrollment theo department. Dùng cho admin
   * /admin/reports để xem phân phối học viên.
   */
  async statsByDepartment(): Promise<
    Array<{
      departmentId: string;
      departmentName: string;
      studentCount: number;
      courseCount: number;
      enrollmentCount: number;
    }>
  > {
    const departments = await this.prisma.client.department.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            users: { where: { role: Role.STUDENT, isBlocked: false } },
            subjects: { where: { isDeleted: false } },
          },
        },
        subjects: {
          where: { isDeleted: false },
          select: {
            courses: {
              where: { isDeleted: false, status: CourseStatus.PUBLISHED },
              select: { _count: { select: { enrollments: true } } },
            },
          },
        },
      },
    });

    return departments.map((d) => {
      const courseCount = d.subjects.reduce((sum, s) => sum + s.courses.length, 0);
      const enrollmentCount = d.subjects.reduce(
        (sum, s) => sum + s.courses.reduce((cSum, c) => cSum + c._count.enrollments, 0),
        0,
      );
      return {
        departmentId: d.id,
        departmentName: d.name,
        studentCount: d._count.users,
        courseCount,
        enrollmentCount,
      };
    });
  }

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
