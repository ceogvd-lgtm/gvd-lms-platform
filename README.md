# LMS Platform

> Hệ thống LMS thế hệ mới tích hợp AI — chuyên đào tạo thực hành kỹ thuật công nghiệp.

Monorepo quản lý bằng **pnpm workspaces** + **Turborepo**. Scope Phase 01 = scaffold hạ tầng (không có business logic).

---

## Tech Stack

| Layer    | Stack                                                              |
| -------- | ------------------------------------------------------------------ |
| Backend  | NestJS 10 + TypeScript + Prisma + PostgreSQL + Redis               |
| Frontend | Next.js 14 (App Router) + Tailwind CSS + shadcn/ui + Framer Motion |
| State    | Zustand (client) + TanStack Query (server)                         |
| Auth     | JWT (15m/7d) + Google OAuth2 + 2FA email OTP                       |
| Storage  | MinIO (S3-compatible)                                              |
| Email    | Nodemailer + BullMQ queue                                          |
| AI       | Google Gemini (gemini-2.0-flash) + ChromaDB                        |
| Infra    | Docker Compose + GitHub Actions + Turborepo cache                  |

---

## Cấu trúc monorepo

```
lms-platform/
├── apps/
│   ├── backend/              # NestJS API (@lms/backend)
│   └── frontend/             # Next.js 14 (@lms/frontend)
├── packages/
│   ├── database/             # Prisma schema + client (@lms/database)
│   ├── types/                # Shared TypeScript types (@lms/types)
│   ├── ui/                   # Shared component library (@lms/ui)
│   └── config/               # ESLint / TS / Tailwind / Prettier presets (@lms/config)
├── docker/
│   ├── docker-compose.dev.yml
│   └── docker-compose.prod.yml
├── scripts/
│   └── setup.sh              # Bootstrap dev environment
├── .github/workflows/
│   ├── ci.yml                # Lint + typecheck + test + build
│   └── deploy.yml            # Build & push images on merge to main
├── .husky/                   # Pre-commit + commit-msg hooks
├── .env.example
├── package.json              # Workspace root
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.json             # Path aliases cho IDE
```

---

## Yêu cầu môi trường

| Tool    | Version | Cài đặt                                                               |
| ------- | ------- | --------------------------------------------------------------------- |
| Node.js | ≥ 20    | https://nodejs.org — khuyến nghị dùng `nvm` hoặc `volta`              |
| pnpm    | ≥ 9     | `npm install -g pnpm@9` hoặc `corepack enable && corepack use pnpm@9` |
| Docker  | ≥ 24    | https://docs.docker.com/get-docker/ (kèm Docker Compose v2)           |
| Git     | ≥ 2.30  | https://git-scm.com                                                   |

---

## Setup nhanh (script tự động, cross-platform)

```bash
git clone https://github.com/ceogvd-lgtm/gvd-lms-platform.git lms-platform
cd lms-platform
pnpm install           # cài pnpm trước nếu chưa có: npm i -g pnpm
pnpm run restore
```

Script `scripts/restore.js` (chạy được cả Windows/macOS/Linux) sẽ:

1. Kiểm tra prerequisites (Node ≥ 20, pnpm ≥ 9, Docker daemon)
2. Copy `.env.example` → `.env` nếu chưa có + **auto-gen JWT_SECRET/REFRESH_TOKEN_SECRET** 64 ký tự random
3. `pnpm install --frozen-lockfile`
4. Generate Prisma client
5. Khởi động Docker stack (postgres/redis/minio/mailpit/chromadb)
6. Đợi Postgres ready (pg_isready loop)
7. Chạy `prisma migrate deploy`
8. Seed super admin + demo data (idempotent)
9. In URL + tài khoản test

Flags:

```bash
pnpm run restore -- --skip-install   # bỏ qua pnpm install
pnpm run restore -- --skip-seed      # bỏ qua seed demo
pnpm run restore -- --skip-docker    # khi Docker đã chạy sẵn
```

Sau khi restore xong, chạy `pnpm dev`.

> Sau khi chạy `restore`, ĐIỀN các secret còn trống trong `.env`: `GOOGLE_CLIENT_ID/SECRET`, `GEMINI_API_KEY`, `SMTP_*` — nếu không dùng Google OAuth/AI thì có thể để trống.

Bản legacy `bash scripts/setup.sh` (Linux/Mac only) vẫn còn dùng được — trỏ `restore.js` chỉ là khuyến nghị mới.

---

## Setup thủ công (từng bước)

```bash
# 1. Cài dependencies
pnpm install

# 2. Tạo file .env từ template
cp .env.example .env
# Mở .env và điền các giá trị secret (GOOGLE_CLIENT_ID, GEMINI_API_KEY, SMTP_*, ...)

# 3. Khởi động dev stack (postgres, redis, minio)
pnpm docker:dev

# 4. Generate Prisma client
pnpm --filter @lms/database db:generate

# 5. Chạy migration đầu tiên
pnpm db:migrate

# 6. (Tuỳ chọn) Seed dữ liệu mẫu
pnpm --filter @lms/database db:seed

# 7. Chạy cả backend + frontend song song
pnpm dev
```

Sau khi `pnpm dev` chạy xong:

- Frontend: <http://localhost:3000>
- Backend health: <http://localhost:4000/api/v1/health>
- MinIO console: <http://localhost:9001> (user/pass: `minioadmin` / `minioadmin`)
- Prisma Studio: `pnpm db:studio` → <http://localhost:5555>

---

## Lệnh thường dùng

```bash
# Dev
pnpm dev                                # chạy cả backend + frontend (turbo parallel)
pnpm --filter @lms/backend dev          # chỉ backend
pnpm --filter @lms/frontend dev         # chỉ frontend

# Quality
pnpm lint                               # lint toàn monorepo
pnpm typecheck                          # typecheck toàn monorepo
pnpm test                               # chạy mọi test
pnpm format                             # format mọi file
pnpm format:check                       # kiểm tra format (CI)

# Database
pnpm db:migrate                         # prisma migrate dev
pnpm db:studio                          # mở Prisma Studio
pnpm db:generate                        # regen Prisma client
pnpm --filter @lms/database db:reset    # reset DB (CẨN THẬN)

# Docker
pnpm docker:dev                         # start postgres + redis + minio
pnpm docker:dev:down                    # stop dev stack
pnpm docker:prod                        # start prod stack

# Build
pnpm build                              # build cả monorepo (turbo cache)
pnpm clean                              # xoá build outputs + node_modules
```

---

## Environment variables

Tham khảo [`.env.example`](./.env.example). Các biến quan trọng:

| Biến                                  | Mục đích                         |
| ------------------------------------- | -------------------------------- |
| `DATABASE_URL`                        | Postgres connection string       |
| `REDIS_URL`                           | Redis cho cache + BullMQ         |
| `JWT_SECRET` / `REFRESH_TOKEN_SECRET` | Ký JWT access / refresh          |
| `GOOGLE_CLIENT_ID` / `_SECRET`        | Google OAuth2                    |
| `SMTP_*`                              | Gửi email OTP / thông báo        |
| `MINIO_*`                             | S3-compatible object storage     |
| `GEMINI_API_KEY`                      | AI (primary)                     |
| `OPENAI_API_KEY`                      | AI fallback                      |
| `CHROMA_HOST` / `_PORT`               | Vector store                     |
| `NEXT_PUBLIC_API_URL`                 | URL API mà frontend gọi          |
| `ALLOWED_ORIGINS`                     | CORS whitelist (comma-separated) |

---

## 4 Luật Bất Khả Xâm Phạm (từ CLAUDE.md)

```
LUẬT 1: Chỉ SUPER_ADMIN gọi được createAdmin · deleteAdmin · updateAdminRole
LUẬT 2: ADMIN cố sửa/xoá SUPER_ADMIN hoặc ADMIN khác → 403
LUẬT 3: Bất kỳ ai tự xoá chính mình → 403
LUẬT 4: count(SUPER_ADMIN) ≤ 1 và target là SUPER_ADMIN → 403
```

Mọi admin action backend phải đi qua middleware `checkAdminRules()`. Frontend phải **disable** button + tooltip (không ẩn).

---

## Phân quyền bài giảng

- **INSTRUCTOR**: tạo / sửa / lưu trữ — **không có nút xoá**.
- **ADMIN / SUPER_ADMIN**: có thể soft-delete (`isDeleted=true`) + ghi `AuditLog`.

---

## Git workflow

- Branch chính: `main`
- Branch phát triển: `develop`
- Feature branch: `feat/<ten-tinh-nang>`, `fix/<mo-ta>`, ...
- Commit message theo **Conventional Commits** (hook `commit-msg` sẽ enforce):
  ```
  feat(auth): add google oauth
  fix(course): correct enrollment count
  docs(readme): update setup steps
  ```
- Pre-commit hook chạy `lint-staged` (prettier + eslint --fix) trên file đã stage.

---

## CI/CD

- **`ci.yml`**: chạy trên mọi PR về `main`/`develop` → lint → typecheck → test (với postgres/redis services) → build.
- **`deploy.yml`**: chạy khi merge vào `main` → build & push Docker images lên GHCR → deploy step (hiện placeholder, cần wire vào infra thật).

---

## Troubleshooting

| Triệu chứng                           | Xử lý                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------- |
| `pnpm install` lỗi `ERR_PNPM_...`     | `rm -rf node_modules && pnpm store prune && pnpm install`                 |
| Port 5432 / 6379 / 9000 đã dùng       | Tắt service đang chạy hoặc sửa port trong `docker/docker-compose.dev.yml` |
| Prisma: `Can't reach database server` | Kiểm tra `pnpm docker:dev` đã chạy; verify `DATABASE_URL` trong `.env`    |
| `Cannot find module '@lms/types'`     | Chạy `pnpm install` từ root để symlink workspace packages                 |
| Husky hook không chạy                 | `pnpm prepare` rồi `chmod +x .husky/pre-commit .husky/commit-msg`         |

---

## Roadmap

Xem [`CONTEXT.md`](./CONTEXT.md) để biết phase hiện tại và danh sách các phase tiếp theo.

---

## License

Private — © 2025 GVD LMS Platform.
