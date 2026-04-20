# CONTEXT.md — Dự Án LMS

Cập nhật ngày: 20/04/2026

## ĐÃ HOÀN THÀNH TẤT CẢ

Phase 01-18 đã merge về main + tag v1.0.0. Production ready.

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
- Silent token refresh: 401 → auto refresh → retry
- Xong ngày: 15/04/2026

### ✅ Phase 04 — RBAC & 4 Luật

- 20 routes | 23/23 unit test PASS
- INSTRUCTOR không xoá lesson | AuditService ghi log
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
- Buckets: avatars/ thumbnails/ attachments/ content/scorm/ content/video/ content/ppt/ content/webgl/ certificates/
- Commit: 5b9ed03 | Xong ngày: 15/04/2026

### ✅ Phase 07 — Email & Notification

- BullMQ emailQueue + 8 React Email templates
- Socket.io /notifications + 5 endpoints
- Commit: 93af1fa | Xong ngày: 15/04/2026

### ✅ Phase 08 — Course Structure + Token Fix

- 28 endpoints: departments/subjects/courses/chapters/lessons/enrollments
- Status FSM: DRAFT→PENDING_REVIEW→PUBLISHED→ARCHIVED
- Frontend: /admin/curriculum tree view 5 levels + slide-in panel
- Silent token refresh: 401 → auto refresh → retry
- Commit: fbc72e7 | Xong ngày: 15/04/2026

### ✅ Phase 09 — Admin Dashboard

- Database: thêm model SystemSetting, migration 20260415120000
- ~30 endpoints mới + 6 unit tests (9 suites, 95 tests PASS)
- 5 trang admin mới + 2 migrate
- Commit: 1ac1292 | Xong ngày: 16/04/2026

### ✅ Phase 10 — Instructor Dashboard

- Database: thêm field body Json? vào TheoryContent, migration 20260416120000
- ~14 endpoints mới + 4 unit tests (13 suites, 128 tests PASS)
- 5 trang instructor mới + TipTap + Wizard 4 bước
- practice-contents module: GET + PUT upsert (ĐÃ CÓ)
- Commit: 08632e9 | Xong ngày: 16/04/2026

### ✅ Phase 11 — Question Bank System

- questions module (7 endpoints) + quizzes module (8 endpoints)
- 26 unit tests mới: 15 suites, 154/154 tests PASS
- Pages: /instructor/questions | /instructor/lessons/:id/quiz
- Commits: 915a59f → be4ff17 | Xong ngày: 16/04/2026

### ✅ Phase 12 — Theory Lesson Engine

- SCORM/xAPI/Video/PPT + VideoProgress + LessonAttachment
- 18 endpoints mới: scorm/ xapi/ video/ lessons/:id/\*
- Modules mới: scorm/ xapi/ video-progress/
- Pages: /student/lessons/[id] (mới) | /instructor/lessons/:id/edit (mở rộng)
- 34 unit tests mới: 19 suites, 188/188 tests PASS | 25 routes build OK
- Bug fix: PPT convert 500 → 404 khi sourceKey không tồn tại
- Commits: 2067dc5 → 81da453 | Merge: 14d4380
- Xong ngày: 16/04/2026

### ✅ Phase 13 — Virtual Lab Engine (Unity WebGL)

- PracticeContent: upload WebGL .zip + extract async (BullMQ) + verify Builds.loader.js
- Practice lifecycle: start → action → complete + scoring engine
- Scoring: isInOrder ×1.10 | critical violation −20% | mandatory skip = 0 | clamp ≥ 0
- LMS Bridge: SendMessage('LMSBridge', 'ReceiveConfig') + postMessage listener
- 7 endpoints mới: /practice/\* + /practice-contents/:id/upload-webgl
- Instructor: tab Thực hành ảo trong /instructor/lessons/:id/edit
- Student: tab Thực hành ảo trong /student/lessons/[id] (pre-lab/run/post-lab)
- Analytics: tab Thực hành ảo trong /instructor/analytics
- 27 unit tests mới: 22 suites, 221/221 tests PASS | 26 routes build OK
- Session fixes (17/04):
  - Google OAuth callback + /auth/me endpoint
  - Logout flow sidebar + header + dashboard layout auth guard
  - Dark mode default + student menu "Sắp có"
  - WebGL extract Windows race condition
  - SCORM same-origin proxy + public bucket
  - Unity .gz Content-Encoding headers
  - GET /lessons/:id/context (sidebar outline + prev/next)
  - Split /practice/:id/my-attempts vs /attempts
  - Nút "Gửi duyệt" trên Draft course card
  - Nút "Upload nội dung" shortcut wizard step 4
  - Xoá placeholder Step 3 "Cài đặt" wizard
  - /student/dashboard stub (enrollments list)
  - seed-demo.ts script idempotent
  - fix(storage): content/video thêm vào PUBLIC_PREFIXES
- Commits: 41b1895 → 3f06d3b | Xong ngày: 17/04/2026

### ✅ Phase 14 — Student Dashboard & Learning Experience

- Database: +4 models (LessonNote, Discussion, DiscussionReply, StudentXP)
  migration 20260417101840
- 15 endpoints mới:
  - POST/GET /quiz-attempts (grading thật server-side)
  - GET/PUT /lessons/:id/notes (DB sync)
  - GET/POST /lessons/:id/discussions + replies + delete
  - GET /students/dashboard + streak + my-learning + progress + xp
  - GET /students/certificates + /students/certificates/:id
  - GET /courses/:id/lessons (fix analytics lesson picker)
  - GET /lessons/:id/mentionable (@mention dropdown)
- Modules mới: quiz-attempts/ discussions/ lesson-notes/ students/
- XP auto-award: +10 lesson · +20 quiz first pass · +100 course complete
- +XP Trophy popup animation (CSS keyframe)
- Pages mới: /student/my-learning + /student/progress + /student/certificates/:id/print
- Pages mở rộng: /student/dashboard (6 rows đầy đủ)
- Tabs mở rộng trong /student/lessons/[id]:
  - Tab Ghi chú: localStorage → DB sync + offline fallback
  - Tab Hỏi đáp: threads + replies + @mention + real-time Socket.io
  - Quiz: grading thật thay auto-pass
- Mobile: swipe prev/next (react-swipeable) + bottom nav 56px
- PWA stub: /public/manifest.json + layout meta
- 6 gaps đã đóng sau audit:
  - Dashboard Row 6 Notifications
  - Real-time discussions Socket.io
  - Certificates gallery /student/progress Row 6
  - @mention dropdown MentionComposer
  - Mobile swipe gesture
  - XP popup Trophy animation
- 27 suites / 243 tests PASS | 29 routes build OK
- Commits: b463156 → ec025e9 | Merge: 7efaa77
- Xong ngày: 17/04/2026

### ✅ Phase 15 — Progress Tracking & Analytics

- Database: +progressPercent Int @default(0) + lastActiveAt DateTime vào CourseEnrollment
  +hasCriticalViolation Boolean @default(false) vào PracticeAttempt
  migration 20260418052800
- Progress Module (4 endpoints):
  - GET /progress/student/:id/courses
  - GET /progress/student/:id/course/:cid
  - GET /progress/course/:id/students
  - GET /progress/analytics/at-risk?courseId=
  - calculateCourseProgress engine (auto-trigger khi lesson COMPLETED)
- Analytics Module (7 endpoints):
  - GET /analytics/department/:id
  - GET /analytics/cohort
  - GET /analytics/system
  - GET /analytics/lesson-difficulty
  - GET /analytics/heatmap
  - GET /analytics/export?type=&format=xlsx|pdf
  - POST /analytics/schedule-report
- At-risk detection 4 điều kiện:
  - SLOW_START: progress <30% sau ≥7 ngày enrolled
  - INACTIVE: lastActiveAt >5 ngày
  - LOW_SCORE: avg quiz <50% sau ≥3 bài
  - SAFETY_VIOLATION: practice có hasCriticalViolation=true
  - Side effects: notification instructor + email học viên + AT_RISK_DETECTED audit
- Frontend mới:
  - activity-heatmap.tsx (7×24 GitHub-style + tooltip)
  - cohort-chart.tsx (Recharts LineChart 6-color)
  - lesson-difficulty-panel.tsx (đỏ/vàng/xanh threshold)
  - export-panel.tsx (spinner + auto-download)
- Pages mở rộng:
  - /instructor/analytics → tab "Phân tích nâng cao"
  - /admin/reports → tab "Phân tích hệ thống"
- Post-verify fixes:
  - avgScore clamp 0-100% (score/maxScore per attempt, mixed maxScore)
  - failRate per-row percent đúng
  - eslint import/internal-regex fix
- At-risk test: 9/9 PASS (4 điều kiện + healthy + side effects + restore)
- 30 suites / 272 tests PASS | 30 routes build OK
- Commits: 0fc1582 → 4147b31 | Merge: b05da19
- Xong ngày: 18/04/2026

### ✅ Phase 16 — Certificate System

- Database: +CertificateCriteria model + grade/finalScore/pdfUrl vào Certificate
  migration 20260418080730
- 8 endpoints mới:
  - GET/PUT/DELETE /certificates/criteria/:courseId
  - POST /certificates/check/:courseId (auto-issue trigger)
  - POST /certificates/issue-manual [ADMIN+]
  - GET /certificates/:id/download (presigned PDF URL)
  - GET /certificates/verify/:code [PUBLIC]
  - Hook: lessons.completeForStudent → auto-issue
- Auto-issue engine:
  - 5 điều kiện: progress/score/practice/safety/requiredLessons
  - Grade: Xuất sắc ≥90% | Giỏi ≥80% | Đạt ≥70%
  - PDF pdfmake A4 landscape + QR code → MinIO certificates/
  - Email template + notification + audit log
- Phase 15 backlog wrapped:
  - BullMQ repeat daily 8AM (CRON_QUEUE + cron.processor)
  - SystemSetting persist subscribers (analytics.reportSubscribers)
  - Mailpit Docker (SMTP :1025 | UI :8025)
- Pages mới:
  - /verify/[code] (PUBLIC SSR + SEO + LinkedIn share)
  - /instructor/courses/:id/certificate (criteria config 6 sliders)
- Pages mở rộng:
  - /admin/certificates (download PDF + manual issue)
  - /student/progress (cert gallery + LinkedIn share)
- Verification: 290/290 unit + 26/26 integration + 18/18 regression PASS
- 31 suites / 290 tests PASS | 31 routes build OK
- Commits: 2eba9cb | Merge: 13cdc09
- Xong ngày: 18/04/2026

### ✅ Phase 17 — AI Learning Assistant (Gemini)

- Database: +4 models (AiRecommendation, AiChatMessage, AiQuotaLog, AiSuggestedQuestions)
  migration 20260418120000
- 7 endpoints mới:
  - POST /ai/chat [AUTH, STUDENT+] → SSE streaming
  - GET /ai/suggestions/:lessonId [AUTH]
  - GET /ai/recommendations [AUTH, STUDENT+]
  - PATCH /ai/recommendations/:id/read [AUTH, STUDENT+]
  - POST /ai/index-lesson [INSTRUCTOR own / ADMIN+]
  - PATCH /ai/chat/:messageId/rating [AUTH]
  - GET /ai/health [ADMIN+]
- Models Gemini đang dùng:
  - gemini-2.5-flash → chat chính (đã verify hoạt động)
  - gemini-flash-lite-latest → recommendations + weekly report
  - gemini-embedding-001 → RAG embeddings (Phase 18 fix, 004 đã retired)
  - KHÔNG dùng gemini-2.0-flash (429) hoặc gemini-1.5-flash (404 retired)
- RAG Pipeline: ChromaDB + Gemini embeddings
- Adaptive Learning: BullMQ daily 1AM + Weekly report Monday 8AM
- Rate limit: GEMINI_QUEUE max 10 req/phút | AiQuotaLog track 1500/ngày
- 34 suites / 319 tests PASS | 31 routes build OK
- Xong ngày: 18/04/2026

### ✅ Phase 18 — Phần A: Testing + Performance + Deploy (20/04/2026)

**Baseline trước Phase 18**: 44 suites / 412 tests PASS (đã bao gồm auto-enroll commit 000020d)

**ĐỢT 1 — Integration + E2E Tests**:

- Integration tests: 3 suites / 49 tests PASS
  - auth.integration.spec.ts (13): register → login → 2FA → refresh → logout + brute-force
  - course.integration.spec.ts (20): APPROVE auto-enroll hook + student self-enroll + quiz grading + WITHDRAW
  - ai.integration.spec.ts (16): RAG splitText + retrieve fallback + quota + chat SSE
- E2E tests Playwright: 14 tests PASS
  - smoke.spec.ts (2): login page + verify page
  - student-learning.spec.ts (2): dashboard shell + login validation
  - quiz.spec.ts (2): lesson mount + grade check
  - certificate.spec.ts (2): valid code + not-found
  - admin.spec.ts (2): dashboard + users list
  - instructor.spec.ts (2): dashboard + courses list
  - responsive.spec.ts (2): iPhone 12 viewport + verify mobile
- Helpers: test/integration/helpers/{prisma-stub, in-memory-redis, test-auth-app}
- Scripts mới: `test:integration` + `test:e2e` + `test:e2e:ui`

**ĐỢT 2 — Security + Performance**:

- Security tests: 1 suite / 19 tests PASS
  - SQL injection (Prisma escape), XSS (storage), IDOR (JWT scope check),
    JWT tampering, brute-force lockout, RolesGuard (6 cases), file upload mime
- Script mới: `test:security`
- DB indexes: migration 20260420080000_phase18_perf_indexes
  - `users(departmentId, role)` — auto-enroll sweeps
  - `quiz_attempts(studentId, quizId)` — my attempts lookup
  - `course_enrollments(studentId, courseId)` — my courses list
  - `lesson_progress(studentId, lessonId)` — calculateCourseProgress
  - `ai_chat_messages(studentId, createdAt)` — chat history pagination
- Redis caching — common/cache/{cache.service, cache.module}
  - DepartmentsService.list(): TTL 1h + invalidate on create/update/remove
  - SubjectsService.list(): TTL 1h + invalidate on create/update/remove
  - Namespace-scoped invalidateNamespace() via SCAN (non-blocking)
  - CacheService spec: 5 tests PASS
- Next.js optimization — next.config.mjs
  - `output: 'standalone'` gated trên NEXT_STANDALONE=1 (Windows symlink perm workaround)
  - `compress: true` + `poweredByHeader: false`
  - `images.remotePatterns` cho MinIO + Google avatar
  - Lazy dynamic import: AiChatWidget, ActivityHeatmap, CohortChart (ssr: false)
- Health check mở rộng: GET /api/v1/health
  - Trả về `{status, version, uptime, timestamp, services, metrics}`
  - Probe: database, redis, minio, chromadb, gemini (quota_warning @1400)
  - Metrics: dbResponseMs, redisResponseMs, pendingJobs (BullMQ)
  - 2s timeout per probe, overall: ok/degraded/down
  - app.controller.spec: +3 tests

**ĐỢT 3 — Docker Production + CI/CD + Backup**:

- docker/docker-compose.prod.yml — 7 services
  - postgres:16-alpine + healthcheck pg_isready
  - redis:7-alpine + maxmemory 256mb allkeys-lru + AOF + password
  - minio:latest + healthcheck
  - chromadb:latest + healthcheck heartbeat v2
  - backend: Dockerfile.prod (multi-stage non-root) + /health probe
  - frontend: Dockerfile.prod (standalone non-root) + HEAD probe
  - nginx:1.27-alpine + SSL + rate limit + gzip
  - Networks: internal (backend↔services) + public (nginx only)
- apps/backend/Dockerfile.prod — multi-stage deps/builder/runner, user `nestjs`
- apps/frontend/Dockerfile.prod — multi-stage standalone, user `nextjs`
- docker/nginx/nginx.prod.conf
  - HTTP→HTTPS redirect + /.well-known/acme-challenge
  - SSL TLSv1.2+1.3 + HSTS + security headers
  - Rate limit: /api/v1/auth/ 10r/m | /api/ 30r/m
  - SSE pass-through: /api/v1/ai/(chat|stream) no buffer
  - Socket.io upgrade: /socket.io/
  - Gzip 20+ MIME types + /\_next/static 1y immutable cache
  - Liveness /healthz on :80
- .github/workflows/ci.yml — lint + typecheck + test (unit + integration + security) + build + e2e
- .github/workflows/deploy.yml — GHCR push (Dockerfile.prod) + tag v*.*.\* deploy placeholder
- scripts/backup.sh — pg_dump daily 2AM + 30d rotation + optional S3
- scripts/restore.sh — safe restore with confirm prompt + sanity check
- scripts/deploy.sh — one-shot deploy on VPS (first-run seeds admin)
- .env.production.example — tất cả vars với comment + secret-gen hints

**Tổng kết test cuối Phase 18 Phần A**:

- Unit tests: **45 suites / 420 tests PASS** (+8 từ baseline: 5 cache + 3 health)
- Integration tests: **3 suites / 49 tests PASS**
- Security tests: **1 suite / 19 tests PASS**
- E2E tests: **14 tests PASS** (Playwright chromium + mobile-iphone12 viewport)
- Frontend build: **35 routes built OK**
- **Tổng: 502/502 automated tests PASS**

- Commit: f8a3ae6 | Merge: b5c3593 | Tag: **v1.0.0**
- Push: origin/main + origin/v1.0.0 OK
- Xong ngày: 20/04/2026

## LƯU Ý QUAN TRỌNG

- Docker port 5433 (không phải 5432)
- docker-compose.override.yml KHÔNG commit | .env KHÔNG commit
- Sau khi sửa packages/types hoặc packages/database phải build trước
- Backend hot reload: ts-node-dev (KHÔNG dùng tsx)
- Seed SUPER_ADMIN: pnpm --filter @lms/database db:seed
- Seed demo data: pnpm --filter @lms/database exec tsx prisma/seed-demo.ts
- API prefix luôn là /api/v1/ (KHÔNG phải /api/)
- INSTRUCTOR: Tạo + Sửa + Lưu trữ — TUYỆT ĐỐI KHÔNG có nút Xoá
- Hydration: layout dùng useHasHydrated() trước khi check role
- TipTap body lưu JSON ProseMirror — auto-save 30s
- KHÔNG dùng curl từ Git Bash Windows để POST tiếng Việt
- Main branch đã merge đủ Phase 01-17
- Unity WebGL tên project "Builds":
  Builds.loader.js / Builds.data / Builds.framework.js / Builds.wasm
- LMS Bridge: SendMessage('LMSBridge', 'ReceiveConfig', JSON.stringify(config))
- GET /lessons/:id/context ĐÃ CÓ → sidebar outline + prev/next hoạt động
- content/video ĐÃ thêm PUBLIC_PREFIXES → video không cần presigned URL
- Google OAuth ĐÃ CÓ: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET trong .env
- ceo.gvd@gmail.com = SUPER_ADMIN trong DB
- Quiz grading thật từ Phase 14 (KHÔNG còn auto-pass)
- 10 câu hỏi ATVSLĐ đã import vào ngân hàng + gắn quiz "Bài 1: PPE cơ bản"
- lessonId "Bài 1: PPE cơ bản": cmnzujyxm000aepnnolixisst
- avgScore trong analytics đã scale 0-100% (clamp per attempt)
- Audit log endpoint: /api/v1/admin/audit-logs (có chữ s)
- At-risk test script: node scripts/phase15-seed-at-risk.js [slow|inactive|low|safety|all|restore]
- Mailpit: SMTP localhost:1025 | UI http://localhost:8025
- /verify/:code là PUBLIC page (không cần auth)
- Auto-issue cert: trigger sau lesson complete + quiz pass + practice pass
- Grade: Xuất sắc ≥90% | Giỏi ≥80% | Đạt ≥70%
- BullMQ cron at-risk-daily: pattern 0 8 \* \* \* (đã active)
- Certificate PDF: certificates/{certId}.pdf trong MinIO
- GEMINI_API_KEY đã có trong .env | Model: gemini-2.5-flash
- GEMINI_MODEL=gemini-2.5-flash | GEMINI_MODEL_LITE=gemini-flash-lite-latest
- GEMINI_MODEL_EMBEDDING=text-embedding-004
- ChromaDB: localhost:8000 | API v2 (/api/v2/) | Collection: lms_docs
- AI quota: 1500 req/ngày free tier | Track qua AiQuotaLog
- Phase 18: VPS Hetzner CX22 Ubuntu 22.04 | Domain: gvdsoft.com.vn
- Phase 18: Docker production + SSL Let's Encrypt + CI/CD
- 31 routes hiện tại
- Role-based redirect: Admin→/admin/dashboard | Instructor→/instructor/dashboard | Student→/student/dashboard
- /dashboard tự redirect theo role (homeForRole helper tại apps/frontend/src/lib/auth-redirect.ts)
- Không còn "Sắp có" với Admin + Instructor (shared dashboard chỉ còn là fallback)

## LỆNH ĐÃ VERIFY (Phase 18 Phần A baseline)

```bash
pnpm --filter @lms/backend test                 # 45 suites, 420 tests PASS
pnpm --filter @lms/backend test:integration     # 3 suites, 49 tests PASS
pnpm --filter @lms/backend test:security        # 1 suite, 19 tests PASS
pnpm --filter @lms/frontend build               # 35 routes built OK
pnpm --filter @lms/frontend test:e2e            # 14 E2E tests PASS
pnpm --filter @lms/database exec tsx prisma/seed-demo.ts  # seed demo data
```

## DEPLOY PRODUCTION

```bash
# Trên VPS (Ubuntu 22.04):
cp .env.production.example .env.production
# Điền secrets (openssl rand -base64 64 cho JWT_SECRET, REFRESH_TOKEN_SECRET)
./scripts/deploy.sh --first-run      # Seeds SUPER_ADMIN lần đầu
./scripts/deploy.sh                  # Rolling update về sau
./scripts/backup.sh                  # Daily dump (cron 2AM)
```
