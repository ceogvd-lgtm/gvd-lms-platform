# CONTEXT.md — Dự Án LMS

Cập nhật ngày: 15/04/2026

## ĐANG LÀM

Phase 10 — (TBD)

## ĐÃ HOÀN THÀNH

### ✅ Phase 01 — Project Setup

- Backend: localhost:4000/api/v1 | Frontend: localhost:3000
- Lệnh chạy: pnpm dev
- Docker: docker compose -f docker/docker-compose.dev.yml -f docker/docker-compose.override.yml up -d
- Xong ngày: 15/04/2026

### ✅ Phase 02 — Database Schema

- Schema: packages/database/prisma/schema.prisma (23 tables, 8 enums)
- Database port: 5433 | DATABASE_URL: postgresql://lms:lms@localhost:5433/lms
- Xong ngày: 15/04/2026

### ✅ Phase 03 — Auth & Security

- 10 endpoints /auth/\* | JWT 15min/7d | 2FA OTP 6 số
- Xong ngày: 15/04/2026

### ✅ Phase 04 — RBAC & 4 Luật

- 20 routes | 23/23 unit test PASS
- INSTRUCTOR không xoá lesson | AuditService ghi log
- /admin/users và /admin/audit-log đã có từ Phase 04 (bảng thủ công)
- Xong ngày: 15/04/2026

### ✅ Pre-Phase 05

- Seed: pnpm --filter @lms/database db:seed (admin@lms.local / Admin@123456)
- Dev watcher: ts-node-dev | Commit: 5e3c133
- Xong ngày: 15/04/2026

### ✅ Phase 05 — Design System

- 15 components @lms/ui + ThemeProvider + DarkModeToggle
- DataTable component có sẵn trong @lms/ui (TanStack Table v8)
- Commit: b584de7 | Xong ngày: 15/04/2026

### ✅ Phase 06 — File Storage + GVD Rebrand

- 6 endpoints upload + MinIO + WebGL BullMQ
- Commit: 5b9ed03 | Xong ngày: 15/04/2026

### ✅ Phase 07 — Email & Notification

- BullMQ emailQueue + 8 React Email templates
- Socket.io /notifications + 5 endpoints
- Commit: 93af1fa | Xong ngày: 15/04/2026

### ✅ Phase 08 — Course Structure + Token Fix

- 28 endpoints: departments/subjects/courses/chapters/lessons/enrollments
- Status FSM: DRAFT→PENDING_REVIEW→PUBLISHED→ARCHIVED
- Frontend: /admin/curriculum tree view 5 levels + slide-in panel
- Silent token refresh: 401 → auto refresh → retry (race condition safe)
- Commit: fbc72e7 | Xong ngày: 15/04/2026

### ✅ Phase 09 — Admin Dashboard

- **Database**: thêm model SystemSetting (key-value), migration 20260415120000
- **Backend modules mới** (~30 endpoints):
  - `admin/dashboard` — 6 endpoints (kpi, registrations, top-courses, role-distribution, activity-feed, alerts)
  - `admin/content` — 7 endpoints moderation (list courses/lessons, approve, reject, delete, impact, flag)
  - `certificates` — 5 endpoints (list, detail, revoke, stats summary, pass-rate by course)
  - `reports` — 4 endpoints (progress JSON + export PDF/XLSX cho progress, users, certificates)
  - `system-settings` — 6 endpoints (getAll, update, testSmtp, triggerBackup stub, backup history stub)
  - **Extend admin.service**: bulk-block, user detail với stats, export CSV/XLSX, filter status
- **Backend exporters**: pdfmake (Roboto Unicode VN) + exceljs
- **6 unit test mới**: dashboard/admin/content/certificates/system-settings/reports services — tất cả PASS (9 suites, 95 tests)
- **Frontend DataTable** (packages/ui): extend với server-side mode (manualPagination/Filtering/Sorting) + loading skeleton + rowActions
- **Frontend recharts**: cài recharts@^3.8.1
- **Admin layout mới**: refactor sang sidebar-based (darker navy) với AdminSidebar component, role-gated menu
- **5 trang admin mới**:
  - `/admin/dashboard` — KPI 4 cards + line/bar/pie charts + activity feed + alerts panel
  - `/admin/content` — Tabs (Chờ duyệt/Đã xuất bản/Lưu trữ/Tất cả) + moderation modals (approve/reject/delete với impact)
  - `/admin/certificates` — Stats cards + filter + revoke modal với reason bắt buộc
  - `/admin/reports` — Filter department/subject/date + preview + export PDF/Excel
  - `/admin/settings` — 5 tabs (Org/Email/Security/Storage/Backup), SUPER_ADMIN-only edit, SMTP test, backup stub
- **2 trang migrate**:
  - `/admin/users` — DataTable server-side, bulk block, export CSV/XLSX, create admin modal, row actions DropdownMenu với 4 Luật disable+tooltip
  - `/admin/audit-log` — DataTable server-side, audit detail modal với JSON diff oldValue/newValue
- **4 Luật enforcement**:
  - Backend: mọi mutation gọi `AdminRulesService.check()` trước
  - Frontend: `UserActionButton` + `checkAdminRules()` disable + tooltip (không hide)
  - Settings page read-only cho ADMIN với warning banner
- **Audit actions mới**: CONTENT_APPROVE/REJECT/DELETE/FLAG_LESSON, CERTIFICATE_REVOKE, SYSTEM_SETTING_UPDATE, SYSTEM_BACKUP_TRIGGER
- Xong ngày: 15/04/2026

## LƯU Ý QUAN TRỌNG

- Docker port 5433 (không phải 5432)
- docker-compose.override.yml KHÔNG commit | .env KHÔNG commit
- Sau khi sửa packages/types hoặc packages/database phải build trước
- Backend hot reload: ts-node-dev (KHÔNG dùng tsx)
- Seed SUPER_ADMIN: pnpm --filter @lms/database db:seed (seed cả SystemSetting defaults)
- API prefix luôn là /api/v1/ (không phải /api/)
- Silent token refresh đã implement trong lib/api.ts
- DataTable từ @lms/ui dùng TanStack Table v8, hỗ trợ cả client-side (default) và server-side mode
- pdfmake render với font Roboto (Unicode VN hoạt động tốt)
- Phase 09 backup chỉ ở chế độ stub — Phase 18 (Deploy) sẽ implement pg_dump + MinIO thật

## LỆNH ĐÃ VERIFY Ở PHASE 09

```bash
# Database
pnpm --filter @lms/database db:migrate          # apply SystemSetting migration
pnpm --filter @lms/database db:seed             # seed admin + SystemSetting defaults

# Backend
pnpm --filter @lms/backend typecheck            # PASS
pnpm --filter @lms/backend lint                 # PASS
pnpm --filter @lms/backend test                 # 9 suites, 95 tests PASS

# Frontend
pnpm --filter @lms/frontend typecheck           # PASS
pnpm --filter @lms/frontend lint                # PASS
pnpm --filter @lms/frontend build               # 19 routes built
```
