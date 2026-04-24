# 🔵 HƯỚNG DẪN ADMIN

> **Admin là ai?** — Người quản lý vận hành hàng ngày của hệ thống. Admin giống như **"thư ký trường học"**: ghi danh học viên, duyệt khoá học mới của giảng viên, xem báo cáo.
>
> **Cái gì KHÔNG phải của Admin?** — Tạo Admin khác, sửa cài đặt hệ thống, sao lưu database. Những việc này là của **Super Admin**.

---

## Mục lục

1. [Màn hình chính của Admin](#1-màn-hình-chính-của-admin)
2. [Quản lý người dùng](#2-quản-lý-người-dùng)
3. [Quản lý Ngành - Môn - Khoá học](#3-quản-lý-ngành---môn---khoá-học)
4. [Duyệt khoá học mới](#4-duyệt-khoá-học-mới)
5. [Xem báo cáo](#5-xem-báo-cáo)
6. [Quản lý chứng chỉ](#6-quản-lý-chứng-chỉ)
7. [Xem nhật ký hệ thống](#7-xem-nhật-ký-hệ-thống)
8. [Gán ngành cho học viên](#8-gán-ngành-cho-học-viên)

---

## 1. Màn hình chính của Admin

Sau khi đăng nhập, bạn vào trang `/admin/dashboard`. Màn hình chia **4 phần**:

### 📊 Phần 1 — 4 ô số liệu trên cùng

Hiện ngay 4 con số quan trọng nhất:

| Ô                  | Ý nghĩa                                         |
| ------------------ | ----------------------------------------------- |
| 👥 Tổng người dùng | Bao nhiêu người có tài khoản                    |
| 📚 Tổng khoá học   | Bao nhiêu khoá đang mở                          |
| ✅ Đã hoàn thành   | Số lượt học viên hoàn thành khoá học            |
| ⏳ Đang chờ duyệt  | Khoá học giảng viên gửi lên, đang chờ bạn duyệt |

### 📈 Phần 2 — Biểu đồ "Đăng ký mới 7 ngày qua"

Đường biểu đồ cho thấy mỗi ngày có bao nhiêu học viên mới.

### 🔔 Phần 3 — "Cảnh báo" (AlertsPanel)

Liệt kê những việc **cần bạn làm ngay**:

- "3 khoá học đang chờ duyệt"
- "5 giảng viên chưa có khoá nào"
- "2 học viên bị flag nguy cơ"

Bấm vào mỗi dòng → đi thẳng đến nơi cần xử lý.

### 📜 Phần 4 — "Hoạt động gần đây"

Xem 20 hành động mới nhất trong hệ thống: ai đăng nhập, ai tạo khoá, ai được cấp chứng chỉ...

Bấm **"Xem tất cả nhật ký"** → vào trang đầy đủ.

---

## 2. Quản lý người dùng

### 2.1 Vào trang

**Menu bên trái → "Người dùng"** hoặc URL `/admin/users`

### 2.2 Bảng danh sách hiển thị

| Cột        | Ý nghĩa                               |
| ---------- | ------------------------------------- |
| Họ tên     | Tên đầy đủ                            |
| Email      | Email đăng nhập                       |
| Vai trò    | STUDENT / INSTRUCTOR / ADMIN...       |
| Ngành      | Khoa/ngành được gán (vd: "Khoa Điện") |
| Trạng thái | Đang hoạt động / Bị khoá              |
| Ngày tạo   | Ngày tham gia hệ thống                |

### 2.3 Tìm nhanh người dùng

- Gõ **tên** hoặc **email** vào ô search phía trên bảng
- Dùng **bộ lọc** bên cạnh:
  - Theo **Vai trò**: dropdown chọn STUDENT, INSTRUCTOR, ADMIN
  - Theo **Ngành**: chọn khoa
  - Theo **Trạng thái**: đang hoạt động / bị khoá

### 2.4 Tạo người dùng mới

1. Bấm nút **"+ Tạo người dùng"** (góc trên phải)
2. Điền form:
   - **Email** (ví dụ: `sv0123@gvd.local`)
   - **Họ tên** đầy đủ
   - **Mật khẩu tạm** (tối thiểu 8 ký tự)
   - **Vai trò** — chọn STUDENT / INSTRUCTOR (không chọn được ADMIN — việc đó của Super Admin)
   - **Ngành** (tuỳ chọn) — gán ngay hoặc để trống rồi gán sau
3. Bấm **"Tạo"**
4. Hệ thống gửi email chào mừng → người đó đổi mật khẩu khi login lần đầu

### 2.5 Sửa thông tin người dùng

1. Trong bảng → hover vào row → bấm icon **"Sửa" (✏️)**
2. Popup mở — sửa tên / email / ngành
3. Bấm **"Lưu"**

### 2.6 Khoá tài khoản (block)

Khi học viên vi phạm / nghỉ học, bạn có thể khoá:

1. Hover row → bấm icon **"Khoá" (🔒)**
2. Popup hỏi lý do — điền ngắn gọn ("Vi phạm quy chế", "Đã chuyển trường"...)
3. Bấm **"Xác nhận khoá"**
4. User đó **không đăng nhập được** nữa cho đến khi bạn mở khoá

### 2.7 Mở khoá (unblock)

1. Trong bộ lọc → chọn **"Đã khoá"** để xem user bị khoá
2. Hover row → bấm **icon khoá mở (🔓)**
3. Xác nhận → user đăng nhập được lại

### 2.8 Xoá người dùng

> ⚠️ Hành động này **không hoàn tác dễ dàng**. Cân nhắc kỹ!

1. Hover row → bấm **icon Thùng rác đỏ (🗑️)**
2. Popup yêu cầu gõ **email của user** để xác nhận (tránh xoá nhầm)
3. Bấm **"Xoá vĩnh viễn"**
4. User bị xoá — dữ liệu họ (course đã học, chứng chỉ) vẫn còn trong DB nhưng UI ẩn

### 2.9 Thao tác hàng loạt (bulk actions)

Khi muốn khoá 50 user cùng lúc:

1. Tích checkbox dòng đầu tiên
2. Shift-click dòng cuối cùng → chọn 50 dòng
3. Thanh action hiện lên trên bảng: **"Khoá tất cả" / "Xoá tất cả" / "Xuất Excel"**
4. Bấm → popup xác nhận số lượng → OK

---

## 3. Quản lý Ngành - Môn - Khoá học

### 3.1 Cấu trúc cây phân cấp

Hệ thống tổ chức nội dung theo **5 tầng**:

```
🏫 NGÀNH         (ví dụ: "Kỹ thuật Điện")
 └─ 📚 MÔN         (ví dụ: "Mạch điện 1")
    └─ 📖 KHOÁ HỌC   (ví dụ: "Mạch điện 1 — Kỳ 1 năm 2026")
       └─ 📑 CHƯƠNG     (ví dụ: "Chương 1: Giới thiệu")
          └─ 📄 BÀI HỌC    (ví dụ: "Bài 1.1: Định luật Ohm")
```

### 3.2 Vào trang

**Menu → "Curriculum"** (`/admin/curriculum`)

Hiện cây có thể mở/đóng từng tầng bằng mũi tên ▶️.

### 3.3 Tạo Ngành mới

1. Bấm nút **"+ Tạo Ngành"** (góc trên)
2. Điền:
   - **Tên Ngành** (vd: "Tự động hoá")
   - **Mã** (vd: "TDH") — duy nhất, không trùng
   - **Mô tả** (tuỳ chọn)
   - **Ảnh thumbnail** (tuỳ chọn — JPG/PNG, dùng trên trang chủ)
3. Bấm **"Tạo"**

### 3.4 Tạo Môn trong Ngành

1. Trong cây → hover vào Ngành → bấm nút **"+"** bên phải
2. Chọn **"Thêm Môn"**
3. Điền tên Môn, mã Môn → **"Tạo"**

### 3.5 Khoá học → Chương → Bài học

Thường do **Giảng viên** tạo (xem [Hướng dẫn Giảng viên](./03-Giang-vien.md)). Admin có quyền:

- **Duyệt** (xem mục 4)
- **Xoá** (nếu nội dung vi phạm)
- **Xem mọi khoá** (bao gồm DRAFT của giảng viên khác)

### 3.6 Xoá Ngành / Môn / Khoá

#### Quy tắc xoá (đảm bảo an toàn)

| Đối tượng    | Điều kiện xoá                            | Ai làm được         |
| ------------ | ---------------------------------------- | ------------------- |
| **Ngành**    | Phải xoá hết **Môn con** trước           | Chỉ **Super Admin** |
| **Môn**      | Phải xoá hết **Khoá con** trước          | Admin + Super Admin |
| **Khoá học** | Xoá được luôn (không cần xoá Chương/Bài) | Admin + Super Admin |

#### Các bước

1. Trong cây → hover vào đối tượng → bấm icon **Thùng rác (🗑️)** hiện bên phải
2. Popup hỏi xác nhận — bấm **"Xoá"**
3. Nếu có con → báo lỗi: "Xoá hết con trước đi"

### 3.7 Sửa tên / mô tả

Hover → bấm icon **Bút chì (✏️)** → sửa → Lưu.

---

## 4. Duyệt khoá học mới

### 4.1 Quy trình "Gửi duyệt → Duyệt"

```
1. Giảng viên soạn khoá (Status = DRAFT)
2. Giảng viên bấm "Gửi duyệt" (Status = PENDING_REVIEW)
3. Admin xem → Duyệt (Status = PUBLISHED) hoặc Từ chối (Status = DRAFT + lý do)
4. Khi PUBLISHED → học viên cùng Ngành tự động được enroll (auto-enroll)
```

### 4.2 Xem danh sách chờ duyệt

**Menu → "Nội dung"** (`/admin/content`) → tab **"Chờ duyệt"**

Bảng hiện:

- Tên khoá
- Giảng viên
- Ngành/Môn
- Ngày gửi duyệt
- Số chương / số bài
- Nút **"Xem chi tiết"** và **"Duyệt nhanh"**

### 4.3 Xem chi tiết khoá

Bấm **"Xem chi tiết"** → mở trang `/instructor/courses/:id/edit` (chế độ read-only cho Admin):

- Xem cấu trúc Chương / Bài
- Xem nội dung từng bài (video, slide, quiz...)
- Xem quiz câu hỏi + đáp án đúng
- Download attachment đính kèm

### 4.4 Duyệt

**Cách 1 — Duyệt nhanh**:

- Trong bảng "Chờ duyệt" → bấm **"Duyệt nhanh" (✓)** xanh
- Popup xác nhận → bấm **"Duyệt"**
- Trạng thái: PENDING_REVIEW → **PUBLISHED**

**Cách 2 — Duyệt có ghi chú**:

- Vào chi tiết khoá → bấm **"Duyệt & Ghi chú"**
- Popup: ghi chú (tuỳ chọn) — sẽ gửi email cho giảng viên
- Bấm **"Duyệt"**

### 4.5 Từ chối khoá học

Khi nội dung chưa đạt (sai chính tả, thiếu bài, video hỏng...):

1. Trong chi tiết khoá → bấm **"Từ chối"** (màu đỏ)
2. Popup: **bắt buộc** ghi lý do (tối thiểu 10 ký tự)
3. Bấm **"Từ chối"**
4. Trạng thái: PENDING_REVIEW → **DRAFT**
5. Giảng viên nhận email với lý do → sửa → gửi lại

### 4.6 Sau khi duyệt

Hệ thống tự động:

1. Đánh dấu Status = PUBLISHED
2. **Auto-enroll** học viên cùng Ngành vào khoá này
3. Gửi email thông báo cho từng học viên
4. Thêm vào `activityFeed` trên dashboard

---

## 5. Xem báo cáo

### 5.1 Vào trang

**Menu → "Báo cáo"** (`/admin/reports`)

### 5.2 Các loại báo cáo

#### 📊 Báo cáo người dùng

- Số lượng user theo vai trò
- Đăng ký mới theo thời gian
- User đang hoạt động / bị khoá
- Top 10 user đăng nhập nhiều nhất

#### 📚 Báo cáo khoá học

- Số khoá học theo trạng thái (DRAFT / PENDING / PUBLISHED / ARCHIVED)
- Tỷ lệ hoàn thành trung bình
- Khoá học phổ biến nhất
- Khoá học có tỷ lệ đỗ thấp nhất → có thể nội dung cần cải thiện

#### 📈 Báo cáo tiến độ

- Phân phối điểm học viên (biểu đồ histogram)
- Ngành/Môn nào học viên học tốt nhất
- Học viên nguy cơ (at-risk) — điểm < 50% hoặc không vào hệ thống 14 ngày

#### 🎓 Báo cáo chứng chỉ

- Số chứng chỉ cấp theo tháng
- Phân phối grade (Xuất sắc / Giỏi / Đạt)
- Khoá có nhiều chứng chỉ nhất

### 5.3 Xuất Excel / PDF

Mỗi báo cáo có nút **"Tải Excel"** hoặc **"Tải PDF"** góc trên phải.

File Excel có đầy đủ:

- Sheet 1: Summary (tổng kết)
- Sheet 2: Detail (chi tiết từng row)
- Biểu đồ tự động

---

## 6. Quản lý chứng chỉ

### 6.1 Cấp chứng chỉ tự động

Hệ thống **tự cấp chứng chỉ** khi học viên đạt đủ điều kiện (điểm ≥ 70%, hoàn thành tất cả bài...). Admin không cần làm gì.

### 6.2 Khi nào Admin vào tay?

- Học viên cần cấp chứng chỉ **thủ công** (ví dụ: học viên đặc biệt, ngoại lệ)
- Cần **thu hồi** chứng chỉ (học viên gian lận, đạo văn)

### 6.3 Cấp thủ công

1. **Menu → "Chứng chỉ"** (`/admin/certificates`)
2. Bấm **"+ Cấp thủ công"**
3. Chọn:
   - **Học viên** (gõ email tìm)
   - **Khoá học**
   - **Grade** (Xuất sắc / Giỏi / Đạt)
   - **Điểm cuối kỳ** (%)
   - **Lý do cấp thủ công** (để audit)
4. Bấm **"Cấp chứng chỉ"**
5. Hệ thống sinh PDF → email học viên có link tải

### 6.4 Thu hồi chứng chỉ

1. Tìm chứng chỉ trong bảng → hover → bấm **"Thu hồi" (🚫)**
2. Popup: ghi lý do (tối thiểu 20 ký tự)
3. Bấm **"Thu hồi"**
4. Chứng chỉ đánh dấu **REVOKED** — khi ai đó scan QR verify sẽ thấy "ĐÃ THU HỒI"
5. Audit log ghi `CERTIFICATE_REVOKED`

---

## 7. Xem nhật ký hệ thống

### 7.1 Vị trí

**Menu → "Nhật ký hệ thống"** (`/admin/audit-log`)

### 7.2 Nhật ký là gì?

**Ghi lại mọi hành động** có thể gây ảnh hưởng trong hệ thống:

- Ai đăng nhập
- Ai tạo/sửa/xoá user
- Ai duyệt khoá học
- Ai cấp / thu hồi chứng chỉ
- Ai chạy backup / restore

Dùng để:

- **Tra cứu sự cố**: "Hôm qua user X bị xoá, ai xoá?"
- **Audit tuân thủ**: chứng minh hệ thống có kiểm soát

### 7.3 Đọc hiểu 1 dòng log

```
24/04/2026 10:30   🟢 Instructor   Nguyễn Văn A   COURSE_SUBMIT   Course: cmoasl8pj0...   ::1
────────────────   ─────────────   ────────────   ─────────────   ────────────────────   ──
Thời gian          Vai trò         Tên user       Action          Đối tượng bị tác động   IP
```

### 7.4 Tên action thường gặp (dịch)

| Action                | Nghĩa tiếng Việt               |
| --------------------- | ------------------------------ |
| `USER_LOGIN`          | Đăng nhập                      |
| `USER_LOGOUT`         | Đăng xuất                      |
| `ADMIN_CREATE_USER`   | Admin tạo user                 |
| `ADMIN_DELETE_USER`   | Admin xoá user                 |
| `ADMIN_UPDATE_ROLE`   | Admin đổi vai trò user         |
| `COURSE_SUBMIT`       | Giảng viên gửi duyệt khoá      |
| `COURSE_APPROVE`      | Admin duyệt                    |
| `COURSE_REJECT`       | Admin từ chối                  |
| `CERTIFICATE_ISSUED`  | Cấp chứng chỉ                  |
| `CERTIFICATE_REVOKED` | Thu hồi chứng chỉ              |
| `BACKUP_CREATED`      | Tạo backup                     |
| `WEBGL_DELETED`       | Giảng viên xoá WebGL thực hành |

### 7.5 Bộ lọc

- **Khoảng thời gian** (vd: 7 ngày qua)
- **User** (gõ email)
- **Action** (dropdown)

### 7.6 Xem chi tiết 1 log

Bấm **"Chi tiết"** → popup hiện JSON đầy đủ:

- **oldValue**: giá trị trước khi đổi
- **newValue**: giá trị sau khi đổi
- **metadata**: thông tin thêm (user agent, session id...)

---

## 8. Gán ngành cho học viên

### 8.1 Tại sao cần?

Khi học viên được gán vào **Khoa Điện**, khoá mới thuộc Khoa Điện được PUBLISHED → học viên đó **tự động enroll** (không cần Admin click từng người).

### 8.2 Các bước

1. **Menu → "Người dùng"**
2. Tìm học viên → bấm vào row
3. Panel chi tiết mở — tìm mục **"Ngành học"**
4. Bấm **"Đổi ngành"** → dropdown hiện danh sách Ngành
5. Chọn Ngành mới → **"Lưu"**
6. Học viên tự enroll vào các khoá PUBLISHED của Ngành đó trong **vòng 24 giờ** (cron 06:00 AM mỗi ngày) hoặc bạn có thể bấm **"Enroll ngay"** để trigger ngay

### 8.3 Bỏ gán ngành

- Đổi về **"Chưa có ngành"** (option đầu dropdown)
- Học viên **không bị un-enroll** khoá đã học — chỉ ngăn auto-enroll khoá mới

---

## 🎯 Checklist Admin hàng ngày

Buổi sáng vào hệ thống, kiểm tra:

- [ ] **Cảnh báo** trên dashboard có gì gấp không
- [ ] **Chờ duyệt** — duyệt các khoá học mới
- [ ] **Người dùng mới** đăng ký — có spam không
- [ ] **Học viên nguy cơ** (at-risk) — liên hệ giảng viên
- [ ] **Nhật ký** — có action lạ không

## 🎯 Hàng tuần

- [ ] Export báo cáo cho ban lãnh đạo
- [ ] Review ngành/môn — có cần thêm không
- [ ] Check giảng viên nào chưa active — động viên

---

**Tiếp theo**:

- [📖 Hướng dẫn Giảng viên](./03-Giang-vien.md) — để hiểu quy trình giảng viên làm
- [📖 FAQ & Xử lý sự cố](./05-FAQ.md)
