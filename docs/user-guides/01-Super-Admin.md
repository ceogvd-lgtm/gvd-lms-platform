# 🟡 HƯỚNG DẪN SUPER ADMIN

> Tài liệu dành cho người quản trị **cấp cao nhất** của hệ thống. Super Admin là "ông chủ" — có thể làm **mọi thứ** Admin làm, CỘNG THÊM: tạo/xoá Admin khác, cấu hình hệ thống, sao lưu dữ liệu, khôi phục từ backup.

> ⚠️ **Trách nhiệm cao**: thao tác của Super Admin ảnh hưởng đến toàn bộ hệ thống. Mọi hành động đều được ghi vào **nhật ký (audit log)** vĩnh viễn — không xoá được.

---

## Mục lục

1. [4 luật bất biến của Super Admin](#1-4-luật-bất-biến-của-super-admin)
2. [Đăng nhập lần đầu sau cài đặt](#2-đăng-nhập-lần-đầu-sau-cài-đặt)
3. [Tạo Admin mới](#3-tạo-admin-mới)
4. [Xoá Admin](#4-xoá-admin)
5. [Đổi vai trò Admin ↔ Instructor ↔ Student](#5-đổi-vai-trò)
6. [Cài đặt hệ thống](#6-cài-đặt-hệ-thống)
7. [Backup & Restore](#7-backup--restore)
8. [Xem audit log](#8-xem-audit-log)
9. [Dọn dẹp lưu trữ](#9-dọn-dẹp-lưu-trữ)
10. [Quản lý AI quota](#10-quản-lý-ai-quota)

---

## 1. 4 luật bất biến của Super Admin

Hệ thống enforce **4 luật** cứng bằng code — Super Admin **KHÔNG vượt qua được**, đảm bảo an toàn:

|    Luật    | Nội dung                                                                            |
| :--------: | ----------------------------------------------------------------------------------- |
| **Luật 1** | Chỉ SUPER_ADMIN mới tạo / xoá / đổi role Admin. ADMIN cố làm → báo lỗi 403          |
| **Luật 2** | ADMIN không được sửa / xoá SUPER_ADMIN khác, cũng không được sửa ADMIN khác         |
| **Luật 3** | **Không ai tự xoá chính mình** — kể cả Super Admin                                  |
| **Luật 4** | **Phải luôn có ít nhất 1 Super Admin** — không thể xoá/hạ cấp Super Admin cuối cùng |

→ Nếu bạn là Super Admin DUY NHẤT, trước khi xoá tài khoản của mình, phải tạo thêm Super Admin khác đã.

---

## 2. Đăng nhập lần đầu sau cài đặt

### 2.1 Tài khoản mặc định khi seed

Khi deploy production lần đầu (`./scripts/deploy.sh --first-run`), hệ thống tự tạo 1 Super Admin:

```
Email:     admin@gvdsoft.com.vn    (hoặc email bạn cấu hình)
Mật khẩu:  (giá trị trong .env.production, mục SEED_SUPER_ADMIN_PASSWORD)
```

### 2.2 Thao tác đầu tiên BẮT BUỘC

1. **Đăng nhập** với email + mật khẩu mặc định
2. **Đổi mật khẩu NGAY** → vào avatar → Tài khoản → Đổi mật khẩu
3. **Bật 2FA** — xem [Tổng quan mục 5](./00-Tong-quan.md#5-xác-thực-2-lớp-2fa)
4. **Tạo Admin** phụ (để lỡ bạn mất tài khoản còn có người vào sửa)

---

## 3. Tạo Admin mới

### 3.1 Các bước

1. Vào **Sidebar → "Người dùng"** (`/admin/users`)
2. Bấm nút **"+ Tạo Admin"** (góc trên phải)
3. Form popup hiện lên, điền:
   - **Email** — phải là email thật, duy nhất trong hệ thống
   - **Họ tên**
   - **Mật khẩu tạm** (Admin mới sẽ đổi khi login lần đầu)
   - **Vai trò**: chọn `ADMIN`
4. Bấm **"Tạo"**
5. Hệ thống gửi email welcome + yêu cầu đổi mật khẩu

### 3.2 Lưu ý

- Email không hỗ trợ unicode → chỉ ASCII
- Mật khẩu tạm tối thiểu 8 ký tự
- Admin mới không có quyền làm Super Admin action → muốn biến thành Super Admin phải đổi role riêng (xem mục 5)

### 3.3 Kiểm tra audit

Mọi tạo Admin đều ghi vào `/admin/audit-log` với action `ADMIN_CREATE_USER` + ghi IP của Super Admin.

---

## 4. Xoá Admin

### 4.1 Các bước

1. **Sidebar → "Người dùng"**
2. Tìm Admin cần xoá (dùng bộ lọc role = ADMIN)
3. Hover vào row → bấm **icon Trash (🗑️)** màu đỏ ở cột Actions
4. Popup xác nhận — gõ **email** của Admin đó để xác nhận
5. Bấm **"Xoá vĩnh viễn"**

### 4.2 Lưu ý

- Xoá là **soft delete** (`isDeleted=true`) → dữ liệu vẫn còn trong DB, chỉ ẩn UI
- Admin bị xoá **không thể đăng nhập** lại
- Mọi course Admin đó đã duyệt vẫn giữ nguyên
- Nếu muốn phục hồi → vào DB sửa `isDeleted=false` (cần kỹ thuật)

### 4.3 Ngoại lệ — không xoá được

| Trường hợp                                                   | Lỗi                                |
| ------------------------------------------------------------ | ---------------------------------- |
| Bạn tự xoá chính mình                                        | ❌ "Không thể tự xoá tài khoản"    |
| Admin là người duy nhất Super Admin                          | ❌ "Phải có ít nhất 1 Super Admin" |
| Admin đang trong middle của 1 transaction (đang tạo course…) | ❌ "User đang bận, thử lại sau"    |

---

## 5. Đổi vai trò

### 5.1 Các vai trò đổi được

| Từ                 | Sang        | Ai làm được                               |
| ------------------ | ----------- | ----------------------------------------- |
| STUDENT            | INSTRUCTOR  | Admin                                     |
| INSTRUCTOR         | STUDENT     | Admin                                     |
| STUDENT/INSTRUCTOR | ADMIN       | **Super Admin only**                      |
| ADMIN              | SUPER_ADMIN | **Super Admin only**                      |
| SUPER_ADMIN        | ADMIN       | **Super Admin only** (+ điều kiện Luật 4) |

### 5.2 Các bước

1. **Sidebar → "Người dùng"**
2. Tìm user → hover → **icon "Đổi vai trò"** (hình bánh răng)
3. Popup hiện dropdown → chọn vai trò mới
4. Bấm **"Xác nhận"**
5. User bị đăng xuất ngay lập tức → khi login lại nhận role mới

### 5.3 Audit

Log ghi `ADMIN_UPDATE_ROLE` với `oldValue: {role: X}` và `newValue: {role: Y}`.

---

## 6. Cài đặt hệ thống

Truy cập: **Sidebar → "Cài đặt hệ thống"** (`/admin/settings`)

Super Admin **sửa được**. Admin chỉ xem.

### 6.1 Tab Tổ chức

- **Tên tổ chức**: "GVD next gen LMS" (hiện trên header, email, chứng chỉ)
- **URL logo**: `/logo-gvd.svg` (hoặc link tuyệt đối)
- **Màu chính / phụ**: HEX code (ví dụ `#1E40AF` / `#7C3AED`)

⚠️ Đổi tên tổ chức ở đây **chỉ đổi 1 số chỗ** (tiêu đề email, chứng chỉ). Nhiều chỗ trong UI hardcode trong code → muốn đổi toàn bộ cần dev deploy (xem Dev team).

### 6.2 Tab Email / SMTP

- **SMTP Host**: `smtp.sendgrid.net` (hoặc Gmail, Mailgun)
- **SMTP Port**: `587` (TLS)
- **SMTP User**: `apikey` (SendGrid) hoặc email Gmail
- **SMTP Pass**: password ứng dụng (KHÔNG phải password thường)
- **From**: `"GVD next gen LMS <no-reply@gvdsoft.com.vn>"`
- **Secure**: tắt nếu dùng TLS port 587

Bấm **"Test SMTP"** → gõ email test → hệ thống gửi email thử → kiểm tra hộp thư.

### 6.3 Tab Bảo mật

- **Min password length**: 8 (khuyên 12)
- **Session TTL (access token)**: 15 phút
- **Refresh token TTL**: 7 ngày
- **Yêu cầu 2FA cho Admin**: nên bật `true`
- **Brute-force lockout**: 5 lần sai → khoá 15 phút

### 6.4 Tab Lưu trữ

- **Max file size (content)**: 2GB (không nên tăng — Multer buffer RAM)
- **Allowed MIME types**: đã preset (zip, mp4, pdf, pptx, etc.)
- **Storage cleanup**: nút "Chạy dọn dẹp NGAY" — xoá file mồ côi (không có row DB tương ứng)

### 6.5 Tab Backup

Xem [mục 7](#7-backup--restore).

### 6.6 Tab AI & Quota

- **Gemini enabled**: bật/tắt AI chat
- **Quota giới hạn / ngày**: cảnh báo khi dùng gần hết
- **Xem log quota 30 ngày qua**: biểu đồ ngày/ngày

---

## 7. Backup & Restore

### 7.1 Backup là gì?

Hệ thống tự động dump **toàn bộ PostgreSQL database** mỗi ngày **02:00 sáng** → lưu vào MinIO bucket `backups/`. Giữ **30 ngày gần nhất**, tự xoá bản cũ.

### 7.2 Xem danh sách backup

1. **Sidebar → "Cài đặt hệ thống" → tab Backup**
2. Bảng hiện:
   - Tên file (vd: `backup_20260424_020000.sql.gz`)
   - Kích thước (MB)
   - Loại: **Tự động** (cron) / **Thủ công** (Super Admin bấm nút)
   - Trạng thái: PENDING / RUNNING / SUCCESS / FAILED
   - Ngày tạo
   - Nút **"Tải xuống"** (chỉ SUCCESS rows)

### 7.3 Tạo backup thủ công

1. Tab Backup → bấm **"Backup ngay"** (chỉ Super Admin thấy nút này)
2. Status chuyển **PENDING → RUNNING** (khoảng 10-30 giây tuỳ DB size)
3. Xong → status **SUCCESS**, có nút "Tải xuống"

### 7.4 Tải backup về máy

1. Bấm **"Tải xuống"** trên row SUCCESS
2. File `.sql.gz` tải về
3. Giải nén: `gunzip backup_xxx.sql.gz` → `.sql`

### 7.5 Khôi phục từ backup

⚠️ **NGUY HIỂM** — ghi đè toàn bộ DB hiện tại, mọi data sau backup sẽ **MẤT**.

1. Tab Backup → chọn backup muốn restore → bấm **"Phục hồi"**
2. Popup xác nhận — gõ nguyên văn:
   ```
   YES-I-UNDERSTAND-THIS-OVERWRITES-DATABASE
   ```
3. Bấm **"Phục hồi vĩnh viễn"**
4. Hệ thống dừng backend → chạy `psql < backup.sql` → khởi động lại
5. Downtime ~1-2 phút

### 7.6 Khi nào nên restore?

- **Hack / bị xoá dữ liệu nhầm**: restore về backup trước sự cố
- **Deploy hỏng**: restore + rollback code
- **Thử nghiệm trên staging**: restore từ prod backup

### 7.7 Cleanup backup cũ

1. Tab Backup → bấm **"Cleanup ngay"**
2. Hệ thống xoá mọi backup > 30 ngày (hoặc theo `BACKUP_RETENTION_DAYS` env)

---

## 8. Xem audit log

### 8.1 Vị trí

**Sidebar → "Nhật ký hệ thống"** (`/admin/audit-log`)

### 8.2 Bảng audit

| Cột        | Ý nghĩa                               |
| ---------- | ------------------------------------- |
| Thời gian  | Khi nào hành động xảy ra              |
| Role badge | Role của user thực hiện               |
| Tên user   | Ai làm                                |
| Action     | Loại hành động (UPPERCASE_SNAKE_CASE) |
| Target     | Đối tượng bị tác động                 |
| IP         | Địa chỉ IP                            |
| Chi tiết   | Nút xem JSON đầy đủ old/new value     |

### 8.3 Các action Super Admin cần theo dõi

| Action                                | Ý nghĩa              |
| ------------------------------------- | -------------------- |
| `ADMIN_CREATE_USER`                   | Tạo Admin            |
| `ADMIN_DELETE_USER`                   | Xoá user             |
| `ADMIN_UPDATE_ROLE`                   | Đổi vai trò          |
| `ADMIN_UPDATE_DEPARTMENT`             | Gán khoa/ngành       |
| `BACKUP_TRIGGERED` / `BACKUP_CREATED` | Sao lưu              |
| `BACKUP_RESTORED`                     | Khôi phục (chú ý!)   |
| `SYSTEM_SETTING_UPDATED`              | Sửa cài đặt          |
| `STORAGE_CLEANUP`                     | Dọn file             |
| `COURSE_APPROVE` / `COURSE_REJECT`    | Duyệt khoá           |
| `USER_LOGIN`                          | Đăng nhập (mọi role) |
| `WEBGL_DELETED`                       | Xoá WebGL thực hành  |

### 8.4 Bộ lọc

- Theo **date range** (from → to)
- Theo **user** (gõ email/tên)
- Theo **action** (dropdown)
- Theo **IP**
- Pagination 50 rows/page

### 8.5 Export

Bấm **"Export CSV"** → tải về file CSV để mở Excel phân tích.

---

## 9. Dọn dẹp lưu trữ

### 9.1 Vấn đề

Khi xoá user, course, lesson → DB rows bị xoá nhưng **file trong MinIO** (avatar, video, WebGL) có thể còn sót → gọi là "orphan files" → tốn dung lượng.

### 9.2 Tự động

Cron chạy **03:00 Chủ Nhật** hàng tuần — quét `avatars/`, `thumbnails/`, `content/*/`, `certificates/` → xoá file không có DB reference.

### 9.3 Chạy thủ công

1. **Sidebar → "Cài đặt hệ thống" → tab Lưu trữ**
2. Bấm **"Dọn dẹp NGAY"** (chỉ Super Admin)
3. Xem progress bar
4. Kết quả: "Quét X files, dùng Y files, orphan Z files, xoá Z files"
5. Audit log ghi `STORAGE_CLEANUP` với chi tiết

---

## 10. Quản lý AI quota

### 10.1 Vấn đề quota

Gemini free tier: **1500 request/ngày** toàn hệ thống. Reset **00:00 PST** (15:00 VN time).

### 10.2 Xem quota

**Sidebar → "Cài đặt hệ thống" → tab AI & Quota**:

- **Hôm nay**: X / 1500 request (+ thanh progress)
- **Biểu đồ 30 ngày**: tăng/giảm qua thời gian
- **Top user xài nhiều nhất**: ranking

### 10.3 Khi sắp hết quota

- Khi dùng > 80% → hiện cảnh báo vàng cho Admin
- Khi dùng > 95% → gửi email alert cho Super Admin
- Hết quota → AI chat im lặng, hiện "Hệ thống quá tải, thử lại sau"

### 10.4 Giải pháp

**Ngắn hạn**: tắt AI cho đến 15:00 VN ngày mai (quota reset):

- Tab AI → toggle **"Enable AI"** = OFF → tiết kiệm quota còn lại

**Dài hạn**: nâng gói trả phí:

1. Vào https://aistudio.google.com/
2. Enable billing
3. Update `GEMINI_API_KEY` mới trong `.env.production`
4. Restart backend

---

## 🎯 Checklist Super Admin hàng ngày

- [ ] Kiểm tra audit log có action lạ không
- [ ] Xem backup cron 02:00 sáng có SUCCESS không
- [ ] Xem quota AI còn đủ cho ngày hôm nay không
- [ ] Xem user đăng ký mới (có spam bot không)
- [ ] Kiểm tra `/admin/dashboard` — có alert đỏ nào không

## 🎯 Checklist hàng tuần

- [ ] Tải 1 backup về máy local / S3 external (phòng server hỏng)
- [ ] Xem báo cáo Reports → trend học viên tăng/giảm
- [ ] Check storage cleanup Chủ Nhật đã chạy chưa
- [ ] Review user bị block trong tuần

## 🎯 Checklist hàng tháng

- [ ] Đổi mật khẩu Super Admin
- [ ] Review Admin đã tạo — ai không dùng nữa → xoá
- [ ] Kiểm tra SMTP còn hoạt động (Test SMTP)
- [ ] Update `.env.production` nếu đổi nhà cung cấp email/AI

---

**Tiếp theo**:

- [📖 Hướng dẫn Admin](./02-Admin.md) — các tính năng Admin chung (Super Admin cũng dùng)
- [📖 FAQ & Xử lý sự cố](./05-FAQ.md)
