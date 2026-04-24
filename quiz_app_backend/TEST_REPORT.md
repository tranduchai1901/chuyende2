# API Test Report (Week 4)

## 1) Kich ban kiem thu

1. **Health check**
   - Muc tieu: dam bao backend online
   - API: `GET /api/health`
   - Ky vong: HTTP 200 + `ok=true`

2. **Dang nhap thanh cong**
   - API: `POST /api/auth/login`
   - Input: `student1 / 123456`
   - Ky vong: HTTP 200 + co token

3. **Lay danh sach de theo lop/mon**
   - API: `GET /api/quizzes?grade=10&subject=Toan`
   - Ky vong: HTTP 200 + mang de > 0

4. **Nop bai**
   - API: `POST /api/attempts`
   - Ky vong: HTTP 201 + tra ve score

5. **Lay lich su bai lam**
   - API: `GET /api/attempts?userId=1`
   - Ky vong: HTTP 200 + co it nhat 1 ban ghi

## 2) Ket qua

- Da cau hinh file test: `tests/run-tests.js`
- Lenh chay:
  - `npm test`
- Ket qua mong doi:
  - 5/5 test PASS
