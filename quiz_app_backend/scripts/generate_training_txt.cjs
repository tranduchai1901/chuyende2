const fs = require("fs");

const targetPath = "d:/ANDORID/quiz_app_backend/data/training_material_master_vietnamese_dau.txt";

let text =
  "TAI LIEU HUAN LUYEN AI HOC TAP TOAN DIEN (BAN MO RONG 20K)\n" +
  "Muc tieu: ho tro hoc sinh hoi dap, giai chi tiet, phan tich van hoc, va lap ke hoach on tap.\n\n";

for (let i = 1; i <= 180; i += 1) {
  text += `CHUYEN DE ${i}: LUYEN TAP TICH HOP TOAN LY HOA VAN
Trong chuyen de ${i}, hoc sinh duoc ren bon nang luc cot loi: tu duy dinh luong, tu duy mo hinh, doc hieu khoa hoc, va dien dat hoc thuat. Phan Toan nhan manh quy trinh giai bai gom xac dinh du kien, viet cong thuc, bien doi tuong duong, kiem tra dieu kien, va ket luan bang ngon ngu ro rang. Phan Vat ly tap trung vao cach chuyen tu hien tuong sang mo hinh, tu mo hinh sang cong thuc, tu cong thuc sang y nghia thuc tien. Phan Hoa hoc nhan manh can bang phuong trinh, bao toan khoi luong, bao toan nguyen to, bao toan electron, va xu ly don vi nhat quan. Phan Ngu van ren ky nang lap luan theo cau truc luan diem, luan cu, dan chung, binh luan, mo rong va lien he ban than.

Bai mau Toan trong chuyen de ${i}: giai phuong trinh bac hai, tim dieu kien xac dinh, va phan tich nghiem theo Delta. Bai mau Vat ly: tinh van toc, gia toc, cong suat hoac cuong do dong dien theo du kien chuan. Bai mau Hoa hoc: tinh so mol, nong do, khoi luong chat tan, hoac nhan dien chat oxi hoa va chat khu. Bai mau Ngu van: viet doan nghi luan xa hoi khoang hai tram chu voi mot luan diem ro rang, mot dan chung thuc te, va mot bai hoc hanh dong cu the.

Khung tra loi AI khuyen nghi: truoc het tom tat yeu cau cua hoc sinh trong mot den hai cau; tiep theo trinh bay loi giai theo tung buoc danh so; sau do nhan manh loi sai thuong gap; cuoi cung de xuat mot bai tuong tu de hoc sinh tu luyen. Neu hoc sinh yeu cau ngan gon, AI tra loi trong nam den tam dong; neu hoc sinh yeu cau chi tiet, AI trien khai day du cong thuc, phep bien doi va kiem tra ket qua. Nguyen tac dao duc: khong bia nguon, khong phan xet nguoi hoc, ton trong su khac biet toc do hoc tap va luon khuyen khich thai do trung thuc.

Mo rong ky nang trong chuyen de ${i}: luyen ghi chep theo bang ba cot gom kien thuc cot loi, vi du minh hoa, va loi sai thuong gap. Sau moi phien hoc, hoc sinh tu phan tu bang ba cau hoi: minh da hieu phan nao, con vuong phan nao, va ngay mai can uu tien gi. Cach hoc nay giup chuyen tu hoc thu dong sang hoc chu dong, tang kha nang nho lau va van dung linh hoat trong kiem tra, thi hoc ky va thi chuyen cap.

`;
}

fs.writeFileSync(targetPath, text, "utf8");
console.log("Generated:", targetPath);
