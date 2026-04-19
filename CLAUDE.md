# LMS Platform — Hướng dẫn cho Claude Code

## Tổng quan dự án

Hệ thống LMS thế hệ mới tích hợp AI, chuyên đào tạo thực hành kỹ thuật công nghiệp tại Việt Nam.

Tính năng cốt lõi đã hoàn thành:

- Đào tạo lý thuyết: Video / SCORM / xAPI / PowerPoint
- Thực hành ảo: Unity WebGL 3D tích hợp LMS Bridge đầy đủ (KHÔNG phải scaffold)
- Đánh giá: Quiz server-side + Practice scoring engine (13 rules)
- Theo dõi tiến độ: Student Dashboard + Analytics + At-risk detection
- Gamification: XP system + streak + leaderboard
- Hỏi đáp: Threaded comments + @mention + real-time Socket.io
- Chứng chỉ: Tự động cấp + QR verify (Phase 16)
- AI Assistant: Gemini chatbot RAG (Phase 17)
- Deploy production: Docker + CI/CD + Monitoring (Phase 18)

## Monorepo Structure

lms-platform/
├── apps/
│ ├── backend/ # NestJS + TypeScript
│ └── frontend/ # Next.js 14 App Router + TypeScript
├── packages/
│ ├── database/ # Prisma schema + migrations
│ ├── ui/ # Shared component library (shadcn/ui base)
│ ├── types/ # Shared TypeScript types — ĐỌC TRƯỚC KHI TẠO TYPE MỚI
│ └── config/ # ESLint, TS, Tailwind shared config
└── docker/

## Tech Stack — KHÔNG THAY ĐỔI

- **Backend**: NestJS + Prisma + PostgreSQL + Redis
- **Frontend**: Next.js 14 App Router + Tailwind CSS + shadcn/ui
- **Auth**: JWT (access 15min / refresh 7d) + Google OAuth2 + 2FA email OTP
- **Storage**: MinIO (S3-compatible)
- **Email**: Nodemailer + BullMQ queue
- **AI**: Google Gemini API (gemini-2.5-flash free tier) + ChromaDB
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

LUẬT 1: Chỉ SUPER_ADMIN gọi được createAdmin · deleteAdmin · updateAdminRole
LUẬT 2: ADMIN cố sửa/xoá SUPER_ADMIN hoặc ADMIN khác → 403
LUẬT 3: Bất kỳ ai tự xoá chính mình → 403
LUẬT 4: count(SUPER_ADMIN) ≤ 1 + target là SUPER_ADMIN → 403
Backend: middleware `checkAdminRules()` bắt buộc trước mọi admin action.
Frontend: disable button + tooltip giải thích (không ẩn button).

## Phân Quyền Bài Giảng — QUAN TRỌNG

- **INSTRUCTOR**: Tạo | Sửa | Lưu trữ — **TUYỆT ĐỐI KHÔNG CÓ NÚT XOÁ**
- **ADMIN / SUPER_ADMIN**: Có thể xoá (soft delete: `isDeleted=true`, ghi AuditLog)

## Phân Quyền Curriculum — QUAN TRỌNG

- Xoá Ngành (Department): chỉ SUPER_ADMIN
  → Phải xoá hết môn con trước
- Xoá Môn (Subject): ADMIN + SUPER_ADMIN
  → Phải xoá hết khoá học trước
- Xoá Khoá học: ADMIN + SUPER_ADMIN
- Tất cả soft delete: isDeleted=true + AuditLog
- \_count luôn filter isDeleted=false

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

## Tài Khoản Test

- SUPER_ADMIN: admin@lms.local / [Dangphuc@2016]
  → Tài khoản quản trị cao nhất
  → Xoá ngành, quản lý admin, toàn quyền
- ADMIN (Google): ceo.gvd@gmail.com
  → Quản lý nội dung, người dùng
  → Đăng nhập bằng nút Google OAuth
- INSTRUCTOR: instructor@lms.local / Instructor@123456
- STUDENT: student@lms.local / Student@123456

⚠️ Chỉ có 1 SUPER_ADMIN duy nhất: admin@lms.local
⚠️ Xoá ngành học: BẮT BUỘC login admin@lms.local
⚠️ ceo.gvd@gmail.com = ADMIN (đăng nhập Google)

## Environment Variables (xem .env.example)

DATABASE_URL, REDIS_URL, JWT_SECRET, REFRESH_TOKEN_SECRET
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
SMTP_HOST, SMTP_USER, SMTP_PASS
MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY
GEMINI_API_KEY
CHROMA_HOST, CHROMA_PORT
NEXT_PUBLIC_API_URL, ALLOWED_ORIGINS

## Storage — PUBLIC_PREFIXES

Các prefix sau serve trực tiếp từ MinIO (không cần presigned URL):

- content/webgl
- content/scorm
- content/video

File: `apps/backend/src/storage/storage.constants.ts`
Khi thêm loại content mới → thêm prefix vào đây.

## Unity WebGL Convention

- Tên project thực tế: "Builds"
- Files: Builds.loader.js / Builds.data / Builds.framework.js / Builds.wasm
- LMS → Unity: `unityInstance.SendMessage('LMSBridge', 'ReceiveConfig', JSON.stringify(config))`
- Unity → LMS: `window.parent.postMessage({ type: 'LMS_ACTION', payload }, '*')`
- SCORM proxy: Next.js rewrite `/scorm-content/*` → MinIO (tránh cross-origin)
- WebGL extract: stream thẳng lên MinIO (không extract ra disk — tránh Windows race condition)
- Scoring engine: isInOrder ×1.10 | critical violation −20% | mandatory skip = 0 | clamp ≥ 0

## Seed Data

```bash
# Seed SUPER_ADMIN (chỉ lần đầu)
pnpm --filter @lms/database db:seed

# Seed demo đầy đủ (idempotent — chạy nhiều lần không bị lỗi)
pnpm --filter @lms/database exec tsx prisma/seed-demo.ts
# Tạo: instructor + student + course PPE + chapters + lessons + quiz + enrollment
```

## Lệnh Thường Dùng

```bash
pnpm dev                                    # chạy cả backend + frontend
pnpm --filter @lms/backend test             # test backend
pnpm --filter @lms/frontend build           # build frontend
pnpm --filter @lms/frontend lint            # lint frontend
pnpm --filter @lms/database db:migrate      # chạy migration mới
pnpm --filter @lms/database db:studio       # mở Prisma Studio
```

## Phase Hiện Tại

> **Xem CONTEXT.md để biết phase đang làm và những gì đã hoàn thành**

## Lưu Ý Quan Trọng Khi Code

1. Luôn kiểm tra `packages/types/` trước khi tạo interface mới
2. Luôn kiểm tra CONTEXT.md để biết các endpoint đã có
3. Không tạo file ngoài cấu trúc monorepo đã định nghĩa
4. Test file đặt cạnh source: `auth.service.spec.ts`
5. Mỗi NestJS module phải có: module, controller, service, dto, spec
6. Mỗi Next.js page phải có: loading.tsx, error.tsx, empty state

## ⚠️ Files TUYỆT ĐỐI KHÔNG Commit

- `.env` — chứa secrets (DB password, JWT keys, API keys)
- `docker/docker-compose.override.yml` — cấu hình riêng từng máy
- `*.local` và `apps/frontend/.env.local` — cấu hình local
- `.claude/` — internal tooling của Claude Code

## Frontend Route Groups — CẤU TRÚC BẮT BUỘC

apps/frontend/src/app/
├── (auth)/ → login, register, 2fa, verify-email, callback
├── (admin)/ → /admin/dashboard, users, content, curriculum...
├── (instructor)/ → /instructor/dashboard, courses, lessons, analytics...
├── (student)/ → /student/dashboard, lessons, my-learning, progress...
└── (dashboard)/ → /dashboard, /profile, /account/settings
KHÔNG tạo page ngoài route groups này!

## Khởi Động Môi Trường Dev

```bash
# Bước 1: Khởi động Docker
docker compose -f docker/docker-compose.dev.yml \
  -f docker/docker-compose.override.yml up -d

# Bước 2: Chạy app
pnpm dev

# Xác nhận:
# Backend:  http://localhost:4000/api/v1/health → {"status":"ok"}
# Frontend: http://localhost:3000/login → load được
```

## Sau Khi Sửa Packages — Build Bắt Buộc

```bash
pnpm --filter @lms/types build        # khi sửa packages/types
pnpm --filter @lms/database generate  # khi sửa packages/database
pnpm --filter @lms/ui build           # khi sửa packages/ui
```

## Lưu Ý Kỹ Thuật Bắt Buộc

- Docker PostgreSQL port: **5433** (KHÔNG phải 5432)
- Backend hot reload: **ts-node-dev** (KHÔNG dùng tsx)
- API prefix: **/api/v1/** (KHÔNG phải /api/)
- Layout: dùng `useHasHydrated()` tránh hydration mismatch
- TipTap content: lưu JSON ProseMirror (không phải HTML string)
- SCORM iframe: serve qua proxy `/scorm-content/*` (không trực tiếp MinIO)
- Quiz grading: server-side tại POST /quiz-attempts (KHÔNG auto-pass)
- Google OAuth callback path: `/callback` (không phải `/auth/callback`)
- Presigned URL video expires 1h → dùng PUBLIC_PREFIXES thay thế
- Unity WebGL build tên project "Builds" → verify Builds.loader.js khi upload
- Role-based redirect: Admin→/admin/dashboard | Instructor→/instructor/dashboard | Student→/student/dashboard
- /dashboard tự redirect theo role (homeForRole tại src/lib/auth-redirect.ts)
- Admin + Instructor không còn "Sắp có" (dùng sidebar riêng)
- /profile + /account/settings: trang cá nhân mọi role (dashboard group)
- PATCH /users/me: sửa name + avatar (KHÔNG sửa role/email)
- POST /auth/change-password: cần oldPassword
- Xoá Ngành: chỉ SUPER_ADMIN | Xoá Môn: ADMIN+ | phải xoá con trước
- Subject có isDeleted + \_count filter isDeleted=false
- Audit log: /api/v1/admin/audit-logs (có chữ s)
- Mailpit: SMTP localhost:1025 | UI http://localhost:8025
- GEMINI_MODEL=gemini-2.5-flash | LITE=gemini-flash-lite-latest
- ChromaDB: localhost:8000 API v2 | Collection: lms_docs
- /verify/:code là PUBLIC page (không cần auth)
- Grade: Xuất sắc ≥90% | Giỏi ≥80% | Đạt ≥70%
- At-risk script: node scripts/phase15-seed-at-risk.js [slow|inactive|low|safety|all|restore]
- lessonId PPE cơ bản: cmnzujyxm000aepnnolixisst
- Certificate PDF: certificates/{certId}.pdf trong MinIO
- BullMQ cron at-risk-daily: pattern 0 8 \* \* \* (đã active)
- Storage cleanup A: hook xoá file khi xoá entity (subject/course/lesson/user)
- Storage cleanup B: cron 03:00 CN + manual trigger
- POST /api/v1/admin/storage-cleanup [SUPER_ADMIN] → manual trigger
- AuditLog action=STORAGE_CLEANUP: {scanned, used, orphan, deleted, errors}
- WebGL cleanup: xoá cả cây content/webgl/<id>/\*

## Cảnh Báo Encoding UTF-8

- KHÔNG dùng curl từ Git Bash Windows để POST data tiếng Việt
- Dùng Node.js script hoặc UI browser để tạo data tiếng Việt
- Kiểm tra encoding trước khi seed: dùng `seed-demo.ts` thay vì curl

## Thư Viện Đã Cài Sẵn — KHÔNG Cài Lại

**Backend:**

- pdfmake + exceljs → xuất PDF/Excel
- SheetJS/xlsx → import Excel
- BullMQ → queue jobs + scheduled repeat jobs
- Socket.io → realtime notification
- scorm-again → SCORM LRS
- unzipper + xml2js → parse SCORM/WebGL zip
- storage.listKeys(prefix) → list MinIO keys by prefix
- extractMinioKey(url) → parse URL về MinIO key
  (tại apps/backend/src/common/storage/storage.utils.ts)

**Frontend:**

- dnd-kit → drag & drop
- TipTap → rich text editor (7 packages đã cài)
- Recharts → charts + responsive container
- Framer Motion → animation
- react-pdf → PDF viewer
- scorm-again → SCORM player (từ public/ static)
- react-swipeable → swipe gesture

## Kiểm Tra Trước Khi Tạo Module/Page Mới

```bash
# Kiểm tra backend module đã tồn tại chưa
ls apps/backend/src/modules/

# Kiểm tra frontend page đã tồn tại chưa
ls apps/frontend/src/app/(instructor)/instructor/
ls apps/frontend/src/app/(admin)/admin/
ls apps/frontend/src/app/(student)/student/
ls apps/frontend/src/app/(dashboard)/
```

Nếu đã có → **MỞ RỘNG, KHÔNG tạo mới!**

## Quy Trình Bắt Buộc Trước Khi Bắt Đầu Phase Mới

1. Đọc CONTEXT.md + CLAUDE.md trước
2. Kiểm tra main branch có đủ code phase trước:

```bash
git log --oneline main | head -5
ls apps/backend/src/modules/
```

3. Nếu main THIẾU code phase trước → DỪNG NGAY, báo user:
   "Main branch chưa có code Phase XX. Cần merge trước khi tiếp tục."
4. Chỉ bắt đầu làm khi main đã đầy đủ.

## Quy Trình Bắt Buộc Sau Khi Hoàn Thành Phase

### Bước 1 — Test + Build

```bash
pnpm --filter @lms/backend test        # phải 100% PASS
pnpm --filter @lms/frontend build      # phải build thành công
```

### Bước 2 — Commit vào worktree hiện tại

```bash
git add -A
# KHÔNG commit: .env | docker-compose.override.yml | .claude/
git commit -m "feat(scope): phase XX - mô tả ngắn"
```

### Bước 3 — Nhắc user merge về main (BẮT BUỘC)

Thông báo user chạy lệnh sau tại `C:\GVD-lms-platform`:

```bash
git checkout main
git merge claude/{tên-branch-hiện-tại} --no-ff \
  -m "feat(scope): phase XX complete"
git checkout -
```

**KHÔNG bắt đầu phase mới trước khi user xác nhận merge xong!**

### Bước 4 — Báo cáo đầy đủ cho user

- Commit hash trên worktree
- Danh sách endpoints mới (method + path + role)
- Danh sách pages mới (route + mô tả)
- Số tests PASS + số routes build OK
- Hướng dẫn test thủ công từng tính năng
- Nhắc user: "Vui lòng cập nhật CONTEXT.md trước khi bắt đầu Phase tiếp theo"
