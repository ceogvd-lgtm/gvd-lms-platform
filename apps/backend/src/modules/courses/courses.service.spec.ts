import { Role } from '@lms/types';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';

import { CoursesService } from './courses.service';

/**
 * Phase 18 (Scenario 4 fix) — Tests cho auto-enroll hook trong
 * `CoursesService.updateStatus`. Mục tiêu: xác nhận khi course chuyển
 * sang PUBLISHED thì `EnrollmentsService.autoEnrollByDepartment` được
 * gọi, và KHÔNG gọi cho các transition khác.
 *
 * Hook chạy fire-and-forget (không await) nên các test phải flush
 * microtasks trước khi assert. Dùng `await Promise.resolve()` 2 lần là
 * đủ cho chain `.then().catch()`.
 */
describe('CoursesService — auto-enroll on publish hook (Scenario 4)', () => {
  let service: CoursesService;
  let prisma: {
    client: {
      course: { findUnique: jest.Mock; update: jest.Mock };
    };
  };
  let audit: { log: jest.Mock };
  let enrollments: { autoEnrollByDepartment: jest.Mock };
  let storage: Record<string, jest.Mock>;

  // Actor đóng vai ADMIN — đủ quyền APPROVE.
  const admin = { id: 'admin-1', role: Role.ADMIN };
  const meta = { ip: '127.0.0.1' };

  beforeEach(async () => {
    prisma = {
      client: {
        course: {
          findUnique: jest.fn(),
          update: jest.fn(),
        },
      },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    enrollments = {
      autoEnrollByDepartment: jest.fn().mockResolvedValue({
        courseId: 'c1',
        courseTitle: 'Test',
        departmentId: 'd1',
        departmentName: 'Điện công nghiệp',
        enrolled: 2,
        skipped: 0,
        total: 2,
      }),
    };
    // StorageService không dùng trong updateStatus nhưng là dependency
    // của CoursesService — stub rỗng để DI resolve được.
    storage = {
      deletePrefix: jest.fn(),
      extractKey: jest.fn(),
      presignedGet: jest.fn(),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        CoursesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: StorageService, useValue: storage },
        { provide: EnrollmentsService, useValue: enrollments },
      ],
    }).compile();
    service = mod.get(CoursesService);
  });

  /** Helper: chờ các microtask của `.then().catch()` chain hoàn tất. */
  const flushMicrotasks = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
  };

  it('GỌI auto-enroll khi PENDING_REVIEW → PUBLISHED (action=APPROVE)', async () => {
    prisma.client.course.findUnique.mockResolvedValue({
      id: 'c1',
      title: 'Khoá test',
      status: 'PENDING_REVIEW',
      instructorId: 'ins-1',
      isDeleted: false,
      publishedAt: null,
    });
    prisma.client.course.update.mockResolvedValue({
      id: 'c1',
      status: 'PUBLISHED',
    });

    const result = await service.updateStatus(admin, 'c1', { action: 'APPROVE' }, meta);

    // Response trả về ngay — fire-and-forget, không đợi hook xong
    expect(result.status).toBe('PUBLISHED');
    // Hook đã schedule (dù chưa resolve) — autoEnrollByDepartment được gọi
    expect(enrollments.autoEnrollByDepartment).toHaveBeenCalledWith('c1');
    expect(enrollments.autoEnrollByDepartment).toHaveBeenCalledTimes(1);

    // Flush microtasks để hook background chạy xong
    await flushMicrotasks();

    // Audit cho AUTO_ENROLL_ON_PUBLISH phải được ghi sau khi hook resolve
    const auditCalls = audit.log.mock.calls.map((c) => c[0].action);
    expect(auditCalls).toContain('AUTO_ENROLL_ON_PUBLISH');
  });

  it('KHÔNG gọi auto-enroll khi DRAFT → PENDING_REVIEW (action=SUBMIT)', async () => {
    prisma.client.course.findUnique.mockResolvedValue({
      id: 'c1',
      title: 'Khoá test',
      status: 'DRAFT',
      instructorId: admin.id,
      isDeleted: false,
      publishedAt: null,
    });
    prisma.client.course.update.mockResolvedValue({
      id: 'c1',
      status: 'PENDING_REVIEW',
    });

    await service.updateStatus(admin, 'c1', { action: 'SUBMIT' }, meta);

    expect(enrollments.autoEnrollByDepartment).not.toHaveBeenCalled();
  });

  it('KHÔNG gọi auto-enroll khi PENDING_REVIEW → DRAFT (action=REJECT)', async () => {
    prisma.client.course.findUnique.mockResolvedValue({
      id: 'c1',
      title: 'Khoá test',
      status: 'PENDING_REVIEW',
      instructorId: 'ins-1',
      isDeleted: false,
      publishedAt: null,
    });
    prisma.client.course.update.mockResolvedValue({
      id: 'c1',
      status: 'DRAFT',
    });

    await service.updateStatus(admin, 'c1', { action: 'REJECT', reason: 'sơ sài' }, meta);

    expect(enrollments.autoEnrollByDepartment).not.toHaveBeenCalled();
  });

  it('KHÔNG gọi auto-enroll khi PUBLISHED → ARCHIVED (action=ARCHIVE)', async () => {
    prisma.client.course.findUnique.mockResolvedValue({
      id: 'c1',
      title: 'Khoá test',
      status: 'PUBLISHED',
      instructorId: 'ins-1',
      isDeleted: false,
      publishedAt: new Date(),
    });
    prisma.client.course.update.mockResolvedValue({
      id: 'c1',
      status: 'ARCHIVED',
    });

    await service.updateStatus(admin, 'c1', { action: 'ARCHIVE' }, meta);

    expect(enrollments.autoEnrollByDepartment).not.toHaveBeenCalled();
  });

  it('Response KHÔNG bị block khi auto-enroll chậm (fire-and-forget)', async () => {
    prisma.client.course.findUnique.mockResolvedValue({
      id: 'c1',
      title: 'Khoá test',
      status: 'PENDING_REVIEW',
      instructorId: 'ins-1',
      isDeleted: false,
      publishedAt: null,
    });
    prisma.client.course.update.mockResolvedValue({
      id: 'c1',
      status: 'PUBLISHED',
    });
    // Giả lập hook chậm 10 giây — response vẫn phải trả ngay
    let resolveHook: (value: unknown) => void = () => undefined;
    enrollments.autoEnrollByDepartment.mockReturnValue(
      new Promise((resolve) => {
        resolveHook = resolve;
      }),
    );

    const start = Date.now();
    await service.updateStatus(admin, 'c1', { action: 'APPROVE' }, meta);
    const elapsed = Date.now() - start;

    // Response về nhanh — < 100ms (không đợi hook resolve)
    expect(elapsed).toBeLessThan(100);
    expect(enrollments.autoEnrollByDepartment).toHaveBeenCalledWith('c1');

    // Cleanup: cho hook resolve để không leak promise
    resolveHook({
      courseId: 'c1',
      courseTitle: 'Test',
      departmentId: null,
      departmentName: null,
      enrolled: 0,
      skipped: 0,
      total: 0,
    });
    await flushMicrotasks();
  });

  it('Hook failure KHÔNG ảnh hưởng response (silent warn log)', async () => {
    prisma.client.course.findUnique.mockResolvedValue({
      id: 'c1',
      title: 'Khoá test',
      status: 'PENDING_REVIEW',
      instructorId: 'ins-1',
      isDeleted: false,
      publishedAt: null,
    });
    prisma.client.course.update.mockResolvedValue({
      id: 'c1',
      status: 'PUBLISHED',
    });
    enrollments.autoEnrollByDepartment.mockRejectedValue(new Error('DB connection lost'));

    const result = await service.updateStatus(admin, 'c1', { action: 'APPROVE' }, meta);

    // Response thành công dù hook fail
    expect(result.status).toBe('PUBLISHED');

    // Flush để `.catch()` handler của hook chạy
    await flushMicrotasks();

    // AUTO_ENROLL_ON_PUBLISH KHÔNG được ghi audit (vì hook fail)
    const auditCalls = audit.log.mock.calls.map((c) => c[0].action);
    expect(auditCalls).not.toContain('AUTO_ENROLL_ON_PUBLISH');
  });
});
