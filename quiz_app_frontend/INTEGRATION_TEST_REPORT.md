# Integration / Functional Test Report (Week 5)

## 1) Cac kich ban test tich hop

1. **Dang nhap**
   - Buoc: nhap `student1 / 123456` -> bam Dang nhap
   - Ky vong: vao man hinh Home

2. **Chon lop -> mon -> de**
   - Buoc: Home -> Bat dau luyen thi -> chon Lop 10 -> Toan
   - Ky vong: hien danh sach de Toan lop 10

3. **Lam bai va nop bai**
   - Buoc: mo de -> chon dap an -> bam Nop bai
   - Ky vong: backend tra score, app hien man ket qua

4. **Xem lich su**
   - Buoc: Home -> Lich su bai lam
   - Ky vong: hien du lieu bai thi vua nop

## 2) Ket qua test chuc nang

- Luong dang nhap: PASS
- Luong chon de: PASS
- Luong nop bai: PASS
- Luong lich su: PASS

> Neu app khong ket noi duoc backend tren emulator, kiem tra lai `baseUrl` trong `lib/main.dart` la `http://10.0.2.2:3000/api`.
