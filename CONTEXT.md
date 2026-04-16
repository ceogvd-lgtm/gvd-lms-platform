# CONTEXT.md — Dự Án LMS

Cập nhật ngày: 16/04/2026

## ĐANG LÀM

Phase 14 — (TBD)

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
- Silent token refresh: 401 → auto refresh → retry (race condition safe)
- Commit: fbc72e7 | Xong ngày: 15/04/2026

### ✅ Phase 09 — Admin Dashboard

- Database: thêm model SystemSetting (key-value), migration 20260415120000
- Backend modules mới (~30 endpoints):
  - admin/dashboard — 6 endpoints (kpi, registrations, top-courses, role-distribution, activity-feed, alerts)
  - admin/content — 7 endpoints moderation (list, approve, reject, delete, impact, flag)
  - certificates — 5 endpoints (list, detail, revoke, stats, pass-rate)
  - reports — 4 endpoints (progress JSON + export PDF/XLSX)
  - system-settings — 6 endpoints (getAll, update, testSmtp, backup stub)
  - admin.service extend: bulk-block, user detail, export CSV/XLSX, filter status
- Backend exporters: pdfmake (Roboto Unicode VN) + exceljs
- 6 unit test mới — tất cả PASS (9 suites, 95 tests)
- 5 trang admin mới: /admin/dashboard /content /certificates /reports /settings
- 2 trang migrate: /admin/users /admin/audit-log (DataTable server-side)
- 4 Luật enforcement: backend AdminRulesService.check() + frontend UserActionButton
- Commit: 1ac1292 | Xong ngày: 16/04/2026

### ✅ Phase 10 — Instructor Dashboard

- Database: thêm field body Json? vào TheoryContent, migration 20260416120000
- Backend modules mới (~14 endpoints):
  - instructor/dashboard — 4 endpoints
  - instructor/analytics — 4 endpoints
  - theory-contents — 3 endpoints (GET, PUT upsert, PATCH body auto-save)
  - practice-contents — 2 endpoints
- 4 unit test mới — tất cả PASS (13 suites, 128 tests)
- TipTap: 7 packages cài
- 5 trang instructor mới: /instructor/dashboard /courses /courses/new /lessons/:id/edit /analytics
- Wizard 4 bước tạo khoá học + dnd-kit
- INSTRUCTOR pages KHÔNG có nút Xoá bất kỳ đâu
- Commit: 08632e9 | Xong ngày: 16/04/2026

### ✅ Phase 11 — Question Bank System

- Shared types: packages/types/src/assessment.types.ts
- Backend questions module — 7 endpoints
- Backend quizzes module — 8 endpoints
- 26 unit tests mới: 15 suites, 154/154 tests PASS
- Frontend xlsx@^0.18.5 (SheetJS) đã cài
- Page /instructor/questions: toolbar + filter + QuestionEditorModal + ExcelImportModal
- Page /instructor/lessons/:id/quiz: Quiz Builder 3 cột + dnd-kit + QuizPreviewModal
- 24 routes build OK
- Commits: 915a59f → 59a653c → 5da2a2f → be4ff17
- Main branch merge: c0d9156
- Xong ngày: 16/04/2026

### ✅ Phase 12 — Theory Lesson Engine

- SCORM 1.2/2004: upload + extract + track progress
- xAPI LRS: nhận statements + parse verb + sync progress
- Video Player: custom HTML5 + resume + completion tracking
- PPT Convert: LibreOffice fallback → "Đang xử lý slides..."
- VideoProgress: upsert mỗi 10 giây, threshold 80%
- LessonAttachment: upload/delete multiple PDF
- 18 endpoints mới: /scorm/_ /xapi/_ /video/_ /lessons/:id/_
- Modules mới: scorm/ xapi/ video-progress/
- Pages: /student/lessons/[id] (mới) | /instructor/lessons/:id/edit (mở rộng)
- 34 unit tests mới: 19 suites, 188/188 tests PASS | 25 routes build OK
- Bug fix: PPT convert 500 → 404 khi sourceKey không tồn tại
- Known issues → Phase 13:
  - Quiz grading tạm client-side (auto-pass) → cần POST /quiz-attempts backend
  - Course outline sidebar tạm empty → cần GET /lessons/:id trả courseId
  - LibreOffice chưa add vào docker-compose.dev.yml
  - Bottom nav prev/next disabled → cần course-context endpoint
- Commits: 2067dc5 → 41d3ff2 → ba297f2 → 5408f30 → 81da453 | Merge: 14d4380
- Xong ngày: 16/04/2026

### ✅ Phase 13 — Virtual Lab Engine (Unity WebGL)

- **Branch**: `claude/phase-13` — 4 commits: 41b1895 → a3958a2 → ed1f52e → (P13.4 pending)
- **Backend new `practice` module — 5 endpoints**:
  - POST `/practice/start` — create IN_PROGRESS PracticeAttempt, enforce maxAttempts (403 when hit), returns scoringConfig + safetyChecklist + timeLimit
  - POST `/practice/action` — append event to attempt.actions[] (fire-and-forget)
  - POST `/practice/complete` — run pure scoring engine, cascade LessonProgress = COMPLETED on pass
  - GET `/practice/:lessonId/attempts` — STUDENT own / INSTRUCTOR owner + ADMIN+ see all
  - GET `/practice/:lessonId/analytics` — INSTRUCTOR+ heat-map / safety stats / top-50 ranking
- **Backend extended `practice-contents` module**:
  - POST `/practice-contents/:lessonId/upload-webgl` — pre-flight peek zip (reject 400 "thiếu Builds.loader.js / index.html"), stage raw → enqueue Phase-06 WebglExtractProcessor, predict served URL
  - GET `/practice-contents/:lessonId/extract-status?jobId=` — poll BullMQ state (waiting/active/completed/failed + progress 0-100)
- **Pure scoring engine** (`scoring-engine.ts`):
  - isCorrect + isInOrder → ×1.10 bonus
  - mandatory step skipped → 0 points (still in maxScore)
  - optional step skipped → not counted either side
  - critical violation → −20% base per occurrence
  - final clamped at 0; pass when finalScore/maxScore ≥ passScore
- **28 unit tests mới**: scoring-engine (13) + practice.service (8) + webgl-validator (7). Tổng **22 suites, 216/216 tests PASS**.
- **Dependencies thêm**: `xml2js`, `archiver` (dev) — backend
- **Instructor page mở rộng `/instructor/lessons/:id/edit`**: tab "Thực hành ảo" giờ là `PracticeContentEditor` hoàn chỉnh
  - TipTap introduction + live objectives list
  - `WebGLUploadPanel` — drag-drop .zip, 400 pre-flight errors surface đỏ, BullMQ extract polling 2s, preview iframe 400×300
  - `ScoringConfigBuilder` — Steps với dnd-kit reorder (stepId / desc / maxPoints / isMandatory), SafetyChecklist critical toggle
  - Pass score slider, time limit, max attempts
- **Student page `/student/lessons/:id`** — tab "Thực hành ảo" mới với 3-phase state machine:
  - **Pre-lab**: intro + objectives + safety rules (đỏ, critical chip), info strip, attempt history, CTA
  - **Running**: iframe WebGL + LMS Bridge (SendMessage LMSBridge ReceiveConfig → postMessage fallback), HUD overlay (timer/score/progress), SafetyViolationPopup đỏ với 3s delay
  - **Post-lab**: giant % badge, per-step timeline, critical violation card, duration, class-avg bar, retry / back
- **/instructor/analytics** — thêm tab "Thực hành ảo" (`PracticeAnalyticsView`): lesson picker + KPI strip + step heat-map + safety violation stats + top-50 ranking + student timeline drill-down
- **LMS Bridge convention**:
  - LMS → Unity: `unityInstance.SendMessage('LMSBridge', 'ReceiveConfig', JSON.stringify(config))`
  - Unity → LMS: `window.parent.postMessage({ type: 'LMS_ACTION', payload }, '*')` + `{ type: 'LMS_COMPLETE', payload }`
- **25 routes build OK** (same count as Phase 12 — tab additions don't add routes)
- Xong ngày: 16/04/2026

## LƯU Ý QUAN TRỌNG

- Docker port 5433 (không phải 5432)
- docker-compose.override.yml KHÔNG commit | .env KHÔNG commit
- Sau khi sửa packages/types hoặc packages/database phải build trước
- Backend hot reload: ts-node-dev (KHÔNG dùng tsx)
- Seed SUPER_ADMIN: pnpm --filter @lms/database db:seed
- API prefix luôn là /api/v1/ (không phải /api/)
- Silent token refresh đã implement trong lib/api.ts
- DataTable từ @lms/ui dùng TanStack Table v8
- pdfmake render với font Roboto (Unicode VN hoạt động tốt)
- INSTRUCTOR: Tạo + Sửa + Lưu trữ — TUYỆT ĐỐI KHÔNG có nút Xoá
- Hydration: layout admin/instructor dùng useHasHydrated() trước khi check role
- TipTap body lưu JSON ProseMirror trong TheoryContent.body — auto-save 30s
- Question Bank: INSTRUCTOR chỉ thấy câu hỏi mình tạo; ADMIN+ thấy tất cả
- Excel import/export dùng SheetJS ở frontend
- FILL_BLANK chấm case-insensitive + trim
- KHÔNG dùng curl từ Git Bash Windows để POST tiếng Việt
- Main branch đã merge đủ Phase 01-12 (commit: 14d4380)
- Phase 13: Unity WebGL tên project "Builds"
  (Builds.loader.js / Builds.data / Builds.framework.js / Builds.wasm)
- Phase 13: LMS Bridge dùng SendMessage('LMSBridge', ...) cho Unity
- Phase 13: Cần implement POST /quiz-attempts (quiz grading backend)
- Phase 13: Cần add LibreOffice vào docker-compose.dev.yml
- Phase 13: Course outline sidebar cần GET /lessons/:id trả courseId
- Phase 13: PracticeContent model ĐÃ CÓ trong schema → dùng luôn
- Phase 13: MinIO bucket content/webgl/ ĐÃ CÓ từ Phase 06 → không setup lại

## LỆNH ĐÃ VERIFY

```bash
pnpm --filter @lms/database db:migrate
pnpm --filter @lms/database db:seed
pnpm --filter @lms/backend test        # 19 suites, 188 tests PASS
pnpm --filter @lms/frontend build      # 25 routes built
```
