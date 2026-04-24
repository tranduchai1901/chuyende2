# Quản lý database bằng phpMyAdmin (MySQL)

## Cách 1: Docker (khuyên dùng — có sẵn MySQL + phpMyAdmin)

Từ thư mục `quiz_app_backend`:

```bash
docker compose up -d
```

- **phpMyAdmin:** http://localhost:8080  
  - Server: `db`  
  - User: `root`  
  - Password: `root`  
- **MySQL:** `localhost:3306`  
  - Database: `quizmaster` (tự tạo)

### Import schema

1. Vào phpMyAdmin → chọn database **`quizmaster`** (hoặc tạo mới cùng tên).  
2. Tab **Import** → chọn file **`database/schema_mysql.sql`** → Go.

### Seed dữ liệu (nhiều đề, lớp 1–12)

Trên máy host (cần Node + biến môi trường trỏ tới MySQL):

```bash
cd quiz_app_backend
npm install
set MYSQL_HOST=127.0.0.1
set MYSQL_USER=root
set MYSQL_PASSWORD=root
set MYSQL_DATABASE=quizmaster
npm run seed
```

(Linux/macOS dùng `export` thay cho `set`.)

---

## Cách 2: XAMPP / WAMP (phpMyAdmin có sẵn)

1. Bật **MySQL** trong XAMPP.  
2. Mở http://localhost/phpmyadmin  
3. Tạo database `quizmaster`, collation **utf8mb4_unicode_ci**.  
4. Import **`schema_mysql.sql`**.  
5. Chạy `npm run seed` với `MYSQL_HOST=127.0.0.1`, user/pass đúng với XAMPP (thường `root` + mật khẩu rỗng — khi đó `MYSQL_PASSWORD=`).

---

## Chạy API với MySQL

```bash
set MYSQL_HOST=127.0.0.1
set MYSQL_USER=root
set MYSQL_PASSWORD=root
set MYSQL_DATABASE=quizmaster
npm run start:mysql
```

Nếu không cấu hình MySQL, có thể chạy bản SQLite: `npm start` (mặc định trong `package.json`).

---

## Tài khoản sau khi seed (MySQL)

| Username  | Mật khẩu  | Vai trò |
|-----------|------------|---------|
| admin     | admin123   | admin   |
| student1  | 123456     | user    |
| student2  | 123456     | user    |
| student3  | 123456     | user    |
