# Backend Design (Week 3-4)

## 1) Danh sach API/Function chinh

| API/Function | Muc dich su dung | Man hinh frontend su dung |
|---|---|---|
| `POST /api/auth/login` | Dang nhap hoc sinh | Man Login |
| `GET /api/grades` | Lay danh sach lop 1-12 | Man Chon Lop |
| `GET /api/subjects?grade=` | Lay mon hoc theo lop | Man Chon Mon |
| `GET /api/quizzes?grade=&subject=` | Lay danh sach de theo lop/mon | Man Danh sach de |
| `GET /api/quizzes/:id` | Lay chi tiet de + cau hoi | Man Lam bai |
| `POST /api/attempts` | Nop bai va tinh diem | Man Ket qua |
| `GET /api/attempts?userId=` | Xem lich su bai lam | Man Lich su |
| `GET /api/rankings?grade=` | Xem bang xep hang theo lop | Man Bang xep hang |
| `GET /api/stats/:userId` | Thong ke tong quan nguoi dung | Dashboard |
| `GET /api/recommendations/:userId` | Goi y de theo lop | Dashboard, De goi y |
| `GET /api/favorites?userId=` | Lay danh sach de yeu thich | Man De yeu thich |
| `POST /api/favorites` | Them de vao yeu thich | Man Lam bai, Danh sach de |
| `DELETE /api/favorites` | Bo de khoi yeu thich | Man Lam bai, De yeu thich |

## 2) Thiet ke chi tiet API

### 2.1 `POST /api/auth/login`
- **Input**
```json
{
  "username": "student1",
  "password": "123456"
}
```
- **Output**
```json
{
  "token": "fake-token-1",
  "user": {
    "id": 1,
    "fullName": "Nguyen Van A",
    "grade": 10,
    "username": "student1"
  }
}
```
- **Database**: bang `users` (id, username, password, fullName, grade)

### 2.2 `GET /api/grades`
- **Input**: none
- **Output**: mang lop 1-12
- **Database**: bang `grades` (id, name)

### 2.3 `GET /api/subjects?grade=10`
- **Input**: query `grade`
- **Output**: danh sach mon theo lop
- **Database**: bang `subjects` (id, grade, name)

### 2.4 `GET /api/quizzes?grade=10&subject=Toan`
- **Input**: query `grade`, `subject`
- **Output**: danh sach de rut gon (title, so cau, thoi gian)
- **Database**: bang `quizzes` (id, grade, subject, title, durationMinutes)

### 2.5 `GET /api/quizzes/:id`
- **Input**: path `id`
- **Output**: thong tin de + danh sach cau hoi/option (khong tra dap an)
- **Database**: `quizzes`, `questions`, `question_options`

### 2.6 `POST /api/attempts`
- **Input**
```json
{
  "userId": 1,
  "quizId": 1,
  "answers": [
    { "questionId": 1, "selectedAnswer": 1 },
    { "questionId": 2, "selectedAnswer": 1 }
  ]
}
```
- **Output**
```json
{
  "id": 1,
  "userId": 1,
  "quizId": 1,
  "correct": 2,
  "total": 2,
  "score": 100,
  "submittedAt": "2026-03-30T00:00:00.000Z"
}
```
- **Database**: bang `attempts` (id, userId, quizId, correct, total, score, submittedAt)

### 2.7 `GET /api/attempts?userId=1`
- **Input**: query `userId`
- **Output**: danh sach bai da nop cua user
- **Database**: bang `attempts`

### 2.8 `GET /api/rankings?grade=10`
- **Input**: query `grade`
- **Output**: danh sach hoc sinh + diem trung binh + so lan thi
- **Database**: tong hop tu `users` + `attempts`

## 3) Mo hinh database (SQLite)
- File database: `data/quiz.sqlite`
- Cac bang:
  - `users`
  - `grades`
  - `subjects`
  - `quizzes`
  - `questions`
  - `attempts`
  - `favorite_quizzes`
