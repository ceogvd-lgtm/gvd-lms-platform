# 🟢 HƯỚNG DẪN GIẢNG VIÊN

> **Bạn là giảng viên.** Tài liệu này dạy bạn **từ A đến Z**:
>
> - Cách soạn 1 khoá học hoàn chỉnh
> - Cách upload video bài giảng
> - Cách tạo đề thi trắc nghiệm
> - Cách làm bài thực hành 3D (WebGL)
> - Cách xem học viên đang học thế nào
>
> **Không cần biết lập trình**. Mọi thao tác đều là click chuột + điền form.

---

## Mục lục

1. [Màn hình chính của Giảng viên](#1-màn-hình-chính)
2. [Tạo 1 khoá học mới (từ đầu)](#2-tạo-1-khoá-học-mới)
3. [Thêm chương / bài giảng](#3-thêm-chương--bài-giảng)
4. [Soạn nội dung bài giảng](#4-soạn-nội-dung-bài-giảng)
   - [4.1 Bài giảng dạng video](#41-bài-giảng-video)
   - [4.2 Bài giảng dạng SCORM](#42-bài-giảng-scorm)
   - [4.3 Bài giảng dạng PowerPoint (PPT)](#43-bài-giảng-powerpoint)
   - [4.4 Bài giảng có Lý thuyết (TipTap editor)](#44-bài-giảng-lý-thuyết)
5. [Tạo đề kiểm tra (Quiz)](#5-tạo-đề-kiểm-tra-quiz)
6. [Ngân hàng câu hỏi](#6-ngân-hàng-câu-hỏi)
7. [Tạo bài thực hành ảo WebGL](#7-bài-thực-hành-ảo-webgl)
8. [Gửi duyệt + Xuất bản khoá](#8-gửi-duyệt--xuất-bản-khoá)
9. [Quản lý chứng chỉ khoá](#9-chứng-chỉ-khoá)
10. [Xem học viên học thế nào (Analytics)](#10-xem-analytics-học-viên)
11. [Trả lời câu hỏi của học viên](#11-trả-lời-câu-hỏi-học-viên)

---

## 1. Màn hình chính

Sau khi đăng nhập, bạn vào `/instructor/dashboard`. Hình dung như bảng điều khiển xe hơi:

### 🎯 4 ô số liệu đầu tiên (KPI)

| Ô                   | Ý nghĩa                                    |
| ------------------- | ------------------------------------------ |
| 📚 Khoá của tôi     | Số khoá bạn đang dạy                       |
| 👥 Học viên         | Tổng số học viên enroll vào khoá của bạn   |
| 📊 Tỉ lệ hoàn thành | Trung bình bao nhiêu % học viên hoàn thành |
| 🏆 Điểm trung bình  | Điểm thi trung bình của học viên           |

### 📈 Biểu đồ tuần

Hiện 8 tuần gần nhất — tỷ lệ hoàn thành có tăng không, có giảm không.

### 👨‍🎓 Hoạt động học viên gần đây

15 hoạt động mới nhất:

- Sinh viên A làm quiz — 80 điểm
- Sinh viên B hoàn thành bài 3
- Sinh viên C đăng ký khoá của bạn

Bấm **"Xem chi tiết phân tích"** → vào trang Analytics đầy đủ.

### ⏰ Học viên sắp hết hạn

Cảnh báo học viên nào đang học chậm / sắp trễ deadline. Bạn nên liên hệ động viên.

---

## 2. Tạo 1 khoá học mới

### Wizard 4 bước (giống hướng dẫn đăng ký Shopee)

Bấm nút **"+ Tạo khoá mới"** trên menu trái → mở wizard.

### 📝 Bước 1: Thông tin cơ bản

Điền như đăng ký facebook:

| Trường             | Hướng dẫn                        | Ví dụ                                              |
| ------------------ | -------------------------------- | -------------------------------------------------- |
| **Tên khoá học**   | Đặt rõ ràng, ngắn gọn            | "An toàn lao động PPE cơ bản"                      |
| **Mã khoá**        | Tự sinh, không cần điền          | (ẩn)                                               |
| **Mô tả ngắn**     | 1-2 câu giới thiệu               | "Khoá dạy cách sử dụng đồ bảo hộ lao động cá nhân" |
| **Mô tả chi tiết** | Nhiều đoạn, tuỳ ý                | Có thể dán từ Word                                 |
| **Ảnh bìa**        | Upload JPG/PNG, khuyên 1920×1080 | Ảnh minh hoạ khoá                                  |

Bấm **"Tiếp →"**

### 🏫 Bước 2: Phân loại

| Trường                 | Hướng dẫn                           |
| ---------------------- | ----------------------------------- |
| **Ngành**              | Chọn từ dropdown (do Admin tạo sẵn) |
| **Môn**                | Chọn Môn trong Ngành vừa chọn       |
| **Độ khó**             | Cơ bản / Trung bình / Nâng cao      |
| **Thời lượng dự kiến** | Bao nhiêu giờ học (vd: 10h)         |
| **Số bài dự kiến**     | Bao nhiêu bài (vd: 15 bài)          |

Bấm **"Tiếp →"**

### 🎯 Bước 3: Mục tiêu + yêu cầu

| Trường                 | Hướng dẫn                                            |
| ---------------------- | ---------------------------------------------------- |
| **Mục tiêu học tập**   | Liệt kê kết quả học viên sẽ đạt được                 |
| **Yêu cầu đầu vào**    | Cần biết gì trước (vd: "Đã học xong An toàn cơ bản") |
| **Đối tượng học viên** | "Công nhân nhà máy", "Kỹ sư điện mới"...             |

Bấm **"Tiếp →"**

### ⚙️ Bước 4: Cài đặt

| Trường                        | Giải thích                                           |
| ----------------------------- | ---------------------------------------------------- |
| **Điểm pass**                 | Tối thiểu bao nhiêu % được qua (thường 70%)          |
| **Số lần làm quiz tối đa**    | 1, 2, 3... lần (hoặc Không giới hạn)                 |
| **Tự cấp chứng chỉ khi pass** | Bật = tự cấp, tắt = giảng viên cấp thủ công          |
| **Khoá học công khai**        | Bật = mọi học viên thấy, tắt = chỉ ngành được enroll |

Bấm **"Tạo khoá"** → hoàn tất.

Khoá ở trạng thái **DRAFT** — chỉ bạn thấy. Phải thêm Chương + Bài trước khi gửi duyệt.

---

## 3. Thêm chương / bài giảng

### 3.1 Vào trang edit khoá

Sau khi tạo xong khoá, bấm **"Vào chỉnh sửa"** hoặc từ menu **"Khoá học của tôi"** → bấm khoá → **"Chỉnh sửa"**.

URL: `/instructor/courses/:id/edit`

### 3.2 Giao diện edit

```
┌──────────────────────────────────────────────┐
│ ← Khoá: An toàn PPE cơ bản       [Gửi duyệt] │
├──────────────────────────────────────────────┤
│                                              │
│   📑 Chương 1: Giới thiệu          [+ Bài]   │
│      └─ 📄 Bài 1.1: Tầm quan trọng PPE      │
│      └─ 📄 Bài 1.2: Phân loại đồ bảo hộ     │
│                                              │
│   📑 Chương 2: Sử dụng thực tế     [+ Bài]   │
│      └─ 📄 Bài 2.1: Đeo kính bảo hộ         │
│      └─ 📄 Bài 2.2: Đeo mặt nạ N95         │
│                                              │
│   [+ Thêm chương]                            │
└──────────────────────────────────────────────┘
```

### 3.3 Thêm Chương

1. Bấm **"+ Thêm chương"** cuối danh sách
2. Nhập tên chương (vd: "Chương 3: Xử lý tình huống")
3. Enter → chương được tạo

### 3.4 Thêm Bài trong chương

1. Hover vào chương → bấm **"+ Bài"** bên phải
2. Chọn **loại bài**:
   - **📹 Video** — upload video có sẵn
   - **🎞️ SCORM** — upload gói SCORM từ Articulate/Adobe Captivate
   - **📊 PPT** — upload slide PowerPoint
   - **📝 Lý thuyết** — soạn trực tiếp bằng editor (như Word)
   - **❓ Quiz** — bài kiểm tra
   - **🎮 Thực hành ảo** — WebGL 3D
3. Nhập **tên bài** → Enter

### 3.5 Di chuyển thứ tự (kéo thả)

- Hover icon **6 chấm (⋮⋮)** bên trái mỗi bài
- Kéo lên/xuống để đổi thứ tự
- Có thể kéo giữa các chương

### 3.6 Sửa / Xoá chương, bài

- **Sửa tên**: click vào tên → gõ tên mới → Enter
- **Xoá**: hover → icon **Thùng rác (🗑️)** bên phải
- **Lưu ý**: GIẢNG VIÊN không xoá được bài, chỉ **LƯU TRỮ** (ẩn). Admin+ mới xoá được.

---

## 4. Soạn nội dung bài giảng

### 4.1 Bài giảng Video

Khi click bài dạng Video → mở panel soạn bên phải:

#### Upload video

1. Kéo thả file `.mp4` / `.webm` vào khung upload (hoặc bấm "Chọn file")
2. Video tối đa **2GB**
3. Thanh progress bar hiện tiến độ upload
4. Xong → video preview ngay

#### Cài đặt video

| Trường                   | Hướng dẫn                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| **Tiêu đề**              | Tên hiển thị                                                                                     |
| **Mô tả**                | Giới thiệu ngắn gọn                                                                              |
| **Thời lượng**           | Tự động đọc từ file                                                                              |
| **Điểm đánh dấu chương** | (Tuỳ chọn) — bookmark các điểm quan trọng trong video: `00:30 — Giới thiệu`, `03:45 — Ví dụ PPE` |
| **Bắt buộc xem hết**     | Bật → học viên phải xem đủ 90% mới được đánh dấu hoàn thành                                      |

Bấm **"Lưu"** → xong.

### 4.2 Bài giảng SCORM

SCORM là **gói nội dung chuẩn** xuất từ Articulate, Adobe Captivate, iSpring...

#### Upload

1. Nén nội dung SCORM thành file `.zip`
2. Kéo thả vào khung upload
3. Hệ thống tự giải nén + verify `imsmanifest.xml`
4. Hiện preview như học viên thấy

#### Lưu ý

- **Chỉ SCORM 1.2 và 2004** được hỗ trợ
- File phải có `imsmanifest.xml` ở gốc
- Max 2GB

### 4.3 Bài giảng PowerPoint

Upload slide `.pptx` hoặc `.ppt`:

1. Kéo thả file
2. Hệ thống convert sang dạng xem được trên web (tự động)
3. Học viên có thể lật slide từng tab

**Mẹo**: Nếu muốn học viên có notes đầy đủ, chuyển PPT sang PDF trước khi upload qua tab **"Tài liệu"**.

### 4.4 Bài giảng Lý thuyết

Khi chọn dạng **Lý thuyết** → mở **editor TipTap** (giống Google Docs):

#### Các công cụ trên thanh

- **B I U** — bold / italic / underline
- **H1 H2 H3** — tiêu đề
- **Bullet list / Numbered list**
- **Chèn ảnh** — upload từ máy
- **Chèn video YouTube** — dán link
- **Chèn bảng**
- **Chèn công thức toán** (LaTeX): `$E = mc^2$`
- **Chèn code** (cho giảng viên IT)

#### Auto-save

- Hệ thống **tự lưu mỗi 30 giây**
- Không cần bấm Ctrl+S
- Góc phải hiện **"Đã lưu lúc 14:23"**

#### Chèn ảnh

1. Bấm icon **Ảnh**
2. Chọn file từ máy (JPG, PNG, WEBP)
3. Tối đa 10MB mỗi ảnh
4. Ảnh tự upload lên MinIO, hiện trong bài

#### Kéo link YouTube

1. Bấm icon **Video**
2. Dán link YouTube (`https://youtube.com/watch?v=...`)
3. Enter → video embed vào bài

### 4.5 Tab "Tài liệu" (đính kèm)

Mỗi bài có thể đính kèm thêm **PDF, Word, Excel** để học viên download:

1. Trong panel bài → tab **"Tài liệu"**
2. Bấm **"+ Thêm tài liệu"**
3. Upload PDF (tối đa 50MB mỗi file)
4. Điền tên hiển thị

---

## 5. Tạo đề kiểm tra (Quiz)

### 5.1 Tạo bài Quiz

1. Thêm Bài mới trong chương → chọn dạng **Quiz**
2. Vào trang `/instructor/lessons/:id/quiz`

### 5.2 Cấu hình Quiz

| Trường                      | Hướng dẫn                            |
| --------------------------- | ------------------------------------ |
| **Tiêu đề**                 | "Kiểm tra giữa khoá"                 |
| **Mô tả**                   | (Tuỳ chọn) giải thích cho học viên   |
| **Thời gian làm**           | Phút (vd: 30 phút) — hết giờ tự nộp  |
| **Số lần làm tối đa**       | 1, 2, 3... (hoặc 0 = không giới hạn) |
| **Điểm pass**               | 70% (hoặc theo cài đặt)              |
| **Hiện đáp án sau khi nộp** | Bật → học viên xem câu nào sai       |
| **Xáo trộn câu hỏi**        | Bật → mỗi lần làm thứ tự khác nhau   |
| **Xáo trộn đáp án**         | Bật → các option A/B/C/D bị shuffle  |

### 5.3 Thêm câu hỏi

**Cách 1 — Tạo mới trực tiếp**:

1. Bấm **"+ Thêm câu hỏi"**
2. Chọn **loại câu**:
   - **SINGLE_CHOICE** — 1 đáp án đúng (thường gặp nhất)
   - **MULTI_CHOICE** — nhiều đáp án đúng (học viên tick tất cả đúng mới tính)
   - **TRUE_FALSE** — đúng/sai
   - **FILL_BLANK** — điền từ (so sánh không phân biệt hoa/thường, tự trim)
3. Gõ **đề bài**
4. Điền **đáp án**:
   - Option A / B / C / D...
   - Tick vào option **đúng**
   - Có thể thêm > 4 options
5. Điền **giải thích** (hiện sau khi nộp) — tuỳ chọn
6. Nhập **điểm** cho câu (vd: 5 điểm)
7. Bấm **"Lưu"**

**Cách 2 — Chọn từ Ngân hàng câu hỏi**:

1. Bấm **"+ Từ ngân hàng"**
2. Popup hiện bảng câu hỏi đã có sẵn (xem mục 6)
3. Tick câu muốn dùng → **"Thêm vào Quiz"**

### 5.4 Sắp xếp thứ tự câu

Kéo thả bằng icon **6 chấm** bên trái.

### 5.5 Preview Quiz

Bấm **"Xem thử"** → xem như học viên — kiểm tra đáp án, shuffle hoạt động không.

### 5.6 Xoá câu hỏi

Hover → icon **Thùng rác**.

---

## 6. Ngân hàng câu hỏi

### 6.1 Tại sao dùng?

Khi bạn dạy nhiều lớp cùng môn → cùng câu hỏi → lưu vào **Ngân hàng** để tái sử dụng.

### 6.2 Vào trang

**Menu → "Ngân hàng câu hỏi"** (`/instructor/questions`)

### 6.3 Thêm câu hỏi vào ngân hàng

1. Bấm **"+ Tạo câu hỏi"**
2. Điền form (giống như tạo câu trong Quiz)
3. Thêm **tag** (vd: `PPE`, `An toàn lao động`, `Cơ bản`) — giúp tìm sau này
4. Bấm **"Lưu"**

### 6.4 Import hàng loạt từ Excel

1. Bấm **"Import Excel"**
2. Tải **template Excel mẫu** (có sẵn từ giao diện)
3. Điền câu hỏi theo format:

| Loại          | Câu hỏi   | Option A | Option B | Option C | Option D | Đáp án đúng | Điểm | Tag        |
| ------------- | --------- | -------- | -------- | -------- | -------- | ----------- | ---- | ---------- |
| SINGLE_CHOICE | 1 + 1 = ? | 1        | 2        | 3        | 4        | B           | 5    | math,basic |

4. Upload file Excel
5. Hệ thống báo số câu hỏi import thành công / lỗi

### 6.5 Xuất Excel

Bấm **"Export Excel"** — tải toàn bộ câu hỏi về máy.

---

## 7. Bài thực hành ảo WebGL

### 7.1 WebGL là gì?

**WebGL** = mô phỏng 3D trên trình duyệt. Học viên thao tác như game — bấm nút, đọc đồng hồ, kéo dây điện... → hệ thống tự chấm điểm dựa trên thao tác đúng/sai.

### 7.2 Upload gói WebGL

Team Unity của bạn build ra **file `.zip`** chứa:

- `index.html`
- `Build/ProjectName.loader.js`
- `Build/ProjectName.data.gz`
- `Build/ProjectName.framework.js.gz`
- `Build/ProjectName.wasm.gz`
- `TemplateData/` (ảnh + CSS)

### Các bước upload

1. Trong edit khoá → thêm Bài dạng **Thực hành ảo**
2. Vào bài đó → tab **"WebGL"**
3. Kéo thả file `.zip` vào khung (tối đa 2GB)
4. Hệ thống:
   - ✅ Validate: có đủ `index.html` + `*.loader.js` không
   - ✅ Giải nén vào MinIO bucket `content/webgl/{lessonId}/`
   - ✅ Tự lọc rác Mac (`__MACOSX/`, `.DS_Store`) nếu có
   - ✅ Vô hiệu hoá ServiceWorker của Unity (tránh lỗi cache)
5. Progress bar 0% → 100% (khoảng 30 giây tuỳ file size)
6. Xong → hiện preview 400×300 bên trong editor

### 7.3 Xoá WebGL đã upload (upload nhầm file)

Hover vào preview → nút **"Xoá"** màu đỏ → xác nhận.

**Lưu ý**:

- Giảng viên chỉ xoá được khi khoá ở trạng thái **DRAFT** hoặc **PENDING_REVIEW**
- Nếu khoá đã **PUBLISHED** → báo lỗi "Huỷ xuất bản trước" (tránh làm vỡ trải nghiệm học viên đang học)

### 7.4 Cấu hình chấm điểm (Scoring)

Đây là phần **QUAN TRỌNG NHẤT** — nếu không cấu hình, học viên thấy `0/0 · 0%` khi làm bài.

#### Bước 1: Định nghĩa các bước thao tác

Trong tab **"Cấu hình chấm điểm"** — bấm **"+ Thêm bước"**:

| Trường          | Ví dụ                                                 |
| --------------- | ----------------------------------------------------- |
| **Step ID**     | `step_1_wear_gloves` (team Unity phải đồng bộ ID này) |
| **Mô tả**       | "Đeo găng tay cách điện"                              |
| **Điểm tối đa** | 10                                                    |
| **Bắt buộc**    | Bật → nếu bỏ qua → 0 điểm toàn bài                    |
| **Thứ tự**      | 1 (làm thao tác này trước)                            |

Thêm N bước — tuỳ bài cần bao nhiêu thao tác (thường 5-10 bước).

#### Bước 2: Quy tắc an toàn (Safety checklist)

Các lỗi vi phạm an toàn trừ điểm:

| Trường               | Ví dụ                                  |
| -------------------- | -------------------------------------- |
| **Safety ID**        | `safety_no_gloves`                     |
| **Mô tả**            | "Không đeo găng tay khi cầm dây điện"  |
| **Lỗi nghiêm trọng** | Bật → 1 lần vi phạm → trừ 20% toàn bài |

#### Bước 3: Đồng bộ với team Unity

Gửi file JSON này cho team Unity:

```json
{
  "steps": [
    { "stepId": "step_1_wear_gloves", "description": "Đeo găng tay", ... }
  ],
  "safetyChecklist": [
    { "safetyId": "safety_no_gloves", "description": "Không đeo găng", ... }
  ]
}
```

Team Unity dùng `stepId` và `safetyId` này trong code `postMessage` → hệ thống tự chấm điểm.

### 7.5 Công thức chấm điểm

Hệ thống tính như sau:

```
1. Mỗi step đúng → +[điểm tối đa] của step đó
2. Step làm đúng THỨ TỰ → ×1.1 (bonus 10%)
3. Step bắt buộc bị skip → toàn bài = 0
4. Mỗi safety violation nghiêm trọng → −20% tổng điểm
5. Cuối cùng: clamp về ≥ 0 (không âm)

Grade chứng chỉ:
  ≥ 90%: Xuất sắc
  ≥ 80%: Giỏi
  ≥ 70%: Đạt
  < 70%: Chưa đạt
```

### 7.6 Xem trước bài thực hành

1. Trong editor → ô preview 400×300 bên phải
2. Bấm **"Thử nghiệm"** → mở fullscreen Unity
3. Thao tác như học viên → check chấm điểm có đúng không

### 7.7 Nút Phóng to / thu nhỏ

- Nút **Maximize** góc dưới phải khung WebGL → fullscreen 100vw × 100vh
- Nhấn **Esc** hoặc bấm **Minimize** → về 16:9

---

## 8. Gửi duyệt + Xuất bản khoá

### 8.1 Quy trình

```
DRAFT (bạn đang soạn)
  ↓ Bấm "Gửi duyệt"
PENDING_REVIEW (Admin xem)
  ↓ Admin duyệt
PUBLISHED (học viên thấy + auto-enroll)
```

### 8.2 Điều kiện gửi duyệt

Trước khi gửi duyệt, kiểm tra:

- [ ] Khoá có ≥ 1 chương
- [ ] Mỗi chương có ≥ 1 bài
- [ ] Ít nhất 1 bài có nội dung (video / SCORM / PPT / Lý thuyết)
- [ ] Nếu có Quiz → Quiz có ≥ 1 câu hỏi
- [ ] Nếu có WebGL → đã upload + cấu hình scoring
- [ ] Mô tả khoá đầy đủ + ảnh bìa
- [ ] Điểm pass + số lần làm quiz hợp lý

### 8.3 Bấm "Gửi duyệt"

1. Vào trang edit khoá
2. Góc trên phải → nút **"Gửi duyệt"** (chỉ hiện khi Status = DRAFT)
3. Popup xác nhận
4. Bấm **"Gửi"**
5. Status chuyển PENDING_REVIEW — bạn **không sửa được** cho đến khi Admin xử lý

### 8.4 Admin duyệt

**Nếu duyệt**: bạn nhận email + thông báo → Status = PUBLISHED → học viên bắt đầu thấy.

**Nếu từ chối**: bạn nhận email ghi **lý do** (vd: "Video bài 2 bị mờ, re-upload") → Status về DRAFT → sửa + gửi lại.

### 8.5 Huỷ gửi duyệt

Nếu đã gửi mà muốn sửa (chưa được Admin xử lý):

1. Trang edit khoá → nút **"Huỷ gửi duyệt"** góc trên
2. Status về DRAFT → bạn sửa tiếp
3. Gửi lại khi xong

---

## 9. Chứng chỉ khoá

### 9.1 Cấu hình tiêu chí cấp chứng chỉ

1. Vào khoá → tab **"Chứng chỉ"** (`/instructor/courses/:id/certificate`)
2. Cấu hình **5 điều kiện** học viên phải đạt để được cấp:
   - ✅ Hoàn thành **X%** số bài học (mặc định 100%)
   - ✅ Điểm quiz trung bình **≥ Y%** (mặc định 70%)
   - ✅ Bài thực hành ảo đạt **≥ Z%** (nếu có)
   - ✅ Không vi phạm **safety nghiêm trọng** (WebGL)
   - ✅ Đã nộp bài cuối khoá (nếu có)

### 9.2 Preview chứng chỉ

Bấm **"Xem mẫu"** → preview A4 ngang:

```
┌─────────────────────────────────────┐
│  🏫 GVD NEXT GEN LMS                │
│                                     │
│  CHỨNG CHỈ HOÀN THÀNH               │
│                                     │
│  Xác nhận:                          │
│       NGUYỄN VĂN A                  │
│                                     │
│  Đã hoàn thành khoá:                │
│       An toàn lao động PPE          │
│                                     │
│  Xếp loại: GIỎI                     │
│  Điểm: 85%                          │
│  Ngày cấp: 24/04/2026               │
│                                     │
│  Giảng viên: [ký tên]               │
│                                     │
│  [QR code verify]                   │
└─────────────────────────────────────┘
```

### 9.3 Tự động cấp

Khi học viên **pass** đủ điều kiện:

1. Hệ thống tự tạo PDF
2. Gửi email cho học viên có link tải
3. Học viên vào `/student/certificates` xem được
4. QR trên chứng chỉ → link verify `/verify/:code` (public, ai cũng xem được)

---

## 10. Xem Analytics học viên

### 10.1 Vào trang

**Menu → "Analytics"** (`/instructor/analytics`)

### 10.2 Các biểu đồ

#### 📊 Activity heatmap (bảng nhiệt)

Hình ô vuông 7×30 — mỗi ô = 1 ngày. Màu đậm = có học viên hoạt động nhiều.

→ Biết giờ nào / ngày nào học viên hay học để lên lịch live session.

#### 📈 Cohort chart (so sánh các batch)

So sánh tỷ lệ hoàn thành giữa các lớp mở khác nhau.

#### 🎯 Lesson difficulty (độ khó từng bài)

Biểu đồ cột — bài nào học viên thường fail → cần xem lại nội dung.

#### 👥 Ranking (xếp hạng học viên)

Top học viên theo điểm / tỷ lệ hoàn thành.

### 10.3 Xem chi tiết 1 học viên

Trong ranking → click vào tên → mở popup:

- Lịch sử từng bài
- Điểm quiz từng lần
- Số lần vi phạm safety (WebGL)
- Thời gian học tổng cộng

### 10.4 At-risk students (học viên nguy cơ)

Hệ thống tự flag học viên có 1 trong 4 dấu hiệu:

| Dấu hiệu           | Ý nghĩa                                        |
| ------------------ | ---------------------------------------------- |
| `SLOW_START`       | Không vào hệ thống 7 ngày đầu                  |
| `INACTIVE`         | 14 ngày không hoạt động                        |
| `LOW_SCORE`        | Điểm trung bình < 50%                          |
| `SAFETY_VIOLATION` | Vi phạm safety nghiêm trọng trong thực hành ảo |

Bạn nhận **notification + email** khi có học viên bị flag → chủ động liên hệ động viên.

### 10.5 Xuất báo cáo

Mỗi biểu đồ có nút **"Tải Excel"** / **"Tải PDF"**.

---

## 11. Trả lời câu hỏi học viên

### 11.1 Học viên hỏi ở đâu?

Trong trang `/student/lessons/:id` có tab **"Hỏi đáp"**. Học viên tạo thread với câu hỏi.

### 11.2 Bạn thấy ở đâu?

- **Thông báo chuông 🔔** khi có reply / mention bạn
- **Email** khi có câu hỏi mới trong khoá của bạn
- Vào bài → tab **"Hỏi đáp"** → xem toàn bộ

### 11.3 Reply câu hỏi

1. Bấm **"Reply"** dưới câu hỏi
2. Gõ câu trả lời (hỗ trợ markdown: `**bold**`, danh sách, link)
3. Có thể @mention học viên khác: `@NguyenVanA` → họ nhận notification
4. Bấm **"Gửi"**

### 11.4 Xoá thread / reply không phù hợp

Hover → icon **"Xoá"** — Chỉ giảng viên của khoá + Admin+ xoá được.

### 11.5 Ghim (pin) thread quan trọng

Bấm icon **Ghim** — thread sẽ nổi lên đầu cho mọi học viên.

---

## 🎯 Quy trình hoàn chỉnh tạo 1 khoá

```
1. Menu → "+ Tạo khoá mới" → Wizard 4 bước
2. Vào edit → Thêm Chương 1, 2, 3...
3. Mỗi chương → Thêm Bài (video + PPT + quiz + thực hành)
4. Soạn nội dung từng bài
5. Tạo quiz kiểm tra
6. Cấu hình WebGL + scoring (nếu có)
7. Cấu hình chứng chỉ
8. Xem preview toàn khoá (nút "Preview")
9. Bấm "Gửi duyệt" → chờ Admin
10. Admin duyệt → PUBLISHED → học viên bắt đầu học
11. Vào Analytics theo dõi
```

---

## ⚠️ Lưu ý bảo mật quan trọng

- **KHÔNG để lộ file nguồn WebGL** (Unity project .unity files) — chỉ upload build output (.zip)
- **KHÔNG đưa đáp án Quiz ra nơi khác** — hệ thống mã hoá nhưng bạn tự giữ bí mật
- **Backup câu hỏi Ngân hàng** định kỳ (Export Excel mỗi tháng)

---

**Tiếp theo**:

- [📖 Hướng dẫn Học viên](./04-Hoc-vien.md) — để hiểu góc nhìn học viên
- [📖 FAQ & Xử lý sự cố](./05-FAQ.md) — khi gặp lỗi
