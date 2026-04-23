# CONTEXT.md — Trạng Thái Dự Án LMS

> File này chứa **trạng thái động** — cập nhật sau mỗi phase.
> Quy tắc bất biến → xem `CLAUDE.md`.

**Cập nhật lần cuối**: 23/04/2026 (v1.0.8)

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

**Trạng thái**: ✅ **SẴN SÀNG PRODUCTION** — Phase 01-18B đã merge về `main` + tag `v1.0.8`.

Brand hiện tại: **GVD next-gen LMS** (thay từ "GVD Simvana" ngày 22/04 tối — tên mới nhấn mạnh vị thế LMS thế hệ mới).

| Item              | Value                                                                  |
| ----------------- | ---------------------------------------------------------------------- |
| Version           | `v1.0.8` (quiz DTO @Allow() — unblocks v1.0.7 grader)                  |
| Tag hash v1.0.0   | `b5c3593` (Phase 18 gốc)                                               |
| Tag hash v1.0.1   | `366a3fb` (Phase 18B merge)                                            |
| Tag hash v1.0.2   | `b721105` (WebGL fixes — Mac junk + Unity PWA SW)                      |
| Tag hash v1.0.3   | `fbab97f` (WebGL — patch index.html + kill stale PWA SW)               |
| Tag hash v1.0.4   | `69b2b8c` (feat: student iframe 16:9 aspect ratio)                     |
| Tag hash v1.0.5   | `73cd3b2` (feat(brand): rename to GVD next-gen LMS)                    |
| Tag hash v1.0.6   | `1b61de3` (feat: fullscreen toggle cho student iframe)                 |
| Tag hash v1.0.7   | `16f7729` (fix(quiz): string-id grading, remove gradeLocally)          |
| Tag hash v1.0.8   | `e8fae59` (fix(quiz): @Allow() decorator cho AnswerItem.answer)        |
| Commit gần nhất   | `e8fae59` (fix(quiz): whitelist answer field in DTO)                   |
| Tổng tests PASS   | **446 unit** (47 suites) + 49 integration + 19 security + 14 E2E = 528 |
| Frontend routes   | 36 (Backup tab + các page hiện có)                                     |
| Prisma migrations | 12 files (+ `20260421160240_add_backup_model`)                         |
| Backend modules   | 32 (+ `BackupModule`)                                                  |
| Brand             | **GVD next-gen LMS**                                                   |

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

### ✅ Phase 18B — Real Backup System + Brand GVD Simvana (21-22/04)

**Brand rename → GVD Simvana** (28 user-visible strings):

- Frontend: page titles · sidebars (`· Admin` / `· Giảng viên`) · auth pages · verify cert · certificate print · AI chat · PWA manifest (name + short_name + description) · `GvdLogo` title prop
- Backend: SMTP_FROM fallback · `INSTITUTION_NAME` cert · Gemini system prompt · 6 email templates (subjects + bodies + footer) · Excel workbook creator · test fixtures
- Seed: `org.name` + `smtp.from` defaults (existing DB rows không đổi — update qua `/admin/settings`)
- Technical identifiers giữ nguyên: `@lms/*` packages · `lms-uploads` bucket · `LMS_*` env vars · docker container names

**Real pg_dump Backup System** (thay stub Phase 09):

- Model Prisma `Backup` (migration `20260421160240_add_backup_model`) + enums `BackupStatus` · `BackupTriggerType`
- MinIO prefix mới: `backups/` (KHÔNG trong `PUBLIC_PREFIXES` — dump chứa PII + password hashes)
- Dockerfile.prod: `apk add postgresql-client` (cho pg_dump + psql trên PATH)
- BullMQ cron `database-backup-daily` pattern `0 2 * * *` (02:00 mỗi ngày) — idempotent jobId `database-backup-daily-repeat`
- Retention: 30 ngày (`BACKUP_RETENTION_DAYS` env, default 30) — cleanup sweep cùng cron tick
- **4 endpoints** tại `/api/v1/admin/backups/*`:
  - `POST /trigger` (ADMIN+) → 202 tạo PENDING row + enqueue dispatch job
  - `GET /?page&limit` (ADMIN+) → paginated history với presigned URL 1h (chỉ SUCCESS rows)
  - `POST /cleanup` (SUPER_ADMIN) → force retention sweep
  - `POST /restore/:id` (SUPER_ADMIN) → DANGEROUS, yêu cầu `confirm: "YES-I-UNDERSTAND-THIS-OVERWRITES-DATABASE"` trong body
- AuditLog actions mới: `BACKUP_TRIGGERED` · `BACKUP_CREATED` · `BACKUP_FAILED` · `BACKUP_CLEANED` · `BACKUP_RESTORED`

**Hotfix**: `stripPrismaParams()` strip Prisma-only query params (`schema`, `pgbouncer`, `connection_limit`, `pool_timeout`, `statement_cache_size`, `socket_timeout`, `connect_timeout`) khỏi DATABASE_URL trước khi pass vào pg_dump (libpq reject `?schema=public` với `invalid URI query parameter`)

**Frontend Backup tab** (`/admin/settings` → Backup):

- Stub banner Phase 09 ĐÃ XOÁ
- Bảng 6 cột: Tên file · Kích thước · Loại (Thủ công/Tự động) · Trạng thái (badge màu 4 mức) · Ngày tạo · Tải xuống
- Nút **Backup ngay** (SUPER_ADMIN) — toast + auto-refetch
- Auto-refresh 5s CHỈ KHI có row PENDING/RUNNING (tiết kiệm request)
- Download qua presigned URL 1h (`<a download>` synthetic click)
- Pagination 10/trang

**Bonus fixes (cùng merge)**:

- **Curriculum delete buttons**: `/admin/curriculum` giờ có nút Trash hover cho Course/Chapter/Lesson (backend endpoints sẵn có, UI thiếu wiring)
- **WebGL upload stuck-on-fail**: 3 bug — `jobId` zombie polling · `<input type=file>` cached value · thiếu retry CTA. Fix: clear jobId ở success/fail paths · `e.target.value = ''` sau onChange · nút "Thử lại" + "Chọn file khác" với `key` prop force remount

**Tổng kết**:

- **429/429 backend tests PASS** (46 suites) · **36 routes** build OK
- Tests mới: `backup.service.spec.ts` (11/11) covering trigger + runBackupJob success/fail/notfound + getBackupHistory pagination+presigned + cleanupOldBackups cutoff + cron register+fail-soft
- Squashed 5 brand commits → 1 · Final history main:
  - `366a3fb` merge commit
  - `a21c94e` feat(brand): rename to GVD Simvana (squashed)
  - `15f1bbd` fix(backup): strip Prisma params
  - `8fd8d30` feat(backup): pg_dump system
  - `fde45bc` fix(instructor): curriculum delete + WebGL stuck
- Push `origin/main` OK (271f7af..366a3fb)

### 🧪 Quiz grading fix (23/04/2026 sáng) — v1.0.7 + v1.0.8

**Trigger**: User phát hiện "làm quiz toàn được 100% dù cố tình chọn sai", sau đó khi fix đợt 1 thì lại thấy toast đỏ `answers.N.property answer should not exist`.

**Bug 1 — NaN collision** (`16f7729` / v1.0.7):

- Root cause: DB lưu `Question.correctAnswer = ["opt_a849b6370cc85067"]` (CUID strings từ `questions.service.ts#validateAndNormalizeOptions`). Frontend `student-quiz.tsx` coerce `Number(opt.id)` = **NaN** trước khi gửi. Backend `compareIndexAnswer` dùng `new Set(arr.map(Number))` + `.has(Number(c))` — vì `Set([NaN]).has(NaN) === true` theo JS SameValueZero spec → SINGLE_CHOICE + TRUE_FALSE **luôn 100% đúng** bất kể student chọn đáp án nào. MULTI_CHOICE thì `filter(Number.isInteger)` loại NaN → array rỗng → luôn 0 điểm. FILL_BLANK không ảnh hưởng (string compare riêng).
- **Bug phụ** (cùng commit): frontend wrap submit trong `try { server } catch { gradeLocally(...) }`, nhưng `gradeLocally` **hardcode `correct: true`** cho mọi câu + trả `attemptId: "local-${Date.now()}"` không bao giờ lưu DB. Bất kỳ lỗi server (401, 500, validator) → fallback trả 100% giả, người dùng không bao giờ thấy error thật. Đó là lý do `quiz_attempts` table có 0 rows dù user "làm nhiều lần".
- Fix:
  - Frontend gửi `String(opt.id)` (không coerce Number)
  - Backend rename `compareIndexAnswer` → `compareIdAnswer`, so sánh bằng **string equality**. Reject empty submission thay vì coi như length-0 match.
  - **XOÁ `gradeLocally` fallback** — lỗi server giờ hiện toast đỏ "Nộp bài thất bại" thay vì phantom pass.
  - Update DTO comment: `string` (CUID id) thay vì `number` (index)
- Regression tests: +5 (CUID SINGLE/TRUE_FALSE/MULTI, NaN collision, empty submission)

**Bug 2 — DTO validator rejection** (`e8fae59` / v1.0.8):

- Trigger: Sau khi v1.0.7 xoá `gradeLocally` fallback, mọi submission 400 với `answers.N.property answer should not exist` cho tất cả câu.
- Root cause: `AnswerItem.answer: unknown` **không có decorator class-validator**. App-wide `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` → strip/reject mọi field không decorator → validator reject toàn bộ submission.
- Trước v1.0.7, bug này đã tồn tại nhưng **bị che** bởi `gradeLocally`: fallback nuốt 400 và trả 100% giả. Xoá fallback = bug lộ ra.
- Fix: thêm `@Allow()` decorator từ `class-validator` cho `AnswerItem.answer` — whitelist field mà không ràng buộc type. Service-layer tự validate shape khi biết `Question.type`.

**Tổng kết v1.0.7 + v1.0.8**:

- **446/446 backend tests PASS** (+5 từ v1.0.6 baseline 441)
- 2 commits: `16f7729` (string-id grading) + `e8fae59` (@Allow())
- Tag `v1.0.7` + `v1.0.8` push `origin` OK
- Student làm quiz giờ nhận **điểm thực**: SAI → 🔴 đỏ, ĐÚNG → 🟢 xanh, `quiz_attempts` có row được persist
- Hướng dẫn học viên đang test: hard refresh (Ctrl+Shift+R) sau khi deploy để pick up frontend changes

### 🖥️ WebGL fullscreen toggle (22/04/2026 cuối ngày) — v1.0.6

- **Feature**: Nút phóng to/thu nhỏ toàn màn hình ở góc dưới-phải khung thực hành (`Maximize2` / `Minimize2` icons). Click toggle giữa chế độ xem cửa sổ (16:9 bounded) ↔ toàn màn hình (100vw × 100vh). Commit `1b61de3`.
- UX rationale: Thực hành ảo cần không gian rộng để học viên quan sát thiết bị 3D, bấm nút chính xác, đọc HUD không vướng browser chrome. Nút này là **core UX** cho trải nghiệm học viên.
- Implementation:
  - `stageRef.current.requestFullscreen()` trên stage div wrapper → Unity + HUD + nút đều vào toàn màn hình
  - Listen `document.fullscreenchange` event → icon tự sync khi user thoát qua Esc / browser chrome
  - Khi fullscreen: drop `aspect-ratio: 16/9` + `width` cap → stage fills 100vw × 100vh (tránh letterbox kép)
  - Button nằm OUTSIDE `pointer-events-none` HUD overlay để click register
  - Tooltip + aria-label tiếng Việt: "Toàn màn hình" / "Thu nhỏ (Esc)"
- Iframe `allow="fullscreen"` policy đã có sẵn → Unity canvas cũng có thể request fullscreen nội bộ nếu scene script gọi
- Tests: typecheck PASS · không thêm unit test (component render logic)

### 🎨 Brand rename → GVD next-gen LMS (22/04/2026 cuối ngày)

- Rename 30 user-visible strings từ "GVD simvana" → "GVD next-gen LMS". Tên mới nhấn mạnh vị thế LMS thế hệ mới với AI + 3D simulation.
- Scope: frontend (page titles, sidebars, auth pages, certificate print, manifest) + backend (email templates, cert institution, Gemini system prompt, Excel workbook creator, seed defaults) + config (`.env.production.example` SMTP_FROM)
- Technical identifiers giữ nguyên: `@lms/*` packages · `lms-uploads` bucket · `LMS_*` env vars · docker container names · DB column names
- DB: `SystemSetting.org.name` + `smtp.from` cần SQL update runtime (existing rows không đổi theo seed, xem `scripts/` hoặc dùng UI `/admin/settings`)
- Split span pattern `<span className="text-secondary">simvana</span>` → `<span className="text-secondary">next-gen LMS</span>` (giữ nguyên màu nhấn violet cho phần tên)
- Documents cũ (`GVD_Simvana_Catalogue_2026_*.pptx`, `Huong_Dan_*.docx`): giữ nguyên filename (historical artifacts, untracked)

### 🩹 WebGL iframe 16:9 (22/04/2026 tối) — v1.0.4

- **Feature**: Student WebGL iframe giờ khoá tỉ lệ **16:9** đúng với native Unity render target `1920×1080` thay vì stretch theo viewport height. Commit `69b2b8c`
- Layout mới: outer stage full-width dark backdrop → flex-centre inner frame với `aspect-ratio: 16 / 9` + `width: min(100%, calc((100vh - 96px) * 16 / 9))` → bound cả 2 trục nên frame không tràn viewport bất kể ultrawide / portrait / 3:2 laptop
- HUD chips (điểm + timer + steps) chuyển vào INSIDE frame 16:9 → không còn float qua letterbox gutters
- Cosmetic: rounded-lg + shadow-2xl cho contrast đẹp hơn trên dark stage
- Không thay đổi LMS Bridge postMessage protocol hoặc scoring pipeline
- Frontend build OK — 36 routes

### 🩹 WebGL stuck 30% triệt để (22/04/2026 chiều muộn) — v1.0.3

**Trigger**: Sau v1.0.2, student reload vẫn stuck 30% dù `ServiceWorker.js` đã xoá khỏi MinIO.

- Root cause: Student's browser đã register SW thành công từ lần upload TRƯỚC v1.0.2 fix. **SW đã register sống mãi trong browser** cho đến khi:
  - User manual unregister trong DevTools
  - SW script thay đổi (nhưng giờ 404 → browser không update được)
  - Clear site data
  - SW cũ vẫn chạy `fetch` handler → `cache.put(response.clone())` buffer 108MB vào Cache Storage → memory pressure → Unity's XHR failed → progress bar đơ
- Fix: `patchIndexHtml()` trong extractor (commit `fbab97f`):
  1. **Strip** Unity's `navigator.serviceWorker.register("ServiceWorker.js")` block khỏi `<script>` trong `index.html`
  2. **Inject cleanup script** ở top `<body>` — mỗi lần page load, script tự unregister mọi SW + purge Cache Storage ở origin
  3. Idempotent — cleanup chạy lại sau khi SW đã bị xoá là no-op
  4. Regex tolerant single/double quotes, có fallback inject khi không match (Unity thay đổi template giữa các version)
- Retroactive fix: `scripts/patch-webgl-index.mjs <lessonId>` — one-shot node script patch `index.html` hiện tại trong MinIO cho lesson đã upload trước v1.0.2 mà không cần instructor re-upload
- Tests: +6 (patchIndexHtml matrix: strip / inject / preserve Unity config / idempotence / single-quote tolerance / fallback injection)

**Tổng kết v1.0.3 + v1.0.4**:

- **441/441 backend tests PASS** (47 suites, +6 từ v1.0.2 baseline 435)
- 2 commits: `fbab97f` (SW cleanup patch) + `69b2b8c` (16:9 iframe)
- Tag `v1.0.3` + `v1.0.4` push `origin` OK
- Student mở lesson cũ: chỉ cần F12 → Application → Service Workers → Unregister + Clear site data + hard refresh (CHỈ 1 LẦN) → Unity load 100% đúng 16:9

### 🩹 WebGL hotfix session (22/04/2026) — v1.0.2

**Trigger**: Instructor upload `WebGL_Ver02.zip` (115MB, Unity 2022 PWA build, zipped on Mac) → 2 bug lộ ra theo thứ tự:

**Fix 1 — Mac-zipped build `__MACOSX/` junk** (`dc947d2`):

- Root cause: file zip trên Mac chứa `__MACOSX/` + `.DS_Store` + `._*` (AppleDouble) sidecar → zip có 2 top-level folders (`WebGL/` + `__MACOSX/`) → `stripCommonPrefix()` fail điều kiện `allShare` → return paths unchanged → files lên MinIO với prefix `{lessonId}/WebGL/*` thay vì `{lessonId}/*` → frontend predict URL `{lessonId}/index.html` → **iframe student 404**
- Fix: thêm `filterJunkPaths()` trong `webgl-validator.ts` lọc `__MACOSX/**`, `.DS_Store`, basename starting `._`, `Thumbs.db`, `desktop.ini` (case-insensitive) TRƯỚC khi chạy `stripCommonPrefix`
- Apply ở cả `summariseWebGLZip()` (pre-flight) và `webgl-extract.processor.ts` (worker) → validator + extractor agree on "what's at root"
- Tests: +6 (regression Mac-zipped build + filterJunkPaths matrix 5 cases)

**Fix 2 — Unity PWA ServiceWorker 30% stuck** (`b721105`):

- Root cause: Unity 2022+ với "Enable PWA" option sinh `ServiceWorker.js` có `cache.addAll(['WebGL.loader.js', 'WebGL.framework.js.gz', 'WebGL.data.gz', 'WebGL.wasm.gz', 'style.css'])` — pre-cache toàn bộ ~117MB trong install event. Student iframe register SW → browser download mọi file 2 LẦN ĐỒNG THỜI: 1 cho Unity loader boot, 1 cho SW cache. Bandwidth/memory tranh nhau trên cùng origin (MinIO) → Unity's progress **stall ở ~30%** khi đang pull `.data.gz` (104MB)
- Phát hiện: instructor preview 400×300 nên memory đủ + test nhanh xong, student view full viewport 1920×1080 + first-time fresh → stuck
- Fix: extractor skip `ServiceWorker.js` + `manifest.webmanifest` khi upload → `navigator.serviceWorker.register("ServiceWorker.js")` trong index.html 404 gracefully (Promise reject silently, không `.catch`) → Unity loader độc chiếm bandwidth → load OK
- PWA không cần thiết cho LMS (bài học load qua authenticated route, không install như PWA app)
- Không có file modification — index.html giữ nguyên, chỉ 2 artifacts bị skip ở extractor

**Tổng kết v1.0.2**:

- **435/435 backend tests PASS** (+6 so với v1.0.1 baseline 429)
- 2 commits: `dc947d2` (Mac junk) + `b721105` (Unity PWA)
- Tag `v1.0.2` + push `origin/v1.0.2`
- Existing lesson `cmo9s73ez000pau9mpi89cx1r`: đã xoá thủ công 2 file `ServiceWorker.js` + `manifest.webmanifest` trong MinIO → student hard-refresh test được ngay (Ctrl+Shift+R + unregister SW cũ trong DevTools)
- Lesson upload mới: tự động skip cả junk + PWA artifacts

### 🩹 Session wrap-up (22/04/2026) — v1.0.1

- Commit `abaabc1` — **feat(webgl): allow instructor to delete uploaded WebGL file** (endpoint + service + instructor button + student guard + `WEBGL_DELETED` audit)
- Tag `v1.0.1` — push `origin/v1.0.1` OK
- Docs: `CONTEXT.md` cập nhật (session fixes · endpoint mới · v1.0.1 hashtag)
- SystemSetting `org.name` + `smtp.from` → "GVD Simvana" (SQL update sau seed — runtime pickup)
- Catalogue 2026 clean Full HD: `docs/user-guides/GVD_Simvana_Catalogue_2026_Clean_FullHD.pptx` (sans-serif upright, red+white 70/30, bố cục 3-zone slide 2 không overlap)
- User guide docs 4 roles: `Huong_Dan_{Admin,Cai_Dat_He_Thong,Giang_Vien,Hoc_Vien}.docx` (untracked — review trước khi commit)

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

### Content engines (~19)

`/scorm/*` · `/xapi/*` · `/video-progress/*` · `/practice/*` · `/lessons/:id/context` · `/storage/*` (upload) · `POST /practice-contents/:lessonId/upload-webgl` · `GET /practice-contents/:lessonId/extract-status` · **`DELETE /practice-contents/:lessonId/webgl`** [INSTRUCTOR DRAFT-only | ADMIN+ override]

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

### Session 23/04 sáng — Quiz grading hotfixes v1.0.7 + v1.0.8

- **Quiz "luôn 100%" bug** (`16f7729` / v1.0.7): Frontend gửi `Number(CUID) = NaN`, backend `Set([NaN]).has(NaN) = true` (JS quirk) → SINGLE_CHOICE / TRUE_FALSE luôn đúng. Đồng thời `gradeLocally` fallback hardcode `correct: true` + không lưu DB. Fix: frontend gửi string ids, backend compare bằng string equality, **xoá fallback**. +5 regression tests.
- **Quiz DTO 400** (`e8fae59` / v1.0.8): `AnswerItem.answer: unknown` không có decorator → `whitelist: true + forbidNonWhitelisted: true` reject mọi submission với `"property answer should not exist"`. Fix: thêm `@Allow()` decorator — whitelist field, service tự validate shape. Regression bị che bởi `gradeLocally` nay lộ khi v1.0.7 xoá fallback.

### Session 22/04 cuối ngày — WebGL fullscreen + brand rename (v1.0.5 + v1.0.6)

- **Fullscreen toggle** (`1b61de3` / v1.0.6): Nút phóng to/thu nhỏ toàn màn hình cho khung thực hành ở góc dưới-phải. Core UX cho học viên quan sát thiết bị 3D trong môi trường không vướng browser chrome. Drop aspect-ratio 16:9 khi fullscreen để lấp 100vw × 100vh.

- **Brand rename → GVD next-gen LMS** (`73cd3b2` / v1.0.5): 30 user-visible strings từ "GVD simvana" → "GVD next-gen LMS" qua frontend (pages, sidebars, manifest, hero) + backend (email templates, cert institution, Gemini prompt, Excel creator, SMTP_FROM default) + seed. Technical identifiers giữ nguyên. DB SystemSetting `org.name` + `smtp.from` đã update runtime.

### Session 22/04 tối — WebGL 16:9 + SW cleanup (v1.0.3 + v1.0.4)

- **Student iframe 16:9** (`69b2b8c` / v1.0.4): Layout cũ stretch iframe theo `h-[calc(100vh-64px)]` → Unity canvas 1920×1080 bị méo trên monitor không 16:9 (ultrawide, portrait, 3:2 laptop). Fix: `aspect-ratio: 16/9` + `width: min(100%, (100vh-96px)*16/9)` → bound cả 2 trục, frame không tràn viewport. HUD chips chuyển vào trong frame 16:9.

- **Stuck 30% triệt để** (`fbab97f` / v1.0.3): v1.0.2 đã skip SW file khi upload, nhưng browser của student đã register SW từ lần upload TRƯỚC đó → SW cũ vẫn sống trong browser (SW không tự update khi script 404). SW `cache.put(response.clone())` buffer 108MB .data.gz → memory pressure → Unity XHR fail → progress đơ. Fix: `patchIndexHtml()` trong extractor (1) strip Unity's SW register block khỏi `index.html`, (2) inject cleanup script tự unregister + purge Cache Storage trên mọi page load. +6 tests. `scripts/patch-webgl-index.mjs <lessonId>` để patch lesson đã upload trước fix mà không cần re-upload.

### Session 22/04 chiều — WebGL hotfixes v1.0.2

- **WebGL Mac-zipped build fail** (`dc947d2`): file zip trên Mac chứa `__MACOSX/` + `.DS_Store` + `._*` → `stripCommonPrefix()` fail → files vào sai đường dẫn MinIO → student iframe 404. Fix: thêm `filterJunkPaths()` lọc OS junk trước khi detect common prefix. Apply cả ở validator (pre-flight) và extractor (worker). +6 tests.

- **WebGL 30% stuck — Unity PWA ServiceWorker** (`b721105`): Unity 2022+ bật PWA → `ServiceWorker.js` pre-cache 117MB qua `cache.addAll()` trong install event → tranh bandwidth với Unity loader trên cùng origin → progress bar dừng ~30% khi đang download `.data.gz` (104MB). Fix: extractor skip `ServiceWorker.js` + `manifest.webmanifest` → SW registration 404 gracefully → Unity độc chiếm bandwidth. Instructor preview 400×300 không lộ bug vì memory pressure thấp hơn + tested xong nhanh.

### Session 22/04 — Wrap-up fixes (commit `abaabc1` + predecessors)

- **WebGL delete cho instructor** (`abaabc1`): Thêm `DELETE /practice-contents/:lessonId/webgl` — giảng viên upload nhầm file giờ có thể xoá lại. Permission gates:
  - INSTRUCTOR: chỉ xoá được khi course đang `DRAFT` hoặc `PENDING_REVIEW` (tránh làm vỡ trải nghiệm học viên đang học khoá `PUBLISHED`)
  - ADMIN / SUPER_ADMIN: override mọi trạng thái (xử lý sự cố)
  - Cleanup cả cây MinIO `content/webgl/<lessonId>/*` qua `storage.deletePrefix()` (best-effort — weekly cron sẽ dọn tiếp nếu sót)
  - `PracticeContent.webglUrl = ''` (giữ row để preserve `scoringConfig` + `safetyChecklist` + `introduction` cho lần upload lại) → KHÔNG động vào FK `PracticeAttempt`
  - AuditLog action mới: `WEBGL_DELETED` với `oldValue.webglUrl` đầy đủ
  - Student guard (`practice-tab.tsx`): khi `webglUrl === ''` → hiển thị card amber "Nội dung đang được cập nhật" thay vì iframe trắng / toast muộn
  - Frontend button trong ready-state của `practice-content-editor.tsx`: `useMutation` + confirm dialog + toast + invalidate cache

- **Nút "Xem" course 404** (`09bdb43`/`f45be97`): instructor `course-card.tsx` + `courses/page.tsx` trỏ `/courses/:id` (không tồn tại) → đổi `/instructor/courses/:id/edit`

- **404 `/notifications`** (`5ea1c8d`/`271f7af`): chuông notification bell chuyển hướng `/notifications` nhưng page chưa có → thêm page `/app/(dashboard)/notifications/page.tsx` list tất cả thông báo + mark-read bulk

- **"Gửi duyệt" button sai chỗ**: trước đây nằm trong course card → chuyển sang header của `/instructor/lessons/[id]/edit` (chỉ hiện khi `course.status === DRAFT`). Thêm back-link "← Khoá học: [tên]" + badge status. Instructor muốn sửa khi đang `PENDING_REVIEW` → click "Huỷ gửi duyệt" trước.

- **Chapter/Lesson edit + move + withdraw**: fixes bundled trong các phase trước — chapter dùng inline edit trong curriculum tree, lesson có drag-reorder dnd-kit + withdraw CTA khi `PENDING_REVIEW`

- **WebGL upload stuck-on-fail** (`fde45bc`): zombie polling sau fail + file input cached value + thiếu retry CTA. Fix: clear `jobId` ở success/fail paths · `e.target.value = ''` sau onChange · nút "Thử lại" + "Chọn file khác" với `key` prop force remount

- **Curriculum delete buttons** (`fde45bc`): `/admin/curriculum` thiếu wiring nút Trash cho Course/Chapter/Lesson (backend sẵn có) → thread `onDeleteCourse/onDeleteChapter/onDeleteLesson` props qua Department → Subject → Course → Chapter → Lesson

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
