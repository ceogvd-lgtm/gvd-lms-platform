# CONTEXT.md — Trạng Thái Dự Án LMS

> File này chứa **trạng thái động** — cập nhật sau mỗi phase.
> Quy tắc bất biến → xem `CLAUDE.md`.

**Cập nhật lần cuối**: 21/04/2026

---

## Mục lục

1. [Tình trạng production](#1-tình-trạng-production)
2. [Lịch sử phase](#2-lịch-sử-phase)
3. [Endpoints hiện có](#3-endpoints-hiện-có)
4. [Pages hiện có](#4-pages-hiện-có)
5. [Migration history](#5-migration-history)
6. [Bugs đã fix gần đây](#6-bugs-đã-fix-gần-đây)
7. [Test baseline](#7-test-baseline)
8. [Deploy reference](#8-deploy-reference)

---

## 1. Tình trạng production

**Trạng thái**: ✅ **SẴN SÀNG PRODUCTION** — Phase 01-18 đã merge về `main` + tag `v1.0.0`.

| Item                | Value                                                      |
| ------------------- | ---------------------------------------------------------- |
| Version             | `v1.0.0`                                                   |
| Tag hash            | `b5c3593` (merge Phase 18)                                 |
| Commit Phase 18 gốc | `f8a3ae6`                                                  |
| Commit fix gần nhất | `f45be97` (Xem button 404)                                 |
| Tổng tests PASS     | **502** (420 unit + 49 integration + 19 security + 14 E2E) |
| Frontend routes     | 35 (30 static + 5 dynamic)                                 |
| Prisma migrations   | 11 files                                                   |
| Backend modules     | 31                                                         |

---

## 2. Lịch sử phase

> Format đồng nhất: **tên phase** → mục tiêu → số endpoint/page/test → commit → ngày xong.

### ✅ Phase 01 — Project Setup (15/04)

- Monorepo pnpm workspace: `apps/{backend,frontend}` + `packages/{database,types,ui,config}`
- Backend `localhost:4000/api/v1` · Frontend `localhost:3000`
- Docker dev stack: `docker-compose.dev.yml` + `override.yml`

### ✅ Phase 02 — Database Schema (15/04)

- Schema: 23 tables, 8 enums tại `packages/database/prisma/schema.prisma`
- Postgres port **5433** · `DATABASE_URL=postgresql://lms:lms@localhost:5433/lms`
- Migration đầu tiên: `20260415000000_init`

### ✅ Phase 03 — Auth & Security (15/04)

- 10 endpoints `/auth/*` · JWT 15min/7d · 2FA OTP 6 số
- Silent token refresh: `401 → refresh → retry`
- Redis-backed: brute-force lock 5/15min · refresh allowlist · OTP 10min

### ✅ Phase 04 — RBAC & 4 Luật (15/04)

- 20 routes có role guard · 23/23 unit test PASS
- INSTRUCTOR không xoá lesson/chapter/course (enforced `AdminRulesService`)
- `AuditService` ghi log mọi admin action

### ✅ Pre-Phase 05 — Dev polish (15/04)

- Seed SUPER_ADMIN: `pnpm --filter @lms/database db:seed`
- Đổi backend watcher sang `ts-node-dev` (từ `tsx`)

### ✅ Phase 05 — Design System (15/04)

- 15 components `@lms/ui` + ThemeProvider + DarkModeToggle
- DataTable (TanStack Table v8)

### ✅ Phase 06 — File Storage + GVD Rebrand (15/04)

- 6 endpoints upload + MinIO + WebGL BullMQ queue
- Buckets: `avatars/ thumbnails/ attachments/ content/{scorm,video,ppt,webgl}/ certificates/`

### ✅ Phase 07 — Email & Notification (15/04)

- BullMQ `email` queue + 8 React Email templates
- Socket.io `/notifications` namespace + 5 endpoints

### ✅ Phase 08 — Course Structure + Token Fix (15/04)

- 28 endpoints: `departments/subjects/courses/chapters/lessons/enrollments`
- Status FSM: `DRAFT → PENDING_REVIEW → PUBLISHED → ARCHIVED`
- Frontend `/admin/curriculum` tree 5 levels + slide-in panel

### ✅ Phase 09 — Admin Dashboard (16/04)

- +1 model `SystemSetting` · migration `20260415120000`
- ~30 endpoints mới · 5 trang admin · 95/95 tests PASS

### ✅ Phase 10 — Instructor Dashboard (16/04)

- TheoryContent `body Json?` · migration `20260416120000`
- ~14 endpoints · 5 trang instructor · Wizard 4 bước · TipTap editor
- 128/128 tests PASS

### ✅ Phase 11 — Question Bank System (16/04)

- Modules `questions` (7 endpoints) + `quizzes` (8 endpoints)
- Pages: `/instructor/questions` · `/instructor/lessons/:id/quiz`
- 154/154 tests PASS

### ✅ Phase 12 — Theory Lesson Engine (16/04)

- SCORM / xAPI / Video / PPT + `VideoProgress` + `LessonAttachment`
- 18 endpoints · Modules mới: `scorm/ xapi/ video-progress/`
- Pages: `/student/lessons/[id]` · `/instructor/lessons/:id/edit`
- 188/188 tests PASS · 25 routes build OK

### ✅ Phase 13 — Virtual Lab Engine (Unity WebGL) (17/04)

- `PracticeContent` + WebGL upload + extract BullMQ + verify `Builds.loader.js`
- Practice lifecycle: start → action → complete + scoring engine
- LMS Bridge: `SendMessage` + `postMessage` listener
- 7 endpoints `/practice/*` · Tab "Thực hành ảo" cho 3 role
- 221/221 tests PASS · 26 routes build OK
- Session fixes: Google OAuth callback, logout flow, dark mode, WebGL Windows race, SCORM proxy, Unity .gz headers, `/lessons/:id/context`, v.v.

### ✅ Phase 14 — Student Dashboard & Learning Experience (17/04)

- +4 models: `LessonNote, Discussion, DiscussionReply, StudentXP` · migration `20260417101840`
- 15 endpoints mới · Modules: `quiz-attempts/ discussions/ lesson-notes/ students/`
- XP auto-award: +10 lesson · +20 quiz first pass · +100 course complete
- Pages mới: `/student/{my-learning, progress, certificates/:id/print}`
- Tab mở rộng `/student/lessons/[id]`: Ghi chú (DB sync) · Hỏi đáp (Socket.io real-time + @mention) · Quiz (grading thật)
- Mobile: swipe prev/next · bottom nav 56px · PWA manifest
- 243/243 tests PASS · 29 routes build OK

### ✅ Phase 15 — Progress Tracking & Analytics (18/04)

- `CourseEnrollment` +`progressPercent` +`lastActiveAt` · `PracticeAttempt` +`hasCriticalViolation` · migration `20260418052800`
- Progress module (4 endpoints) · Analytics module (7 endpoints)
- At-risk detection 4 điều kiện: `SLOW_START / INACTIVE / LOW_SCORE / SAFETY_VIOLATION`
- Side effects: notification instructor + email học viên + `AT_RISK_DETECTED` audit
- Frontend: `activity-heatmap` · `cohort-chart` · `lesson-difficulty-panel` · `export-panel`
- 272/272 tests PASS · 30 routes build OK

### ✅ Phase 16 — Certificate System (18/04)

- `CertificateCriteria` model + `grade/finalScore/pdfUrl` vào `Certificate` · migration `20260418080730`
- 8 endpoints · Hook `lessons.completeForStudent → auto-issue`
- Auto-issue engine 5 điều kiện · PDF `pdfmake` A4 landscape + QR code → MinIO `certificates/`
- Pages: `/verify/[code]` (PUBLIC SSR + SEO) · `/instructor/courses/:id/certificate`
- BullMQ repeat daily 8AM cron · Mailpit Docker (SMTP :1025 · UI :8025)
- 290/290 tests PASS · 31 routes build OK

### ✅ Phase 17 — AI Learning Assistant (Gemini) (18/04)

- +4 models: `AiRecommendation, AiChatMessage, AiQuotaLog, AiSuggestedQuestions` · migration `20260418120000`
- 7 endpoints `/ai/*` · SSE streaming cho `/ai/chat`
- RAG Pipeline: ChromaDB + Gemini embeddings (`gemini-embedding-001` sau fix Phase 18)
- Adaptive Learning: BullMQ daily 1AM · Weekly report Monday 8AM
- Rate limit: `GEMINI_QUEUE` max 10 req/phút · quota 1500/ngày
- Frontend: `chat-widget` SSE · `recommendation-cards` · `suggested-questions` · `ai-health-panel`
- 319/319 tests PASS · 31 routes build OK

### ✅ Phase 18 — Testing + Performance + Deploy (20/04)

**Tổng quan**: Đưa hệ thống từ dev lên production ready + tag `v1.0.0`.

**Testing**:

- Integration tests (3 suites / 49): `auth` (13) · `course` (20) · `ai` (16)
- E2E Playwright (14 tests / 7 specs): smoke · student-learning · quiz · certificate · admin · instructor · responsive
- Security tests (1 suite / 19): SQL injection · XSS · IDOR · JWT tampering · brute-force · RolesGuard · file upload MIME
- Helpers: `test/integration/helpers/{prisma-stub, in-memory-redis, test-auth-app}`
- Scripts mới: `test:integration`, `test:security`, `test:e2e`, `test:e2e:ui`

**Performance**:

- DB composite indexes (migration `20260420080000`):
  - `users(departmentId, role)` — auto-enroll sweeps
  - `quiz_attempts(studentId, quizId)`
  - `course_enrollments(studentId, courseId)`
  - `lesson_progress(studentId, lessonId)`
  - `ai_chat_messages(studentId, createdAt)`
- Redis cache: `common/cache/{cache.service, cache.module}` — wired `DepartmentsService` + `SubjectsService` (TTL 1h + invalidate on write)
- Next.js: `output: 'standalone'` gated `NEXT_STANDALONE=1` · `compress: true` · `poweredByHeader: false`
- Lazy dynamic imports: `AiChatWidget`, `ActivityHeatmap`, `CohortChart`
- Health check mở rộng `GET /api/v1/health`: services + metrics + timeout probes (2s)

**Docker Production**:

- `docker-compose.prod.yml`: 7 services (postgres, redis, minio, chromadb, backend, frontend, nginx)
- `Dockerfile.prod` backend (user `nestjs`) + frontend (user `nextjs`, standalone)
- Nginx: SSL + HSTS + rate limit (`/auth/` 10r/m · `/api/` 30r/m) + SSE pass-through + gzip
- 2 networks: `internal` (backend↔services) · `public` (nginx only)

**CI/CD + Backup**:

- GitHub Actions `ci.yml`: lint + typecheck + unit/integration/security + build + e2e
- GitHub Actions `deploy.yml`: GHCR push `Dockerfile.prod` + tag `v*.*.*` deploy
- Scripts: `backup.sh` (pg_dump daily 2AM + 30d rotation + S3 optional) · `restore.sh` · `deploy.sh`
- `.env.production.example` đầy đủ vars + secret-gen hints

**Auto-enroll by department** (bundled trong Phase 18):

- Hook: course APPROVE → `enrollments.autoEnrollByDepartment(courseId)` fire-and-forget
- Cron `auto-enroll-daily` 06:00 AM — pick up student mới gia nhập
- Migration `20260420064407_phase18_user_department` (`User.departmentId`)
- Endpoints: `PATCH /admin/users/:id/department` · `POST /enrollments/auto-enroll` · `GET /enrollments/stats`

**Tổng kết**:

- **502/502 automated tests PASS** (+90 so với baseline 412)
- **35 routes** build OK
- Commit: `f8a3ae6` · Merge: `b5c3593` · Tag: **v1.0.0** · Push `origin/main` + `origin/v1.0.0` OK

### 🩹 Hotfix (21/04/2026)

- **Nút "Xem" course 404**: `/courses/:id` không tồn tại → đổi về `/instructor/courses/:id/edit` (2 files: `course-card.tsx` grid view + `courses/page.tsx` table view)
- Commit worktree `09bdb43` → merge main `f45be97`

---

## 3. Endpoints hiện có

### `/auth/*` (10)

`POST /register` · `POST /login` · `POST /2fa/send` · `POST /2fa/verify` · `POST /2fa/toggle` · `POST /refresh` · `POST /logout` · `POST /change-password` · `GET /me` · `GET /google/callback`

### `/admin/*` (~35)

`/admin/dashboard/kpi` · `/admin/users` (CRUD + block + dept assign) · `/admin/audit-logs` · `/admin/settings` · `/admin/certificates` (list + manual issue + revoke) · `/admin/questions` · `/admin/content` · `/admin/reports` · `/admin/storage-cleanup` [SUPER_ADMIN]

### Curriculum & Content (~50)

`/departments` · `/subjects` · `/courses` (+ status FSM) · `/chapters` · `/lessons` · `/enrollments` (+ auto-enroll) · `/theory-contents` · `/practice-contents`

### Assessment (~15)

`/questions` · `/quizzes` · `/quiz-attempts` (server-side grading)

### Student (~15)

`/students/dashboard` · `/students/my-learning` · `/students/progress` · `/students/xp` · `/students/certificates` · `/lessons/:id/notes` · `/lessons/:id/discussions` · `/lessons/:id/mentionable`

### Progress & Analytics (~11)

`/progress/*` (4) · `/analytics/*` (7 — department, cohort, system, lesson-difficulty, heatmap, export, schedule-report)

### Content engines (~18)

`/scorm/*` · `/xapi/*` · `/video-progress/*` · `/practice/*` · `/lessons/:id/context` · `/storage/*` (upload)

### Certificate (8)

`/certificates/criteria/:courseId` (GET/PUT/DELETE) · `/certificates/check/:courseId` · `/certificates/issue-manual` · `/certificates/:id/download` · `/certificates/verify/:code` [PUBLIC]

### AI (7)

`POST /ai/chat` (SSE) · `GET /ai/suggestions/:lessonId` · `GET /ai/recommendations` · `PATCH /ai/recommendations/:id/read` · `POST /ai/index-lesson` · `PATCH /ai/chat/:messageId/rating` · `GET /ai/health` [ADMIN+]

### Notifications & Misc

`/notifications` · `/health` (detailed Phase 18)

---

## 4. Pages hiện có (35 routes)

### `(auth)` group (5)

`/login` · `/register` · `/2fa` · `/verify-email` · `/callback`

### `(admin)` group (9)

`/admin/dashboard` · `/admin/users` · `/admin/content` · `/admin/curriculum` · `/admin/questions` · `/admin/certificates` · `/admin/reports` · `/admin/settings` · `/admin/audit-log`

### `(instructor)` group (8)

`/instructor/dashboard` · `/instructor/courses` · `/instructor/courses/new` · `/instructor/courses/[id]/edit` · `/instructor/courses/[id]/certificate` · `/instructor/lessons/[id]/edit` · `/instructor/lessons/[id]/quiz` · `/instructor/questions` · `/instructor/analytics`

### `(student)` group (5)

`/student/dashboard` · `/student/my-learning` · `/student/progress` · `/student/lessons/[id]` · `/student/certificates/[id]/print`

### `(dashboard)` group (4)

`/dashboard` (redirect theo role) · `/profile` · `/account/settings` · `/upload-demo`

### Public (4)

`/` · `/verify/[code]` · `/_not-found` · (không group)

---

## 5. Migration history

| Timestamp      | Tên                                  | Mục đích                                                           |
| -------------- | ------------------------------------ | ------------------------------------------------------------------ |
| 20260415000000 | init                                 | Schema ban đầu 23 tables                                           |
| 20260415120000 | phase09_system_setting               | +SystemSetting                                                     |
| 20260416120000 | phase10_theory_body                  | +TheoryContent.body Json                                           |
| 20260417101840 | phase14_student_experience           | +LessonNote, Discussion, DiscussionReply, StudentXP                |
| 20260418052800 | phase15_progress_analytics           | +progressPercent/lastActiveAt, hasCriticalViolation                |
| 20260418080730 | phase16_certificate                  | +CertificateCriteria, grade/finalScore/pdfUrl                      |
| 20260418120000 | phase17_ai_assistant                 | +AiRecommendation, AiChatMessage, AiQuotaLog, AiSuggestedQuestions |
| 20260419070157 | phase18_subject_soft_delete          | +Subject.isDeleted                                                 |
| 20260420023817 | phase18_lesson_attachment_ai_indexed | +LessonAttachment.aiIndexed                                        |
| 20260420064407 | phase18_user_department              | +User.departmentId + FK                                            |
| 20260420080000 | phase18_perf_indexes                 | 5 composite indexes                                                |

---

## 6. Bugs đã fix gần đây

### Phase 18 post-merge (21/04)

- **Nút "Xem" 404**: card instructor trỏ `/courses/:id` (không tồn tại) → đổi `/instructor/courses/:id/edit`. Fix tại `course-card.tsx` + `instructor/courses/page.tsx`.

### Phase 18 khi deploy

- **ChromaDB embedding 404**: `text-embedding-004` đã retired → đổi default sang `gemini-embedding-001`
- **pdf-parse API change**: v2.x dùng class `PDFParse` thay cho function → dynamic import trong `rag.service.ts`
- **Windows standalone fail**: `output: 'standalone'` gặp EPERM symlink → gate sau `NEXT_STANDALONE=1` (chỉ Docker/Linux CI build)

### Phase 17 sau merge

- **ChromaDB path deprecated warning**: giữ tương thích bằng `new ChromaClient({ path })` — sẽ migrate sang `{ ssl, host, port }` ở phase sau

### Phase 15 post-verify

- **avgScore sai scale**: đã clamp 0-100% per attempt (score/maxScore, mixed maxScore)
- **failRate row percent**: sửa công thức đúng per-row

---

## 7. Test baseline

Tất cả verified tại `v1.0.0`:

```bash
pnpm --filter @lms/backend test                 # 45 suites, 420 tests PASS
pnpm --filter @lms/backend test:integration     # 3 suites, 49 tests PASS
pnpm --filter @lms/backend test:security        # 1 suite, 19 tests PASS
pnpm --filter @lms/frontend build               # 35 routes built OK
pnpm --filter @lms/frontend test:e2e            # 14 E2E tests PASS (chromium + mobile-iphone12)
pnpm --filter @lms/database exec tsx prisma/seed-demo.ts  # seed demo idempotent
```

**Tổng**: 502 automated tests PASS.

---

## 8. Deploy reference

### VPS (Ubuntu 22.04) lần đầu

```bash
# 1. Clone + checkout release
sudo mkdir -p /srv/lms && sudo chown $USER /srv/lms
cd /srv/lms
git clone https://github.com/ceogvd-lgtm/gvd-lms-platform.git .
git checkout v1.0.0

# 2. Cấu hình .env.production
cp .env.production.example .env.production
nano .env.production
# Sinh secret: openssl rand -base64 64  (cho JWT_SECRET, REFRESH_TOKEN_SECRET)

# 3. Deploy
./scripts/deploy.sh --first-run    # Seeds SUPER_ADMIN
```

### Lần sau (rolling update)

```bash
git pull
./scripts/deploy.sh
```

### Backup cron

```cron
0 2 * * * /srv/lms/scripts/backup.sh
```

### Health check trên prod

```
https://gvdsoft.com.vn/api/v1/health
→ { status: "ok", services: {...all ok}, metrics: {...} }
```

### Khôi phục từ backup

```bash
docker compose stop backend
./scripts/restore.sh /srv/lms/backups/lms_YYYYMMDD_HHMMSS.sql.gz
# Gõ "YES I UNDERSTAND" xác nhận
docker compose start backend
```

---

## Thông tin thêm

### Fixtures đã seed

- SUPER_ADMIN: `admin@lms.local / Dangphuc@2016`
- ADMIN Google: `ceo.gvd@gmail.com`
- INSTRUCTOR: `instructor@lms.local / Instructor@123456`
- STUDENT: `student@lms.local / Student@123456`
- Course demo: "Bài 1: PPE cơ bản" · `lessonId = cmnzujyxm000aepnnolixisst`
- 10 câu hỏi ATVSLĐ trong ngân hàng

### Infrastructure đích

- VPS: Hetzner CX22 Ubuntu 22.04
- Domain: `gvdsoft.com.vn`
- SSL: Let's Encrypt (auto renew)

---

_Khi bắt đầu phase mới: đọc file này + `CLAUDE.md` trước. Cập nhật file này sau khi hoàn thành phase._
