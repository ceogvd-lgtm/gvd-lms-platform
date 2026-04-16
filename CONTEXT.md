# CONTEXT.md — Dự Án LMS

Cập nhật ngày: 16/04/2026

## ĐANG LÀM

Phase 14 — Student Dashboard & Learning Experience

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
- 27 unit tests mới: 22 suites, 216/216 tests PASS | 25 routes build OK
- Known issues → Phase 14:
  - Analytics lesson picker cần GET /courses/:id/lessons
  - WebGL iframe preview TTL 7 ngày
  - Multi-tab timer không sync
- Commits: 41b1895 → 6f7063c | Xong ngày: 16/04/2026

## LƯU Ý QUAN TRỌNG

- Docker port 5433 (không phải 5432)
- docker-compose.override.yml KHÔNG commit | .env KHÔNG commit
- Sau khi sửa packages/types hoặc packages/database phải build trước
- Backend hot reload: ts-node-dev (KHÔNG dùng tsx)
- Seed SUPER_ADMIN: pnpm --filter @lms/database db:seed
- API prefix luôn là /api/v1/ (KHÔNG phải /api/)
- INSTRUCTOR: Tạo + Sửa + Lưu trữ — TUYỆT ĐỐI KHÔNG có nút Xoá
- Hydration: layout dùng useHasHydrated() trước khi check role
- TipTap body lưu JSON ProseMirror — auto-save 30s
- KHÔNG dùng curl từ Git Bash Windows để POST tiếng Việt
- Main branch đã merge đủ Phase 01-13
- Unity WebGL tên project "Builds":
  Builds.loader.js / Builds.data / Builds.framework.js / Builds.wasm
- LMS Bridge: SendMessage('LMSBridge', 'ReceiveConfig', JSON.stringify(config))
- Phase 14: cần thêm model LessonNote + Discussion + DiscussionReply + StudentXP
- Phase 14: cần implement POST /quiz-attempts (quiz grading backend thật)
- Phase 14: cần GET /lessons/:id/context (courseId, prev/next, outline)
- Phase 14: cần GET /courses/:id/lessons (fix analytics lesson picker Phase 13)
- Phase 14: Tab Hỏi đáp + nâng cấp Ghi chú lên DB

## LỆNH ĐÃ VERIFY

pnpm --filter @lms/backend test # 22 suites, 216 tests PASS
pnpm --filter @lms/frontend build # 25 routes built
