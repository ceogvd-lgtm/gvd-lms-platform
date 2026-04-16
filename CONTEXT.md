# CONTEXT.md — Dự Án LMS

Cập nhật ngày: 16/04/2026

## ĐANG LÀM

Phase 12 — (TBD)

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
- **Hydration fix**: `useHasHydrated()` hook (lib/auth-store.ts) — dùng cho admin/instructor layout để tránh redirect-flash khi reload
- Commit: 1ac1292 | Xong ngày: 16/04/2026

### ✅ Phase 10 — Instructor Dashboard

- **Database**: thêm field `body Json?` vào TheoryContent (TipTap JSON ProseMirror), migration 20260416120000
- **Backend modules mới** (~14 endpoints):
  - `instructor/dashboard` — 4 endpoints (stats, weekly-progress, activity, deadlines) **scoped `course.instructorId === actor.id`**
  - `instructor/analytics` — 4 endpoints (list students, detail, export CSV, send-reminder qua EmailService Phase 07)
  - `theory-contents` — 3 endpoints (GET, PUT upsert, PATCH body cho auto-save)
  - `practice-contents` — 2 endpoints (GET, PUT upsert)
- **At-risk definition**: progress < 30% AND lastActiveAt > 7 ngày AND completedAt = null
- **4 unit test mới**: instructor/dashboard, instructor/analytics, theory-contents, practice-contents — tất cả PASS (13 suites, 128 tests)
- **Frontend TipTap** cài 7 packages (@tiptap/react, pm, starter-kit, placeholder, link, image, underline)
- **Instructor layout mới**: blue navy + amber accent, useHasHydrated() guard role INSTRUCTOR+
- **5 trang instructor mới**:
  - `/instructor/dashboard` — 4 KPI + line chart 8 tuần + activity feed + deadlines panel
  - `/instructor/courses` — Grid/List view toggle + filter status + search realtime, KHÔNG có nút Xoá
  - `/instructor/courses/new` — Wizard 4 bước (info / structure dnd-kit / settings stub / preview), auto-save 30s
  - `/instructor/lessons/[id]/edit` — TipTap editor + tabs Theory/Practice/History stub, floating save status, KHÔNG có nút Xoá
  - `/instructor/analytics` — DataTable server-side với conditional formatting, modal chi tiết, export CSV, send reminder modal
- **4 Luật giữ nguyên**: INSTRUCTOR pages KHÔNG render bất kỳ button "Xoá" nào (UI level), backend `LessonsService.softDelete` vẫn enforce ADMIN+ only
- **Audit action mới**: INSTRUCTOR_SEND_REMINDER (gửi email at-risk-alert tới học viên nguy cơ)
- Xong ngày: 16/04/2026

### ✅ Phase 11 — Question Bank System

- **Shared types**: `packages/types/src/assessment.types.ts` viết lại khớp Prisma — `QuestionType` (SINGLE_CHOICE/MULTI_CHOICE/TRUE_FALSE/FILL_BLANK), `Difficulty` (EASY/MEDIUM/HARD), `QuestionBank`, `Quiz`, `QuizQuestion`, `QuizWithQuestions`, `QuizAttempt`.
- **Backend `questions` module** — 7 endpoints:
  - `GET /questions` — filter q/type/difficulty/tags/courseId/departmentId, paginated; INSTRUCTOR tự scope về createdBy của mình
  - `GET /questions/tags` — autocomplete (tag, count) từ kho của actor
  - `GET /questions/export` — rows JSON (frontend tự xuất .xlsx bằng SheetJS)
  - `POST /questions` — create với validate options theo type
  - `POST /questions/import?dryRun=` — bulk import + preview (tối đa 1000 rows/request)
  - `PATCH /questions/:id` — owner / ADMIN+
  - `DELETE /questions/:id` — owner / ADMIN+ (INSTRUCTOR chặn xoá nếu câu hỏi đang dùng trong quiz)
- **Validate options per type** trong `validateAndNormalizeOptions()`:
  - SINGLE_CHOICE: 2–6 lựa chọn, đúng 1 đáp án đúng
  - MULTI_CHOICE: 2–10 lựa chọn, ≥1 đáp án đúng
  - TRUE_FALSE: đúng 2 lựa chọn với id ép về `'true'`/`'false'`
  - FILL_BLANK: ≥1 đáp án đúng (chấm so khớp case-insensitive + trim)
- **Tag normalise**: lowercase + trim + dedupe trước khi lưu và trước khi query `hasSome`.
- **Backend `quizzes` module** — 8 endpoints:
  - `GET /lessons/:lessonId/quiz` — STUDENT + INSTRUCTOR+ (redact `isCorrect`/`correctAnswer`/`explanation` khi viewer không phải course owner / ADMIN+)
  - `POST /lessons/:lessonId/quiz` — instructor own, chặn nếu đã có quiz
  - `PATCH /quizzes/:id` — update settings (title/timeLimit/shuffle/showAnswerAfter/passScore/maxAttempts)
  - `DELETE /quizzes/:id` — ADMIN+ only, ghi AuditLog QUIZ_DELETE
  - `POST /quizzes/:id/questions` — add 1 câu vào quiz, dedupe bằng unique(quizId, questionId)
  - `POST /quizzes/:id/questions/bulk` — add nhiều câu, skip trùng, giữ order liên tục
  - `POST /quizzes/:id/questions/random-pick` — Fisher–Yates pool ≤500 rồi add bulk (chạy được trên cả SQLite và Postgres)
  - `DELETE /quizzes/:id/questions/:questionId` — gỡ + compact order
  - `PATCH /quizzes/:id/questions/reorder` — reorder toàn bộ theo `orderedIds[]`
- **Audit**: `QUIZ_DELETE` khi ADMIN+ xoá quiz.
- **Unit test mới** (26): `questions.service.spec.ts` (15) + `quizzes.service.spec.ts` (11) — cover validate options, ownership guard, bulk dedup, redact cho student. **Tổng 15 suites, 154 tests PASS.**
- **Frontend** — thêm `src/lib/assessments.ts` (types + `questionsApi` + `quizzesApi`).
- **Frontend dependency**: `xlsx@^0.18.5` (SheetJS).
- **Instructor sidebar**: thêm mục "Ngân hàng câu hỏi" → `/instructor/questions` (icon HelpCircle).
- **Lesson editor header**: thêm nút "Quiz" → `/instructor/lessons/:id/quiz` (icon FileQuestion).
- **Page `/instructor/questions`**:
  - Toolbar tìm theo text + filter loại/độ khó + `TagInput` autocomplete tags
  - Paginated list rows (20/page) với `DifficultyBadge` (xanh/vàng/đỏ) + `QuestionTypeBadge`
  - Modal `QuestionEditorModal` tạo/sửa — 4 tab loại câu hỏi, `OptionEditor` đổi hành vi radio/checkbox/lock theo type, điểm + difficulty + tags
  - Modal `PreviewDialog` — render như học viên qua `QuestionPreview` (revealAnswers)
  - `ExcelImportModal`: drag-drop .xlsx → SheetJS parse → preview 20 dòng đầu với trạng thái OK/lỗi → POST `/questions/import`
  - "Tải template mẫu" — SheetJS build 4 row mẫu cho 4 loại câu hỏi
  - "Xuất Excel" — `GET /questions/export` → SheetJS writeFile với filename có ngày
- **Page `/instructor/lessons/:id/quiz`** — Quiz Builder 3 cột:
  - Cột trái (360px): `QuestionBankPicker` — search + filter + tags + **nút "Bốc ngẫu nhiên N câu"**; mỗi row `draggable` (HTML5 drag) mang `application/x-question-id`; hiển thị greyed-out cho câu đã có trong quiz
  - Cột giữa (flex): Drop zone highlight khi drag; `QuizQuestionList` dùng `@dnd-kit/sortable` để reorder, click câu để preview, nút gỡ (trash)
  - Cột phải (300px, sticky trên desktop): `QuizSettingsPanel` — title/thời gian/passScore/maxAttempts/shuffle/showAnswerAfter, dirty-detect + save
  - Toolbar: "Xem trước" mở `QuizPreviewModal` render toàn bộ quiz với header stats (số câu, tổng điểm, pass %, thời gian)
  - Empty state khi chưa có quiz: nút "Tạo quiz cho bài giảng"
- **Components tái dùng** (`src/components/questions/*`): `DifficultyBadge`, `QuestionTypeBadge`, `TagInput` (hue ổn định theo hash tag), `OptionEditor`, `QuestionPreview`, `QuestionEditorModal`, `ExcelImportModal`
- **Components Quiz Builder** (`src/components/quiz/*`): `QuizSettingsPanel`, `QuizQuestionList` (dnd-kit), `QuestionBankPicker`, `QuizPreviewModal`
- **Loading + Error + Empty states**: mỗi trang mới có `loading.tsx` + `error.tsx` + empty-state block theo CLAUDE.md
- **Typecheck**: backend + frontend đều PASS
- Xong ngày: 16/04/2026

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
- INSTRUCTOR: Tạo + Sửa + Lưu trữ — TUYỆT ĐỐI KHÔNG có nút Xoá ở UI, backend cũng từ chối (Phase 04)
- Hydration: layout admin/instructor dùng `useHasHydrated()` (auth-store.ts) trước khi check role
- TipTap body lưu JSON ProseMirror trong `TheoryContent.body` — auto-save 30s qua `PATCH /lessons/:id/theory/body`
- Lesson revision history Phase 10 chỉ stub UI — Phase 11 sẽ thêm LessonRevision model
- Instructor analytics gửi email "nhắc học" qua `EmailService.sendAtRiskAlert` (template Phase 07)
- Question Bank: INSTRUCTOR tự scope (chỉ thấy + sửa câu hỏi mình tạo); ADMIN+ thấy + sửa tất cả
- Quiz Builder UI ở `/instructor/lessons/:id/quiz`; vào từ lesson editor hoặc sidebar mục "Ngân hàng câu hỏi" (cho bank)
- Excel import/export dùng SheetJS ở frontend (tránh upload file lên server); server chỉ nhận JSON đã parse + re-validate
- FILL_BLANK chấm so khớp case-insensitive + trim — lưu nhiều đáp án chấp nhận bằng nhiều option `isCorrect=true`

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
