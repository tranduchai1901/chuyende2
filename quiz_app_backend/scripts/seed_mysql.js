/**
 * Seed MySQL: lop 1-12, day du mon, nhieu de + cau hoi (chay sau khi import schema_mysql.sql)
 * Usage: node scripts/seed_mysql.js
 * Bien moi truong: MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
 */
import mysql from "mysql2/promise";

const config = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "root",
  database: process.env.MYSQL_DATABASE || "quizmaster",
  multipleStatements: true
};

function subjectsForGrade(g) {
  if (g <= 2) {
    return ["Toán", "Tiếng Việt", "Đạo đức"];
  }
  if (g <= 5) {
    return ["Toán", "Tiếng Việt", "Tự nhiên và Xã hội", "Đạo đức", "Tiếng Anh", "Tin học"];
  }
  if (g <= 9) {
    return [
      "Toán",
      "Ngữ văn",
      "Tiếng Anh",
      "Lịch sử",
      "Địa lý",
      "GDCD",
      "Tin học",
      "Công nghệ",
      "Vật lý",
      "Hóa học",
      "Sinh học"
    ];
  }
  return [
    "Toán",
    "Ngữ văn",
    "Vật lý",
    "Hóa học",
    "Sinh học",
    "Lịch sử",
    "Địa lý",
    "GDCD",
    "Tiếng Anh",
    "Tin học"
  ];
}

function questionTemplates(subject, grade, diff, qIndex) {
  const d = diff === "De" ? "mức cơ bản" : diff === "Kho" ? "mức nâng cao" : "mức vận dụng";
  const s = subject.toLowerCase();
  if (s.includes("toán")) {
    const bank = [
      [`Tổng hai số 12 và 15 là bao nhiêu?`, "27", "25", "30", "33", 0, "12 + 15 = 27."],
      [`${grade} × 0 bằng bao nhiêu?`, "0", `${grade}`, "1", "Không xác định", 0, "Nhân với 0 luôn bằng 0."],
      [`Một góc vuông có số đo bao nhiêu độ?`, "90°", "180°", "45°", "360°", 0, "Góc vuông = 90°."],
      [`Phân số 1/2 tương đương với?`, "0,5", "0,2", "2", "1/4", 0, "1/2 = 0,5."],
      [`Hình tam giác có tối thiểu bao nhiêu cạnh?`, "3", "4", "2", "5", 0, "Tam giác có 3 cạnh."]
    ];
    return bank[qIndex % bank.length];
  }
  if (s.includes("tiếng việt") || s.includes("ngữ văn")) {
    const bank = [
      [`Từ "học sinh" trong câu "Học sinh chăm chỉ" thuộc thành phần nào?`, "Chủ ngữ", "Vị ngữ", "Tân ngữ", "Bổ ngữ", 0, "Chủ thể thực hiện hành động."],
      [`Dấu câu thích hợp cuối câu cảm: "Ôi hay quá"`, "!", ".", "?", ",", 0, "Câu cảm thán thường dùng !"],
      [`Từ đồng nghĩa gần nhất với "nhanh"?`, "mau", "chậm", "cao", "nặng", 0, "Nhanh ≈ mau."],
      [`Thể loại "Truyện cổ tích" thường có yếu tố nào?`, "Yếu tố kỳ ảo", "Bảng biểu", "Phương trình", "Thí nghiệm", 0, "Cổ tích thường có phép màu, kỳ ảo."],
      [`Câu ghép là câu có?`, "Hai vế câu trở lên", "Một vế", "Không có dấu", "Chỉ một từ", 0, "Ghép nhiều vế câu."]
    ];
    return bank[qIndex % bank.length];
  }
  if (s.includes("tiếng anh")) {
    const bank = [
      [`"Hello" nghĩa là gì?`, "Xin chào", "Tạm biệt", "Cảm ơn", "Xin lỗi", 0, "Hello = greeting."],
      [`Chọn dạng đúng: I ___ a student.`, "am", "is", "are", "be", 0, "I am."],
      [`"Book" nghĩa là?`, "Sách", "Bút", "Bảng", "Cặp", 0, "Book = sách."],
      [`Động từ "go" ở ngôi thứ ba số ít hiện tại đơn:`, "goes", "go", "going", "went", 0, "He/She goes."],
      [`"Thank you" nghĩa là?`, "Cảm ơn", "Xin lỗi", "Mời vào", "Chúc ngủ ngon", 0, "Thank you = thanks."]
    ];
    return bank[qIndex % bank.length];
  }
  if (s.includes("vật lý")) {
    const bank = [
      [`Đơn vị của lực trong hệ SI là?`, "Newton (N)", "Joule", "Watt", "Met", 0, "F đo bằng N."],
      [`Vận tốc là đại lượng?`, "Đo tỉ lệ với thời gian", "Không đổi", "Chỉ có hướng", "Vô hướng luôn", 0, "v = s/t."],
      [`Âm thanh truyền trong môi trường nào nhanh nhất (thông thường)?`, "Chất rắn", "Chân không", "Chất khí", "Chất lỏng", 0, "Sóng cơ học lan nhanh trong rắn hơn khí."],
      [`Gia tốc trọng trường gần bề mặt Trái Đất xấp xỉ?`, "9,8 m/s²", "1 m/s²", "0", "100 m/s²", 0, "g ≈ 9,8."],
      [`Điện trở đo bằng?`, "Ohm (Ω)", "Ampe", "Volt", "Coulomb", 0, "R tính bằng Ω."]
    ];
    return bank[qIndex % bank.length];
  }
  if (s.includes("hóa học")) {
    const bank = [
      [`Nguyên tử gồm hạt nào sau đây?`, "Hạt nhân và electron", "Chỉ proton", "Chỉ neutron", "Chỉ ion", 0, "Cấu trúc nguyên tử Rutherford-Bohr."],
      [`Nước có công thức hóa học?`, "H₂O", "CO₂", "NaCl", "O₂", 0, "Nước = H₂O."],
      [`pH = 7 thường là môi trường?`, "Trung tính", "Axit mạnh", "Bazơ mạnh", "Không xác định", 0, "pH 7 trung tính."],
      [`Phản ứng cháy cần?`, "Chất oxi hóa (thường là O₂)", "Chỉ nước", "Chân không tuyệt đối", "Nhiệt độ 0K", 0, "Cháy là oxi hóa nhanh."],
      [`Ion là?`, "Nguyên tử hoặc nhóm nguyên tử mang điện", "Phân tử trung hòa", "Electron tự do duy nhất", "Proton trong hạt nhân", 0, "Ion mang điện."]
    ];
    return bank[qIndex % bank.length];
  }
  if (s.includes("sinh học")) {
    const bank = [
      [`Tế bào là đơn vị cấu trúc của?`, "Sinh vật sống", "Vật vô sinh", "Ánh sáng", "Nước đá", 0, "Cell theory."],
      [`Quang hợp xảy ra chủ yếu ở bộ phận nào của cây xanh?`, "Lá", "Rễ", "Thân gỗ", "Hoa", 0, "Lá có lục lạp."],
      [`ADN mang thông tin?`, "Di truyền", "Tiêu hóa", "Vận chuyển oxi", "Co cơ", 0, "ADN = di truyền."],
      [`Enzyme xúc tác phản ứng bằng cách?`, "Giảm năng lượng hoạt hóa", "Tăng nhiệt độ tuyệt đối", "Loại bỏ chất nền", "Thay đổi cân bằng tự do", 0, "Xúc tác sinh học."],
      [`Hô hấp tế bào tạo ra năng lượng dạng?`, "ATP", "ADN", "ARN", "Glucose thuần", 0, "ATP là tiền tệ năng lượng."]
    ];
    return bank[qIndex % bank.length];
  }
  if (s.includes("lịch sử")) {
    const bank = [
      [`Nước Việt Nam Dân chủ Cộng hòa được khai sinh năm nào?`, "1945", "1954", "1975", "1986", 0, "2/9/1945."],
      [`Ai là người đọc Tuyên ngôn Độc lập tại Quảng trường Ba Đình?`, "Chủ tịch Hồ Chí Minh", "Vua Bảo Đại", "Trần Hưng Đạo", "Lê Lợi", 0, "Bác Hồ đọc bản Tuyên ngôn."],
      [`Chiến thắng Điện Biên Phủ năm?`, "1954", "1945", "1968", "1972", 0, "Điện Biên Phủ 1954."],
      [`Cuộc khởi nghĩa Hai Bà Trưng chống lại?`, "Ách thống trị phương Bắc", "Thực dân Pháp", "Thực dân Mỹ", "Chiêm Thành", 0, "Hai Bà Trưng (40)."],
      [`Văn Miếu - Quốc Tử Giám ở thành phố nào?`, "Hà Nội", "Huế", "Đà Nẵng", "TP.HCM", 0, "Văn Miếu Hà Nội."]
    ];
    return bank[qIndex % bank.length];
  }
  if (s.includes("địa lý")) {
    const bank = [
      [`Việt Nam nằm ở bán cầu nào?`, "Đông bán cầu", "Tây bán cầu", "Cận cực", "Xích đạo thuần", 0, "Kinh tuyến Đông."],
      [`Đồng bằng sông Cửu Long thuộc miền?`, "Nam Bộ", "Bắc Bộ", "Trung Bộ", "Tây Nguyên", 0, "ĐBSCL ở Nam Bộ."],
      [`Gió mùa Đông Bắc thổi vào mùa nào ở nước ta?`, "Mùa đông", "Mùa hè", "Quanh năm", "Chỉ tháng 4", 0, "Mùa đông gió mùa ĐB."],
      [`Đại dương lớn nhất Trái Đất?`, "Thái Bình Dương", "Đại Tây Dương", "Ấn Độ Dương", "Bắc Băng Dương", 0, "Pacific largest."],
      [`Trục Trái Đất nghiêng khoảng bao nhiêu độ so với pháp tuyến?`, "23,5°", "0°", "45°", "90°", 0, "Độ nghiêng ~23,5°."]
    ];
    return bank[qIndex % bank.length];
  }
  if (s.includes("gdcd")) {
    const bank = [
      [`Pháp luật có vai trò gì trong xã hội?`, "Điều chỉnh hành vi xã hội", "Thay thế đạo đức hoàn toàn", "Chỉ áp dụng với trẻ em", "Không ràng buộc công dân", 0, "Pháp luật điều chỉnh + bảo vệ."],
      [`Công dân có nghĩa vụ gì với pháp luật?`, "Chấp hành pháp luật", "Tuỳ ý bất tuân", "Chỉ tuân theo khi có người xem", "Chỉ online", 0, "Tuân thủ pháp luật."],
      [`Bình đẳng giới là?`, "Nam nữ có cơ hội và quyền như nhau", "Ưu tiên một giới", "Chỉ trong gia đình", "Không liên quan pháp luật", 0, "Bình đẳng giới."],
      [`Tham gia bầu cử là quyền của?`, "Công dân đủ điều kiện theo luật", "Trẻ em", "Người nước ngoài", "Chỉ cán bộ", 0, "Quyền cử tri."],
      [`Đạo đức công dân gắn với?`, "Chuẩn mực hành vi tốt trong cộng đồng", "Chỉ lợi nhuận", "Chỉ thi cử", "Chỉ thể thao", 0, "Đạo đức xã hội."]
    ];
    return bank[qIndex % bank.length];
  }
  if (s.includes("tin học")) {
    const bank = [
      [`CPU là viết tắt của?`, "Central Processing Unit", "Computer Personal Unit", "Code Program Utility", "Copy Paste Unit", 0, "CPU = bộ xử lý trung tâm."],
      [`Bit là đơn vị nhỏ nhất của?`, "Thông tin số", "Điện áp", "Tốc độ mạng", "Dung lượng pin", 0, "0 hoặc 1."],
      [`Phím tắt Ctrl+C thường dùng để?`, "Sao chép", "Dán", "Cắt", "In", 0, "Copy."],
      [`HTTP là giao thức tầng?`, "Ứng dụng", "Vật lý", "Liên kết", "Mạng", 0, "HTTP application layer."],
      [`Mật khẩu mạnh nên?`, "Dài và đa dạng ký tự", "Chỉ gồm số 1", "Trùng tên đăng nhập", "Để trống", 0, "Độ phức tạp cao."]
    ];
    return bank[qIndex % bank.length];
  }
  if (s.includes("công nghệ")) {
    const bank = [
      [`An toàn khi dùng máy cắt gọt kim loại cần?`, "Kính bảo hộ và quy trình an toàn", "Không cần bảo hộ", "Tăng tốc tối đa", "Làm ẩm tay", 0, "ATLD."],
      [`CAD thường dùng để?`, "Thiết kế kỹ thuật trên máy tính", "Chỉ chơi game", "Nghe nhạc", "Duyệt web", 0, "Computer-Aided Design."],
      [`Vật liệu composite là?`, "Kết hợp hai loại vật liệu trở lên", "Chỉ kim loại", "Chỉ gỗ", "Chỉ nhựa PVC", 0, "Composite hybrid."],
      [`Dụng cụ đo điện áp là?`, "Vôn kế", "Ampe kế", "Ôm kế", "Cân", 0, "Voltmeter."],
      [`Kỹ thuật hàn điện cần chú ý?`, "Nhiệt độ và bảo vệ mắt", "Tăng ẩm", "Giảm điện áp xuống 0 luôn", "Không cần thông gió", 0, "An toàn hàn."]
    ];
    return bank[qIndex % bank.length];
  }
  if (s.includes("tự nhiên") || s.includes("xã hội")) {
    const bank = [
      [`Cơ thể cần nước để?`, "Vận chuyển chất dinh dưỡng và điều hoà nhiệt", "Chỉ làm ướt", "Thay thế oxi", "Không cần thiết", 0, "Nước quan trọng cho sinh học."],
      [`Gia đình gồm những thành viên điển hình?`, "Cha mẹ và con (có thể mở rộng)", "Chỉ một người", "Chỉ họ hàng xa", "Chỉ bạn bè", 0, "Khái niệm gia đình."],
      [`An toàn giao thông đi bộ qua đường nên?`, "Quan sát và đi vạch qua đường", "Chạy bất cẩn", "Nhắm mắt", "Đi giữa làn ô tô", 0, "Quy tắc qua đường."],
      [`Thực vật lấy khí cácbonic từ đâu?`, "Không khí", "Đất sét", "Nước biển", "Kim loại", 0, "Quang hợp dùng CO₂."],
      [`Mùa ở Việt Nam phân theo chủ yếu?`, "Khí hậu nhiệt đới gió mùa", "Cực địa", "Sa mạc", "Ôn đới hải dương", 0, "Khí hậu VN."]
    ];
    return bank[qIndex % bank.length];
  }
  if (s.includes("đạo đức")) {
    const bank = [
      [`Biết ơn thể hiện qua?`, "Lời nói và hành động tôn trọng", "Bỏ mặc", "Chỉ trên mạng", "Không cần", 0, "Đạo đức biết ơn."],
      [`Bạn bè cần?`, "Thật thà và chia sẻ", "Lừa dối", "Ích kỷ", "Cô lập", 0, "Tình bạn lành mạnh."],
      [`Giữ trật tự nơi công cộng là?`, "Tôn trọng cộng đồng", "Tuỳ ý", "Chỉ khi có camera", "Không quan trọng", 0, "Văn minh đô thị."],
      [`Tiết kiệm điện nước giúp?`, "Bảo vệ môi trường và tài nguyên", "Tăng hóa đơn", "Không ảnh hưởng", "Chỉ nhà hàng xóm", 0, "Tiết kiệm năng lượng."],
      [`Khiêm tốn là?`, "Không khoe khoang quá mức", "Luôn tự ti", "Trốn tránh", "Không học", 0, "Đức tính khiêm tốn."]
    ];
    return bank[qIndex % bank.length];
  }
  // default
  return [
    [`[${subject} - Lớp ${grade}] (${d}) Câu ${qIndex + 1}: Khái niệm trọng tâm của bài là gì?`, "Phương án đúng nhất", "Phương án nhiễu A", "Phương án nhiễu B", "Phương án nhiễu C", 0, `Ôn tập ${subject} lớp ${grade}.`],
    [`[${subject}] Kiến thức nền tảng số ${qIndex + 1}?`, "Đúng", "Sai một phần", "Sai hoàn toàn", "Không liên quan", 0, "Nền tảng."],
    [`[${subject}] Câu ${qIndex + 1} vận dụng kiến thức?`, "Lựa chọn hợp lý", "Lựa chọn sai", "Lựa chọn sai 2", "Lựa chọn sai 3", 0, "Vận dụng."],
    [`[${subject}] Tình huống ${qIndex + 1}?`, "Xử lý đúng", "Xử lý sai", "Bỏ qua", "Không quan tâm", 0, "Tình huống."],
    [`[${subject}] Tổng hợp ${qIndex + 1}?`, "Đáp án chuẩn", "Khác", "Khác 2", "Khác 3", 0, "Tổng hợp."]
  ][qIndex % 5];
}

async function main() {
  const conn = await mysql.createConnection(config);
  console.log("Đang xóa dữ liệu cũ (giữ cấu trúc bảng)...");
  await conn.query("SET FOREIGN_KEY_CHECKS=0");
  await conn.query("TRUNCATE TABLE favorite_quizzes");
  await conn.query("TRUNCATE TABLE attempts");
  await conn.query("TRUNCATE TABLE questions");
  await conn.query("TRUNCATE TABLE quizzes");
  await conn.query("TRUNCATE TABLE subjects");
  await conn.query("TRUNCATE TABLE grades");
  await conn.query("TRUNCATE TABLE users");
  await conn.query("SET FOREIGN_KEY_CHECKS=1");

  console.log("Thêm người dùng...");
  await conn.query(
    `INSERT INTO users (username,password,fullName,grade,role) VALUES
     ('admin','admin123','Quản trị viên',12,'admin'),
     ('student1','123456','Nguyễn Văn A',10,'user'),
     ('student2','123456','Trần Thị B',12,'user'),
     ('student3','123456','Lê Minh C',9,'user')`
  );

  console.log("Thêm lớp...");
  for (let g = 1; g <= 12; g++) {
    await conn.query("INSERT INTO grades (id,name) VALUES (?,?)", [g, `Lớp ${g}`]);
  }

  console.log("Thêm môn & đề & câu hỏi (có thể mất vài chục giây)...");
  let quizCounter = 0;
  for (let grade = 1; grade <= 12; grade++) {
    const subs = subjectsForGrade(grade);
    for (const subj of subs) {
      await conn.query("INSERT INTO subjects (grade,name) VALUES (?,?)", [grade, subj]);
      const difficulties = ["De", "Trung binh", "Kho"];
      for (let t = 0; t < difficulties.length; t++) {
        const diff = difficulties[t];
        const title = `Ôn tập ${subj} — Lớp ${grade} (${diff === "De" ? "Cơ bản" : diff === "Kho" ? "Nâng cao" : "Vận dụng"}) #${t + 1}`;
        const mins = diff === "Kho" ? 30 : diff === "De" ? 12 : 20;
        const [qr] = await conn.query(
          "INSERT INTO quizzes (grade,subject,title,difficulty,durationMinutes) VALUES (?,?,?,?,?)",
          [grade, subj, title, diff, mins]
        );
        const quizId = qr.insertId;
        quizCounter++;
        for (let qi = 0; qi < 5; qi++) {
          const row = questionTemplates(subj, grade, diff, qi + t * 7 + grade * 3);
          const [c, oa, ob, oc, od, corr, expl] = row;
          await conn.query(
            `INSERT INTO questions (quizId,content,optionA,optionB,optionC,optionD,correctAnswer,explanation)
             VALUES (?,?,?,?,?,?,?,?)`,
            [quizId, c, oa, ob, oc, od, corr, expl]
          );
        }
      }
    }
  }

  await conn.end();
  console.log(`Hoàn tất. Đã tạo khoảng ${quizCounter} đề, mỗi đề 5 câu.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
