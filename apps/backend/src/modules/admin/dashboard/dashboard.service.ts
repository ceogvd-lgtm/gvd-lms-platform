import { CertificateStatus, CourseStatus, Role } from '@lms/database';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Aggregation queries for the /admin/dashboard page (Phase 09).
 *
 * All methods are READ-ONLY. They never mutate state, so no audit log is
 * written here and no 4-Immutable-Laws check is needed — the enclosing
 * AdminController already gates the whole thing behind
 * `@Roles(ADMIN, SUPER_ADMIN)`.
 *
 * Keep queries **cheap**. The dashboard is refetched on every navigation
 * with a 60s staleTime, so aim for a single round-trip per method and
 * use indexes that the Phase 02 schema already defines (e.g. User.role,
 * Course.status, AuditLog(userId, createdAt)).
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  // =====================================================
  // 1. KPI CARDS — 4 numbers + delta vs last month
  // =====================================================
  async getKpi(): Promise<KpiResponse> {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    // `endOfLastMonth === startOfThisMonth` — used to slice "last month"
    // as the < boundary so current month is excluded from the baseline.
    const endOfLastMonth = startOfThisMonth;

    const [
      totalUsers,
      usersLastMonth,
      activeToday,
      activeYesterday,
      totalCourses,
      coursesLastMonth,
      certificatesActive,
      certsLastMonth,
    ] = await Promise.all([
      this.prisma.client.user.count(),
      this.prisma.client.user.count({ where: { createdAt: { lt: endOfLastMonth } } }),
      this.prisma.client.user.count({ where: { lastLoginAt: { gte: startOfToday } } }),
      this.prisma.client.user.count({
        where: {
          lastLoginAt: {
            gte: new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000),
            lt: startOfToday,
          },
        },
      }),
      this.prisma.client.course.count({ where: { isDeleted: false } }),
      this.prisma.client.course.count({
        where: { isDeleted: false, createdAt: { lt: endOfLastMonth } },
      }),
      this.prisma.client.certificate.count({ where: { status: CertificateStatus.ACTIVE } }),
      this.prisma.client.certificate.count({
        where: { status: CertificateStatus.ACTIVE, issuedAt: { lt: endOfLastMonth } },
      }),
    ]);

    return {
      totalUsers: kpi(totalUsers, usersLastMonth),
      activeToday: kpi(activeToday, activeYesterday),
      totalCourses: kpi(totalCourses, coursesLastMonth),
      certificatesIssued: kpi(certificatesActive, certsLastMonth),
    };
  }

  // =====================================================
  // 2. REGISTRATIONS — new users per month (line chart)
  // =====================================================
  async getRegistrations(months: number): Promise<RegistrationsResponse> {
    // Clamp 1..24 to protect against abuse.
    const clamped = Math.min(Math.max(1, Math.floor(months)), 24);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - (clamped - 1), 1);

    // We group in JS rather than in SQL to stay database-agnostic and
    // avoid `$queryRaw` complexity. At the dashboard scale (<100k users
    // total) this is negligible.
    const users = await this.prisma.client.user.findMany({
      where: { createdAt: { gte: start } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const buckets = new Map<string, number>();
    for (let i = 0; i < clamped; i += 1) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      buckets.set(monthKey(d), 0);
    }
    for (const u of users) {
      const key = monthKey(u.createdAt);
      if (buckets.has(key)) {
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }
    }

    return {
      points: Array.from(buckets.entries()).map(([month, count]) => ({ month, count })),
    };
  }

  // =====================================================
  // 3. TOP COURSES — most enrolled (bar chart)
  // =====================================================
  async getTopCourses(limit: number): Promise<TopCoursesResponse> {
    const clamped = Math.min(Math.max(1, Math.floor(limit)), 20);
    const courses = await this.prisma.client.course.findMany({
      where: { isDeleted: false, status: CourseStatus.PUBLISHED },
      select: {
        id: true,
        title: true,
        thumbnailUrl: true,
        _count: { select: { enrollments: true } },
      },
      orderBy: { enrollments: { _count: 'desc' } },
      take: clamped,
    });

    return {
      courses: courses.map((c) => ({
        id: c.id,
        title: c.title,
        thumbnailUrl: c.thumbnailUrl,
        enrollmentCount: c._count.enrollments,
      })),
    };
  }

  // =====================================================
  // 4. ROLE DISTRIBUTION — pie chart
  // =====================================================
  async getRoleDistribution(): Promise<RoleDistributionResponse> {
    const rows = await this.prisma.client.user.groupBy({
      by: ['role'],
      _count: { _all: true },
    });
    return {
      slices: rows.map((r) => ({ role: r.role, count: r._count._all })),
    };
  }

  // =====================================================
  // 5. ACTIVITY FEED — recent audit + login + enrollment
  // =====================================================
  async getActivityFeed(limit: number): Promise<ActivityFeedResponse> {
    const clamped = Math.min(Math.max(1, Math.floor(limit)), 50);
    // Fetch top N from each source (3×N rows max), merge, sort desc, slice.
    const [auditLogs, logins, enrollments] = await Promise.all([
      this.prisma.client.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: clamped,
        include: { user: { select: { id: true, name: true, role: true } } },
      }),
      this.prisma.client.loginLog.findMany({
        where: { success: true },
        orderBy: { createdAt: 'desc' },
        take: clamped,
        include: { user: { select: { id: true, name: true, role: true } } },
      }),
      this.prisma.client.courseEnrollment.findMany({
        orderBy: { enrolledAt: 'desc' },
        take: clamped,
        include: {
          student: { select: { id: true, name: true, role: true } },
          course: { select: { id: true, title: true } },
        },
      }),
    ]);

    const items: ActivityItem[] = [
      ...auditLogs.map<ActivityItem>((a) => ({
        id: `audit-${a.id}`,
        type: 'AUDIT',
        action: a.action,
        userId: a.user.id,
        userName: a.user.name,
        userRole: a.user.role,
        target: `${a.targetType}:${a.targetId.slice(0, 8)}`,
        timestamp: a.createdAt,
      })),
      ...logins.map<ActivityItem>((l) => ({
        id: `login-${l.id}`,
        type: 'LOGIN',
        action: 'USER_LOGIN',
        userId: l.user.id,
        userName: l.user.name,
        userRole: l.user.role,
        target: null,
        timestamp: l.createdAt,
      })),
      ...enrollments.map<ActivityItem>((e) => ({
        id: `enroll-${e.id}`,
        type: 'ENROLL',
        action: 'COURSE_ENROLL',
        userId: e.student.id,
        userName: e.student.name,
        userRole: e.student.role,
        target: e.course.title,
        timestamp: e.enrolledAt,
      })),
    ];

    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return { items: items.slice(0, clamped) };
  }

  // =====================================================
  // 6. ALERTS — inactive students + pending courses
  // =====================================================
  async getAlerts(): Promise<AlertsResponse> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [inactiveStudents, pendingCoursesCount, pendingCoursesList] = await Promise.all([
      this.prisma.client.user.count({
        where: {
          role: Role.STUDENT,
          isBlocked: false,
          OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: sevenDaysAgo } }],
        },
      }),
      this.prisma.client.course.count({
        where: { isDeleted: false, status: CourseStatus.PENDING_REVIEW },
      }),
      this.prisma.client.course.findMany({
        where: { isDeleted: false, status: CourseStatus.PENDING_REVIEW },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          createdAt: true,
          instructor: { select: { id: true, name: true } },
        },
      }),
    ]);

    return {
      inactiveStudents,
      pendingCourses: pendingCoursesCount,
      pendingItems: pendingCoursesList.map((c) => ({
        id: c.id,
        title: c.title,
        instructorName: c.instructor.name,
        createdAt: c.createdAt,
      })),
    };
  }
}

// =====================================================
// Response shapes (exported for controller + tests + @lms/types later)
// =====================================================

export interface KpiValue {
  value: number;
  deltaPct: number;
}

export interface KpiResponse {
  totalUsers: KpiValue;
  activeToday: KpiValue;
  totalCourses: KpiValue;
  certificatesIssued: KpiValue;
}

export interface RegistrationsResponse {
  points: Array<{ month: string; count: number }>;
}

export interface TopCoursesResponse {
  courses: Array<{
    id: string;
    title: string;
    thumbnailUrl: string | null;
    enrollmentCount: number;
  }>;
}

export interface RoleDistributionResponse {
  slices: Array<{ role: Role; count: number }>;
}

export interface ActivityItem {
  id: string;
  type: 'AUDIT' | 'LOGIN' | 'ENROLL';
  action: string;
  userId: string;
  userName: string;
  userRole: Role;
  target: string | null;
  timestamp: Date;
}

export interface ActivityFeedResponse {
  items: ActivityItem[];
}

export interface AlertsResponse {
  inactiveStudents: number;
  pendingCourses: number;
  pendingItems: Array<{
    id: string;
    title: string;
    instructorName: string;
    createdAt: Date;
  }>;
}

// =====================================================
// Helpers
// =====================================================

function kpi(current: number, previous: number): KpiValue {
  if (previous === 0) {
    // No baseline — show +100% for any positive current, 0 otherwise so
    // the UI doesn't render `Infinity%`.
    return { value: current, deltaPct: current > 0 ? 100 : 0 };
  }
  const deltaPct = Math.round(((current - previous) / previous) * 100);
  return { value: current, deltaPct };
}

function monthKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
