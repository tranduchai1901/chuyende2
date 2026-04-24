Dự án gồm hai phần:

- **`quiz_app_backend`**: API Node.js + Express — **mặc định SQLite** (`npm start`), hoặc **MySQL** (`npm run start:mysql`) kèm Docker + phpMyAdmin (xem `quiz_app_backend/database/README_PHPMYADMIN.md`).
- **`quiz_app_frontend`**: ứng dụng Flutter (Android / Web / Windows); đăng nhập **admin** vào màn quản trị, **user** vào luồng học sinh.

---

## Mô tả các chức năng của ứng dụng

### 1. Đăng nhập và người dùng

- Người dùng nhập **tài khoản** và **mật khẩu**.
- Hệ thống gọi API xác thực; nếu đúng thì vào màn hình chính.
- Sau đăng nhập, ứng dụng biết **họ tên** và **lớp** của học sinh để cá nhân hóa (gợi ý đề, xếp hạng theo lớp).

### 2. Bảng điều khiển (Dashboard)

- Hiển thị lời chào theo tên học sinh.
- **Thống kê nhanh**: số lần đã thi, điểm trung bình, điểm cao nhất.
- **Đề gợi ý**: danh sách đề được gợi ý theo lớp của học sinh.
- Điều hướng nhanh tới: luyện thi nâng cao, lịch sử, đề yêu thích, bảng xếp hạng.

### 3. Khám phá đề thi

- Chọn **lớp** (1–12) và **môn học** tương ứng.
- **Lọc độ khó**: Tất cả / Dễ / Trung bình / Khó.
- **Tìm kiếm** theo tên đề.
- Danh sách đề hiển thị: tên đề, môn, độ khó, số câu; chọn đề để vào làm bài.

### 4. Làm bài trắc nghiệm

- Hiển thị từng **câu hỏi** và các **lựa chọn** (dạng chip/chọn một đáp án).
- **Thanh tiến độ** theo số câu đã chọn đáp án.
- Có thể **đánh dấu yêu thích** đề đang làm (icon tim).
- **Nộp bài**: gửi đáp án lên server; server chấm và trả về điểm.

### 5. Kết quả và lịch sử

- Màn **kết quả**: điểm phần trăm, số câu đúng / tổng số câu; nút quay về trang chủ.
- Màn **lịch sử bài làm**: các lần nộp bài trước (điểm, mã đề, ngày).

### 6. Bảng xếp hạng

- Xem **bảng xếp hạng theo lớp** của học sinh (điểm trung bình, số lần thi).
- Giao diện làm nổi bật top đầu bảng.

### 7. Đề yêu thích

- Danh sách các đề đã **lưu yêu thích** để ôn lại nhanh.
- Thêm / bỏ yêu thích từ màn làm bài hoặc quản lý qua API.

### 8. Backend và dữ liệu

- API REST (Express), bật CORS cho frontend.
- **SQLite** (mặc định): file `quiz_app_backend/data/quiz.sqlite` (tạo khi chạy `server_sqlite.js`).
- **MySQL** (tùy chọn): schema `database/schema_mysql.sql`, seed nhiều đề lớp 1–12 bằng `npm run seed` sau khi import DB; Docker Compose MySQL + phpMyAdmin trong `quiz_app_backend/docker-compose.yml`.
- **Phân quyền:** cột `role` (`user` / `admin`). Sau đăng nhập API trả `role`; client gửi header `x-user-id` cho các API cần nhận diện user (và admin cho `/api/admin/*`).
- Tài khoản demo (seed MySQL hoặc tương đương SQLite): **admin** / **admin123**; **student1**–**student3** / **123456**.

### 9. Kiểm thử (Tuần 4)

- Trong `quiz_app_backend`: `npm test` — unit test `utils/scoring.js` và kịch bản API SQLite (health, login, đề, nộp bài, lịch sử). Kết quả gần đây: tất cả bước **PASS**.

### 10. Giao diện và trải nghiệm

- Thiết kế Material 3, màu sắc và gradient hiện đại.
- Hiệu ứng chuyển cảnh / animation nhẹ khi đăng nhập và danh sách đề.
- Hỗ trợ nhiều nền tảng build Flutter (Android emulator dùng `10.0.2.2`, máy tính/web dùng `localhost`).

---


