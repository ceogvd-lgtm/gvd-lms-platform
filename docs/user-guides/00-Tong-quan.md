# 📘 HƯỚNG DẪN SỬ DỤNG — Tổng quan

> Tài liệu dành cho **TẤT CẢ người dùng** (Học viên, Giảng viên, Admin, Super Admin). Đây là các thao tác cơ bản ai cũng cần biết.

---

## Mục lục

1. [GVD next gen LMS là gì?](#1-gvd-next-gen-lms-là-gì)
2. [Các vai trò trong hệ thống](#2-các-vai-trò-trong-hệ-thống)
3. [Đăng nhập lần đầu](#3-đăng-nhập-lần-đầu)
4. [Quên mật khẩu](#4-quên-mật-khẩu)
5. [Xác thực 2 lớp (2FA)](#5-xác-thực-2-lớp-2fa)
6. [Đổi mật khẩu](#6-đổi-mật-khẩu)
7. [Hồ sơ cá nhân](#7-hồ-sơ-cá-nhân)
8. [Giao diện tối / sáng](#8-giao-diện-tối--sáng)
9. [Thanh menu bên trái](#9-thanh-menu-bên-trái)
10. [Chuông thông báo](#10-chuông-thông-báo)
11. [Tìm kiếm nhanh](#11-tìm-kiếm-nhanh)
12. [Đăng xuất](#12-đăng-xuất)
13. [Trợ lý AI Gemini](#13-trợ-lý-ai-gemini)

---

## 1. GVD next gen LMS là gì?

GVD next gen LMS là **hệ thống đào tạo trực tuyến thế hệ mới**, phục vụ:

- ✅ **Học lý thuyết** qua video, bài trình chiếu, SCORM
- ✅ **Thực hành ảo 3D** bằng Unity WebGL (mô phỏng thiết bị công nghiệp thật)
- ✅ **Kiểm tra** qua quiz server-side (không gian lận được)
- ✅ **Theo dõi tiến độ** cá nhân + lớp học
- ✅ **Cấp chứng chỉ** tự động khi hoàn thành khoá
- ✅ **Trò chuyện AI** (Gemini) khi cần hỏi nhanh

Truy cập tại: **`https://gvdsoft.com.vn`** (production) hoặc `http://localhost:3000` (dev).

---

## 2. Các vai trò trong hệ thống

Hệ thống có **4 vai trò**, phân quyền rõ ràng:

| Vai trò                     |  Biểu tượng   | Quyền chính                                            |
| --------------------------- | :-----------: | ------------------------------------------------------ |
| **Super Admin**             |    🟡 Vàng    | Toàn quyền — tạo/xoá Admin, cấu hình hệ thống, sao lưu |
| **Admin**                   | 🔵 Xanh dương | Quản lý user, duyệt khoá học, xem báo cáo              |
| **Instructor** (Giảng viên) |  🟢 Xanh lá   | Tạo khoá, soạn bài, chấm quiz, xem analytics           |
| **Student** (Học viên)      |    ⚪ Xám     | Học, thi, thực hành, nhận chứng chỉ                    |

Mỗi vai trò có **dashboard riêng** + **sidebar menu riêng**. Khi đăng nhập, hệ thống tự chuyển bạn đến dashboard đúng vai trò.

---

## 3. Đăng nhập lần đầu

### 3.1 Các cách đăng nhập

Hệ thống hỗ trợ **2 cách**:

#### Cách 1: Email + Mật khẩu

1. Truy cập `https://gvdsoft.com.vn/login`
2. Nhập **Email** (ví dụ: `student01@gvd.local`)
3. Nhập **Mật khẩu** được cấp
4. Bấm nút **"Đăng nhập"**
5. Nếu lần đầu → hệ thống yêu cầu đổi mật khẩu

#### Cách 2: Google OAuth (chỉ Admin hoặc user đã link Google)

1. Tại trang `/login` → bấm **"Đăng nhập với Google"**
2. Chọn tài khoản Google có email đã được Admin cấp quyền
3. Tự động vào dashboard

### 3.2 Lần đầu sau khi đăng nhập

- Hệ thống chuyển đến **dashboard** theo vai trò:
  - Student → `/student/dashboard`
  - Instructor → `/instructor/dashboard`
  - Admin → `/admin/dashboard`
  - Super Admin → `/admin/dashboard` (cùng giao diện Admin, nhưng thấy thêm nút "Cài đặt hệ thống")

### 3.3 Lưu ý bảo mật

- **KHÔNG chia sẻ mật khẩu** với bất kỳ ai
- **KHÔNG login vào máy lạ** — nếu phải, nhớ bấm "Đăng xuất" khi xong
- Phiên đăng nhập tự hết hạn sau **15 phút không thao tác** (tự làm mới khi bạn đang dùng)

---

## 4. Quên mật khẩu

### 4.1 Các bước

1. Tại trang `/login`, bấm **"Quên mật khẩu?"**
2. Nhập email của bạn
3. Bấm **"Gửi liên kết đặt lại"**
4. Mở email (kiểm tra cả hộp **Spam/Thư rác** nếu không thấy)
5. Trong email có nút **"Đặt lại mật khẩu"** — bấm vào
6. Nhập mật khẩu mới (tối thiểu 8 ký tự, có chữ hoa + số + ký tự đặc biệt)
7. Xác nhận → đăng nhập lại với mật khẩu mới

### 4.2 Không nhận được email?

- Đợi 2-3 phút (email có thể chậm)
- Kiểm tra hộp Spam / Promotions
- Nếu sau 10 phút vẫn không có → **liên hệ Admin** (người cấp tài khoản cho bạn)
- Liên kết đặt lại **chỉ có hiệu lực 30 phút**, sau đó phải gửi lại

---

## 5. Xác thực 2 lớp (2FA)

### 5.1 2FA là gì?

Khi bật 2FA, mỗi lần đăng nhập hệ thống yêu cầu **thêm mã OTP 6 số** gửi qua email → tăng bảo mật khi lộ mật khẩu.

### 5.2 Bật 2FA (khuyên cho mọi Admin+)

1. Đăng nhập → bấm **avatar** góc trên phải
2. Chọn **"Hồ sơ"** hoặc **"Tài khoản"**
3. Tìm mục **"Xác thực 2 lớp"**
4. Bật công tắc → hệ thống yêu cầu nhập mã OTP đầu tiên để xác nhận
5. Kiểm tra email → lấy mã 6 số → nhập vào
6. 2FA đã bật

### 5.3 Đăng nhập khi đã bật 2FA

1. Nhập email + mật khẩu như bình thường
2. Hệ thống gửi mã OTP 6 số qua email
3. Nhập mã (có hiệu lực **10 phút**)
4. Bấm **"Xác nhận"** → vào dashboard

### 5.4 Mất quyền truy cập email?

- Bị quên email → **không tự gỡ 2FA được**
- Phải liên hệ Super Admin (hoặc Admin) tắt 2FA cho bạn
- Sau đó đổi email mới, bật 2FA lại

---

## 6. Đổi mật khẩu

### 6.1 Các bước

1. Bấm **avatar** góc trên phải → **"Tài khoản"**
2. Mục **"Đổi mật khẩu"**
3. Nhập:
   - **Mật khẩu hiện tại**
   - **Mật khẩu mới** (tối thiểu 8 ký tự, có chữ hoa + số)
   - **Nhập lại mật khẩu mới**
4. Bấm **"Lưu"**
5. Hệ thống tự đăng xuất → đăng nhập lại với mật khẩu mới

### 6.2 Quy tắc mật khẩu tốt

- **Độ dài**: tối thiểu 8 ký tự (khuyên 12+)
- **Có chữ hoa** (ABC)
- **Có chữ thường** (abc)
- **Có số** (123)
- **Có ký tự đặc biệt** (!@#$%)
- **KHÔNG dùng** tên, ngày sinh, số điện thoại
- **KHÔNG dùng** mật khẩu giống các trang khác (Facebook, email)

---

## 7. Hồ sơ cá nhân

### 7.1 Xem / sửa hồ sơ

1. Bấm **avatar** góc trên phải → **"Hồ sơ"**
2. Hiển thị:
   - **Họ tên**
   - **Email**
   - **Avatar** (có thể upload ảnh mới — JPG/PNG, tối đa 5MB)
   - **Vai trò** (không sửa được — Admin quản lý)
   - **Khoa/Ngành** (chỉ Admin gán được)
   - **Ngày tham gia**
3. Sửa tên hoặc avatar → bấm **"Lưu thay đổi"**

### 7.2 Upload avatar

1. Bấm vào ảnh avatar hiện tại
2. Chọn file từ máy tính (JPG, PNG, WEBP — tối đa 5MB)
3. Hệ thống tự resize về 256×256px
4. Bấm **"Lưu"**

---

## 8. Giao diện tối / sáng

Có 2 chế độ:

- **☀️ Light** (sáng) — nền trắng, dễ đọc ban ngày
- **🌙 Dark** (tối) — nền đen, dễ chịu mắt ban đêm

### Cách đổi

- Bấm biểu tượng **mặt trời/mặt trăng** ở thanh header (góc trên phải)
- Hệ thống nhớ lựa chọn của bạn cho lần sau
- Tự động theo hệ điều hành nếu bạn chưa chọn thủ công

---

## 9. Thanh menu bên trái

Menu bên trái (sidebar) hiển thị **theo vai trò**:

### Student

- 🏠 **Tổng quan** — dashboard cá nhân
- 📖 **Khoá học** — danh sách khoá đã ghi danh
- 📊 **Tiến độ** — biểu đồ + timeline học tập
- ⚙️ **Cài đặt** — hồ sơ, mật khẩu, 2FA

### Instructor

- 🏠 **Tổng quan**
- 📚 **Khoá học của tôi**
- ➕ **Tạo khoá mới**
- ❓ **Ngân hàng câu hỏi**
- 📊 **Analytics** (thống kê)

### Admin

- 🏠 **Dashboard**
- 👥 **Người dùng**
- 🏫 **Curriculum** (ngành/môn/khoá)
- ❓ **Ngân hàng câu hỏi toàn hệ thống**
- 🎓 **Chứng chỉ**
- 📈 **Báo cáo**
- ⚙️ **Cài đặt hệ thống** (chỉ Super Admin sửa được)
- 📜 **Nhật ký hệ thống** (audit log)

### Super Admin

Giống Admin nhưng thêm:

- **"Cài đặt hệ thống"** — quyền sửa (Admin chỉ xem)
- **"Backup"** — tạo/phục hồi sao lưu
- **"Quản lý Admin"** — tạo/xoá Admin khác

---

## 10. Chuông thông báo

### 10.1 Vị trí

Biểu tượng **🔔 chuông** ở header (góc trên phải). Khi có thông báo mới → hiện **chấm đỏ**.

### 10.2 Các loại thông báo

- 📢 **Khoá học mới** được gán — Student
- ✅ **Bài quiz đã chấm** — Student (ngay sau nộp bài)
- 🎓 **Chứng chỉ mới** được cấp — Student
- ⚠️ **Học viên ở mức rủi ro** — Instructor
- 💬 **Có người reply câu hỏi của bạn** — Student / Instructor
- 🛠️ **Có khoá học đang chờ duyệt** — Admin
- 📧 **Hệ thống** (maintenance, update)

### 10.3 Thao tác

- **Bấm chuông** → hiện popup list 10 thông báo mới nhất
- Bấm **1 thông báo** → đi đến trang liên quan (khoá học, quiz, discussion…)
- Bấm **"Xem tất cả"** → vào `/notifications` (đầy đủ có pagination)
- Bấm **"Đánh dấu đã đọc"** (x) trên từng item

### 10.4 Real-time

Thông báo **tức thì** qua WebSocket — không cần refresh trang.

---

## 11. Tìm kiếm nhanh

### 11.1 Vị trí

Thanh **"Tìm khoá học, bài giảng..."** ở trên cùng (header).

### 11.2 Cách dùng

1. Gõ từ khoá (ví dụ: "an toàn lao động", "PPE", "điện công nghiệp")
2. Hệ thống tự gợi ý khoá học / bài giảng / tài liệu
3. Bấm gợi ý → đi thẳng đến nội dung

### 11.3 Phím tắt

- `Ctrl + K` (Windows) hoặc `⌘ + K` (Mac) — mở nhanh ô tìm kiếm

---

## 12. Đăng xuất

### 12.1 Các bước

**Cách 1**: bấm nút **"Đăng xuất"** ở cuối sidebar (góc dưới bên trái)

**Cách 2**: bấm avatar góc trên phải → **"Đăng xuất"**

### 12.2 Lưu ý

- Đăng xuất **ngay khi xong** nếu dùng máy chung
- Không có nút "Đăng xuất khỏi mọi thiết bị" — phải đổi mật khẩu để vô hiệu hoá mọi phiên cũ

---

## 13. Trợ lý AI Gemini

### 13.1 Vị trí

Nút **✨ tròn** ở góc dưới phải màn hình (chỉ hiện cho Student).

### 13.2 Các câu hỏi hay dùng

- "Giải thích về PPE"
- "Tóm tắt bài học này"
- "Câu hỏi thi cuối khoá thường có gì?"
- "Cách đo điện trở một chiều?"

### 13.3 Hoạt động

1. Bấm nút ✨ → mở cửa sổ chat
2. Gõ câu hỏi → Enter
3. AI trả lời trong **5-15 giây** (streaming từng chữ)
4. AI có **biết nội dung bài học hiện tại** — nên câu trả lời chuẩn theo tài liệu, không bịa

### 13.4 Giới hạn

- **1500 câu hỏi/ngày** toàn hệ thống (quota miễn phí Gemini)
- Nếu hết → hiện thông báo "Hệ thống đang quá tải, vui lòng thử lại sau"
- Không nên hỏi câu ngoài chủ đề kỹ thuật (AI tập trung vào giáo dục công nghiệp)

### 13.5 Rate limit

- Tối đa **10 câu/phút** mỗi người → tránh spam

---

## 🎯 Các phím tắt hữu ích

| Phím tắt           | Tác dụng                                            |
| ------------------ | --------------------------------------------------- |
| `Ctrl + K`         | Mở ô tìm kiếm                                       |
| `Ctrl + Shift + R` | Refresh cứng (dùng khi UI cũ)                       |
| `Esc`              | Thoát fullscreen hoặc đóng popup                    |
| `F11`              | Toàn màn hình browser (không phải Unity fullscreen) |

---

## ⚠️ Khi gặp sự cố

| Triệu chứng              | Hướng dẫn                                                                      |
| ------------------------ | ------------------------------------------------------------------------------ |
| Trang trắng xoá          | Hard refresh `Ctrl + Shift + R`                                                |
| Đăng nhập không vào được | Xem [FAQ — Lỗi đăng nhập](./05-FAQ.md)                                         |
| Quên mật khẩu            | Làm theo [Mục 4](#4-quên-mật-khẩu)                                             |
| WebGL không load         | Xem [Hướng dẫn Học viên — Thực hành ảo](./04-Hoc-vien.md#9-thực-hành-ảo-webgl) |
| Không nhận email         | Kiểm tra spam, liên hệ Admin                                                   |

---

**Tiếp theo**: chọn tài liệu theo vai trò của bạn:

- [📖 Hướng dẫn Học viên](./04-Hoc-vien.md)
- [📖 Hướng dẫn Giảng viên](./03-Giang-vien.md)
- [📖 Hướng dẫn Admin](./02-Admin.md)
- [📖 Hướng dẫn Super Admin](./01-Super-Admin.md)
- [📖 FAQ & Xử lý sự cố](./05-FAQ.md)
