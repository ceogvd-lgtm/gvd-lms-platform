# GVD LMS — Hướng dẫn Backup & Restore

Tài liệu này áp dụng cho **production** đang chạy trên VPS `103.124.92.197`
(`nextgenlms.com.vn`). Mọi lệnh chạy với quyền `root` qua SSH.

---

## 🗂️ 2 lớp backup hiện có

### Lớp 1 — App-level (đã chạy sẵn, không cần can thiệp)

- Cron BullMQ trong backend: `database-backup-daily` 02:00 hàng đêm
- Chỉ backup **DB** dưới dạng `pg_dump --format=custom`
- Lưu vào MinIO prefix `backups/` (cùng bucket `lms-uploads`)
- DB tracking ở bảng `backups` (status, size, time)
- Endpoint admin: `POST /api/v1/admin/backups/trigger` (manual run),
  `GET /api/v1/admin/backups` (list), `POST /api/v1/admin/backups/restore/:id`
- Retention: do app code quản lý (mặc định giữ 30 ngày, xem `backup.service.ts`)

⚠️ **Hạn chế**: Nếu MinIO chính bị mất (disk hỏng, hacker xóa) → DB backup
trong MinIO cũng mất theo. Lớp 2 bù khoảng trống này.

### Lớp 2 — VPS-disk snapshot (script `backup-full.sh`)

- Cron `crontab -e` của root: 02:30 hàng đêm
- Backup **TOÀN BỘ**: DB + MinIO volume + .env.production + SSL certs
- Lưu trên VPS disk: `/srv/lms/backups/auto_<TIMESTAMP>/`
- Retention: 7 ngày (config `RETENTION_DAYS` trong script)
- Log: `/var/log/lms-backup.log`
- Stagger 30 phút sau Lớp 1 để tránh I/O conflict

---

## 🔧 Cấu trúc 1 backup (Lớp 2)

```
/srv/lms/backups/auto_20260426_023000/
├── db.sqlc                       # pg_dump custom format (~100 KB)
├── minio-data.tar.gz             # Toàn bộ buckets (~150-200 MiB)
├── .env.production.bak           # Secrets (perm 600)
└── certs/                        # SSL certificates
    ├── nextgenlms.com.vn.crt
    └── nextgenlms.com.vn.key
```

---

## 📜 Manual operations

### Backup ngay lập tức (ngoài cron)

```bash
ssh root@103.124.92.197
bash /srv/lms/scripts/backup-full.sh
```

Output sẽ in từng bước + size cuối cùng. Backup nằm tại
`/srv/lms/backups/auto_<TS>/`.

### Liệt kê backups khả dụng

```bash
ls -dt /srv/lms/backups/auto_* | head -10
du -sh /srv/lms/backups/auto_*
```

### Xem log cron backup

```bash
tail -100 /var/log/lms-backup.log
# Hoặc realtime:
tail -f /var/log/lms-backup.log
```

### Verify file backup không corrupt

```bash
BK=/srv/lms/backups/auto_20260426_023000

# Test DB dump
docker exec -i docker-postgres-1 pg_restore -l < $BK/db.sqlc | head -20

# Test MinIO tarball
tar -tzf $BK/minio-data.tar.gz | head -20
```

---

## ⚙️ Restore từ snapshot

⚠️ **CHỈ DÙNG KHI THỰC SỰ CẦN ROLLBACK** — restore SẼ THAY THẾ HOÀN TOÀN
DB hiện tại + MinIO data hiện tại. Mọi upload mới sau snapshot sẽ MẤT.

### Quy trình

```bash
# 1. Liệt kê backups, chọn cái muốn restore
ls -dt /srv/lms/backups/auto_*

# 2. Chạy restore
bash /srv/lms/scripts/restore-full.sh /srv/lms/backups/auto_20260425_023000

# 3. Script hỏi confirm — gõ chính xác 'yes' (lowercase) để tiếp tục
```

### Script làm gì

1. Stop `backend` + `frontend` (downtime ~2 phút)
2. `pg_restore --clean --if-exists` — DROP tables cũ + INSERT lại từ dump
3. Stop MinIO → xóa volume `docker_minio_data` → extract tarball → start MinIO
4. Đợi MinIO healthy
5. Start `backend` + `frontend`

### Sau restore, verify

```bash
curl -I https://nextgenlms.com.vn         # phải 200
docker ps                                 # 7/7 healthy
```

### .env và SSL — restore THỦ CÔNG nếu cần

Script **KHÔNG tự** restore 2 thứ này (hiếm khi cần):

```bash
# Restore .env (chỉ khi secrets hiện tại sai/mất)
cp /srv/lms/backups/auto_<TS>/.env.production.bak /srv/lms/.env.production
chmod 600 /srv/lms/.env.production
docker compose -f /srv/lms/docker/docker-compose.prod.yml \
  --env-file /srv/lms/.env.production up -d  # restart toàn bộ stack

# Restore SSL (hiếm khi cần — certbot tự renew, cert mới hơn thường đã có)
cp -r /srv/lms/backups/auto_<TS>/certs/* /srv/lms/docker/nginx/certs/
docker exec docker-nginx-1 nginx -s reload
```

---

## 📊 Theo dõi disk usage

```bash
# Tổng quan VPS
df -h /

# Tổng size MinIO bucket
docker exec docker-minio-1 mc du local/lms-uploads

# Size mỗi prefix
docker exec docker-minio-1 mc du \
  local/lms-uploads/avatars/ \
  local/lms-uploads/thumbnails/ \
  local/lms-uploads/content/

# Tổng size backups
du -sh /srv/lms/backups/
du -sh /srv/lms/backups/auto_*
```

### Khi nào cần lo

- VPS disk > 80% → cân nhắc giảm `RETENTION_DAYS` trong `backup-full.sh`
- 1 backup > 5 GB → user upload nhiều, tính toán quota lại
- Backup không tăng size mỗi ngày → cron có thể không chạy (check log)

---

## ⏰ Cron schedule

Edit cron của root: `crontab -e`

```cron
# App-level DB backup (Phase 18B, đã có sẵn trong backend service)
# Thực thi qua BullMQ scheduler — không có dòng cron riêng

# Lớp 2 — VPS disk snapshot (DB + MinIO + .env + certs)
30 02 * * * /srv/lms/scripts/backup-full.sh >> /var/log/lms-backup.log 2>&1

# SSL renew (đã có)
0 03 1 * * /usr/local/bin/lms-renew-ssl.sh >> /var/log/lms-ssl-renew.log 2>&1
```

---

## 🔥 Disclaimer & best practices

### Đúng

- ✅ Backup giữ trong VPS đã đủ chống lỗi DB / mất file MinIO
- ✅ Retention 7 ngày = có 7 lần "đi lùi" để tìm điểm tốt
- ✅ Cron 02:30 stagger đủ với 02:00 (Lớp 1) — không I/O conflict
- ✅ MinIO hot tar an toàn với scale này (objects < 1000, < 1 GB)

### Sai (đừng làm)

- ❌ Xóa thư mục `/srv/lms/backups/` mà không có backup khác
- ❌ Edit `backup-full.sh` mà không test (script broken → cron fail silent)
- ❌ Run `restore-full.sh` mà không gõ đúng `yes` (script bảo vệ rồi
  nhưng đừng test gõ random)

### Còn cần làm sau (Lớp 3 — chưa setup)

- 🟡 **Backup ra ngoài VPS**: nếu VPS provider bị compromise / mất disk
  toàn bộ → backup trong VPS cũng mất. Khuyên setup Cloudflare R2 hoặc
  Backblaze B2 với rclone. Sẽ làm trong session sau.
- 🟡 **Test restore định kỳ**: 1-2 tháng nên thử restore lên 1 VPS test
  để verify backup hoạt động. Backup mà không test ≈ không có backup.

---

## ❓ FAQ thường gặp

**Q: User upload file rồi xóa file gốc trên PC — file LMS có mất không?**
A: KHÔNG. Khi upload, file được stream qua HTTP → backend → MinIO volume
trên VPS. File sống độc lập trên disk VPS, không liên quan PC user.
Browser cache cũng không liên quan upload. Chỉ mất nếu:

- VPS disk hỏng / bị xóa
- Admin xóa course/lesson (soft delete xóa file qua hook)
- Storage cleanup cron tìm thấy orphan key

**Q: Backup tốn bao nhiêu disk?**
A: 1 backup hiện tại ≈ 200 MB (do MinIO chỉ 200 MiB). 7 backups ≈ 1.4 GB.
Khi data tăng tới 10 GB MinIO → 7 backups ≈ 70 GB. Lúc đó nên giảm
retention hoặc setup external storage (Lớp 3).

**Q: Có thể chạy nhiều lần backup-full.sh trong ngày không?**
A: Có. Mỗi lần tạo folder mới `auto_<TS>` riêng. Không xung đột.

**Q: Restore mất bao lâu?**
A: ~2-5 phút (200 MB MinIO). Khi data tăng → tăng tuyến tính.

**Q: Backup chạy có làm chậm production không?**
A: Có chút — pg_dump khoá 1 vài giây trên row mới insert. tar MinIO load
disk I/O. Nhưng schedule 02:30 là giờ thấp tải nên không user thấy.

---

_Cập nhật: 26/04/2026 — phiên bản đầu tiên (Lớp 1 + Lớp 2)_
