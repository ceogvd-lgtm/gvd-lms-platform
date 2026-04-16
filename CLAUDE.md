# LMS Platform — Hướng dẫn cho Claude Code

## Tổng quan dự án

Hệ thống LMS thế hệ mới tích hợp AI, chuyên đào tạo thực hành kỹ thuật công nghiệp.
Mục tiêu: 68% scope (bỏ qua WebGL 3D Unity — chỉ làm LMS Bridge scaffold + scoring).

## Monorepo Structure

```
lms-platform/
├── apps/
│   ├── backend/      # NestJS + TypeScript
│   └── frontend/     # Next.js 14 App Router + TypeScript
├── packages/
│   ├── database/     # Prisma schema + migrations
│   ├── ui/           # Shared component library (shadcn/ui base)
│   ├── types/        # Shared TypeScript types — ĐỌC TRƯỚC KHI TẠO TYPE MỚI
│   └── config/       # ESLint, TS, Tailwind shared config
└── docker/
```

## Tech Stack — KHÔNG THAY ĐỔI

- **Backend**: NestJS + Prisma + PostgreSQL + Redis
- **Frontend**: Next.js 14 App Router + Tailwind CSS + shadcn/ui
- **Auth**: JWT (access 15min / refresh 7d) + Google OAuth2 + 2FA email OTP
- **Storage**: MinIO (S3-compatible)
- **Email**: Nodemailer + BullMQ queue
- **AI**: Google Gemini API (gemini-2.0-flash free tier) + ChromaDB
- **State**: Zustand (client) + TanStack Query (server)
- **Animation**: Framer Motion

## Design System — TUÂN THỦ TUYỆT ĐỐI

- Font: Plus Jakarta Sans
- Primary: #1E40AF (blue-800) | Secondary: #7C3AED (violet-600)
- Dark mode: bg #0F172A | surface #1E293B
- Border radius: 12px buttons, 16px cards
- **Mọi component phải có: Light mode + Dark mode + Loading state + Empty state + Error state**
- Màu role badge: SuperAdmin=#F59E0B | Admin=#3B82F6 | Instructor=#10B981 | Student=#6B7280

## 4 Luật Bất Khả Xâm Phạm — ENFORCE Ở MỌI NƠI

```
LUẬT 1: Chỉ SUPER_ADMIN gọi được createAdmin · deleteAdmin · updateAdminRole
LUẬT 2: ADMIN cố sửa/xoá SUPER_ADMIN hoặc ADMIN khác → 403
LUẬT 3: Bất kỳ ai tự xoá chính mình → 403
LUẬT 4: count(SUPER_ADMIN) ≤ 1 + target là SUPER_ADMIN → 403
```

Backend: middleware `checkAdminRules()` bắt buộc trước mọi admin action.
Frontend: disable button + tooltip giải thích (không ẩn button).

## Phân Quyền Bài Giảng — QUAN TRỌNG

- **INSTRUCTOR**: Tạo | Sửa | Lưu trữ — **TUYỆT ĐỐI KHÔNG CÓ NÚT XOÁ**
- **ADMIN / SUPER_ADMIN**: Có thể xoá (soft delete: `isDeleted=true`, ghi AuditLog)

## API Convention

- Base URL: `/api/v1/`
- Auth header: `Authorization: Bearer <accessToken>`
- Error format: `{ statusCode, message, error, timestamp }`
- Pagination: `{ data: [], total, page, limit, totalPages }`
- Soft delete: set `isDeleted=true`, không xoá row khỏi DB

## Database — Prisma

- Package: `packages/database/`
- Client import: `import { prisma } from '@lms/database'`
- **Xem schema đầy đủ tại**: `packages/database/prisma/schema.prisma`
- Migrations: `pnpm --filter @lms/database db:migrate`

## Shared Types — ĐỌC TRƯỚC KHI TẠO TYPE MỚI

Tất cả shared types ở `packages/types/src/`:

- `index.ts` — export tất cả
- `auth.types.ts` — User, Role, JwtPayload
- `course.types.ts` — Course, Chapter, Lesson, LessonType
- `progress.types.ts` — LessonProgress, CourseEnrollment
- `assessment.types.ts` — Quiz, Question, Certificate
- Import: `import type { User, Role } from '@lms/types'`

## Environment Variables (xem .env.example)

```
DATABASE_URL, REDIS_URL, JWT_SECRET, REFRESH_TOKEN_SECRET
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
SMTP_HOST, SMTP_USER, SMTP_PASS
MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY
GEMINI_API_KEY
CHROMA_HOST, CHROMA_PORT
NEXT_PUBLIC_API_URL, ALLOWED_ORIGINS
```

## Lệnh Thường Dùng

```bash
pnpm dev                          # chạy cả backend + frontend
pnpm --filter @lms/backend test   # test backend
pnpm --filter @lms/frontend lint  # lint frontend
pnpm db:migrate                   # chạy migration mới
pnpm db:studio                    # mở Prisma Studio
```

## Phase Hiện Tại

> **Xem CONTEXT.md để biết phase đang làm và những gì đã hoàn thành**

## Lưu Ý Quan Trọng Khi Code

1. Luôn kiểm tra `packages/types/` trước khi tạo interface mới
2. Luôn kiểm tra CONTEXT.md để biết các endpoint đã có
3. Không tạo file ngoài cấu trúc monorepo đã định nghĩa
4. Test file đặt cạnh source: `auth.service.spec.ts`
5. Mỗi NestJS module phải có: module, controller, service, dto, spec
6. Mỗi Next.js page phải có: loading.tsx, error.tsx, không-có-data state

---

## ⚠️ Files TUYỆT ĐỐI KHÔNG Commit

- `.env`
- `docker/docker-compose.override.yml`
- `*.local`
- `apps/frontend/.env.local`

---

## Frontend Route Groups — CẤU TRÚC BẮT BUỘC

apps/frontend/src/app/
├── (auth)/ → login, register, 2fa, verify-email
├── (admin)/ → /admin/dashboard, users, content...
├── (instructor)/ → /instructor/dashboard, courses, lessons...
├── (student)/ → /student/dashboard, lessons, progress...
└── (dashboard)/ → /dashboard (shared)

KHÔNG tạo page ngoài route groups này!

---

## Khởi Động Môi Trường Dev

# Bước 1: Khởi động Docker

docker compose -f docker/docker-compose.dev.yml \
 -f docker/docker-compose.override.yml up -d

# Bước 2: Chạy app

pnpm dev

# Seed SUPER_ADMIN (chỉ lần đầu)

pnpm --filter @lms/database db:seed

---

## Sau Khi Sửa Packages — Build Bắt Buộc

pnpm --filter @lms/types build # khi sửa packages/types
pnpm --filter @lms/database generate # khi sửa packages/database
pnpm --filter @lms/ui build # khi sửa packages/ui

---

## Lưu Ý Kỹ Thuật Bắt Buộc

- Docker PostgreSQL port: 5433 (KHÔNG phải 5432)
- Backend hot reload: ts-node-dev (KHÔNG dùng tsx)
- API prefix: /api/v1/ (KHÔNG phải /api/)
- Layout: dùng useHasHydrated() tránh hydration mismatch
- TipTap content: lưu JSON ProseMirror (không phải HTML string)
- Mỗi NestJS module phải có: module, controller, service, dto, spec
- Mỗi Next.js page phải có: loading.tsx, error.tsx, empty state

---

## Cảnh Báo Encoding UTF-8

- KHÔNG dùng curl từ Git Bash Windows để POST data tiếng Việt
- Dùng Node.js script hoặc UI browser để tạo data tiếng Việt
- Seed data: pnpm --filter @lms/database db:seed

---

## Thư Viện Đã Cài Sẵn — KHÔNG Cài Lại

Backend:

- pdfmake + exceljs → xuất PDF/Excel
- SheetJS/xlsx → import Excel
- BullMQ → queue jobs
- Socket.io → realtime notification

Frontend:

- dnd-kit → drag & drop
- TipTap → rich text editor
- Recharts → charts
- Framer Motion → animation
- react-pdf → PDF viewer (Phase 12+)
- scorm-again → SCORM player (Phase 12+)

---

## Kiểm Tra Trước Khi Tạo Module/Page Mới

# Kiểm tra backend module đã tồn tại chưa

ls apps/backend/src/modules/

# Kiểm tra frontend page đã tồn tại chưa

ls apps/frontend/src/app/(instructor)/instructor/
ls apps/frontend/src/app/(admin)/admin/
ls apps/frontend/src/app/(student)/student/

Nếu đã có → MỞ RỘNG, KHÔNG tạo mới!

---

## Quy Trình Bắt Buộc Trước Khi Bắt Đầu Phase Mới

1. Kiểm tra main branch có đủ code phase trước:
   git log --oneline main | head -5
   ls apps/backend/src/modules/

2. Nếu main THIẾU code phase trước → DỪNG NGAY, báo user:
   "Main branch chưa có code Phase XX. Cần merge trước khi tiếp tục."

3. Chỉ bắt đầu làm khi main đã đầy đủ.

---

## Quy Trình Bắt Buộc Sau Khi Hoàn Thành Phase

### Bước 1 — Test + Build

pnpm --filter @lms/backend test # phải 100% PASS
pnpm --filter @lms/frontend build # phải build thành công

### Bước 2 — Commit vào worktree hiện tại

git add -A
git commit -m "feat(scope): phase XX - mô tả ngắn"

### Bước 3 — Nhắc user merge về main (BẮT BUỘC)

Thông báo user chạy lệnh sau tại C:\GVD-lms-platform:

git checkout main
git merge claude/{tên-branch-hiện-tại} --no-ff \
 -m "feat(scope): phase XX complete"
git checkout -

KHÔNG bắt đầu phase mới trước khi user xác nhận merge xong!

### Bước 4 — Báo cáo đầy đủ cho user

- Commit hash trên worktree
- Danh sách endpoints mới (method + path + role)
- Danh sách pages mới (route + mô tả)
- Hướng dẫn test thủ công từng tính năng
- Nhắc user: "Vui lòng cập nhật CONTEXT.md trước khi bắt đầu Phase tiếp theo"
