# 🚀 HƯỚNG DẪN DEPLOY — GVD next gen LMS

> Tài liệu **step-by-step** cho người chưa deploy lần nào. Làm theo đúng thứ tự — mỗi bước đều có lệnh cụ thể.

**Tổng thời gian**: ~30-60 phút (chưa tính chờ DNS lan truyền).

---

## Mục lục

1. [Chuẩn bị trước khi bắt đầu](#1-chuẩn-bị-trước-khi-bắt-đầu)
2. [Bước 1: Mua VPS + Domain](#2-bước-1-mua-vps--domain)
3. [Bước 2: Trỏ DNS](#3-bước-2-trỏ-dns)
4. [Bước 3: SSH vào VPS](#4-bước-3-ssh-vào-vps)
5. [Bước 4: Chạy setup-vps.sh](#5-bước-4-chạy-setup-vpssh)
6. [Bước 5: Clone code + tạo env](#6-bước-5-clone-code--tạo-env)
7. [Bước 6: Lấy SSL certificate](#7-bước-6-lấy-ssl-certificate)
8. [Bước 7: Preflight check](#8-bước-7-preflight-check)
9. [Bước 8: Deploy thực sự](#9-bước-8-deploy-thực-sự)
10. [Bước 9: Kiểm tra sau deploy](#10-bước-9-kiểm-tra-sau-deploy)
11. [Xử lý sự cố](#11-xử-lý-sự-cố)
12. [Maintenance hàng ngày](#12-maintenance-hàng-ngày)

---

## 1. Chuẩn bị trước khi bắt đầu

Bạn cần có sẵn:

### ✅ Trên máy tính cá nhân

- **Terminal** (Windows: dùng PowerShell hoặc Git Bash; Mac/Linux: dùng Terminal có sẵn)
- **SSH client** — có sẵn trong PowerShell mới / Git Bash / Mac Terminal
- **Trình duyệt** (Chrome / Firefox)

### ✅ Sẵn sàng mua

- **Domain** (~300k-500k VND/năm): mua ở Namecheap, GoDaddy, Tenten, Pavietnam, Nhân Hoà
- **VPS Ubuntu 22.04 LTS** (~$10-30/tháng): mua ở Hetzner, Vultr, DigitalOcean, VinaHost

### ✅ Dịch vụ bên thứ ba (tuỳ chọn, có thể thêm sau)

- **SMTP provider** để gửi email (free tier):
  - [SendGrid](https://sendgrid.com/) — 100 email/ngày free
  - [Mailgun](https://www.mailgun.com/) — 5000 email/tháng đầu free
  - Hoặc Gmail với app password (không khuyên cho sản lượng cao)
- **Gemini API key** (free tier 1500 req/ngày): [Lấy tại aistudio.google.com](https://aistudio.google.com/app/apikey)
- **Google OAuth** (nếu muốn login Google): [Google Cloud Console](https://console.cloud.google.com/)

---

## 2. Bước 1: Mua VPS + Domain

### 2.1 Mua VPS

Vào website nhà cung cấp (ví dụ Hetzner):

1. Đăng ký tài khoản + xác thực email
2. Chọn **"Create Server"**
3. **Location**: Singapore (gần VN nhất) hoặc Germany (Âu)
4. **Image**: **Ubuntu 22.04 LTS** ← quan trọng, KHÔNG chọn Windows
5. **Type**: CPX21 (3 vCPU, 4GB RAM) hoặc cao hơn
6. **Name**: gvd-lms-prod
7. **Add SSH key**: (xem mục 4.1 dưới)
8. Bấm **"Create & Buy now"**

Sau ~30 giây, VPS sẵn sàng. Lưu lại:

- **IP public** (ví dụ: `91.98.12.34`)
- **Username** mặc định (thường là `root`)

### 2.2 Mua Domain

Vào website nhà cung cấp domain (ví dụ Namecheap):

1. Tìm tên domain bạn muốn (ví dụ: `gvdsoft.com.vn`)
2. Add to cart → thanh toán
3. Vào Dashboard → **"Manage"** domain vừa mua

---

## 3. Bước 2: Trỏ DNS

Trong dashboard domain của bạn, tìm phần **"DNS Management"** hoặc **"Nameservers"**.

Thêm 2 records:

| Type  | Host/Name | Value/Points to                    | TTL           |
| ----- | --------- | ---------------------------------- | ------------- |
| **A** | `@`       | IP VPS của bạn (vd: `91.98.12.34`) | Auto hoặc 300 |
| **A** | `www`     | IP VPS (cùng IP trên)              | Auto hoặc 300 |

Lưu lại → chờ DNS lan truyền **5-30 phút** (đôi khi 1-2 giờ).

### Check DNS đã trỏ đúng chưa

Trên máy tính cá nhân, mở terminal:

```bash
nslookup gvdsoft.com.vn
# hoặc
dig +short gvdsoft.com.vn
```

Nếu trả về IP VPS → OK, tiếp tục. Nếu chưa → đợi thêm.

---

## 4. Bước 3: SSH vào VPS

### 4.1 Setup SSH key (nếu chưa có)

**Trên máy tính cá nhân** (Windows PowerShell / Mac Terminal):

```bash
# Tạo SSH key (nếu chưa có)
ssh-keygen -t ed25519 -C "your-email@example.com"
# Bấm Enter 3 lần (chấp nhận default path + không đặt passphrase)

# Xem public key
cat ~/.ssh/id_ed25519.pub
# Copy toàn bộ output (bắt đầu bằng ssh-ed25519 ...)
```

Quay lại dashboard Hetzner → Server → Add SSH Key → Paste public key → Save.

### 4.2 SSH vào VPS

```bash
# Thay 91.98.12.34 bằng IP VPS của bạn
ssh root@91.98.12.34
```

Lần đầu hỏi "Are you sure you want to continue connecting?" → gõ `yes`.

Thành công → terminal hiện prompt `root@gvd-lms-prod:~#`.

---

## 5. Bước 4: Chạy setup-vps.sh

Lúc này bạn đang **trên VPS** (prompt `root@...`). Làm theo:

### 5.1 Cách nhanh (1 lệnh)

```bash
curl -fsSL https://raw.githubusercontent.com/ceogvd-lgtm/gvd-lms-platform/main/scripts/setup-vps.sh | bash
```

Script sẽ:

1. ✅ Update Ubuntu
2. ✅ Đặt timezone Asia/Ho_Chi_Minh
3. ✅ Tạo swap 2GB (nếu RAM < 4GB)
4. ✅ Bật firewall UFW (chỉ mở 22/80/443)
5. ✅ Bật fail2ban chống brute-force SSH
6. ✅ Cài Docker + Docker Compose v2
7. ✅ Tạo user `lms` (không dùng root chạy app)
8. ✅ Cài certbot cho SSL

Mất **5-10 phút**. Kết thúc thấy ✅ xanh.

### 5.2 Nếu có lỗi

- "Permission denied" → chạy `sudo bash` thay vì `bash`
- "Network unreachable" → kiểm tra firewall provider VPS có chặn gì không
- Khác → đọc thông báo lỗi, Google, hoặc hỏi tôi

---

## 6. Bước 5: Clone code + tạo env

### 6.1 Chuyển sang user `lms`

```bash
su - lms
```

Bây giờ prompt `lms@gvd-lms-prod:~$`.

### 6.2 Clone repo

```bash
cd /srv/lms
git clone https://github.com/ceogvd-lgtm/gvd-lms-platform.git .
git checkout v1.0.15   # hoặc tag mới nhất trong phần [📑 Changelog]
```

### 6.3 Tạo `.env.production` tự động

```bash
bash scripts/generate-env.sh
```

Script sẽ hỏi vài câu — trả lời lần lượt:

1. **Domain** → nhập `gvdsoft.com.vn` (domain bạn đã mua)
2. **Super Admin email** → ví dụ `admin@gvdsoft.com.vn`
3. **Super Admin password** → Enter = tự sinh (copy ra note ngay!)
4. **SMTP Host/User/Pass**: nếu đã có SendGrid/Mailgun → nhập; chưa có → Enter bỏ qua
5. **Gemini API key**: nếu có → dán; chưa có → Enter bỏ qua
6. **Google OAuth**: nếu có → nhập; chưa có → Enter bỏ qua

Kết thúc tạo:

- File `.env.production` (trên VPS, permission 600)
- File `credentials-YYYYMMDD-HHMMSS.txt` — **MỞ NGAY**, copy vào password manager, rồi `rm` nó đi

### 6.4 Kiểm tra

```bash
ls -la .env.production
# -rw------- 1 lms lms 2.1K ... .env.production

cat .env.production | head -20
# Xem có đủ các field không
```

---

## 7. Bước 6: Lấy SSL certificate

### 7.1 Chạy setup-ssl.sh (cần sudo)

```bash
# Thoát khỏi user lms tạm thời
exit   # về lại root

# Chạy SSL setup
sudo bash /srv/lms/scripts/setup-ssl.sh gvdsoft.com.vn www.gvdsoft.com.vn
```

Script sẽ:

1. ✅ Check DNS domain đã trỏ đúng VPS chưa
2. ✅ Gọi Let's Encrypt (qua certbot) xin cert
3. ✅ Copy cert vào `docker/nginx/certs/`
4. ✅ Setup cron tự renew mỗi tháng

Mất ~30 giây. Kết thúc thấy:

```
✅ SSL đã sẵn sàng!
Cert location: /etc/letsencrypt/live/gvdsoft.com.vn/
Expiry: 90 ngày (auto-renew hàng tháng)
```

### 7.2 Nếu bị lỗi DNS

```
✗ Domain gvdsoft.com.vn chưa có A record.
```

→ Quay lại [Bước 2](#3-bước-2-trỏ-dns), kiểm tra DNS đã trỏ đúng chưa, đợi thêm.

### 7.3 Chuyển lại user lms

```bash
su - lms
cd /srv/lms
```

---

## 8. Bước 7: Preflight check

**Trước khi deploy thật**, chạy check tự động:

```bash
bash scripts/preflight.sh
```

Script kiểm 5 thứ:

```
[1/5] 🔍 Test SMTP...       ✅ OK   (hoặc ❌ nếu chưa có — OK, bỏ qua)
[2/5] 🔍 Test MinIO...      ✅ OK
[3/5] 🔍 Test Gemini API... ✅ OK   (hoặc ❌ nếu chưa có key — OK, bỏ qua)
[4/5] 🔍 Test Database...   ✅ OK
[5/5] 🔍 Test Redis...      ✅ OK
```

**Nếu có ❌**:

- SMTP / Gemini fail **nhưng placeholder = CHANGE_ME_LATER** → OK, bỏ qua, điền sau
- Postgres / Redis / MinIO fail → check lại `.env.production`, thường là password viết sai

---

## 9. Bước 8: Deploy thực sự

### 9.1 First-run (lần đầu — seed Super Admin)

```bash
bash scripts/deploy.sh --first-run
```

Script sẽ:

1. ✅ Preflight lại
2. ✅ Pull Docker images / build local
3. ✅ Start containers: postgres, redis, minio, chromadb, backend, frontend, nginx
4. ✅ Apply Prisma migrations (tạo schema DB)
5. ✅ Seed Super Admin account (dùng email + password trong `.env.production`)
6. ✅ Khởi động nginx với SSL

Mất **3-8 phút** lần đầu (vì build Docker images).

### 9.2 Xem output

```
[deploy] Running preflight checks...
[deploy] ✅ All checks passed!
[deploy] Pulling images...
[deploy] Starting stack...
 ✔ Container lms-postgres     Healthy
 ✔ Container lms-redis        Healthy
 ✔ Container lms-minio        Healthy
 ✔ Container lms-chromadb     Healthy
 ✔ Container lms-backend      Started
 ✔ Container lms-frontend     Started
 ✔ Container lms-nginx        Started
[deploy] Applying Prisma migrations...
[deploy] FIRST RUN — seeding SUPER_ADMIN...
[deploy] Waiting 10s for backend to settle...
[deploy] /health responded OK
[deploy] Done.
[deploy] UI:   https://gvdsoft.com.vn
[deploy] API:  https://gvdsoft.com.vn/api/v1/health
```

---

## 10. Bước 9: Kiểm tra sau deploy

### 10.1 Test truy cập

Mở trình duyệt (không phải trên VPS, mà trên máy tính cá nhân):

```
https://gvdsoft.com.vn
```

Phải thấy trang hero "GVD next gen LMS" với SSL xanh.

### 10.2 Login lần đầu

```
https://gvdsoft.com.vn/login
```

Dùng email + password đã tạo ở bước 6.3 (trong file credentials).

Sau khi login:

- ✅ Đổi mật khẩu ngay (Avatar → Tài khoản → Đổi mật khẩu)
- ✅ Bật 2FA (Avatar → Tài khoản → Xác thực 2 lớp)

### 10.3 Smoke test 5 phút

1. **Tạo 1 Instructor** test: /admin/users → + Tạo user
2. **Logout** → login bằng instructor test
3. **Tạo khoá học** mẫu (không cần full, chỉ để test)
4. **Logout** → login lại bằng Super Admin
5. Check `/admin/audit-log` có thấy log không
6. **AI chat**: mở icon ✨ góc dưới phải (nếu đã có Gemini key)

### 10.4 Điền thông tin còn thiếu (nếu có)

Nếu lúc generate-env bạn để `CHANGE_ME_LATER`:

- **SMTP**: Vào `/admin/settings` → tab Email/SMTP → điền thật → Test SMTP
- **Gemini key**: `/admin/settings` → tab AI & Quota → dán key

---

## 11. Xử lý sự cố

### 11.1 "Trang không load được"

Vào VPS:

```bash
# Xem container nào đang chạy
docker compose -f docker/docker-compose.prod.yml --env-file .env.production ps

# Xem log backend
docker compose -f docker/docker-compose.prod.yml --env-file .env.production logs backend | tail -50

# Xem log nginx
docker compose -f docker/docker-compose.prod.yml --env-file .env.production logs nginx | tail -50
```

Tìm dòng `ERROR` → chụp màn hình gửi cho dev team.

### 11.2 "SSL lỗi" (chữ đỏ trên browser)

```bash
# Check cert
sudo certbot certificates

# Renew thủ công
sudo certbot renew --standalone

# Restart nginx
docker compose -f docker/docker-compose.prod.yml --env-file .env.production restart nginx
```

### 11.3 Database không kết nối được

```bash
# Check postgres container
docker compose -f docker/docker-compose.prod.yml --env-file .env.production exec postgres pg_isready

# Xem log
docker compose -f docker/docker-compose.prod.yml --env-file .env.production logs postgres | tail -50
```

### 11.4 Hết RAM

```bash
# Xem usage
free -h
docker stats --no-stream

# Nếu <500MB free → thêm swap hoặc upgrade VPS
```

### 11.5 Rollback

Nếu deploy lỗi mà muốn về bản cũ:

```bash
# Stop mọi container
docker compose -f docker/docker-compose.prod.yml --env-file .env.production down

# Checkout tag cũ
git checkout v1.0.14   # bản trước

# Restore DB từ backup gần nhất (nếu có)
bash scripts/restore.sh /srv/lms/backups/latest.sql.gz

# Deploy lại
bash scripts/deploy.sh
```

---

## 12. Maintenance hàng ngày

### 12.1 Xem uptime

```bash
# Trên VPS
docker compose -f docker/docker-compose.prod.yml --env-file .env.production ps
# Tất cả phải "healthy" hoặc "running"
```

### 12.2 Xem log 24h qua

```bash
docker compose -f docker/docker-compose.prod.yml --env-file .env.production logs --since 24h | grep -i error
```

### 12.3 Backup thủ công

Hệ thống tự backup 02:00 AM mỗi ngày. Nhưng bạn có thể trigger thêm:

```bash
bash scripts/backup.sh
```

Hoặc trong admin UI: `/admin/settings` → Backup → "Backup ngay".

### 12.4 Update version mới

Khi có version mới (vd: v1.0.16):

```bash
cd /srv/lms
git fetch --tags
git checkout v1.0.16
bash scripts/deploy.sh   # không cần --first-run nữa
```

Downtime ~30-60 giây.

### 12.5 Monitor

Định kỳ kiểm tra:

- [ ] **Hàng ngày**: `/admin/dashboard` xem số liệu, alerts panel
- [ ] **Hàng tuần**: check backup có SUCCESS không (`/admin/settings` → Backup)
- [ ] **Hàng tháng**: đổi mật khẩu Super Admin, kiểm tra user không hoạt động

---

## 📋 Tổng kết — Quy trình 9 bước

```
1. Mua VPS Ubuntu 22.04 + Domain                     (~10 phút)
2. Trỏ DNS A record domain → IP VPS                  (~5 phút + chờ)
3. SSH root@IP                                       (~1 phút)
4. curl ... setup-vps.sh | bash                      (~5-10 phút)
5. su - lms && git clone + generate-env.sh           (~5 phút)
6. sudo setup-ssl.sh domain.com                      (~30 giây)
7. preflight.sh                                      (~30 giây)
8. deploy.sh --first-run                             (~3-8 phút)
9. Smoke test qua browser                            (~5 phút)
────────────────────────────────────────────────────
Tổng: ~30-60 phút (không tính chờ DNS lan truyền)
```

---

## 🆘 Cần giúp?

Mỗi bước gặp vấn đề:

1. **Đọc output script** — thường có message gợi ý fix
2. **Tìm trong `docs/user-guides/05-FAQ.md`**
3. **Google lỗi** với keyword chính (thường có cách fix trên StackOverflow)
4. **Liên hệ dev team** với screenshot + log

**Chúc deploy thành công! 🎉**

---

_File này cập nhật theo v1.0.15 ngày 24/04/2026._
