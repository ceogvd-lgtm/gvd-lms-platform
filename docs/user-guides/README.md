# 📚 BỘ TÀI LIỆU HƯỚNG DẪN — GVD next gen LMS

> Bộ tài liệu đầy đủ cho **mọi vai trò** trong hệ thống. Chọn đúng tài liệu theo vai trò của bạn để đọc.

---

## 🎯 Tôi là ai? — Chọn tài liệu phù hợp

### 👤 Nếu bạn là **HỌC VIÊN** (Student)

Đọc theo thứ tự:

1. **[📖 00-Tổng quan](./00-Tong-quan.md)** — Đăng nhập, thao tác chung
2. **[📖 04-Hướng dẫn Học viên](./04-Hoc-vien.md)** — Học bài, làm quiz, thực hành ảo, xem chứng chỉ
3. **[📖 05-FAQ](./05-FAQ.md)** — Khi gặp lỗi

### 👨‍🏫 Nếu bạn là **GIẢNG VIÊN** (Instructor)

Đọc theo thứ tự:

1. **[📖 00-Tổng quan](./00-Tong-quan.md)** — Đăng nhập, thao tác chung
2. **[📖 03-Hướng dẫn Giảng viên](./03-Giang-vien.md)** — Tạo khoá, soạn bài, quiz, WebGL, analytics
3. **[📖 04-Hướng dẫn Học viên](./04-Hoc-vien.md)** — Xem để hiểu góc nhìn học viên
4. **[📖 05-FAQ](./05-FAQ.md)** — Xử lý sự cố

### 🔵 Nếu bạn là **ADMIN**

Đọc theo thứ tự:

1. **[📖 00-Tổng quan](./00-Tong-quan.md)**
2. **[📖 02-Hướng dẫn Admin](./02-Admin.md)** — User, curriculum, duyệt khoá, báo cáo
3. **[📖 03-Hướng dẫn Giảng viên](./03-Giang-vien.md)** — Hiểu quy trình giảng viên
4. **[📖 05-FAQ](./05-FAQ.md)**

### 🟡 Nếu bạn là **SUPER ADMIN**

Đọc **TẤT CẢ**:

1. **[📖 00-Tổng quan](./00-Tong-quan.md)**
2. **[📖 01-Hướng dẫn Super Admin](./01-Super-Admin.md)** ⭐ — Tạo Admin, cấu hình, backup
3. **[📖 02-Hướng dẫn Admin](./02-Admin.md)** — Các tính năng chung (Super Admin dùng hết)
4. **[📖 03-Hướng dẫn Giảng viên](./03-Giang-vien.md)**
5. **[📖 04-Hướng dẫn Học viên](./04-Hoc-vien.md)**
6. **[📖 05-FAQ](./05-FAQ.md)**

---

## 📖 Mục lục đầy đủ

### [00. Tổng quan hệ thống](./00-Tong-quan.md)

_Dành cho **mọi người**. ~20 trang._

- GVD next gen LMS là gì?
- Các vai trò trong hệ thống
- Đăng nhập, đăng xuất, đổi mật khẩu
- Xác thực 2 lớp (2FA)
- Hồ sơ cá nhân
- Giao diện tối / sáng
- Menu bên trái
- Chuông thông báo, tìm kiếm
- Trợ lý AI Gemini

### [01. Hướng dẫn Super Admin](./01-Super-Admin.md)

_Dành cho **Super Admin**. ~15 trang._

- 4 luật bất biến
- Tạo / xoá Admin
- Cài đặt hệ thống (org, SMTP, security, AI quota)
- Backup & restore DB
- Audit log
- Dọn dẹp lưu trữ

### [02. Hướng dẫn Admin](./02-Admin.md)

_Dành cho **Admin** + **Super Admin**. ~25 trang._

- Dashboard admin
- Quản lý người dùng (CRUD, block, đổi role, bulk actions)
- Quản lý Ngành / Môn / Khoá học
- Duyệt khoá học mới từ giảng viên
- Xem báo cáo
- Quản lý chứng chỉ
- Xem nhật ký hệ thống
- Gán ngành cho học viên

### [03. Hướng dẫn Giảng viên](./03-Giang-vien.md)

_Dành cho **Giảng viên**. ~40 trang — chi tiết nhất._

- Tạo khoá học mới (wizard 4 bước)
- Thêm chương / bài
- Soạn nội dung:
  - Video bài giảng
  - SCORM package
  - PowerPoint
  - Lý thuyết (TipTap editor)
  - Tài liệu đính kèm
- Tạo đề Quiz + ngân hàng câu hỏi
- Upload WebGL 3D + cấu hình chấm điểm
- Gửi duyệt + xuất bản
- Chứng chỉ khoá
- Analytics học viên
- Trả lời hỏi đáp

### [04. Hướng dẫn Học viên](./04-Hoc-vien.md)

_Dành cho **Học viên**. ~35 trang — dễ hiểu nhất._

- Đăng nhập lần đầu
- Tìm + vào khoá học
- Học bài lý thuyết (video, SCORM, PPT)
- Làm Quiz
- Ghi chú khi học
- Hỏi đáp giảng viên
- Bài thực hành ảo WebGL (fullscreen, scoring)
- Xem tiến độ + điểm
- Chứng chỉ (in, tải PDF, QR verify)
- Trò chuyện với AI
- Dùng trên điện thoại

### [05. FAQ & Xử lý sự cố](./05-FAQ.md)

_Dành cho **mọi người** khi gặp lỗi. ~20 trang._

- Lỗi đăng nhập
- Quên / không nhận email reset
- Lỗi 500, 404, trang trắng
- Chạy chậm
- WebGL không load / stuck 30%
- Quiz không nộp / điểm sai
- Video không play
- Không thấy khoá / bài
- Không nhận thông báo / email
- Chứng chỉ chưa cấp
- AI chat không trả lời
- Upload lỗi
- Khi nào liên hệ ai?

---

## 🗂️ Quy ước dùng trong tài liệu

| Ký hiệu            | Ý nghĩa                           |
| ------------------ | --------------------------------- |
| `/admin/settings`  | URL trong trình duyệt             |
| **"Nút Xanh"**     | Tên nút trên UI — bấm đúng tên đó |
| `Ctrl + Shift + R` | Phím tắt — bấm đồng thời các phím |
| ⚠️                 | Cảnh báo quan trọng               |
| ✅                 | OK / được                         |
| ❌                 | Không được / cấm                  |
| 🔒                 | Bảo mật / cần quyền               |
| ⭐                 | Tính năng nổi bật                 |

---

## 🔖 Phiên bản tài liệu

| Item               | Value                               |
| ------------------ | ----------------------------------- |
| Phiên bản hệ thống | **v1.0.15**                         |
| Ngày viết          | 24/04/2026                          |
| Người viết         | GVD next gen LMS team               |
| Đối tượng          | Người dùng không cần biết công nghệ |
| Ngôn ngữ           | Tiếng Việt                          |

Tài liệu này **cập nhật song song với hệ thống**. Khi hệ thống lên version mới (vd: v1.1.0), tài liệu cũng update.

---

## 📬 Góp ý / báo lỗi tài liệu

Thấy chỗ nào:

- Khó hiểu → báo để viết lại đơn giản hơn
- Sai kỹ thuật → báo để sửa
- Thiếu tính năng → báo để bổ sung

Liên hệ: **Admin nhà trường** hoặc **team dev** qua email (xem [FAQ mục 14](./05-FAQ.md#14-khi-nào-liên-hệ-ai)).

---

## 🚀 Bắt đầu ngay

**Đây là lần đầu bạn dùng hệ thống?**

1. Đọc **[📖 Tổng quan](./00-Tong-quan.md)** trước (5 phút)
2. Tìm tài liệu theo vai trò ở [mục đầu tiên](#-tôi-là-ai--chọn-tài-liệu-phù-hợp)
3. Đọc thử **phần đầu** (không cần đọc hết ngay)
4. Vừa dùng vừa tham khảo khi cần

**Dùng lâu rồi?**

- Nhảy thẳng vào **[FAQ](./05-FAQ.md)** khi gặp lỗi
- Tìm keyword bằng `Ctrl + F` trong tài liệu

---

**Chúc bạn học tập / giảng dạy / quản trị hiệu quả với GVD next gen LMS! 🎓**
