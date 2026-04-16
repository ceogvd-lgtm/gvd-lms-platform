import { CertificateStatus, Role } from '@lms/database';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';

import { ListCertificatesDto } from './dto/list-certificates.dto';
import { RevokeCertificateDto } from './dto/revoke-certificate.dto';

interface Actor {
  id: string;
  role: Role;
}

interface Meta {
  ip: string;
}

/**
 * Admin certificate management (Phase 09).
 *
 * Read + revoke + pass-rate statistics. Certificate issuance itself is
 * handled elsewhere (earlier phases); this module is the admin-facing
 * management surface.
 */
@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // =====================================================
  // LIST with filters + pagination
  // =====================================================
  async list(dto: ListCertificatesDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const where: Record<string, unknown> = {};

    if (dto.status) where.status = dto.status;
    if (dto.courseId) where.courseId = dto.courseId;
    if (dto.studentId) where.studentId = dto.studentId;

    if (dto.q) {
      where.OR = [
        { code: { contains: dto.q, mode: 'insensitive' } },
        { student: { name: { contains: dto.q, mode: 'insensitive' } } },
        { student: { email: { contains: dto.q, mode: 'insensitive' } } },
        { course: { title: { contains: dto.q, mode: 'insensitive' } } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.client.certificate.count({ where }),
      this.prisma.client.certificate.findMany({
        where,
        orderBy: { issuedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          student: { select: { id: true, name: true, email: true, avatar: true } },
          course: { select: { id: true, title: true, thumbnailUrl: true } },
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
  // FIND ONE
  // =====================================================
  async findOne(id: string) {
    const cert = await this.prisma.client.certificate.findUnique({
      where: { id },
      include: {
        student: {
          select: { id: true, name: true, email: true, phone: true, avatar: true },
        },
        course: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
            subject: { select: { id: true, name: true, code: true } },
            instructor: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!cert) throw new NotFoundException('Không tìm thấy chứng chỉ');
    return cert;
  }

  // =====================================================
  // REVOKE — requires reason
  // =====================================================
  async revoke(actor: Actor, id: string, dto: RevokeCertificateDto, meta: Meta) {
    const cert = await this.prisma.client.certificate.findUnique({
      where: { id },
      select: { id: true, code: true, status: true, studentId: true, courseId: true },
    });
    if (!cert) throw new NotFoundException('Không tìm thấy chứng chỉ');
    if (cert.status === CertificateStatus.REVOKED) {
      throw new BadRequestException('Chứng chỉ đã bị thu hồi trước đó');
    }

    const updated = await this.prisma.client.certificate.update({
      where: { id },
      data: {
        status: CertificateStatus.REVOKED,
        revokedAt: new Date(),
        revokedReason: dto.reason,
      },
    });

    await this.audit.log({
      userId: actor.id,
      action: 'CERTIFICATE_REVOKE',
      targetType: 'Certificate',
      targetId: id,
      ipAddress: meta.ip,
      oldValue: { status: cert.status },
      newValue: { status: CertificateStatus.REVOKED, reason: dto.reason },
    });

    return updated;
  }

  // =====================================================
  // PASS RATE by course — for /admin/reports stats + /admin/certificates stats card
  // =====================================================
  async getPassRateByCourse() {
    // 1. Fetch all non-deleted, published courses
    const courses = await this.prisma.client.course.findMany({
      where: { isDeleted: false },
      select: {
        id: true,
        title: true,
        _count: { select: { enrollments: true, certificates: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 2. For each course, count ACTIVE certificates
    const activeCerts = await this.prisma.client.certificate.groupBy({
      by: ['courseId'],
      where: { status: CertificateStatus.ACTIVE },
      _count: { _all: true },
    });
    const activeByCourse = new Map<string, number>();
    for (const row of activeCerts) {
      activeByCourse.set(row.courseId, row._count._all);
    }

    return {
      courses: courses.map((c) => {
        const enrolled = c._count.enrollments;
        const active = activeByCourse.get(c.id) ?? 0;
        const passRate = enrolled > 0 ? Math.round((active / enrolled) * 100) : 0;
        return {
          courseId: c.id,
          courseTitle: c.title,
          enrolled,
          passed: active,
          totalCertificates: c._count.certificates,
          passRate,
        };
      }),
    };
  }

  // =====================================================
  // STATS SUMMARY — total cards for the top of /admin/certificates
  // =====================================================
  async getStatsSummary() {
    const [active, revoked, expired, total] = await Promise.all([
      this.prisma.client.certificate.count({ where: { status: CertificateStatus.ACTIVE } }),
      this.prisma.client.certificate.count({ where: { status: CertificateStatus.REVOKED } }),
      this.prisma.client.certificate.count({ where: { status: CertificateStatus.EXPIRED } }),
      this.prisma.client.certificate.count(),
    ]);

    // Average pass-rate across all courses that have at least one enrollment
    const passRateData = await this.getPassRateByCourse();
    const coursesWithEnrollments = passRateData.courses.filter((c) => c.enrolled > 0);
    const avgPassRate =
      coursesWithEnrollments.length > 0
        ? Math.round(
            coursesWithEnrollments.reduce((sum, c) => sum + c.passRate, 0) /
              coursesWithEnrollments.length,
          )
        : 0;

    return { total, active, revoked, expired, avgPassRate };
  }
}
