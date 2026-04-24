# Thiết kế Backend — API & Cơ sở dữ liệu

**Ứng dụng:** QuizMaster 1–12 (luyện thi trắc nghiệm)  
**Công nghệ:** Node.js + Express — **SQLite** (`server_sqlite.js`, `npm start`) hoặc **MySQL** (`server_mysql.js`, `npm run start:mysql`)  
**Base URL mặc định:** `http://localhost:3000/api`  
**SQLite:** `data/quiz.sqlite` (tự tạo khi chạy server).  
**MySQL:** Docker + phpMyAdmin, import `database/schema_mysql.sql`, chạy `npm run seed` — chi tiết trong `database/README_PHPMYADMIN.md`.

---

## 1. Danh sách API / Function chính

| STT | Phương thức & đường dẫn | Mục đích | Giao diện Flutter sử dụng |
|-----|-------------------------|----------|---------------------------|
| 1 | `GET /api/health` | Kiểm tra backend hoạt động | (Dev / CI, tùy chọn) |
| 2 | `POST /api/auth/login` | Đăng nhập, trả token giả lập + thông tin user | Màn **Đăng nhập** |
| 3 | `GET /api/grades` | Danh sách lớp 1–12 | **Dashboard**, **Khám phá đề** (dropdown lớp) |
| 4 | `GET /api/subjects?grade=` | Danh sách môn theo lớp | **Khám phá đề** (dropdown môn) |
| 5 | `GET /api/quizzes` | Danh sách đề (lọc lớp, môn, tìm kiếm, độ khó) | **Khám phá đề**, **Đề gợi ý** (dùng chung logic) |
| 6 | `GET /api/quizzes/:id` | Chi tiết đề + câu hỏi (không trả đáp án đúng) | **Làm bài** |
| 7 | `POST /api/attempts` | Nộp bài, chấm điểm, lưu lượt thi | **Làm bài** → **Kết quả** |
| 8 | `GET /api/attempts?userId=` | Lịch sử bài đã nộp của user | **Lịch sử bài làm** |
| 9 | `GET /api/stats/:userId` | Thống kê: số lần thi, điểm TB, điểm cao nhất, xu hướng | **Dashboard** |
| 10 | `GET /api/recommendations/:userId` | Gợi ý đề theo lớp user | **Dashboard** (khối đề gợi ý) |
| 11 | `GET /api/rankings?grade=` | Bảng xếp hạng (theo lớp hoặc toàn bộ) | **Bảng xếp hạng** |
| 12 | `GET /api/favorites?userId=` | Danh sách đề yêu thích | **Đề yêu thích** |
| 13 | `POST /api/favorites` | Thêm đề vào yêu thích | **Làm bài** (nút tim) |
| 14 | `DELETE /api/favorites` | Xóa đề khỏi yêu thích | (Có thể mở rộng UI sau) |
| 15 | `GET /api/admin/overview` | Thống kê tổng quan (user, đề, lượt thi) — **chỉ admin** | Màn quản trị Flutter |
| 16 | `GET /api/admin/users` | Danh sách người dùng | Màn quản trị |
| 17 | `GET /api/admin/quizzes` | Danh sách đề (rút gọn) | Màn quản trị |
| 18 | `DELETE /api/admin/quizzes/:id` | Xóa đề | Màn quản trị |

**Admin:** gửi header `x-user-id` bằng `id` user có `role = admin` trong DB; nếu không phải admin → 403.

---

## 2. Thiết kế chi tiết từng API

### 2.1 `GET /api/health`

| Hạng mục | Nội dung |
|----------|----------|
| **Mục đích** | Kiểm tra service sống, phiên bản engine DB. |
| **Input** | Không. |
| **Output (200)** | `{ "ok": true, "engine": "sqlite", "message": "..." }` |
| **Database** | Không truy vấn bảng. |

---

### 2.2 `POST /api/auth/login`

| Hạng mục | Nội dung |
|----------|----------|
| **URL** | `/api/auth/login` |
| **Input (JSON body)** | `username` (string), `password` (string) |
| **Output (200)** | `{ "token": "fake-token-{id}", "user": { "id", "username", "fullName", "grade", "role" } }` — `role`: `"user"` hoặc `"admin"` |
| **Output (401)** | `{ "message": "Thông tin đăng nhập không đúng." }` |
| **Database** | Bảng **`users`**: `SELECT` theo `username`, `password`. Trả `id`, `username`, `fullName`, `grade`, `role`. |

---

### 2.3 `GET /api/grades`

| Hạng mục | Nội dung |
|----------|----------|
| **URL** | `/api/grades` |
| **Input** | Không. |
| **Output (200)** | Mảng: `[{ "id": 1, "name": "Lớp 1" }, ...]` |
| **Database** | Bảng **`grades`**: `id`, `name`. |

---

### 2.4 `GET /api/subjects`

| Hạng mục | Nội dung |
|----------|----------|
| **URL** | `/api/subjects` hoặc `/api/subjects?grade={n}` |
| **Input (query)** | `grade` (optional): số lớp 1–12. Không có thì trả tất cả môn. |
| **Output (200)** | Mảng: `[{ "id", "grade", "name" }, ...]` |
| **Database** | Bảng **`subjects`**. |

---

### 2.5 `GET /api/quizzes`

| Hạng mục | Nội dung |
|----------|----------|
| **URL** | `/api/quizzes` |
| **Input (query, tùy chọn)** | `grade`, `subject`, `search` (tìm trong `title`), `difficulty` (giá trị lưu trong DB: `De`, `Trung binh`, `Kho`) |
| **Output (200)** | Mảng đề rút gọn: `id`, `grade`, `subject`, `title`, `difficulty`, `durationMinutes`, `questionCount` |
| **Database** | **`quizzes`** + đếm câu hỏi qua **`questions`** (`LEFT JOIN`, `GROUP BY`). |

---

### 2.6 `GET /api/quizzes/:id`

| Hạng mục | Nội dung |
|----------|----------|
| **URL** | `/api/quizzes/:id` |
| **Input (path)** | `id` — mã đề. |
| **Output (200)** | Một object: thông tin đề + `questions`: `[{ "id", "content", "options": [A,B,C,D] }]` (không gửi `correctAnswer`). |
| **Output (404)** | `{ "message": "Không tìm thấy đề thi." }` |
| **Database** | **`quizzes`** một dòng; **`questions`** nhiều dòng theo `quizId`. Ghép `optionA`…`optionD` thành mảng `options`. |

---

### 2.7 `POST /api/attempts`

| Hạng mục | Nội dung |
|----------|----------|
| **URL** | `/api/attempts` |
| **Input (JSON body)** | `userId`, `quizId`, `answers`: `[{ "questionId", "selectedAnswer" }]` (`selectedAnswer` là chỉ số 0–3) |
| **Output (201)** | `{ "id", "userId", "quizId", "correct", "total", "score", "submittedAt" }` — `score` là % làm tròn. |
| **Output (400/404)** | Thiếu dữ liệu hoặc không tìm thấy đề / câu hỏi. |
| **Database** | Đọc **`questions`** để chấm; ghi **`attempts`**: `userId`, `quizId`, `correct`, `total`, `score`, `submittedAt` (ISO string). |

---

### 2.8 `GET /api/attempts`

| Hạng mục | Nội dung |
|----------|----------|
| **URL** | `/api/attempts` hoặc `/api/attempts?userId={id}` |
| **Input (query)** | `userId` (optional): lọc theo user; không có thì trả mọi lượt (phục vụ admin/demo). |
| **Output (200)** | Mảng các bản ghi **`attempts`**, sắp xếp `submittedAt` giảm dần. |
| **Database** | Bảng **`attempts`**. |

---

### 2.9 `GET /api/stats/:userId`

| Hạng mục | Nội dung |
|----------|----------|
| **URL** | `/api/stats/:userId` |
| **Input (path)** | `userId` |
| **Output (200)** | `{ "totalAttempts", "avgScore", "bestScore", "trend": [{ "score", "submittedAt" }, ...] }` |
| **Database** | **`attempts`** theo `userId`. |

---

### 2.10 `GET /api/recommendations/:userId`

| Hạng mục | Nội dung |
|----------|----------|
| **URL** | `/api/recommendations/:userId` |
| **Input (path)** | `userId` |
| **Output (200)** | Tối đa 3 đề (cùng `grade` với user), có `questionCount`, sắp xếp theo độ khó. |
| **Output (404)** | Không tìm thấy user. |
| **Database** | **`users`** (lấy `grade`), **`quizzes`**, **`questions`**. |

---

### 2.11 `GET /api/rankings`

| Hạng mục | Nội dung |
|----------|----------|
| **URL** | `/api/rankings` hoặc `/api/rankings?grade={n}` |
| **Input (query)** | `grade` (optional). |
| **Output (200)** | Mảng: `userId`, `fullName`, `grade`, `attempts`, `averageScore` — sắp `averageScore` giảm dần. |
| **Database** | **`users`** `LEFT JOIN` **`attempts`**, `GROUP BY` user. |

---

### 2.12 `GET /api/favorites`

| Hạng mục | Nội dung |
|----------|----------|
| **URL** | `/api/favorites?userId={id}` |
| **Input (query)** | `userId` (bắt buộc). |
| **Output (200)** | Danh sách đề (`quizzes`) đã ghép với `favorite_quizzes`. |
| **Output (400)** | Thiếu `userId`. |
| **Database** | **`favorite_quizzes`** `JOIN` **`quizzes`**. |

---

### 2.13 `POST /api/favorites`

| Hạng mục | Nội dung |
|----------|----------|
| **URL** | `/api/favorites` |
| **Input (JSON body)** | `userId`, `quizId` |
| **Output (201)** | `{ "ok": true }` (dùng `INSERT OR IGNORE`). |
| **Database** | Bảng **`favorite_quizzes`**. |

---

### 2.14 `DELETE /api/favorites`

| Hạng mục | Nội dung |
|----------|----------|
| **URL** | `/api/favorites` |
| **Input (JSON body)** | `userId`, `quizId` |
| **Output (200)** | `{ "ok": true }` |
| **Database** | Xóa khỏi **`favorite_quizzes`**. |

---

## 3. Mô hình cơ sở dữ liệu (SQLite)

| Bảng | Mục đích |
|------|----------|
| **users** | Tài khoản: `username`, `password`, `fullName`, `grade`, `role` (`user` / `admin`). |
| **grades** | Danh mục lớp: `id`, `name`. |
| **subjects** | Môn theo lớp: `grade`, `name`. |
| **quizzes** | Đề thi: `grade`, `subject`, `title`, `difficulty`, `durationMinutes`. |
| **questions** | Câu hỏi: `quizId`, `content`, `optionA`–`optionD`, `correctAnswer` (0–3), `explanation`. |
| **attempts** | Lượt nộp bài: `userId`, `quizId`, `correct`, `total`, `score`, `submittedAt`. |
| **favorite_quizzes** | Đề yêu thích: `userId`, `quizId` (unique cặp). |

---

## 4. Chạy & kiểm thử

**SQLite (mặc định):**

```bash
cd quiz_app_backend
npm install
npm start
```

**MySQL:**

```bash
docker compose up -d
# Import database/schema_mysql.sql qua phpMyAdmin (http://localhost:8080), rồi:
npm run seed
npm run start:mysql
```

**Kiểm thử:**

```bash
npm test
```

Chạy: unit test `tests/unit/scoring.test.js` (hàm `computeScorePercent`) và `tests/run-tests.js` (API SQLite: health, login, đề, nộp bài, lịch sử).

---

## 5. MySQL & phpMyAdmin (tóm tắt)

| Mục | Nội dung |
|-----|----------|
| Compose | `docker-compose.yml` — MySQL cổng 3306, phpMyAdmin 8080 |
| Schema | `database/schema_mysql.sql` |
| Seed | `npm run seed` — lớp 1–12, môn theo lớp, mỗi môn 3 đề × 5 câu; user **admin**/**admin123**, **student1–3**/**123456** |
| Chi tiết | `database/README_PHPMYADMIN.md` |

---

*Tài liệu này phản ánh `server_sqlite.js`, `server_mysql.js` và các script liên quan.*
