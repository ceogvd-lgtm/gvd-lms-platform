# ❓ FAQ & XỬ LÝ SỰ CỐ

> Tài liệu **cẩm nang** khi gặp lỗi. Tìm đúng triệu chứng → làm theo các bước gợi ý.

---

## Mục lục

1. [Lỗi đăng nhập](#1-lỗi-đăng-nhập)
2. [Quên / không nhận email reset mật khẩu](#2-quên--không-nhận-email-reset-mật-khẩu)
3. [Trang trắng, lỗi 500, lỗi 404](#3-trang-trắng-lỗi-500-lỗi-404)
4. [Chạy chậm, load mãi không xong](#4-chạy-chậm-load-mãi-không-xong)
5. [Lỗi WebGL không load](#5-lỗi-webgl-không-load)
6. [WebGL bị stuck ở 30%](#6-webgl-bị-stuck-ở-30)
7. [Quiz không nộp được / điểm sai](#7-quiz-không-nộp-được--điểm-sai)
8. [Video không play](#8-video-không-play)
9. [Không thấy khoá học / bài học](#9-không-thấy-khoá-học--bài-học)
10. [Không nhận thông báo / email](#10-không-nhận-thông-báo--email)
11. [Chứng chỉ chưa được cấp](#11-chứng-chỉ-chưa-được-cấp)
12. [AI chat không trả lời](#12-ai-chat-không-trả-lời)
13. [Upload file bị lỗi](#13-upload-file-bị-lỗi)
14. [Khi nào liên hệ ai?](#14-khi-nào-liên-hệ-ai)

---

## 1. Lỗi đăng nhập

### Triệu chứng

- Gõ đúng email + mật khẩu nhưng báo "Email hoặc mật khẩu không đúng"
- Báo "Tài khoản đã bị khoá"
- Sau 5 lần sai → bị khoá 15 phút

### Hướng dẫn xử lý

**Bước 1 — Kiểm tra email đúng chưa**:

- Email **có khoảng trắng thừa** không? (copy-paste hay dính)
- Có **viết hoa sai** không? (`Student@lms.local` ≠ `student@lms.local` ở một số cấu hình)
- Có **dùng đúng email** nhà trường cấp không?

**Bước 2 — Kiểm tra mật khẩu**:

- Phím **Caps Lock** có bật không? (tắt Caps Lock)
- Có dùng **bàn phím tiếng Việt** khiến số/ký tự gõ sai không? (tạm chuyển Eng)
- **Copy-paste** mật khẩu từ email (nhưng xoá khoảng trắng đầu/cuối)

**Bước 3 — Thử reset mật khẩu**:

- Bấm **"Quên mật khẩu?"** → làm theo [Mục 2](#2-quên--không-nhận-email-reset-mật-khẩu)

**Bước 4 — Bị khoá 15 phút?**:

- Đợi đủ **15 phút** (xem đồng hồ) → thử lại
- Không có nút "mở khoá sớm"

**Bước 5 — Tài khoản bị Admin khoá**:

- Liên hệ **Admin** nhà trường (không phải hệ thống)
- Họ sẽ mở khoá cho bạn

---

## 2. Quên / không nhận email reset mật khẩu

### Triệu chứng

- Bấm "Quên mật khẩu?" → gõ email → bấm Gửi
- Báo "Đã gửi email"
- **Kiểm tra inbox không thấy**

### Hướng dẫn

**Bước 1 — Kiểm tra thư mục Spam**:

- Trong Gmail: vào **"Spam"** hoặc **"Thư rác"**
- Trong Outlook: vào **"Junk Email"**
- Nếu thấy email → mở → "Không phải spam"

**Bước 2 — Đợi thêm**:

- Đôi khi email chậm **2-5 phút**, đặc biệt giờ cao điểm
- Đợi đủ **10 phút** rồi mới kết luận không có

**Bước 3 — Gõ lại email**:

- Có thể gõ sai email → email gửi đến địa chỉ sai
- Kiểm tra **chữ cái nhầm**: `o` vs `0`, `l` vs `1`, `rn` vs `m`

**Bước 4 — Kiểm tra tab "Promotions"** (Gmail):

- Gmail đôi khi xếp email vào tab "Quảng cáo" / "Cập nhật"
- Scroll lên trên, click các tab đó

**Bước 5 — Link hết hạn**:

- Link reset chỉ có hiệu lực **30 phút**
- Nếu đã quá 30 phút → bấm "Quên mật khẩu?" **một lần nữa** để gửi link mới

**Bước 6 — Vẫn không có**:

- Liên hệ **Admin** nhà trường
- Admin có thể **reset thủ công** mật khẩu cho bạn

---

## 3. Trang trắng, lỗi 500, lỗi 404

### Lỗi 404 "Không tìm thấy trang"

**Nguyên nhân**:

- URL bạn gõ sai
- Trang đã bị Admin xoá
- Bạn không có quyền xem (vai trò khác)

**Hướng dẫn**:

- Kiểm tra URL trên thanh địa chỉ — gõ đúng không
- Bấm nút **"Quay về trang chủ"** trên trang 404
- Nếu là trang bài học → có thể giảng viên đã xoá

### Lỗi 500 "Lỗi hệ thống"

**Nguyên nhân**:

- Backend server gặp lỗi tạm thời
- Database đang bảo trì

**Hướng dẫn**:

1. **Đợi 1 phút** → bấm F5 refresh
2. Vẫn lỗi → thử **logout + login lại**
3. Vẫn lỗi → báo Admin (có thể hệ thống đang bảo trì)

### Trang trắng xoá

**Nguyên nhân phổ biến**:

- Cache trình duyệt hỏng
- Mạng yếu, CSS chưa load kịp

**Hướng dẫn**:

1. **Hard refresh**: `Ctrl + Shift + R` (Windows) hoặc `Cmd + Shift + R` (Mac)
2. **Xoá cache trình duyệt**:
   - Chrome: `Ctrl + Shift + Del` → chọn "Cached images and files" → "Clear data"
3. **Thử trình duyệt khác** (Edge, Firefox)
4. **Thử chế độ ẩn danh** (Incognito: `Ctrl + Shift + N`)

---

## 4. Chạy chậm, load mãi không xong

### Hướng dẫn theo thứ tự

**Bước 1 — Kiểm tra mạng**:

- Tốc độ internet: https://fast.com hoặc https://speedtest.net
- Tối thiểu **5 Mbps** để dùng mượt
- WebGL 3D cần tối thiểu **10 Mbps**

**Bước 2 — Đóng tab không cần**:

- Chrome có > 10 tab → RAM tụt → chậm
- Đóng bớt, giữ chỉ tab LMS

**Bước 3 — Tắt extension Chrome**:

- AdBlock / Grammarly / VPN đôi khi làm chậm
- `chrome://extensions` → tắt tạm thời

**Bước 4 — Restart trình duyệt**:

- Đóng hoàn toàn Chrome → mở lại

**Bước 5 — Restart máy**:

- Khi dùng lâu, máy RAM đầy, swap nhiều → chậm

**Bước 6 — Dùng máy mạnh hơn**:

- WebGL 3D cần:
  - CPU Intel i5 trở lên (hoặc tương đương)
  - RAM 8GB trở lên
  - GPU tích hợp OK nhưng rời tốt hơn

---

## 5. Lỗi WebGL không load

### Triệu chứng

- Tab "Thực hành ảo" → màn hình đen
- Hoặc logo Unity không hiện
- Hoặc báo lỗi JavaScript

### Hướng dẫn

**Bước 1 — Kiểm tra giảng viên đã upload WebGL chưa**:

- Nếu thấy card vàng "**Nội dung đang được cập nhật**" → giảng viên chưa upload / vừa xoá
- Liên hệ giảng viên hỏi

**Bước 2 — Hard refresh**:

- `Ctrl + Shift + R` — xoá cache

**Bước 3 — Kiểm tra trình duyệt hỗ trợ WebGL**:

- Mở https://get.webgl.org/
- Nếu thấy khối lập phương xoay → OK
- Nếu không → browser/máy không hỗ trợ WebGL

**Bước 4 — Bật WebGL trong Chrome**:

- Địa chỉ: `chrome://gpu`
- Tìm mục **"WebGL"** — phải là **"Hardware accelerated"**
- Nếu **"Software only"** hoặc **"Disabled"** → vào `chrome://settings/system` → bật **"Use hardware acceleration when available"**

**Bước 5 — Cập nhật driver card đồ hoạ**:

- Windows: Device Manager → Display adapters → Update driver
- NVIDIA / AMD: tải driver mới nhất từ web chính thức

**Bước 6 — Vẫn không được** → [xem mục 6](#6-webgl-bị-stuck-ở-30)

---

## 6. WebGL bị stuck ở 30%

### Triệu chứng

- Unity logo hiện, thanh tiến độ dừng **ở ~30%**
- Đợi mãi không lên

### Nguyên nhân

Thường do **ServiceWorker cache cũ** bị kẹt (bug trước v1.0.3 đã fix).

### Hướng dẫn fix

**Cách 1 — Clear site data** (khuyên dùng):

1. Mở **DevTools**: `F12` hoặc `Ctrl + Shift + I`
2. Tab **Application** (Chrome) hoặc **Storage** (Firefox)
3. Bên trái: tìm **"Service Workers"**
4. Thấy SW cho origin `localhost:9000` hoặc `gvdsoft.com.vn` → bấm **"Unregister"**
5. Bên trái: **"Storage"** → bấm **"Clear site data"**
6. Tick tất cả → **"Clear"**
7. Đóng DevTools → **hard refresh** `Ctrl + Shift + R`

**Cách 2 — Chế độ ẩn danh**:

1. Mở tab **Incognito** (`Ctrl + Shift + N`)
2. Đăng nhập lại
3. Vào bài thực hành → WebGL load bình thường (không có cache cũ)

**Cách 3 — Browser khác**:

1. Nếu bạn đang dùng Chrome → thử **Edge** hoặc **Firefox**
2. Khác profile → không dính SW cache

**Cách 4 — Nhờ giảng viên re-upload**:

- Giảng viên xoá WebGL cũ trong editor → upload lại
- Lần upload mới (từ v1.0.3) có fix tự động neutralise SW
- Học viên sẽ load được không cần clear cache

---

## 7. Quiz không nộp được / điểm sai

### Triệu chứng

- Bấm "Nộp bài" → xoay loading không xong
- Hoặc báo lỗi "Failed to submit"
- Hoặc điểm **luôn 100%** (bug cũ v1.0.7 đã fix)
- Hoặc điểm **luôn 0%** cho MULTI_CHOICE

### Hướng dẫn

**Bước 1 — Kiểm tra mạng**:

- Nộp quiz cần mạng ổn định
- Nếu mạng yếu → refresh trang + làm lại từ đầu (có thể mất tiến trình)

**Bước 2 — Hệ thống đã fix từ v1.0.8**:

- Nếu vẫn thấy 100% giả trên môi trường cũ → **hard refresh** để pick up code mới
- Nếu vẫn lỗi → báo admin kiểm tra version server

**Bước 3 — Kiểm tra lỗi 400 "property answer should not exist"**:

- Đây là bug cũ v1.0.7 đã fix ở v1.0.8
- Nếu vẫn gặp → server chưa deploy v1.0.8 — báo admin

**Bước 4 — Chọn được đáp án nhưng không nộp được**:

- Kiểm tra **ít nhất 1 câu** đã chọn
- Hệ thống chặn nộp khi tất cả câu đều trống

**Bước 5 — Điểm thấp bất ngờ**:

- Tab "Xem chi tiết" → xem câu nào bị sai
- MULTI_CHOICE: **phải tick đúng TẤT CẢ** đáp án đúng — thiếu 1 cái = sai
- FILL_BLANK: so sánh không phân biệt hoa/thường + tự trim — nhưng **đúng chính tả**

---

## 8. Video không play

### Triệu chứng

- Video hiện nhưng không play khi bấm ▶️
- Hoặc báo "Video không khả dụng"

### Hướng dẫn

**Bước 1 — Kiểm tra âm lượng**:

- Loa máy có bật không
- Video có mute không (icon loa)

**Bước 2 — Hard refresh**:

- `Ctrl + Shift + R`

**Bước 3 — Thử trình duyệt khác**:

- Video `.mp4` Chrome/Edge/Firefox đều hỗ trợ
- Safari có thể yêu cầu format khác → thử Chrome

**Bước 4 — Kiểm tra extension chặn autoplay**:

- Tắt AdBlock / Privacy Badger tạm thời

**Bước 5 — Mạng yếu → buffer chậm**:

- Đổi chất lượng video (nút ⚙️) → "Low" hoặc "Auto"
- Đợi buffer xong mới play

---

## 9. Không thấy khoá học / bài học

### Triệu chứng

- Vào `/student/my-learning` → "Bạn chưa được enroll khoá học nào"
- Hoặc thấy khoá nhưng không có bài học bên trong

### Hướng dẫn

**Bước 1 — Kiểm tra Ngành học của bạn**:

- Avatar → Hồ sơ → xem **"Ngành học"**
- Nếu **"Chưa có ngành"** → hệ thống không auto-enroll được
- Liên hệ Admin gán Ngành

**Bước 2 — Đợi auto-enroll cron**:

- Admin gán Ngành xong không hiện ngay
- Hệ thống chạy cron **06:00 AM mỗi ngày** → sáng hôm sau thấy
- Muốn ngay → Admin bấm nút **"Enroll ngay"** thủ công

**Bước 3 — Khoá mới chưa được duyệt**:

- Giảng viên tạo khoá nhưng chưa gửi duyệt / Admin chưa duyệt
- Chỉ khoá **PUBLISHED** mới hiện cho học viên
- Nhờ giảng viên kiểm tra trạng thái khoá

**Bước 4 — Khoá chưa có bài nào**:

- Giảng viên tạo khoá nhưng chưa thêm Chương / Bài
- → Liên hệ giảng viên

---

## 10. Không nhận thông báo / email

### Thông báo in-app (chuông 🔔)

**Bước 1**: Bấm chuông có thấy không?

- Có → chỉ là chấm đỏ chưa mất — bấm vào đọc đi
- Không thấy gì → có thể không có notification mới

**Bước 2**: Kiểm tra Socket.io connection

- F12 → tab **Console** → có lỗi "WebSocket" không?
- Nếu có → refresh trang

### Email

**Bước 1 — Kiểm tra Spam**:

- Gmail: mở "Spam" folder
- Outlook: "Junk"

**Bước 2 — Email cần thời gian**:

- Email không tức thì — đợi 1-5 phút
- Welcome email có khi đến sau 10 phút

**Bước 3 — Cấu hình SMTP hệ thống**:

- Nếu toàn trường không ai nhận email → hệ thống sai cấu hình SMTP
- Báo Super Admin test SMTP trong settings

---

## 11. Chứng chỉ chưa được cấp

### Điều kiện cấp chứng chỉ

Hệ thống cấp **tự động** khi bạn đạt đủ **5 điều kiện** (giảng viên cài):

- ✅ Hoàn thành X% bài học
- ✅ Điểm quiz trung bình ≥ Y%
- ✅ Bài thực hành ảo ≥ Z% (nếu có)
- ✅ Không vi phạm safety nghiêm trọng
- ✅ Bài cuối khoá đã nộp (nếu có)

### Kiểm tra

**Bước 1**: Vào khoá → tab **"Chứng chỉ"** → xem **"Trạng thái"**:

- ✅ Xanh = đã đạt
- ❌ Đỏ = chưa đạt, hiện rõ thiếu gì

**Bước 2**: Xem ví dụ:

```
Điều kiện cấp chứng chỉ:
  ✅ Hoàn thành 100% bài học (15/15)
  ✅ Điểm quiz ≥ 70% (đạt 85%)
  ❌ Bài thực hành ≥ 70% (bạn chỉ 65%)
  ✅ Không vi phạm safety
```

→ Bạn cần làm lại bài thực hành để lên ≥70%.

**Bước 3**: Làm bù các mục còn thiếu → hệ thống tự cấp chứng chỉ sau khi đủ.

**Bước 4**: Nếu tự tin đã đủ nhưng vẫn chưa cấp:

- Đợi **5 phút** (hệ thống batch xử lý)
- Nếu vẫn không → báo giảng viên

---

## 12. AI chat không trả lời

### Triệu chứng

- Gõ câu hỏi → bấm Enter → không có phản hồi
- Hoặc "Hệ thống đang quá tải, thử lại sau"

### Nguyên nhân

**A. Đạt giới hạn cá nhân** (10 câu/phút):

- Đợi 1 phút → gõ lại

**B. Quota toàn hệ thống hết**:

- Free tier Gemini: **1500 câu/ngày toàn trường**
- Reset **15:00 VN** mỗi ngày
- Đợi đến hôm sau → hoặc Admin nâng gói

**C. Gemini API key hết hạn**:

- Admin cần update key mới trong settings

**D. Mạng không ra được Google**:

- Tường lửa / proxy chặn
- Thử từ mạng khác (4G thay vì WiFi công ty)

---

## 13. Upload file bị lỗi

### Triệu chứng

- Kéo file → báo "File không hợp lệ"
- Hoặc upload đến giữa → fail

### Hướng dẫn

**A. Kiểm tra định dạng cho phép**:

| Loại            | Định dạng                             | Max size |
| --------------- | ------------------------------------- | -------- |
| Avatar          | JPG, PNG, WEBP                        | 5 MB     |
| Video bài giảng | MP4, WEBM                             | 2 GB     |
| SCORM           | ZIP (có `imsmanifest.xml`)            | 2 GB     |
| PowerPoint      | PPTX, PPT                             | 2 GB     |
| WebGL           | ZIP (có `index.html` + `*.loader.js`) | 2 GB     |
| PDF attachment  | PDF                                   | 50 MB    |

**B. File quá lớn**:

- Video > 2GB → nén bằng HandBrake / FFmpeg trước
- Khuyên codec H.264, bitrate 2-5 Mbps

**C. File zip WebGL build từ Mac**:

- ✅ Hệ thống **tự lọc rác Mac** (\_\_MACOSX/, .DS_Store) từ v1.0.2
- Không cần xử lý trước

**D. Mạng yếu → upload fail**:

- File lớn cần mạng ổn định
- Tối thiểu **10 Mbps upload**
- Nếu đứt giữa chừng → làm lại (chưa hỗ trợ resume)

**E. Thiếu trường bắt buộc trong ZIP**:

- WebGL cần: `index.html` + `*.loader.js` + `*.data.gz` + `*.framework.js.gz` + `*.wasm.gz`
- Thiếu → báo lỗi cụ thể
- SCORM cần: `imsmanifest.xml` ở gốc

---

## 14. Khi nào liên hệ ai?

### Thứ tự leo thang (escalation)

```
1. Tự tìm trong FAQ này + Hướng dẫn theo vai trò
   ↓ không giải quyết được
2. Hỏi bạn học cùng lớp / đồng nghiệp
   ↓ không giải quyết được
3. Liên hệ GIẢNG VIÊN (cho vấn đề về bài học, điểm, chứng chỉ)
   ↓ không giải quyết được
4. Liên hệ ADMIN nhà trường (cho vấn đề tài khoản, enroll, hệ thống)
   ↓ không giải quyết được
5. ADMIN liên hệ SUPER ADMIN (cho vấn đề cấu hình hệ thống, backup)
   ↓ không giải quyết được
6. SUPER ADMIN liên hệ team DEV (cho bug code)
```

### Phân loại vấn đề

| Vấn đề                              | Liên hệ ai                                                     |
| ----------------------------------- | -------------------------------------------------------------- |
| Quên mật khẩu                       | Tự reset (mục 2), không được → **Admin**                       |
| Không thấy khoá học                 | **Admin** (chưa gán Ngành) hoặc **Giảng viên** (chưa publish)  |
| Điểm quiz / chứng chỉ               | **Giảng viên**                                                 |
| Video / WebGL không play            | Tự fix theo FAQ, không được → **Admin** (nhờ test từ máy khác) |
| Email không nhận                    | **Admin** (test SMTP)                                          |
| Đề nghị tính năng mới               | **Admin** → báo lên **Super Admin** → dev team                 |
| Báo lỗi bug                         | **Admin** → nếu bug code thật → **dev team**                   |
| Cấu hình hệ thống (logo, màu, SMTP) | **Super Admin**                                                |
| Backup / restore                    | **Super Admin**                                                |

### Thông tin cần chuẩn bị khi liên hệ

Khi báo sự cố, cung cấp:

1. **Vai trò của bạn**: Học viên / Giảng viên / Admin
2. **Email tài khoản**: (để truy cứu log)
3. **Trình duyệt + phiên bản**: Chrome 128, Firefox 130...
4. **Hệ điều hành**: Windows 11, macOS 14, Android 13...
5. **Screenshot lỗi** (nếu có): rất quan trọng, chụp nguyên trang
6. **URL** trang gặp lỗi: copy từ thanh địa chỉ
7. **Các bước tái hiện**: "Tôi vào bài X → bấm Y → thấy lỗi Z"
8. **Thời gian xảy ra**: "Khoảng 10:30 sáng nay"

Càng chi tiết → support xử lý càng nhanh.

---

## 🆘 Liên hệ khẩn

| Vai trò liên hệ     | Khi nào                                                         |
| ------------------- | --------------------------------------------------------------- |
| Giảng viên của khoá | Câu hỏi về nội dung bài, điểm, chứng chỉ                        |
| Admin nhà trường    | Tài khoản bị khoá, không vào được, email không nhận             |
| Super Admin         | Chỉ khi Admin không giải quyết được, hoặc cấu hình hệ thống sai |
| Team Dev (ít khi)   | Bug code — qua Super Admin chuyển lên                           |

**Email hỗ trợ mặc định**: (nhà trường / công ty cung cấp riêng)

---

**Xem thêm**:

- [📖 Tổng quan hệ thống](./00-Tong-quan.md)
- [📖 Hướng dẫn theo vai trò](./00-Tong-quan.md#2-các-vai-trò-trong-hệ-thống)
