import { CourseStatus } from '@lms/database';
import { Role } from '@lms/types';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';

import type { CreateCourseDto } from './dto/create-course.dto';
import type { ListCoursesDto } from './dto/list-courses.dto';
import type { UpdateCourseDto } from './dto/update-course.dto';
import type { StatusAction, UpdateStatusDto } from './dto/update-status.dto';

interface Actor {
  id: string;
  role: Role;
}

interface Meta {
  ip: string;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // =====================================================
  // Helpers
  // =====================================================
  private isAdminOrAbove(role: Role): boolean {
    return role === Role.ADMIN || role === Role.SUPER_ADMIN;
  }

  private isOwnerOrAdmin(actor: Actor, instructorId: string): boolean {
    if (this.isAdminOrAbove(actor.role)) return true;
    return actor.role === Role.INSTRUCTOR && actor.id === instructorId;
  }

  /**
   * Course status FSM — only these transitions are legal.
   *
   *   DRAFT          ─SUBMIT(instructor)──▶ PENDING_REVIEW
   *   PENDING_REVIEW ─APPROVE(admin)─────▶ PUBLISHED
   *   PENDING_REVIEW ─REJECT(admin)──────▶ DRAFT
   *   DRAFT|PUBLISHED─ARCHIVE(owner/adm)─▶ ARCHIVED
   *   ARCHIVED       ─UNARCHIVE(admin)───▶ DRAFT
   */
  private assertStatusTransition(
    actor: Actor,
    current: CourseStatus,
    action: StatusAction,
    instructorId: string,
  ): CourseStatus {
    switch (action) {
      case 'SUBMIT':
        if (!this.isOwnerOrAdmin(actor, instructorId)) {
          throw new ForbiddenException('Chỉ giảng viên sở hữu mới submit được');
        }
        if (current !== CourseStatus.DRAFT) {
          throw new BadRequestException('Chỉ khoá học ở trạng thái DRAFT mới có thể submit');
        }
        return CourseStatus.PENDING_REVIEW;

      case 'APPROVE':
        if (!this.isAdminOrAbove(actor.role)) {
          throw new ForbiddenException('Chỉ ADMIN+ mới duyệt được');
        }
        if (current !== CourseStatus.PENDING_REVIEW) {
          throw new BadRequestException('Chỉ khoá đang PENDING_REVIEW mới có thể approve');
        }
        return CourseStatus.PUBLISHED;

      case 'REJECT':
        if (!this.isAdminOrAbove(actor.role)) {
          throw new ForbiddenException('Chỉ ADMIN+ mới reject được');
        }
        if (current !== CourseStatus.PENDING_REVIEW) {
          throw new BadRequestException('Chỉ khoá đang PENDING_REVIEW mới có thể reject');
        }
        return CourseStatus.DRAFT;

      case 'ARCHIVE':
        if (!this.isOwnerOrAdmin(actor, instructorId)) {
          throw new ForbiddenException('Chỉ giảng viên sở hữu hoặc ADMIN+ mới lưu trữ được');
        }
        if (current !== CourseStatus.DRAFT && current !== CourseStatus.PUBLISHED) {
          throw new BadRequestException('Chỉ khoá DRAFT hoặc PUBLISHED mới có thể archive');
        }
        return CourseStatus.ARCHIVED;

      case 'UNARCHIVE':
        if (!this.isAdminOrAbove(actor.role)) {
          throw new ForbiddenException('Chỉ ADMIN+ mới unarchive được');
        }
        if (current !== CourseStatus.ARCHIVED) {
          throw new BadRequestException('Chỉ khoá ARCHIVED mới có thể unarchive');
        }
        return CourseStatus.DRAFT;
    }
  }

  // =====================================================
  // LIST
  // =====================================================
  async list(actor: Actor, dto: ListCoursesDto): Promise<Paginated<unknown>> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const where: Record<string, unknown> = {};

    if (dto.includeDeleted !== 'true') {
      where.isDeleted = false;
    } else if (!this.isAdminOrAbove(actor.role)) {
      // non-admins cannot include deleted
      where.isDeleted = false;
    }

    if (dto.q) {
      where.OR = [
        { title: { contains: dto.q, mode: 'insensitive' } },
        { description: { contains: dto.q, mode: 'insensitive' } },
      ];
    }
    if (dto.subjectId) where.subjectId = dto.subjectId;
    if (dto.status) where.status = dto.status;
    if (dto.instructorId) where.instructorId = dto.instructorId;
    if (dto.departmentId) {
      where.subject = { departmentId: dto.departmentId };
    }

    // Non-admin users only see PUBLISHED or courses they own/enrolled in
    // unless they explicitly filter by status/instructorId.
    if (!this.isAdminOrAbove(actor.role) && !dto.status && !dto.instructorId) {
      where.OR = [
        ...((where.OR as unknown[]) ?? []),
        { status: CourseStatus.PUBLISHED },
        { instructorId: actor.id },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.client.course.count({ where }),
      this.prisma.client.course.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          subject: {
            select: {
              id: true,
              name: true,
              code: true,
              department: { select: { id: true, name: true, code: true } },
            },
          },
          instructor: { select: { id: true, name: true, email: true, avatar: true } },
          _count: { select: { chapters: true, enrollments: true } },
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
  // FIND ONE (with chapters + lessons)
  // =====================================================
  async findOne(actor: Actor, id: string) {
    const course = await this.prisma.client.course.findUnique({
      where: { id },
      include: {
        subject: {
          include: { department: true },
        },
        instructor: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        chapters: {
          orderBy: { order: 'asc' },
          include: {
            lessons: {
              where: { isDeleted: false },
              orderBy: { order: 'asc' },
              select: {
                id: true,
                title: true,
                type: true,
                order: true,
                isPublished: true,
              },
            },
          },
        },
        _count: { select: { enrollments: true } },
      },
    });
    if (!course || course.isDeleted) {
      throw new NotFoundException('Không tìm thấy khoá học');
    }

    // Non-admin & non-owner can only see PUBLISHED
    const isOwner = actor.id === course.instructorId;
    if (course.status !== CourseStatus.PUBLISHED && !isOwner && !this.isAdminOrAbove(actor.role)) {
      throw new NotFoundException('Không tìm thấy khoá học');
    }

    return course;
  }

  // =====================================================
  // CREATE — INSTRUCTOR+ creates DRAFT
  // =====================================================
  async create(actor: Actor, dto: CreateCourseDto) {
    const subject = await this.prisma.client.subject.findUnique({
      where: { id: dto.subjectId },
    });
    if (!subject) throw new NotFoundException('Môn học không tồn tại');

    return this.prisma.client.course.create({
      data: {
        subjectId: dto.subjectId,
        instructorId: actor.id,
        title: dto.title,
        description: dto.description,
        thumbnailUrl: dto.thumbnailUrl,
        status: CourseStatus.DRAFT,
      },
    });
  }

  // =====================================================
  // UPDATE — owner (when DRAFT or REJECTED) or ADMIN+
  // =====================================================
  async update(actor: Actor, id: string, dto: UpdateCourseDto) {
    const course = await this.prisma.client.course.findUnique({
      where: { id },
    });
    if (!course || course.isDeleted) {
      throw new NotFoundException('Không tìm thấy khoá học');
    }
    if (!this.isOwnerOrAdmin(actor, course.instructorId)) {
      throw new ForbiddenException('Bạn không có quyền với khoá học này');
    }
    // Non-admins cannot edit published courses without admin intervention.
    if (!this.isAdminOrAbove(actor.role) && course.status === CourseStatus.PUBLISHED) {
      throw new BadRequestException('Khoá đã xuất bản — liên hệ admin để chỉnh sửa');
    }
    if (dto.subjectId) {
      const subject = await this.prisma.client.subject.findUnique({
        where: { id: dto.subjectId },
      });
      if (!subject) throw new NotFoundException('Môn học không tồn tại');
    }

    return this.prisma.client.course.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.thumbnailUrl !== undefined && {
          thumbnailUrl: dto.thumbnailUrl,
        }),
        ...(dto.subjectId !== undefined && { subjectId: dto.subjectId }),
      },
    });
  }

  // =====================================================
  // STATUS TRANSITION
  // =====================================================
  async updateStatus(actor: Actor, id: string, dto: UpdateStatusDto, meta: Meta) {
    const course = await this.prisma.client.course.findUnique({
      where: { id },
    });
    if (!course || course.isDeleted) {
      throw new NotFoundException('Không tìm thấy khoá học');
    }

    const nextStatus = this.assertStatusTransition(
      actor,
      course.status,
      dto.action,
      course.instructorId,
    );

    const updated = await this.prisma.client.course.update({
      where: { id },
      data: {
        status: nextStatus,
        publishedAt: nextStatus === CourseStatus.PUBLISHED ? new Date() : course.publishedAt,
      },
    });

    await this.audit.log({
      userId: actor.id,
      action: `COURSE_${dto.action}`,
      targetType: 'Course',
      targetId: id,
      ipAddress: meta.ip,
      oldValue: { status: course.status },
      newValue: { status: nextStatus, reason: dto.reason },
    });

    return updated;
  }

  // =====================================================
  // DELETE (soft) — ADMIN+
  // =====================================================
  async softDelete(actor: Actor, id: string, meta: Meta) {
    if (!this.isAdminOrAbove(actor.role)) {
      throw new ForbiddenException('Chỉ ADMIN+ mới được xoá khoá học');
    }
    const course = await this.prisma.client.course.findUnique({
      where: { id },
    });
    if (!course || course.isDeleted) {
      throw new NotFoundException('Không tìm thấy khoá học');
    }

    await this.prisma.client.course.update({
      where: { id },
      data: { isDeleted: true },
    });

    await this.audit.log({
      userId: actor.id,
      action: 'COURSE_DELETE',
      targetType: 'Course',
      targetId: id,
      ipAddress: meta.ip,
      oldValue: { title: course.title, status: course.status },
    });

    return { message: 'Đã xoá khoá học' };
  }

  // =====================================================
  // STUDENTS — list enrolled users in a course
  // =====================================================
  async listStudents(actor: Actor, courseId: string) {
    const course = await this.prisma.client.course.findUnique({
      where: { id: courseId },
      select: { id: true, instructorId: true },
    });
    if (!course) throw new NotFoundException('Không tìm thấy khoá học');
    if (!this.isOwnerOrAdmin(actor, course.instructorId)) {
      throw new ForbiddenException('Bạn không có quyền xem danh sách này');
    }

    const enrollments = await this.prisma.client.courseEnrollment.findMany({
      where: { courseId },
      orderBy: { enrolledAt: 'desc' },
      include: {
        student: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
    });
    return enrollments;
  }
}
