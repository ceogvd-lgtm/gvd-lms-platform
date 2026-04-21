# CLAUDE.md — Quy Tắc Bất Biến Dự Án LMS

> File này chứa các **quy tắc KHÔNG ĐỔI** trong suốt vòng đời dự án.
> Trạng thái theo phase (đã làm gì, đang làm gì) → xem `CONTEXT.md`.

---

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Tech Stack & Cấu trúc Monorepo](#2-tech-stack--cấu-trúc-monorepo)
3. [Thiết kế & UI](#3-thiết-kế--ui)
4. [Quy tắc bảo mật (RBAC)](#4-quy-tắc-bảo-mật-rbac)
5. [Phân quyền nội dung](#5-phân-quyền-nội-dung)
6. [API & Database](#6-api--database)
7. [Frontend Route Groups](#7-frontend-route-groups)
8. [Storage & Content](#8-storage--content)
9. [Tài khoản test & Env vars](#9-tài-khoản-test--env-vars)
10. [Commands reference](#10-commands-reference)
11. [Thư viện đã cài sẵn](#11-thư-viện-đã-cài-sẵn)
12. [Git workflow](#12-git-workflow)
13. [Gotchas phải nhớ](#13-gotchas-phải-nhớ)

---

## 1. Tổng quan

Hệ thống LMS thế hệ mới tích hợp AI, chuyên đào tạo thực hành kỹ thuật công nghiệp tại Việt Nam.

**Tính năng cốt lõi**:

- Đào tạo lý thuyết: Video / SCORM / xAPI / PowerPoint
- Thực hành ảo: Unity WebGL 3D + LMS Bridge (không phải scaffold)
- Đánh giá: Quiz server-side + Practice scoring engine
- Theo dõi tiến độ: Student Dashboard + Analytics + At-risk detection
- Gamification: XP + streak + leaderboard
- Hỏi đáp: Threaded comments + @mention + real-time Socket.io
- Chứng chỉ: Auto-issue + QR verify công khai
- AI Assistant: Gemini chatbot với RAG

---

## 2. Tech Stack & Cấu trúc Monorepo

### Stack (KHÔNG thay đổi)

| Layer     | Công nghệ                                                       |
| --------- | --------------------------------------------------------------- |
| Backend   | NestJS + Prisma + PostgreSQL + Redis                            |
| Frontend  | Next.js 14 App Router + Tailwind + shadcn/ui                    |
| Auth      | JWT (access 15min / refresh 7d) + Google OAuth2 + 2FA email OTP |
| Storage   | MinIO (S3-compatible)                                           |
| Email     | Nodemailer + BullMQ queue                                       |
| AI        | Google Gemini + ChromaDB                                        |
| State     | Zustand (client) + TanStack Query (server)                      |
| Animation | Framer Motion                                                   |

### Cấu trúc

```
lms-platform/
├── apps/
│   ├── backend/          # NestJS + TypeScript
│   └── frontend/         # Next.js 14 App Router
├── packages/
│   ├── database/         # Prisma schema + migrations
│   ├── ui/               # Component library (shadcn/ui base)
│   ├── types/            # Shared TS types — ĐỌC TRƯỚC KHI TẠO TYPE
│   └── config/           # ESLint/TS/Tailwind shared
├── docker/               # compose files + nginx
├── scripts/              # backup/restore/deploy/seed
└── .github/workflows/    # CI + deploy
```

---

## 3. Thiết kế & UI

### Design System

- **Font**: Plus Jakarta Sans
- **Primary**: `#1E40AF` (blue-800)
- **Secondary**: `#7C3AED` (violet-600)
- **Dark mode**: bg `#0F172A` / surface `#1E293B`
- **Border radius**: 12px buttons, 16px cards
- **Role badge colors**:
  - SuperAdmin `#F59E0B`
  - Admin `#3B82F6`
  - Instructor `#10B981`
  - Student `#6B7280`

### Component rule BẮT BUỘC

Mọi component phải có đủ 5 states:

- Light mode + Dark mode
- Loading state
- Empty state
- Error state

---

## 4. Quy tắc bảo mật (RBAC)

### 4 Luật bất khả xâm phạm — ENFORCE MỌI NƠI

| Luật | Nội dung                                                                     |
| ---- | ---------------------------------------------------------------------------- |
| 1    | Chỉ `SUPER_ADMIN` gọi được `createAdmin` · `deleteAdmin` · `updateAdminRole` |
| 2    | `ADMIN` cố sửa/xoá `SUPER_ADMIN` hoặc `ADMIN` khác → 403                     |
| 3    | Bất kỳ ai tự xoá chính mình → 403                                            |
| 4    | `count(SUPER_ADMIN) ≤ 1` + target là `SUPER_ADMIN` → 403                     |

**Enforcement**:

- Backend: middleware `checkAdminRules()` bắt buộc trước mọi admin action
- Frontend: **disable** button + tooltip giải thích (không ẩn button)

---

## 5. Phân quyền nội dung

### Bài giảng (Lesson/Chapter/Course)

| Vai trò             | Quyền                                                    |
| ------------------- | -------------------------------------------------------- |
| INSTRUCTOR          | Tạo · Sửa · **Lưu trữ** — TUYỆT ĐỐI KHÔNG có nút Xoá     |
| ADMIN / SUPER_ADMIN | Có thể xoá (soft delete: `isDeleted=true`, ghi AuditLog) |

### Curriculum (Department/Subject/Course)

| Action       | Vai trò         | Điều kiện                       |
| ------------ | --------------- | ------------------------------- |
| Xoá Ngành    | Chỉ SUPER_ADMIN | Phải xoá hết môn con trước      |
| Xoá Môn      | ADMIN+          | Phải xoá hết khoá học con trước |
| Xoá Khoá học | ADMIN+          | (không có điều kiện con)        |

**Ngoại lệ Quiz**: rule "không xoá" KHÔNG áp cho Quiz — instructor được xoá quiz trong course của mình.

**Tất cả**: soft delete → `isDeleted=true` + AuditLog. `_count` luôn filter `isDeleted=false`.

---

## 6. API & Database

### API Convention

- **Base URL**: `/api/v1/` (KHÔNG phải `/api/`)
- **Auth header**: `Authorization: Bearer <accessToken>`
- **Error format**: `{ statusCode, message, error, timestamp }`
- **Pagination**: `{ data: [], total, page, limit, totalPages }`
- **Audit log endpoint**: `/api/v1/admin/audit-logs` (có chữ `s`)

### Database — Prisma

- Package: `packages/database/`
- Client import: `import { prisma } from '@lms/database'`
- Schema: `packages/database/prisma/schema.prisma`
- Migration: `pnpm --filter @lms/database db:migrate`

### Shared Types

Đọc trước khi tạo interface mới — tất cả ở `packages/types/src/`:

```ts
import type { User, Role, JwtPayload } from '@lms/types';
```

Files:

- `auth.types.ts` — User, Role, JwtPayload
- `course.types.ts` — Course, Chapter, Lesson, LessonType
- `progress.types.ts` — LessonProgress, CourseEnrollment
- `assessment.types.ts` — Quiz, Question, Certificate

---

## 7. Frontend Route Groups

**CẤU TRÚC BẮT BUỘC** — không tạo page ngoài các group này:

```
apps/frontend/src/app/
├── (auth)/          → /login, /register, /2fa, /verify-email, /callback
├── (admin)/         → /admin/{dashboard, users, content, curriculum, ...}
├── (instructor)/    → /instructor/{dashboard, courses, lessons, analytics, ...}
├── (student)/       → /student/{dashboard, lessons, my-learning, progress, ...}
└── (dashboard)/     → /dashboard, /profile, /account/settings  (shared cho mọi role)
```

**Public routes** (không cần auth): `/verify/:code` (cert verify)

**Role-based redirect** (`src/lib/auth-redirect.ts`):

- Admin → `/admin/dashboard`
- Instructor → `/instructor/dashboard`
- Student → `/student/dashboard`
- `/dashboard` tự redirect theo role

---

## 8. Storage & Content

### PUBLIC_PREFIXES (serve trực tiếp từ MinIO, không cần presigned)

File: `apps/backend/src/common/storage/storage.constants.ts`

- `avatars/`
- `thumbnails/`
- `content/webgl/`
- `content/scorm/`
- `content/video/` (thêm Phase 14 — tránh expire presigned URL giữa session)

### Unity WebGL Convention

- Tên project thực tế: **`Builds`**
- Files bắt buộc: `Builds.loader.js` / `Builds.data` / `Builds.framework.js` / `Builds.wasm`
- LMS → Unity: `unityInstance.SendMessage('LMSBridge', 'ReceiveConfig', JSON.stringify(config))`
- Unity → LMS: `window.parent.postMessage({ type: 'LMS_ACTION', payload }, '*')`
- WebGL extract: stream thẳng lên MinIO (không extract ra disk — tránh Windows race)

### SCORM

- iframe serve qua Next.js rewrite `/scorm-content/*` → MinIO (tránh cross-origin)
- KHÔNG trực tiếp từ MinIO

### Practice Scoring Engine

`isInOrder ×1.10` | `critical violation −20%` | `mandatory skip = 0` | `clamp ≥ 0`

### Certificate Grade

- Xuất sắc `≥ 90%`
- Giỏi `≥ 80%`
- Đạt `≥ 70%`

---

## 9. Tài khoản test & Env vars

### Tài khoản đã seed

| Role                 | Email                  | Mật khẩu             |
| -------------------- | ---------------------- | -------------------- |
| SUPER_ADMIN          | `admin@lms.local`      | `Dangphuc@2016`      |
| ADMIN (Google OAuth) | `ceo.gvd@gmail.com`    | — (đăng nhập Google) |
| INSTRUCTOR           | `instructor@lms.local` | `Instructor@123456`  |
| STUDENT              | `student@lms.local`    | `Student@123456`     |

**Lưu ý quan trọng**:

- ⚠️ Chỉ có 1 SUPER_ADMIN duy nhất: `admin@lms.local`
- ⚠️ Xoá ngành học BẮT BUỘC login bằng SUPER_ADMIN
- ⚠️ `ceo.gvd@gmail.com` = ADMIN (đăng nhập bằng nút Google OAuth)

### Env vars chính (xem `.env.example` + `.env.production.example`)

```
# Database
DATABASE_URL=postgresql://lms:lms@localhost:5433/lms

# Redis
REDIS_URL

# JWT
JWT_SECRET, REFRESH_TOKEN_SECRET

# Google OAuth
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

# SMTP (Mailpit dev / SendGrid prod)
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS

# MinIO
MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY

# Gemini AI
GEMINI_API_KEY
GEMINI_MODEL=gemini-2.5-flash
GEMINI_MODEL_LITE=gemini-flash-lite-latest
GEMINI_MODEL_EMBEDDING=gemini-embedding-001

# ChromaDB
CHROMA_HOST, CHROMA_PORT

# Frontend
NEXT_PUBLIC_API_URL, ALLOWED_ORIGINS
```

---

## 10. Commands reference

### Khởi động môi trường dev

```bash
# Bước 1 — Docker
docker compose -f docker/docker-compose.dev.yml \
  -f docker/docker-compose.override.yml up -d

# Bước 2 — App
pnpm dev

# Xác nhận:
# Backend:  http://localhost:4000/api/v1/health → {"status":"ok"}
# Frontend: http://localhost:3000/login
```

### Lệnh hàng ngày

```bash
pnpm dev                                           # backend + frontend
pnpm --filter @lms/backend test                    # unit tests
pnpm --filter @lms/backend test:integration        # integration tests
pnpm --filter @lms/backend test:security           # security tests
pnpm --filter @lms/frontend build                  # build Next.js
pnpm --filter @lms/frontend test:e2e               # Playwright E2E
pnpm --filter @lms/frontend lint                   # lint
pnpm --filter @lms/database db:migrate             # chạy migration mới
pnpm --filter @lms/database db:studio              # Prisma Studio
```

### Sau khi sửa packages — build bắt buộc

```bash
pnpm --filter @lms/types build        # khi sửa packages/types
pnpm --filter @lms/database generate  # khi sửa packages/database
pnpm --filter @lms/ui build           # khi sửa packages/ui
```

### Seed data

```bash
# Seed SUPER_ADMIN (chỉ lần đầu)
pnpm --filter @lms/database db:seed

# Seed demo đầy đủ (idempotent)
pnpm --filter @lms/database exec tsx prisma/seed-demo.ts
# → Tạo: instructor + student + course PPE + chapters + lessons + quiz + enrollment
```

### Deploy production

```bash
# Trên VPS Ubuntu 22.04:
cp .env.production.example .env.production
# Điền secrets: openssl rand -base64 64 cho JWT_SECRET + REFRESH_TOKEN_SECRET
./scripts/deploy.sh --first-run    # Lần đầu (seeds admin)
./scripts/deploy.sh                # Lần sau
./scripts/backup.sh                # Thêm vào cron 2AM
```

### Kiểm tra trước khi tạo module/page mới

```bash
ls apps/backend/src/modules/
ls apps/frontend/src/app/\(instructor\)/instructor/
ls apps/frontend/src/app/\(admin\)/admin/
ls apps/frontend/src/app/\(student\)/student/
```

Nếu đã có → **MỞ RỘNG, KHÔNG tạo mới!**

---

## 11. Thư viện đã cài sẵn

**KHÔNG cài lại**.

### Backend

- `pdfmake` + `exceljs` → xuất PDF / Excel
- `xlsx` (SheetJS) → import Excel
- `bullmq` → queue jobs + scheduled repeat
- `socket.io` → realtime notification
- `scorm-again` → SCORM LRS
- `unzipper` + `xml2js` → parse SCORM / WebGL zip
- `chromadb` → vector store client
- `@google/generative-ai` → Gemini client
- Helpers tại `apps/backend/src/common/storage/storage.utils.ts`:
  - `storage.listKeys(prefix)` → list MinIO keys
  - `extractMinioKey(url)` → parse URL về MinIO key

### Frontend

- `@dnd-kit/core` + `@dnd-kit/sortable` → drag & drop
- `@tiptap/*` → rich text editor (7 packages)
- `recharts` → charts + responsive container
- `framer-motion` → animation
- `react-pdf` → PDF viewer
- `scorm-again` → SCORM player (từ `public/` static)
- `react-swipeable` → swipe gesture
- `@playwright/test` → E2E testing

---

## 12. Git workflow

### Trước khi bắt đầu phase mới

```bash
# 1. Đọc CONTEXT.md + CLAUDE.md
# 2. Kiểm tra main có đủ code phase trước:
git log --oneline main | head -5
ls apps/backend/src/modules/
```

Nếu main **THIẾU** code phase trước → DỪNG NGAY, báo user:

> "Main branch chưa có code Phase XX. Cần merge trước khi tiếp tục."

### Sau khi hoàn thành phase

**Bước 1 — Test + Build**:

```bash
pnpm --filter @lms/backend test         # phải 100% PASS
pnpm --filter @lms/frontend build       # phải build OK
```

**Bước 2 — Commit trên worktree**:

```bash
git add -A
# KHÔNG commit: .env | docker-compose.override.yml | .claude/
git commit -m "feat(scope): phase XX - mô tả ngắn"
```

**Bước 3 — Nhắc user merge về main** (BẮT BUỘC):

```bash
# Tại C:\GVD-lms-platform
git checkout main
git merge claude/{branch-worktree} --no-ff \
  -m "feat(scope): phase XX complete"
```

**KHÔNG bắt đầu phase mới trước khi user xác nhận merge xong!**

**Bước 4 — Báo cáo cho user**:

- Commit hash trên worktree + commit merge
- Danh sách endpoints mới (method + path + role)
- Danh sách pages mới (route + mô tả)
- Số tests PASS + số routes build OK
- Hướng dẫn test thủ công từng tính năng
- Nhắc user: "Vui lòng cập nhật CONTEXT.md trước khi bắt đầu Phase tiếp theo"

### Files TUYỆT ĐỐI KHÔNG commit

- `.env` (chứa secrets)
- `docker/docker-compose.override.yml` (cấu hình riêng máy)
- `*.local`, `apps/frontend/.env.local`
- `.claude/` (internal tooling Claude Code)
- `apps/frontend/test-results/`, `playwright-report/`

---

## 13. Gotchas phải nhớ

### Dev environment

- Docker PostgreSQL port là **5433** (KHÔNG phải 5432)
- Backend hot-reload dùng **ts-node-dev** (KHÔNG dùng tsx)
- Mailpit: SMTP `localhost:1025` · UI `http://localhost:8025`
- ChromaDB: `localhost:8000` · API v2 (`/api/v2/`) · Collection `lms_docs`

### Auth & routing

- Google OAuth callback path: `/callback` (KHÔNG phải `/auth/callback`)
- Silent token refresh: 401 → auto refresh → retry
- Layout dùng `useHasHydrated()` trước khi check role (tránh hydration mismatch)
- `POST /auth/change-password`: cần `oldPassword`

### Nội dung & bài học

- TipTap body lưu JSON ProseMirror (KHÔNG phải HTML string) — auto-save 30s
- Quiz grading server-side tại `POST /quiz-attempts` (KHÔNG auto-pass)
- `/verify/:code` là PUBLIC page (không cần auth)
- SCORM iframe qua proxy `/scorm-content/*` (không trực tiếp MinIO)
- Presigned URL video expires 1h → dùng PUBLIC_PREFIXES thay thế

### Workflow instructor → admin

- Instructor soạn xong → nút "Gửi duyệt" trong `/instructor/lessons/:id/edit` header (chỉ hiện khi `course.status === DRAFT`)
- Admin thấy trong `/admin/content` tab "Chờ duyệt"
- Instructor muốn sửa khi đang PENDING_REVIEW → "Huỷ gửi duyệt" trước
- Header lesson editor có back link "← Khoá học: [tên]" + badge status

### Auto-enroll by department (Phase 18)

- Admin duyệt course (PUBLISHED) → tự enroll mọi student cùng department
- Cron `auto-enroll-daily` 06:00 AM: pick up student mới gia nhập department
- `PATCH /admin/users/:id/department`: gán dept cho user
- `POST /enrollments/auto-enroll` [ADMIN+]: manual trigger

### Storage cleanup

- Hook xoá file khi xoá entity (subject/course/lesson/user)
- Cron 03:00 Chủ nhật + manual trigger `POST /api/v1/admin/storage-cleanup` [SUPER_ADMIN]
- AuditLog `action=STORAGE_CLEANUP`: `{scanned, used, orphan, deleted, errors}`
- WebGL cleanup: xoá cả cây `content/webgl/<id>/*`

### Encoding UTF-8 — cảnh báo Windows

- **KHÔNG dùng `curl` từ Git Bash Windows** để POST data tiếng Việt (sai encoding)
- Dùng Node.js script hoặc UI browser
- Seed tiếng Việt: dùng `seed-demo.ts` thay vì curl

### AI Gemini

- Models verified working:
  - Chat: `gemini-2.5-flash`
  - Lite: `gemini-flash-lite-latest`
  - Embedding: `gemini-embedding-001`
- KHÔNG dùng `gemini-2.0-flash` (429 rate limit) hoặc `gemini-1.5-flash` (404 retired)
- Quota free tier: 1500 req/ngày/model — track qua `AiQuotaLog`
- `GEMINI_QUEUE` max 10 req/phút

### Test conventions

- Test file đặt cạnh source: `auth.service.spec.ts`
- Mỗi NestJS module: có đủ `module + controller + service + dto + spec`
- Mỗi Next.js page: có `loading.tsx` + `error.tsx` + empty state
- At-risk test script: `node scripts/phase15-seed-at-risk.js [slow|inactive|low|safety|all|restore]`

---

_File này được cập nhật cuối ngày 21/04/2026 cho dự án GVD LMS v1.0.0._
