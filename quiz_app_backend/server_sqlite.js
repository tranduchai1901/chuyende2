import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import multer from "multer";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "data");
const dbFile = path.join(dataDir, "quiz.sqlite");
const uploadsDir = path.join(dataDir, "uploads");
const imageUploadsDir = path.join(uploadsDir, "images");
const docsUploadsDir = path.join(uploadsDir, "documents");
const aiResponseCache = new Map();
let lastGeminiRequestAt = 0;

async function initDb() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(imageUploadsDir)) {
    fs.mkdirSync(imageUploadsDir, { recursive: true });
  }
  if (!fs.existsSync(docsUploadsDir)) {
    fs.mkdirSync(docsUploadsDir, { recursive: true });
  }

  const db = await open({
    filename: dbFile,
    driver: sqlite3.Database
  });

  await db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      fullName TEXT NOT NULL,
      studentCode TEXT,
      grade INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'user'
    );

    CREATE TABLE IF NOT EXISTS grades (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grade INTEGER NOT NULL,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quizzes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grade INTEGER NOT NULL,
      subject TEXT NOT NULL,
      title TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      durationMinutes INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quizId INTEGER NOT NULL,
      content TEXT NOT NULL,
      optionA TEXT NOT NULL,
      optionB TEXT NOT NULL,
      optionC TEXT NOT NULL,
      optionD TEXT NOT NULL,
      correctAnswer INTEGER NOT NULL,
      explanation TEXT,
      FOREIGN KEY (quizId) REFERENCES quizzes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      quizId INTEGER NOT NULL,
      correct INTEGER NOT NULL,
      total INTEGER NOT NULL,
      score INTEGER NOT NULL,
      submittedAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (quizId) REFERENCES quizzes(id)
    );

    CREATE TABLE IF NOT EXISTS favorite_quizzes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      quizId INTEGER NOT NULL,
      UNIQUE(userId, quizId),
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (quizId) REFERENCES quizzes(id)
    );

    CREATE TABLE IF NOT EXISTS ai_runtime_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      provider TEXT NOT NULL DEFAULT 'gemini',
      model TEXT NOT NULL DEFAULT 'gemini-1.5-flash',
      apiKey TEXT NOT NULL DEFAULT '',
      apiKeys TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS ai_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      createdBy INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (createdBy) REFERENCES users(id)
    );
  `);

  try {
    await db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`);
  } catch (_) {
    /* column exists */
  }
  try {
    await db.exec(`ALTER TABLE users ADD COLUMN studentCode TEXT`);
  } catch (_) {
    /* column exists */
  }
  try {
    await db.exec(`ALTER TABLE questions ADD COLUMN imageUrl TEXT`);
  } catch (_) {
    /* column exists */
  }
  try {
    await db.exec(`ALTER TABLE ai_runtime_config ADD COLUMN apiKeys TEXT NOT NULL DEFAULT '[]'`);
  } catch (_) {
    /* column exists */
  }

  const row = await db.get("SELECT COUNT(*) AS count FROM users");
  if (row.count === 0) {
    await seedDb(db);
  }
  await migrateLegacyVietnamese(db);
  await ensureAdminAccount(db);
  await ensureRichQuizData(db);
  await ensureAllQuizzesUnique(db);
  await db.run("UPDATE users SET studentCode = COALESCE(studentCode, 'HS' || printf('%05d', id))");
  await db.run(
    `INSERT INTO ai_runtime_config (id, provider, model, apiKey, apiKeys)
     VALUES (1, 'gemini', 'gemini-2.0-flash', '', '[]')
     ON CONFLICT(id) DO NOTHING`
  );

  return db;
}

/** Chuẩn hóa dữ liệu cũ (không dấu) sang tiếng Việt có dấu — chạy mỗi lần khởi động, an toàn nếu đã cập nhật. */
async function migrateLegacyVietnamese(db) {
  const userRenames = [
    ["Nguyen Van A", "Nguyễn Văn A"],
    ["Tran Thi B", "Trần Thị B"],
    ["Le Minh C", "Lê Minh C"]
  ];
  for (const [from, to] of userRenames) {
    await db.run("UPDATE users SET fullName = ? WHERE fullName = ?", [to, from]);
  }

  for (let i = 1; i <= 12; i++) {
    await db.run("UPDATE grades SET name = ? WHERE id = ? AND (name = ? OR name LIKE 'Lop %')", [
      `Lớp ${i}`,
      i,
      `Lop ${i}`
    ]);
  }

  const subjectRenames = [
    ["Toan", "Toán"],
    ["Tieng Viet", "Tiếng Việt"],
    ["Tieng Anh", "Tiếng Anh"],
    ["Khoa Hoc", "Khoa học"],
    ["Lich Su", "Lịch sử"],
    ["Ngu Van", "Ngữ văn"],
    ["Hoa Hoc", "Hóa học"],
    ["Vat Ly", "Vật lý"],
    ["Sinh Hoc", "Sinh học"]
  ];
  for (const [from, to] of subjectRenames) {
    await db.run("UPDATE subjects SET name = ? WHERE name = ?", [to, from]);
    await db.run("UPDATE quizzes SET subject = ? WHERE subject = ?", [to, from]);
  }

  const titleRenames = [
    ["Ham so co ban", "Hàm số cơ bản"],
    ["Dong hoc chat diem", "Động học chất điểm"],
    ["Nguyen tu va phan tu", "Nguyên tử và phân tử"]
  ];
  for (const [from, to] of titleRenames) {
    await db.run("UPDATE quizzes SET title = ? WHERE title = ?", [to, from]);
  }

  const questionPatches = [
    {
      oldContent: "Ham so y = x^2 co do thi la?",
      content: "Hàm số y = x² có đồ thị là?",
      optionA: "Đường thẳng",
      optionB: "Parabol",
      optionC: "Hyperbol",
      optionD: "Elip",
      explanation: "Đồ thị của y = ax² là parabol."
    },
    {
      oldContent: "Dao ham cua x^2 la?",
      content: "Đạo hàm của x² là?",
      optionA: "2x",
      optionB: "x",
      optionC: "x²",
      optionD: "2",
      explanation: "(x²)′ = 2x."
    },
    {
      oldContent: "Chuyen dong thang deu co dac diem?",
      content: "Chuyển động thẳng đều có đặc điểm gì?",
      optionA: "Vận tốc không đổi",
      optionB: "Gia tốc thay đổi",
      optionC: "Đứng yên",
      optionD: "Quay tròn",
      explanation: "Vận tốc không đổi theo thời gian."
    },
    {
      oldContent: "Don vi cua van toc?",
      content: "Đơn vị của vận tốc là gì?",
      optionA: "m/s",
      optionB: "N",
      optionC: "kg",
      optionD: "J",
      explanation: "Đơn vị SI của vận tốc là m/s."
    },
    {
      oldContent: "Hat nho nhat cua chat la?",
      content: "Hạt nhỏ nhất của chất là gì?",
      optionA: "Nguyên tử",
      optionB: "Phân tử",
      optionC: "Electron",
      optionD: "Ion",
      explanation: "Phân tử là hạt nhỏ nhất giữ nguyên tính chất hóa học của chất."
    },
    {
      oldContent: "Ky hieu hoa hoc cua nuoc?",
      content: "Ký hiệu hóa học của nước là gì?",
      optionA: "CO₂",
      optionB: "H₂O",
      optionC: "O₂",
      optionD: "NaCl",
      explanation: "Nước là H₂O."
    }
  ];
  for (const p of questionPatches) {
    await db.run(
      `UPDATE questions SET content=?, optionA=?, optionB=?, optionC=?, optionD=?, explanation=?
       WHERE content = ? OR content = ?`,
      [
        p.content,
        p.optionA,
        p.optionB,
        p.optionC,
        p.optionD,
        p.explanation,
        p.oldContent,
        p.content
      ]
    );
  }
}

async function seedDb(db) {
  await db.run(`INSERT INTO users (username,password,fullName,grade,role) VALUES
    ('admin','admin123','Quản trị viên',12,'admin'),
    ('teacher1','123456','Giáo viên Demo',10,'teacher'),
    ('student1','123456','Nguyễn Văn A',10,'user'),
    ('student2','123456','Trần Thị B',12,'user'),
    ('student3','123456','Lê Minh C',9,'user')`);

  for (let i = 1; i <= 12; i++) {
    await db.run("INSERT INTO grades (id,name) VALUES (?,?)", [i, `Lớp ${i}`]);
  }

  const subjectSeeds = [
    [1, "Toán"],
    [1, "Tiếng Việt"],
    [2, "Toán"],
    [2, "Tiếng Việt"],
    [3, "Tiếng Anh"],
    [4, "Toán"],
    [5, "Khoa học"],
    [6, "Lịch sử"],
    [7, "Ngữ văn"],
    [8, "Toán"],
    [9, "Hóa học"],
    [10, "Toán"],
    [10, "Vật lý"],
    [11, "Sinh học"],
    [12, "Tiếng Anh"],
    [12, "Ngữ văn"]
  ];
  for (const [grade, name] of subjectSeeds) {
    await db.run("INSERT INTO subjects (grade,name) VALUES (?,?)", [grade, name]);
  }

  const quizzes = [
    [10, "Toán", "Hàm số cơ bản", "Trung binh", 20],
    [10, "Vật lý", "Động học chất điểm", "Kho", 25],
    [12, "Tiếng Anh", "Reading Mock Test", "Trung binh", 20],
    [9, "Hóa học", "Nguyên tử và phân tử", "De", 15]
  ];

  for (const quiz of quizzes) {
    await db.run(
      "INSERT INTO quizzes (grade,subject,title,difficulty,durationMinutes) VALUES (?,?,?,?,?)",
      quiz
    );
  }

  await db.run(`INSERT INTO questions (quizId,content,optionA,optionB,optionC,optionD,correctAnswer,explanation) VALUES
    (1,'Hàm số y = x² có đồ thị là?','Đường thẳng','Parabol','Hyperbol','Elip',1,'Đồ thị của y = ax² là parabol.'),
    (1,'Đạo hàm của x² là?','2x','x','x²','2',0,'(x²)′ = 2x.'),
    (2,'Chuyển động thẳng đều có đặc điểm gì?','Vận tốc không đổi','Gia tốc thay đổi','Đứng yên','Quay tròn',0,'Vận tốc không đổi theo thời gian.'),
    (2,'Đơn vị của vận tốc là gì?','m/s','N','kg','J',0,'Đơn vị SI của vận tốc là m/s.'),
    (3,'Synonym of rapid?','slow','quick','late','weak',1,'rapid = quick'),
    (3,'She ___ to school every day.','go','goes','gone','going',1,'Chủ ngữ số ít → goes.'),
    (4,'Hạt nhỏ nhất của chất là gì?','Nguyên tử','Phân tử','Electron','Ion',1,'Phân tử là hạt nhỏ nhất giữ nguyên tính chất hóa học của chất.'),
    (4,'Ký hiệu hóa học của nước là gì?','CO₂','H₂O','O₂','NaCl',1,'Nước là H₂O.')`);
}

/**
 * Đảm bảo luôn có tài khoản quản trị để demo/đăng nhập.
 * Nếu đã có admin thì chuẩn hóa role và mật khẩu mặc định.
 */
async function ensureAdminAccount(db) {
  const admin = await db.get("SELECT id FROM users WHERE LOWER(username) = 'admin' LIMIT 1");
  if (!admin) {
    await db.run(
      "INSERT INTO users (username, password, fullName, grade, role) VALUES (?, ?, ?, ?, ?)",
      ["admin", "admin123", "Quản trị viên", 12, "admin"]
    );
    return;
  }

  await db.run(
    "UPDATE users SET role = 'admin', password = ?, fullName = COALESCE(NULLIF(fullName, ''), ?) WHERE id = ?",
    ["admin123", "Quản trị viên", admin.id]
  );
}

/**
 * Bổ sung dữ liệu đề lớn hơn cho SQLite nếu DB hiện có quá ít đề.
 * Không xóa dữ liệu cũ, chỉ chèn thêm để phù hợp demo nhiều đề.
 */
async function ensureRichQuizData(db) {
  const subjectsByGrade = {
    1: ["Toán", "Tiếng Việt", "Tự nhiên và Xã hội"],
    2: ["Toán", "Tiếng Việt", "Tiếng Anh"],
    3: ["Toán", "Tiếng Việt", "Tiếng Anh"],
    4: ["Toán", "Tiếng Việt", "Khoa học"],
    5: ["Toán", "Tiếng Việt", "Lịch sử và Địa lý"],
    6: ["Toán", "Ngữ văn", "Tiếng Anh", "Khoa học tự nhiên", "Lịch sử và Địa lý"],
    7: ["Toán", "Ngữ văn", "Tiếng Anh", "Vật lý", "Sinh học"],
    8: ["Toán", "Ngữ văn", "Tiếng Anh", "Hóa học", "Lịch sử"],
    9: ["Toán", "Ngữ văn", "Tiếng Anh", "Vật lý", "Hóa học"],
    10: ["Toán", "Ngữ văn", "Tiếng Anh", "Vật lý", "Hóa học"],
    11: ["Toán", "Ngữ văn", "Tiếng Anh", "Sinh học", "Lịch sử"],
    12: ["Toán", "Ngữ văn", "Tiếng Anh", "Vật lý", "Hóa học"]
  };

  const levels = [
    { api: "De", ui: "Dễ", minutes: 15 },
    { api: "Trung binh", ui: "Trung bình", minutes: 20 },
    { api: "Kho", ui: "Khó", minutes: 25 }
  ];

  const defaultOptions = ["A", "B", "C", "D"];
  await db.exec("BEGIN TRANSACTION");
  try {
    for (let grade = 1; grade <= 12; grade += 1) {
      const subjects = subjectsByGrade[grade] ?? ["Toán", "Ngữ văn", "Tiếng Anh"];
      for (const subject of subjects) {
        await db.run(
          "INSERT INTO subjects (grade, name) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM subjects WHERE grade = ? AND name = ?)",
          [grade, subject, grade, subject]
        );

        for (const level of levels) {
          const title = `${subject} lớp ${grade} - Đề ${level.ui}`;
          const existing = await db.get(
            "SELECT id FROM quizzes WHERE grade = ? AND subject = ? AND title = ?",
            [grade, subject, title]
          );
          let quizId = existing?.id;
          if (!quizId) {
            const inserted = await db.run(
              "INSERT INTO quizzes (grade, subject, title, difficulty, durationMinutes) VALUES (?, ?, ?, ?, ?)",
              [grade, subject, title, level.api, level.minutes]
            );
            quizId = inserted.lastID;
          }

          const questionCount = await db.get("SELECT COUNT(*) AS c FROM questions WHERE quizId = ?", [quizId]);
          if ((questionCount?.c ?? 0) >= 40) continue;
          for (let i = questionCount?.c ?? 0; i < 40; i += 1) {
            const idx = i + 1;
            const q = buildMeaningfulQuestion(subject, grade, level.ui, idx);
            await db.run(
              `INSERT INTO questions
                (quizId, content, optionA, optionB, optionC, optionD, correctAnswer, explanation)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [quizId, q.content, q.options[0], q.options[1], q.options[2], q.options[3], q.correctAnswer, q.explanation]
            );
          }
        }
      }
    }

    // Bổ sung cho mọi đề đã có sẵn (kể cả dữ liệu cũ) để luôn đủ tối thiểu 40 câu.
    const allQuizzes = await db.all("SELECT id, grade, subject, difficulty FROM quizzes");
    for (const q of allQuizzes) {
      const countRow = await db.get("SELECT COUNT(*) AS c FROM questions WHERE quizId = ?", [q.id]);
      const current = countRow?.c ?? 0;
      if (current >= 40) continue;
      const diffUi =
        q.difficulty === "De" ? "Dễ" : q.difficulty === "Kho" ? "Khó" : "Trung bình";
      for (let i = current; i < 40; i += 1) {
        const idx = i + 1;
        const generated = buildMeaningfulQuestion(q.subject, q.grade, diffUi, idx);
        await db.run(
          `INSERT INTO questions
            (quizId, content, optionA, optionB, optionC, optionD, correctAnswer, explanation)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            q.id,
            generated.content,
            generated.options[0],
            generated.options[1],
            generated.options[2],
            generated.options[3],
            generated.correctAnswer,
            generated.explanation
          ]
        );
      }
    }

    // Làm sạch các đề cũ đang mang câu placeholder "Câu hỏi ôn tập ...".
    const placeholderQuizzes = await db.all(
      "SELECT DISTINCT quizId FROM questions WHERE content LIKE 'Câu %: Câu hỏi ôn tập %' LIMIT 500"
    );
    for (const item of placeholderQuizzes) {
      const quizInfo = await db.get("SELECT id, grade, subject, difficulty FROM quizzes WHERE id = ?", [item.quizId]);
      if (!quizInfo) continue;
      const diffUi =
        quizInfo.difficulty === "De"
          ? "Dễ"
          : quizInfo.difficulty === "Kho"
          ? "Khó"
          : "Trung bình";
      await db.run("DELETE FROM questions WHERE quizId = ?", [quizInfo.id]);
      for (let i = 1; i <= 40; i += 1) {
        const q = buildMeaningfulQuestion(quizInfo.subject, quizInfo.grade, diffUi, i);
        await db.run(
          `INSERT INTO questions
            (quizId, content, optionA, optionB, optionC, optionD, correctAnswer, explanation)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [quizInfo.id, q.content, q.options[0], q.options[1], q.options[2], q.options[3], q.correctAnswer, q.explanation]
        );
      }
    }

    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

function buildMeaningfulQuestion(subject, grade, level, idx) {
  const n = idx + grade;
  const name = String(subject || "").toLowerCase();
  const type = idx % 5;

  if (name.includes("toán") || name.includes("toan")) {
    if (type === 0) {
      const a = (n % 7) + 2;
      const b = (n % 9) + 3;
      const x = (n % 8) + 1;
      const c = a * x + b;
      return {
        content: `Giải phương trình ${a}x + ${b} = ${c}. (Lớp ${grade} - ${level})`,
        options: [`x = ${x - 1}`, `x = ${x}`, `x = ${x + 1}`, `x = ${x + 2}`],
        correctAnswer: 1,
        explanation: `Ta có ${a}x = ${c - b} nên x = ${x}.`
      };
    }
    if (type === 1) {
      const k = (n % 6) + 1;
      return {
        content: `Đồ thị của hàm số y = ${k}x^2 thuộc dạng nào? (Lớp ${grade} - ${level})`,
        options: ["Đường tròn", "Parabol", "Đường thẳng", "Hypebol"],
        correctAnswer: 1,
        explanation: "Hàm bậc hai luôn có đồ thị là parabol."
      };
    }
    if (type === 2) {
      const m = (n % 6) + 2;
      return {
        content: `Giá trị của biểu thức ${m}^2 là bao nhiêu? (Lớp ${grade} - ${level})`,
        options: [`${m + 2}`, `${m * m - 1}`, `${m * m}`, `${m * m + 1}`],
        correctAnswer: 2,
        explanation: `Bình phương của ${m} là ${m * m}.`
      };
    }
    if (type === 3) {
      const a = (n % 8) + 3;
      const b = (n % 5) + 4;
      return {
        content: `Hình chữ nhật có chiều dài ${a} cm và chiều rộng ${b} cm. Chu vi bằng? (Lớp ${grade} - ${level})`,
        options: [`${a + b}`, `${2 * (a + b)}`, `${a * b}`, `${2 * a + b}`],
        correctAnswer: 1,
        explanation: "Chu vi hình chữ nhật bằng 2 x (dài + rộng)."
      };
    }
    return {
      content: `Giá trị của sin 30° là bao nhiêu? (Lớp ${grade} - ${level} - biến thể ${idx})`,
      options: ["1", "1/2", "sqrt(2)/2", "sqrt(3)/2"],
      correctAnswer: 1,
      explanation: "sin 30° = 1/2."
    };
  }

  if (name.includes("vật lý") || name.includes("vat ly")) {
    const mass = (n % 5) + 1;
    const acc = (n % 6) + 2;
    const force = mass * acc;
    return {
      content: `Một vật có khối lượng ${mass} kg, gia tốc ${acc} m/s². Lực tác dụng bằng bao nhiêu? (Lớp ${grade} - ${level})`,
      options: [`${force - 2} N`, `${force} N`, `${force + 2} N`, `${mass + acc} N`],
      correctAnswer: 1,
      explanation: "Áp dụng công thức F = m x a."
    };
  }

  if (name.includes("hóa") || name.includes("hoa")) {
    const acids = ["HCl", "H2SO4", "HNO3", "CH3COOH"];
    const acid = acids[idx % acids.length];
    return {
      content: `Dung dịch nào sau đây thuộc nhóm axit mạnh tiêu biểu? (Lớp ${grade} - ${level})`,
      options: [acid, "NaCl", "KOH", "CaCO3"],
      correctAnswer: 0,
      explanation: `${acid} là một axit điển hình trong chương trình phổ thông.`
    };
  }

  if (name.includes("tiếng anh") || name.includes("anh văn") || name.includes("tieng anh")) {
    const verbs = ["go", "play", "study", "watch", "read"];
    const verb = verbs[idx % verbs.length];
    return {
      content: `Chọn đáp án đúng: She ___ ${verb} every day. (Lớp ${grade} - ${level})`,
      options: [verb, `${verb}s`, `${verb}ed`, `is ${verb}ing`],
      correctAnswer: 1,
      explanation: "Chủ ngữ số ít ở hiện tại đơn thêm -s/-es cho động từ."
    };
  }

  if (name.includes("ngữ văn") || name.includes("tiếng việt") || name.includes("ngu van") || name.includes("tieng viet")) {
    const topics = ["đời sống học đường", "môi trường", "lối sống đẹp", "trách nhiệm công dân", "tình yêu quê hương"];
    const topic = topics[idx % topics.length];
    return {
      content: `Trong bài nghị luận về "${topic}", thao tác nào dùng để làm rõ luận điểm bằng lí lẽ và dẫn chứng? (Lớp ${grade} - ${level})`,
      options: ["Giải thích", "Bác bỏ", "Chứng minh", "Tự sự"],
      correctAnswer: 2,
      explanation: "Chứng minh là thao tác dùng lí lẽ và dẫn chứng để làm sáng tỏ luận điểm."
    };
  }

  if (name.includes("lịch sử") || name.includes("lich su")) {
    const years = [1945, 1954, 1975, 1986, 1930];
    const correct = years[idx % years.length];
    const wrong1 = correct - 1;
    const wrong2 = correct + 1;
    const wrong3 = correct + 5;
    return {
      content: `Mốc năm quan trọng liên quan đến sự kiện lịch sử Việt Nam trong chương trình phổ thông là năm nào? (Lớp ${grade} - ${level} - biến thể ${idx})`,
      options: [`${wrong1}`, `${correct}`, `${wrong2}`, `${wrong3}`],
      correctAnswer: 1,
      explanation: "Đây là mốc thời gian trọng tâm trong chương trình."
    };
  }

  if (name.includes("sinh học") || name.includes("sinh hoc")) {
    const organs = ["tim", "phổi", "gan", "thận", "não"];
    const organ = organs[idx % organs.length];
    return {
      content: `Cơ quan ${organ} thuộc hệ cơ quan nào ở người? (Lớp ${grade} - ${level} - biến thể ${idx})`,
      options: ["Hệ thần kinh", "Hệ tuần hoàn", "Tùy theo cơ quan", "Hệ sinh dục"],
      correctAnswer: 2,
      explanation: "Mỗi cơ quan thuộc một hệ khác nhau; cần xác định đúng theo cơ quan cụ thể."
    };
  }

  return {
    content: `Câu hỏi ôn tập ${idx} cho môn ${subject} lớp ${grade} (${level}).`,
    options: ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"],
    correctAnswer: idx % 4,
    explanation: "Câu hỏi sinh tự động theo môn học."
  };
}

async function ensureAllQuizzesUnique(db) {
  const quizzes = await db.all("SELECT id, grade, subject, difficulty FROM quizzes");
  await db.exec("BEGIN TRANSACTION");
  try {
    for (const quiz of quizzes) {
      const level = quiz.difficulty === "De" ? "Dễ" : quiz.difficulty === "Kho" ? "Khó" : "Trung bình";
      const generated = [];
      const seen = new Set();
      let idx = 1;
      while (generated.length < 40 && idx <= 300) {
        const q = buildMeaningfulQuestion(quiz.subject, quiz.grade, level, idx);
        const key = normalizeQuestionContent(q.content).toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          generated.push(q);
        }
        idx += 1;
      }
      await db.run("DELETE FROM questions WHERE quizId = ?", [quiz.id]);
      for (const q of generated) {
        await db.run(
          `INSERT INTO questions
            (quizId, content, optionA, optionB, optionC, optionD, correctAnswer, explanation)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [quiz.id, q.content, q.options[0], q.options[1], q.options[2], q.options[3], q.correctAnswer, q.explanation]
        );
      }
    }
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

function normalizeQuestionContent(content) {
  return String(content ?? "")
    .replace(/^Câu\s*\d+\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseQuestion(row) {
  return {
    id: row.id,
    content: normalizeQuestionContent(row.content),
    options: [row.optionA, row.optionB, row.optionC, row.optionD],
    imageUrl: row.imageUrl ?? null
  };
}

function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function uniqueQuestionsByContent(questions) {
  const seen = new Set();
  const out = [];
  for (const q of questions) {
    const key = normalizeQuestionContent(q.content).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

function parseGeminiJson(text) {
  const cleaned = String(text ?? "").replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    const arrStart = cleaned.indexOf("[");
    const arrEnd = cleaned.lastIndexOf("]");
    if (arrStart >= 0 && arrEnd > arrStart) {
      return { questions: JSON.parse(cleaned.slice(arrStart, arrEnd + 1)) };
    }
    throw new Error("Không parse được JSON từ Gemini.");
  }
}

function normalizeGeminiQuestion(raw, idx) {
  const content = String(raw?.content ?? raw?.question ?? "").trim();
  let options = [];
  if (Array.isArray(raw?.options)) {
    options = raw.options.map((o) => String(o ?? "").trim()).filter(Boolean);
  } else if (raw?.options && typeof raw.options === "object") {
    const optObj = raw.options;
    options = [optObj.A, optObj.B, optObj.C, optObj.D].map((o) => String(o ?? "").trim()).filter(Boolean);
  } else {
    options = [raw?.optionA, raw?.optionB, raw?.optionC, raw?.optionD]
      .map((o) => String(o ?? "").trim())
      .filter(Boolean);
  }
  while (options.length < 4) {
    options.push(`Phương án ${String.fromCharCode(65 + options.length)}`);
  }
  options = options.slice(0, 4);

  let correctAnswer = Number(raw?.correctAnswer);
  if (Number.isNaN(correctAnswer)) {
    const ca = String(raw?.correctAnswer ?? "").trim().toUpperCase();
    const map = { A: 0, B: 1, C: 2, D: 3 };
    if (Object.prototype.hasOwnProperty.call(map, ca)) {
      correctAnswer = map[ca];
    } else {
      correctAnswer = 0;
    }
  }
  correctAnswer = Math.max(0, Math.min(3, correctAnswer));
  return {
    id: idx + 1,
    content: normalizeQuestionContent(content),
    options,
    correctAnswer,
    explanation: String(raw?.explanation ?? "").trim()
  };
}

function readGeminiApiKeys(configRow) {
  const keys = [];
  const single = String(configRow?.apiKey ?? "").trim();
  if (single) keys.push(single);
  try {
    const parsed = JSON.parse(String(configRow?.apiKeys ?? "[]"));
    if (Array.isArray(parsed)) {
      for (const k of parsed) {
        const key = String(k ?? "").trim();
        if (key) keys.push(key);
      }
    }
  } catch (_) {
    /* ignore malformed legacy data */
  }
  return [...new Set(keys)];
}

async function callGeminiWithFallback({ apiKey, model, textPrompt }) {
  const keyList = Array.isArray(apiKey) ? apiKey : [apiKey];
  const keys = keyList.map((k) => String(k ?? "").trim()).filter(Boolean);
  if (!keys.length) {
    throw new Error("Thiếu Gemini API key.");
  }
  const preferred = String(model || "").trim().replace(/^models\//, "");
  const candidates = [
    preferred,
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest"
  ].filter(Boolean);

  const uniqueModels = [...new Set(candidates)];
  let lastError = "Unknown Gemini error";

  for (const key of keys) {
    for (const m of uniqueModels) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const now = Date.now();
        const waitMs = Math.max(0, 900 - (now - lastGeminiRequestAt));
        if (waitMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
        lastGeminiRequestAt = Date.now();
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: textPrompt }] }]
            })
          }
        );
        if (r.ok) {
          const payload = await r.json();
          return {
            model: m,
            text: payload?.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
          };
        }
        lastError = `Gemini model ${m} HTTP ${r.status}`;
        if (r.status === 429 && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
          continue;
        }
        if (r.status === 429) {
          break;
        }
        if (r.status === 404) {
          break;
        }
        if (attempt === 2) {
          break;
        }
      }
    }
  }
  if (String(lastError).includes("HTTP 429")) {
    throw new Error("GEMINI_RATE_LIMIT_429");
  }
  throw new Error(
    `${lastError}. Hãy kiểm tra API key và model trong tab Gemini API (gợi ý model: gemini-2.0-flash).`
  );
}

function generateLocalQuestionSet({ grade, subject, difficulty, questionCount }) {
  const level = difficulty === "De" ? "Dễ" : difficulty === "Kho" ? "Khó" : "Trung bình";
  const target = Math.min(60, Math.max(5, Number(questionCount) || 40));
  const seen = new Set();
  const out = [];
  let idx = 1;
  while (out.length < target && idx <= target + 500) {
    const q = buildMeaningfulQuestion(subject, grade, level, idx);
    const key = normalizeQuestionContent(q.content).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push({
        content: normalizeQuestionContent(q.content),
        options: q.options,
        correctAnswer: Number(q.correctAnswer) || 0,
        explanation: q.explanation ?? ""
      });
    }
    idx += 1;
  }
  return out;
}

async function generateQuestionsWithGemini({ apiKey, model, grade, subject, difficulty, questionCount, prompt }) {
  const instruction = `
Bạn là hệ thống tạo đề trắc nghiệm.
Tạo ${questionCount} câu KHÔNG TRÙNG cho môn ${subject}, lớp ${grade}, độ khó ${difficulty}.
Chỉ trả về JSON đúng schema:
{
  "questions":[
    {"content":"...", "options":["A","B","C","D"], "correctAnswer":0, "explanation":"..."}
  ]
}
Quy tắc:
- options đúng 4 phần tử
- correctAnswer là index từ 0 đến 3
- Không thêm markdown hoặc text ngoài JSON
- Yêu cầu bổ sung: ${prompt || "không có"}
`.trim();
  const response = await callGeminiWithFallback({
    apiKey,
    model,
    textPrompt: instruction
  });
  const text = response.text;
  const parsed = parseGeminiJson(text);
  const questionsRaw = Array.isArray(parsed) ? parsed : Array.isArray(parsed.questions) ? parsed.questions : [];
  return questionsRaw.map((q, idx) => normalizeGeminiQuestion(q, idx));
}

function splitToChunks(text, chunkSize = 700) {
  const raw = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return [];
  const chunks = [];
  for (let i = 0; i < raw.length; i += chunkSize) {
    chunks.push(raw.slice(i, i + chunkSize));
  }
  return chunks;
}

function scoreChunk(query, chunk) {
  const qWords = String(query)
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2);
  const lowerChunk = String(chunk).toLowerCase();
  let score = 0;
  for (const w of qWords) {
    if (lowerChunk.includes(w)) score += 1;
  }
  return score;
}

function slugFileName(name) {
  return String(name ?? "file")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseCsvRows(csvText) {
  const lines = String(csvText ?? "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const splitCsv = (line) => {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((x) => x.trim());
  };
  const headers = splitCsv(lines[0]).map((h) => h.toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const vals = splitCsv(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = vals[idx] ?? "";
    });
    rows.push(obj);
  }
  return rows;
}

async function extractTextFromDocumentFile(filePath, originalName) {
  const ext = path.extname(originalName || filePath).toLowerCase();
  if (ext === ".txt") {
    return fs.readFileSync(filePath, "utf-8");
  }
  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value ?? "";
  }
  if (ext === ".pdf") {
    const buffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: buffer });
    try {
      const data = await parser.getText();
      return data.text ?? "";
    } finally {
      await parser.destroy();
    }
  }
  throw new Error("Chỉ hỗ trợ file .txt, .docx, .pdf");
}

async function generateChatWithGemini({ apiKey, model, userQuestion, contextChunks }) {
  const contextText = contextChunks.length
    ? contextChunks.map((c, idx) => `Nguồn ${idx + 1}: ${c}`).join("\n\n")
    : "Không có nguồn tài liệu nội bộ phù hợp.";
  const prompt = `
Bạn là trợ lý học tập cho học sinh Việt Nam.
Hãy trả lời dễ hiểu, đúng trọng tâm, có ví dụ ngắn.
Nếu người dùng hỏi "lời giải chi tiết", hãy trình bày từng bước rõ ràng.

Ngữ cảnh tài liệu nội bộ:
${contextText}

Câu hỏi học sinh:
${userQuestion}
`.trim();

  const response = await callGeminiWithFallback({
    apiKey,
    model,
    textPrompt: prompt
  });
  return response.text || "Mình chưa trả lời được lúc này.";
}

function trySolveBasicMath(question) {
  const normalized = String(question ?? "")
    .toLowerCase()
    .replace(/bằng bao nhiêu|bao nhiêu|la bao nhieu|la may/g, "")
    .replace(/\s+/g, "");
  const match = normalized.match(/^(-?\d+(?:[.,]\d+)?)([\+\-\*x:\/])(-?\d+(?:[.,]\d+)?)$/);
  if (!match) return null;
  const a = Number(match[1].replace(",", "."));
  const op = match[2];
  const b = Number(match[3].replace(",", "."));
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  if ((op === "/" || op === ":") && b === 0) return "Không thể chia cho 0.";
  let result = 0;
  if (op === "+") result = a + b;
  if (op === "-") result = a - b;
  if (op === "*" || op === "x") result = a * b;
  if (op === "/" || op === ":") result = a / b;
  return `Kết quả là ${result}.`;
}

function trySolveBasicTrig(question) {
  const normalized = String(question ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/độ|do/g, "")
    .replace(/\?/g, "");
  const map = new Map([
    ["sin30", "sin 30° = 1/2."],
    ["cos30", "cos 30° = sqrt(3)/2."],
    ["tan30", "tan 30° = 1/sqrt(3) = sqrt(3)/3."],
    ["cot30", "cot 30° = sqrt(3)."],
    ["sin45", "sin 45° = sqrt(2)/2."],
    ["cos45", "cos 45° = sqrt(2)/2."],
    ["tan45", "tan 45° = 1."],
    ["cot45", "cot 45° = 1."],
    ["sin60", "sin 60° = sqrt(3)/2."],
    ["cos60", "cos 60° = 1/2."],
    ["tan60", "tan 60° = sqrt(3)."],
    ["cot60", "cot 60° = 1/sqrt(3) = sqrt(3)/3."],
    ["sin90", "sin 90° = 1."],
    ["cos90", "cos 90° = 0."],
    ["tan90", "tan 90° không xác định."],
    ["sin0", "sin 0° = 0."],
    ["cos0", "cos 0° = 1."],
    ["tan0", "tan 0° = 0."]
  ]);
  for (const [key, value] of map.entries()) {
    if (normalized.includes(key)) return value;
  }
  return null;
}

export async function createApp() {
  const db = await initDb();
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use("/uploads", express.static(uploadsDir));

  const imageUpload = multer({
    storage: multer.diskStorage({
      destination: (_, __, cb) => cb(null, imageUploadsDir),
      filename: (_, file, cb) => {
        const ext = path.extname(file.originalname || ".png").toLowerCase();
        const base = slugFileName(path.basename(file.originalname || "image", ext)) || "image";
        cb(null, `${Date.now()}-${base}${ext}`);
      }
    }),
    limits: { fileSize: 5 * 1024 * 1024 }
  });

  const docUpload = multer({
    storage: multer.diskStorage({
      destination: (_, __, cb) => cb(null, docsUploadsDir),
      filename: (_, file, cb) => {
        const ext = path.extname(file.originalname || ".txt").toLowerCase();
        const base = slugFileName(path.basename(file.originalname || "document", ext)) || "document";
        cb(null, `${Date.now()}-${base}${ext}`);
      }
    }),
    limits: { fileSize: 15 * 1024 * 1024 }
  });
  const csvUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
  });

  app.use(async (req, res, next) => {
    const uid = req.headers["x-user-id"];
    if (!uid) {
      req.authUser = null;
      return next();
    }
    const id = Number(uid);
    if (Number.isNaN(id)) {
      req.authUser = null;
      return next();
    }
    const user = await db.get("SELECT id, username, fullName, grade, role FROM users WHERE id = ?", [id]);
    req.authUser = user ?? null;
    next();
  });

  const requireAdmin = (req, res, next) => {
    if (!req.authUser) return res.status(401).json({ message: "Cần đăng nhập (header x-user-id)." });
    if (req.authUser.role !== "admin") return res.status(403).json({ message: "Chỉ quản trị viên." });
    next();
  };

  const requireQuizManager = (req, res, next) => {
    if (!req.authUser) return res.status(401).json({ message: "Cần đăng nhập." });
    if (!["admin", "teacher"].includes(req.authUser.role)) {
      return res.status(403).json({ message: "Chỉ admin hoặc giáo viên." });
    }
    next();
  };

  app.get("/api/health", (_, res) => {
    res.json({ ok: true, engine: "sqlite", message: "Quiz backend with SQLite is running" });
  });

  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body ?? {};
    const user = await db.get(
      "SELECT id, username, fullName, grade, role, studentCode FROM users WHERE username = ? AND password = ?",
      [username, password]
    );
    if (!user) return res.status(401).json({ message: "Thông tin đăng nhập không đúng." });
    res.json({ token: `fake-token-${user.id}`, user });
  });

  app.post("/api/auth/register", async (req, res) => {
    const { username, password, fullName, grade, studentCode } = req.body ?? {};
    if (!username || !password || !fullName || !grade) {
      return res.status(400).json({ message: "Thiếu thông tin đăng ký." });
    }

    const normalizedUsername = String(username).trim();
    const existed = await db.get("SELECT id FROM users WHERE LOWER(username) = LOWER(?)", [
      normalizedUsername
    ]);
    if (existed) {
      return res.status(409).json({ message: "Tên đăng nhập đã tồn tại." });
    }

    const gradeNumber = Number(grade);
    if (Number.isNaN(gradeNumber) || gradeNumber < 1 || gradeNumber > 12) {
      return res.status(400).json({ message: "Lớp không hợp lệ." });
    }

    const result = await db.run(
      "INSERT INTO users (username, password, fullName, grade, role, studentCode) VALUES (?, ?, ?, ?, 'user', ?)",
      [
        normalizedUsername,
        String(password),
        String(fullName).trim(),
        gradeNumber,
        String(studentCode ?? "").trim() || null
      ]
    );
    await db.run("UPDATE users SET studentCode = COALESCE(studentCode, 'HS' || printf('%05d', id)) WHERE id = ?", [
      result.lastID
    ]);
    const created = await db.get("SELECT id, username, fullName, grade, role, studentCode FROM users WHERE id = ?", [
      result.lastID
    ]);
    return res.status(201).json({
      message: "Đăng ký thành công.",
      user: created
    });
  });

  app.get("/api/grades", async (_, res) => {
    res.json(await db.all("SELECT * FROM grades ORDER BY id"));
  });

  app.get("/api/subjects", async (req, res) => {
    const grade = Number(req.query.grade);
    if (Number.isNaN(grade)) {
      return res.json(await db.all("SELECT * FROM subjects ORDER BY grade, name"));
    }
    res.json(await db.all("SELECT * FROM subjects WHERE grade = ? ORDER BY name", [grade]));
  });

  app.get("/api/quizzes", async (req, res) => {
    const grade = Number(req.query.grade);
    const subject = req.query.subject ? String(req.query.subject) : null;
    const search = req.query.search ? String(req.query.search) : null;
    const difficulty = req.query.difficulty ? String(req.query.difficulty) : null;

    const conditions = [];
    const params = [];
    if (!Number.isNaN(grade)) {
      conditions.push("q.grade = ?");
      params.push(grade);
    }
    if (subject) {
      conditions.push("LOWER(q.subject) = LOWER(?)");
      params.push(subject);
    }
    if (search) {
      conditions.push("LOWER(q.title) LIKE LOWER(?)");
      params.push(`%${search}%`);
    }
    if (difficulty) {
      conditions.push("q.difficulty = ?");
      params.push(difficulty);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = await db.all(
      `SELECT q.*, COUNT(qq.id) AS questionCount
       FROM quizzes q
       LEFT JOIN questions qq ON qq.quizId = q.id
       ${where}
       GROUP BY q.id
       ORDER BY q.grade, q.title`,
      params
    );
    res.json(rows);
  });

  app.get("/api/quizzes/:id", async (req, res) => {
    const id = Number(req.params.id);
    const questionCount = Number(req.query.questionCount);
    const shouldShuffle =
      String(req.query.shuffle).toLowerCase() === "true" || String(req.query.shuffle).toLowerCase() === "1";
    const quiz = await db.get("SELECT * FROM quizzes WHERE id = ?", [id]);
    if (!quiz) return res.status(404).json({ message: "Không tìm thấy đề thi." });
    const rows = await db.all("SELECT * FROM questions WHERE quizId = ? ORDER BY id", [id]);
    const requestedCount = Number.isNaN(questionCount) ? 40 : Math.max(1, questionCount);
    const targetCount = Math.min(60, requestedCount);
    const currentUnique = uniqueQuestionsByContent(rows.map(parseQuestion));
    if (currentUnique.length < targetCount) {
      const diffUi =
        quiz.difficulty === "De" ? "Dễ" : quiz.difficulty === "Kho" ? "Khó" : "Trung bình";
      const existingKeys = new Set(currentUnique.map((q) => normalizeQuestionContent(q.content).toLowerCase()));
      let idx = rows.length + 1;
      while (existingKeys.size < targetCount && idx <= rows.length + 120) {
        const g = buildMeaningfulQuestion(quiz.subject, quiz.grade, diffUi, idx);
        const key = normalizeQuestionContent(g.content).toLowerCase();
        if (!existingKeys.has(key)) {
          await db.run(
            `INSERT INTO questions
              (quizId, content, optionA, optionB, optionC, optionD, correctAnswer, explanation)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, g.content, g.options[0], g.options[1], g.options[2], g.options[3], g.correctAnswer, g.explanation]
          );
          existingKeys.add(key);
        }
        idx += 1;
      }
    }
    const latestRows = await db.all("SELECT * FROM questions WHERE quizId = ? ORDER BY id", [id]);
    const parsedQuestions = latestRows.map(parseQuestion);
    const deduped = uniqueQuestionsByContent(parsedQuestions);
    let selected = shouldShuffle ? shuffleArray(deduped) : deduped;
    if (!Number.isNaN(questionCount) && questionCount > 0) {
      selected = selected.slice(0, Math.min(questionCount, selected.length));
    }
    res.json({ ...quiz, questionCount: selected.length, questions: selected });
  });

  app.post("/api/attempts", async (req, res) => {
    const { userId, quizId, answers } = req.body ?? {};
    if (!userId || !quizId || !Array.isArray(answers)) {
      return res.status(400).json({ message: "Dữ liệu không hợp lệ." });
    }

    const questions = await db.all("SELECT id, correctAnswer FROM questions WHERE quizId = ?", [quizId]);
    if (!questions.length) return res.status(404).json({ message: "Không tìm thấy đề thi." });

    let correct = 0;
    for (const a of answers) {
      const q = questions.find((x) => x.id === Number(a.questionId));
      if (q && q.correctAnswer === Number(a.selectedAnswer)) correct += 1;
    }
    const total = questions.length;
    const score = Math.round((correct / total) * 100);
    const submittedAt = new Date().toISOString();

    const created = await db.run(
      "INSERT INTO attempts (userId, quizId, correct, total, score, submittedAt) VALUES (?,?,?,?,?,?)",
      [userId, quizId, correct, total, score, submittedAt]
    );
    res.status(201).json({
      id: created.lastID,
      userId: Number(userId),
      quizId: Number(quizId),
      correct,
      total,
      score,
      submittedAt
    });
  });

  app.get("/api/attempts", async (req, res) => {
    const userId = Number(req.query.userId);
    const quizId = Number(req.query.quizId);
    const conditions = [];
    const params = [];
    if (!Number.isNaN(userId)) {
      conditions.push("userId = ?");
      params.push(userId);
    }
    if (!Number.isNaN(quizId)) {
      conditions.push("quizId = ?");
      params.push(quizId);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    res.json(await db.all(`SELECT * FROM attempts ${where} ORDER BY submittedAt DESC`, params));
  });

  app.get("/api/attempts/stats", async (req, res) => {
    const userId = Number(req.query.userId);
    const attempts = Number.isNaN(userId)
      ? await db.all("SELECT * FROM attempts")
      : await db.all("SELECT * FROM attempts WHERE userId = ?", [userId]);
    if (!attempts.length) {
      return res.json({ totalAttempts: 0, averageScore: 0, bestScore: 0, lowestScore: 0, byQuiz: [] });
    }
    const scores = attempts.map((a) => a.score);
    const quizzes = await db.all("SELECT id, title, subject FROM quizzes");
    const byQuiz = quizzes
      .map((q) => {
        const list = attempts.filter((a) => a.quizId === q.id);
        if (!list.length) return null;
        const averageScore = Math.round(list.reduce((sum, item) => sum + item.score, 0) / list.length);
        const bestScore = Math.max(...list.map((a) => a.score));
        const latestScore = [...list].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0].score;
        return {
          quizId: q.id,
          title: q.title,
          subject: q.subject,
          attempts: list.length,
          averageScore,
          bestScore,
          latestScore
        };
      })
      .filter(Boolean);
    return res.json({
      totalAttempts: attempts.length,
      averageScore: Math.round(scores.reduce((sum, item) => sum + item, 0) / scores.length),
      bestScore: Math.max(...scores),
      lowestScore: Math.min(...scores),
      byQuiz
    });
  });

  app.get("/api/attempts/compare", async (req, res) => {
    const userId = Number(req.query.userId);
    const quizId = Number(req.query.quizId);
    if (Number.isNaN(userId) || Number.isNaN(quizId)) {
      return res.status(400).json({ message: "Cần truyền userId và quizId hợp lệ." });
    }
    const quiz = await db.get("SELECT id, title FROM quizzes WHERE id = ?", [quizId]);
    if (!quiz) return res.status(404).json({ message: "Không tìm thấy đề thi." });
    const attempts = await db.all(
      "SELECT * FROM attempts WHERE userId = ? AND quizId = ? ORDER BY submittedAt ASC",
      [userId, quizId]
    );
    const compared = attempts.map((a, idx) => {
      const prev = idx > 0 ? attempts[idx - 1] : null;
      const diff = prev ? a.score - prev.score : 0;
      return {
        ...a,
        scoreDiffFromPrevious: diff,
        trend: diff > 0 ? "up" : diff < 0 ? "down" : "same"
      };
    });
    return res.json({
      userId,
      quizId,
      title: quiz.title,
      attempts: compared,
      latestTrend: compared.length ? compared[compared.length - 1].trend : "none"
    });
  });

  app.get("/api/stats/:userId", async (req, res) => {
    const userId = Number(req.params.userId);
    const rows = await db.all("SELECT score, submittedAt FROM attempts WHERE userId = ? ORDER BY submittedAt", [userId]);
    const totalAttempts = rows.length;
    const avgScore = totalAttempts
      ? Math.round(rows.reduce((sum, r) => sum + r.score, 0) / totalAttempts)
      : 0;
    const bestScore = totalAttempts ? Math.max(...rows.map((r) => r.score)) : 0;
    res.json({ totalAttempts, avgScore, bestScore, trend: rows });
  });

  app.get("/api/rankings", async (req, res) => {
    const grade = Number(req.query.grade);
    const where = Number.isNaN(grade) ? "" : "WHERE u.grade = ?";
    const params = Number.isNaN(grade) ? [] : [grade];
    const rows = await db.all(
      `SELECT
          u.id AS userId,
          u.fullName,
          u.grade,
          COUNT(a.id) AS attempts,
          COALESCE(ROUND(AVG(a.score)), 0) AS averageScore
       FROM users u
       LEFT JOIN attempts a ON a.userId = u.id
       ${where}
       GROUP BY u.id
       ORDER BY averageScore DESC, attempts DESC`,
      params
    );
    res.json(rows);
  });

  app.get("/api/recommendations/:userId", async (req, res) => {
    const userId = Number(req.params.userId);
    const user = await db.get("SELECT grade FROM users WHERE id = ?", [userId]);
    if (!user) return res.status(404).json({ message: "Không tìm thấy người dùng." });
    const rows = await db.all(
      `SELECT q.*, COUNT(qq.id) AS questionCount
       FROM quizzes q
       LEFT JOIN questions qq ON qq.quizId = q.id
       WHERE q.grade = ?
       GROUP BY q.id
       ORDER BY CASE q.difficulty WHEN 'De' THEN 1 WHEN 'Trung binh' THEN 2 ELSE 3 END, q.id`,
      [user.grade]
    );
    res.json(rows.slice(0, 8));
  });

  app.get("/api/favorites", async (req, res) => {
    const userId = Number(req.query.userId);
    if (Number.isNaN(userId)) return res.status(400).json({ message: "Thiếu tham số userId." });
    const rows = await db.all(
      `SELECT q.*, f.id AS favoriteId
       FROM favorite_quizzes f
       JOIN quizzes q ON q.id = f.quizId
       WHERE f.userId = ?`,
      [userId]
    );
    res.json(rows);
  });

  app.post("/api/favorites", async (req, res) => {
    const { userId, quizId } = req.body ?? {};
    if (!userId || !quizId) return res.status(400).json({ message: "Dữ liệu không hợp lệ." });
    await db.run("INSERT OR IGNORE INTO favorite_quizzes (userId, quizId) VALUES (?, ?)", [userId, quizId]);
    res.status(201).json({ ok: true });
  });

  app.delete("/api/favorites", async (req, res) => {
    const { userId, quizId } = req.body ?? {};
    if (!userId || !quizId) return res.status(400).json({ message: "Dữ liệu không hợp lệ." });
    await db.run("DELETE FROM favorite_quizzes WHERE userId = ? AND quizId = ?", [userId, quizId]);
    res.json({ ok: true });
  });

  app.post("/api/quizzes/auto-generate", async (req, res) => {
    if (!req.authUser) {
      return res.status(401).json({ message: "Cần đăng nhập để tạo đề AI." });
    }
    const { grade, subject, difficulty = "Trung binh", questionCount = 40, durationMinutes = 20, title, prompt } =
      req.body ?? {};
    if (!grade || !subject) {
      return res.status(400).json({ message: "Thiếu thông tin lớp hoặc môn học." });
    }
    const config = await db.get("SELECT provider, model, apiKey, apiKeys FROM ai_runtime_config WHERE id = 1");
    const apiKeys = readGeminiApiKeys(config);
    if (!apiKeys.length) {
      return res.status(400).json({ message: "Admin chưa cấu hình Gemini API key." });
    }
    const count = Math.min(60, Math.max(5, Number(questionCount) || 40));
    let generated = [];
    try {
      generated = await generateQuestionsWithGemini({
        apiKey: apiKeys,
        model: config?.model || "gemini-1.5-flash",
        grade: Number(grade),
        subject: String(subject),
        difficulty: String(difficulty),
        questionCount: count,
        prompt: String(prompt ?? "")
      });
    } catch (error) {
      if (String(error.message || "").includes("GEMINI_RATE_LIMIT_429")) {
        return res
          .status(503)
          .json({ message: "Gemini đang quá tải (429). Hãy thử lại sau ít phút hoặc giảm tần suất tạo đề." });
      }
      return res.status(500).json({ message: `Tạo đề AI thất bại: ${error.message}` });
    }

    const cleaned = uniqueQuestionsByContent(
      generated.map((q, idx) => ({
        id: idx + 1,
        content: normalizeQuestionContent(q.content),
        options: Array.isArray(q.options) ? q.options.map((o) => String(o)) : [],
        correctAnswer: Number(q.correctAnswer),
        explanation: String(q.explanation ?? "")
      }))
    ).filter((q) => q.content && q.options.length >= 4 && q.correctAnswer >= 0 && q.correctAnswer <= 3);

    if (cleaned.length < 5) {
      return res.status(500).json({ message: "Gemini trả về dữ liệu chưa hợp lệ, hãy thử lại." });
    }

    const finalTitle = title && String(title).trim() ? String(title).trim() : `Đề AI ${subject} lớp ${grade}`;
    const created = await db.run(
      "INSERT INTO quizzes (grade, subject, title, difficulty, durationMinutes) VALUES (?, ?, ?, ?, ?)",
      [Number(grade), String(subject), finalTitle, String(difficulty), Number(durationMinutes) || 20]
    );
    const quizId = created.lastID;
    for (const q of cleaned.slice(0, count)) {
      await db.run(
        `INSERT INTO questions
          (quizId, content, optionA, optionB, optionC, optionD, correctAnswer, explanation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [quizId, q.content, q.options[0], q.options[1], q.options[2], q.options[3], q.correctAnswer, q.explanation]
      );
    }
    return res.status(201).json({
      message: "Tạo đề AI thành công.",
      quizId,
      title: finalTitle,
      questionCount: Math.min(count, cleaned.length),
      fallbackMode: false
    });
  });

  app.get("/api/admin/ai-config", requireAdmin, async (_, res) => {
    const config = await db.get("SELECT provider, model, apiKey, apiKeys FROM ai_runtime_config WHERE id = 1");
    const keys = readGeminiApiKeys(config);
    return res.json({
      provider: config?.provider ?? "gemini",
      model: config?.model ?? "gemini-1.5-flash",
      hasApiKey: keys.length > 0,
      apiKeys: keys
    });
  });

  app.patch("/api/admin/ai-config", requireAdmin, async (req, res) => {
    const { apiKey, apiKeys, model } = req.body ?? {};
    const current = await db.get("SELECT provider, model, apiKey, apiKeys FROM ai_runtime_config WHERE id = 1");
    const currentKeys = readGeminiApiKeys(current);
    const incomingKeys = Array.isArray(apiKeys)
      ? apiKeys.map((k) => String(k ?? "").trim()).filter(Boolean)
      : currentKeys;
    const nextApiKey = typeof apiKey === "string" ? apiKey.trim() : incomingKeys[0] ?? current?.apiKey ?? "";
    const nextModel = typeof model === "string" && model.trim() ? model.trim() : current?.model ?? "gemini-1.5-flash";
    const mergedKeys = [...new Set([nextApiKey, ...incomingKeys].map((k) => String(k ?? "").trim()).filter(Boolean))];
    await db.run("UPDATE ai_runtime_config SET model = ?, apiKey = ?, apiKeys = ? WHERE id = 1", [
      nextModel,
      mergedKeys[0] ?? "",
      JSON.stringify(mergedKeys)
    ]);
    return res.json({
      message: "Đã cập nhật cấu hình AI.",
      provider: current?.provider ?? "gemini",
      model: nextModel,
      hasApiKey: mergedKeys.length > 0,
      apiKeys: mergedKeys
    });
  });

  app.post("/api/admin/upload-image", requireQuizManager, imageUpload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "Không nhận được file ảnh." });
    const ext = path.extname(req.file.originalname || "").toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (_) {
        /* noop */
      }
      return res.status(400).json({ message: "Chỉ hỗ trợ ảnh png/jpg/jpeg/webp/gif." });
    }
    const imageUrl = `/uploads/images/${path.basename(req.file.path)}`;
    return res.status(201).json({ imageUrl });
  });

  app.get("/api/admin/ai-documents", requireAdmin, async (_, res) => {
    const docs = await db.all(
      `SELECT d.id, d.title, d.content, d.createdAt, d.createdBy, u.fullName AS createdByName
       FROM ai_documents d
       LEFT JOIN users u ON u.id = d.createdBy
       ORDER BY d.id DESC`
    );
    res.json(docs);
  });

  app.post("/api/admin/ai-documents", requireAdmin, async (req, res) => {
    const { title, content } = req.body ?? {};
    if (!title || !content) {
      return res.status(400).json({ message: "Thiếu tiêu đề hoặc nội dung tài liệu." });
    }
    const cleanTitle = String(title).trim();
    const cleanContent = String(content).trim();
    if (cleanContent.length < 20) {
      return res.status(400).json({ message: "Nội dung tài liệu quá ngắn." });
    }
    const createdAt = new Date().toISOString();
    const created = await db.run(
      "INSERT INTO ai_documents (title, content, createdBy, createdAt) VALUES (?, ?, ?, ?)",
      [cleanTitle, cleanContent, req.authUser.id, createdAt]
    );
    res.status(201).json({ id: created.lastID, title: cleanTitle, createdAt });
  });

  app.delete("/api/admin/ai-documents/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ message: "Id tài liệu không hợp lệ." });
    await db.run("DELETE FROM ai_documents WHERE id = ?", [id]);
    res.json({ ok: true });
  });

  app.put("/api/admin/ai-documents/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const { title, content } = req.body ?? {};
    if (Number.isNaN(id) || !title || !content) {
      return res.status(400).json({ message: "Dữ liệu cập nhật tài liệu không hợp lệ." });
    }
    await db.run("UPDATE ai_documents SET title = ?, content = ? WHERE id = ?", [
      String(title).trim(),
      String(content).trim(),
      id
    ]);
    res.json({ ok: true });
  });

  app.post("/api/admin/ai-documents/upload", requireAdmin, docUpload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "Không nhận được file tài liệu." });
    try {
      const text = (await extractTextFromDocumentFile(req.file.path, req.file.originalname)).trim();
      if (text.length < 20) {
        return res.status(400).json({ message: "Nội dung trích xuất quá ngắn." });
      }
      const createdAt = new Date().toISOString();
      const title = path.basename(req.file.originalname, path.extname(req.file.originalname));
      const created = await db.run(
        "INSERT INTO ai_documents (title, content, createdBy, createdAt) VALUES (?, ?, ?, ?)",
        [title, text, req.authUser.id, createdAt]
      );
      return res.status(201).json({ id: created.lastID, title, createdAt, sourceFile: req.file.originalname });
    } catch (error) {
      return res.status(400).json({ message: `Không đọc được file tài liệu: ${error.message}` });
    } finally {
      try {
        fs.unlinkSync(req.file.path);
      } catch (_) {
        /* noop */
      }
    }
  });

  app.post("/api/ai/chat", async (req, res) => {
    if (!req.authUser) return res.status(401).json({ message: "Cần đăng nhập để dùng AI Chatbot." });
    const question = String(req.body?.question ?? "").trim();
    if (!question) return res.status(400).json({ message: "Thiếu nội dung câu hỏi." });

    const config = await db.get("SELECT model, apiKey, apiKeys FROM ai_runtime_config WHERE id = 1");
    const apiKeys = readGeminiApiKeys(config);
    if (!apiKeys.length) return res.status(400).json({ message: "Admin chưa cấu hình Gemini API key." });

    const docs = await db.all("SELECT title, content FROM ai_documents ORDER BY id DESC LIMIT 50");
    const allChunks = [];
    for (const d of docs) {
      for (const chunk of splitToChunks(d.content, 700)) {
        allChunks.push({ title: d.title, text: chunk, score: scoreChunk(question, chunk) });
      }
    }
    allChunks.sort((a, b) => b.score - a.score);
    const topChunks = allChunks.filter((c) => c.score > 0).slice(0, 5).map((c) => `[${c.title}] ${c.text}`);
    const cacheKey = `${question.toLowerCase()}::${topChunks.join("|").slice(0, 500)}`;
    const cached = aiResponseCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 10 * 60 * 1000) {
      return res.json({
        answer: cached.answer,
        usedSources: topChunks.length,
        fallbackMode: cached.fallbackMode === true,
        cached: true
      });
    }

    try {
      const answer = await generateChatWithGemini({
        apiKey: apiKeys,
        model: config?.model || "gemini-1.5-flash",
        userQuestion: question,
        contextChunks: topChunks
      });
      aiResponseCache.set(cacheKey, { answer, ts: Date.now(), fallbackMode: false });
      return res.json({
        answer,
        usedSources: topChunks.length,
        fallbackMode: false,
        cached: false
      });
    } catch (error) {
      if (String(error.message || "").includes("GEMINI_RATE_LIMIT_429")) {
        return res.status(503).json({
          message: "Gemini đang quá tải (429). Vui lòng thử lại sau ít phút."
        });
      }
      return res.status(500).json({ message: `AI Chatbot lỗi: ${error.message}` });
    }
  });

  app.get("/api/admin/overview", requireAdmin, async (_, res) => {
    const u = await db.get("SELECT COUNT(*) AS c FROM users");
    const q = await db.get("SELECT COUNT(*) AS c FROM quizzes");
    const a = await db.get("SELECT COUNT(*) AS c FROM attempts");
    const qs = await db.get("SELECT COUNT(*) AS c FROM questions");
    res.json({ users: u.c, quizzes: q.c, attempts: a.c, questions: qs.c });
  });

  app.get("/api/admin/users", requireAdmin, async (_, res) => {
    res.json(await db.all("SELECT id, username, fullName, grade, role, studentCode FROM users ORDER BY id"));
  });

  app.patch("/api/admin/users/:id/role", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const role = String(req.body?.role ?? "");
    if (!id || !["user", "teacher", "admin"].includes(role)) {
      return res.status(400).json({ message: "Dữ liệu không hợp lệ." });
    }
    await db.run("UPDATE users SET role = ? WHERE id = ?", [role, id]);
    const user = await db.get("SELECT id, username, fullName, grade, role FROM users WHERE id = ?", [id]);
    res.json({ ok: true, user });
  });

  app.get("/api/admin/students", requireQuizManager, async (req, res) => {
    const grade = Number(req.query.grade);
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const params = [];
    let where = "WHERE role = 'user'";
    if (!Number.isNaN(grade)) {
      where += " AND grade = ?";
      params.push(grade);
    }
    if (q) {
      where += " AND (LOWER(fullName) LIKE ? OR LOWER(COALESCE(studentCode, '')) LIKE ?)";
      params.push(`%${q}%`, `%${q}%`);
    }
    const rows = await db.all(
      `SELECT id, studentCode, fullName, grade, username
       FROM users
       ${where}
       ORDER BY grade, fullName`,
      params
    );
    res.json(rows);
  });

  app.post("/api/admin/students", requireQuizManager, async (req, res) => {
    const { studentCode, fullName, grade, username, password = "123456" } = req.body ?? {};
    if (!fullName || !grade) return res.status(400).json({ message: "Thiếu tên hoặc lớp." });
    const uname = String(username ?? studentCode ?? `student${Date.now()}`).trim().toLowerCase();
    const g = Number(grade);
    if (Number.isNaN(g) || g < 1 || g > 12) return res.status(400).json({ message: "Lớp không hợp lệ." });
    const existed = await db.get("SELECT id FROM users WHERE username = ?", [uname]);
    if (existed) return res.status(409).json({ message: "Username đã tồn tại." });
    const created = await db.run(
      "INSERT INTO users (username, password, fullName, grade, role, studentCode) VALUES (?, ?, ?, ?, 'user', ?)",
      [uname, String(password), String(fullName).trim(), g, String(studentCode ?? "").trim() || null]
    );
    await db.run("UPDATE users SET studentCode = COALESCE(studentCode, 'HS' || printf('%05d', id)) WHERE id = ?", [
      created.lastID
    ]);
    const user = await db.get(
      "SELECT id, studentCode, fullName, grade, username FROM users WHERE id = ?",
      [created.lastID]
    );
    res.status(201).json(user);
  });

  app.put("/api/admin/students/:id", requireQuizManager, async (req, res) => {
    const id = Number(req.params.id);
    const { studentCode, fullName, grade } = req.body ?? {};
    if (!id || !fullName || !grade) return res.status(400).json({ message: "Dữ liệu không hợp lệ." });
    await db.run("UPDATE users SET studentCode = ?, fullName = ?, grade = ? WHERE id = ? AND role = 'user'", [
      String(studentCode ?? "").trim() || null,
      String(fullName).trim(),
      Number(grade),
      id
    ]);
    const user = await db.get("SELECT id, studentCode, fullName, grade, username FROM users WHERE id = ?", [id]);
    res.json(user);
  });

  app.delete("/api/admin/students/:id", requireQuizManager, async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Id không hợp lệ." });
    await db.run("DELETE FROM users WHERE id = ? AND role = 'user'", [id]);
    res.json({ ok: true });
  });

  app.get("/api/admin/students/export", requireQuizManager, async (req, res) => {
    const grade = Number(req.query.grade);
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const params = [];
    let where = "WHERE role = 'user'";
    if (!Number.isNaN(grade)) {
      where += " AND grade = ?";
      params.push(grade);
    }
    if (q) {
      where += " AND (LOWER(fullName) LIKE ? OR LOWER(COALESCE(studentCode, '')) LIKE ?)";
      params.push(`%${q}%`, `%${q}%`);
    }
    const rows = await db.all(
      `SELECT studentCode, fullName, grade, username
       FROM users
       ${where}
       ORDER BY grade, fullName`,
      params
    );
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      "studentCode,fullName,grade,username",
      ...rows.map((r) => [esc(r.studentCode), esc(r.fullName), esc(r.grade), esc(r.username)].join(","))
    ].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=students.csv");
    return res.send(`\uFEFF${csv}`);
  });

  app.post("/api/admin/students/import-csv", requireQuizManager, csvUpload.single("file"), async (req, res) => {
    if (!req.file?.buffer) return res.status(400).json({ message: "Không nhận được file CSV." });
    const rows = parseCsvRows(req.file.buffer.toString("utf-8"));
    if (!rows.length) return res.status(400).json({ message: "File CSV không có dữ liệu." });

    let inserted = 0;
    let updated = 0;
    await db.exec("BEGIN TRANSACTION");
    try {
      for (const row of rows) {
        const studentCode = String(row.studentcode ?? "").trim();
        const fullName = String(row.fullname ?? "").trim();
        const grade = Number(row.grade);
        const usernameRaw = String(row.username ?? studentCode ?? "").trim().toLowerCase();
        if (!fullName || Number.isNaN(grade)) continue;
        const username = usernameRaw || `student${Date.now()}${Math.floor(Math.random() * 1000)}`;
        const byCode = studentCode
          ? await db.get("SELECT id FROM users WHERE role = 'user' AND studentCode = ?", [studentCode])
          : null;
        if (byCode) {
          await db.run("UPDATE users SET fullName = ?, grade = ?, username = ? WHERE id = ?", [
            fullName,
            grade,
            username,
            byCode.id
          ]);
          updated += 1;
          continue;
        }
        const existedUsername = await db.get("SELECT id FROM users WHERE username = ?", [username]);
        if (existedUsername) continue;
        const created = await db.run(
          "INSERT INTO users (username, password, fullName, grade, role, studentCode) VALUES (?, '123456', ?, ?, 'user', ?)",
          [username, fullName, grade, studentCode || null]
        );
        await db.run("UPDATE users SET studentCode = COALESCE(studentCode, 'HS' || printf('%05d', id)) WHERE id = ?", [
          created.lastID
        ]);
        inserted += 1;
      }
      await db.exec("COMMIT");
      return res.json({ ok: true, inserted, updated });
    } catch (error) {
      await db.exec("ROLLBACK");
      return res.status(500).json({ message: "Import CSV thất bại.", detail: String(error.message) });
    }
  });

  app.post("/api/admin/students/reset-password", requireQuizManager, async (req, res) => {
    const { studentCodes = [], grade, newPassword = "123456" } = req.body ?? {};
    if (!newPassword || String(newPassword).length < 4) {
      return res.status(400).json({ message: "Mật khẩu mới không hợp lệ." });
    }
    if (Array.isArray(studentCodes) && studentCodes.length) {
      const placeholders = studentCodes.map(() => "?").join(",");
      await db.run(
        `UPDATE users SET password = ? WHERE role = 'user' AND studentCode IN (${placeholders})`,
        [String(newPassword), ...studentCodes.map((x) => String(x))]
      );
      return res.json({ ok: true, mode: "codes", count: studentCodes.length });
    }
    const g = Number(grade);
    if (!Number.isNaN(g)) {
      await db.run("UPDATE users SET password = ? WHERE role = 'user' AND grade = ?", [String(newPassword), g]);
      return res.json({ ok: true, mode: "grade", grade: g });
    }
    return res.status(400).json({ message: "Cần studentCodes hoặc grade." });
  });

  app.get("/api/admin/quizzes", requireQuizManager, async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const rows = await db.all(
      `SELECT q.*, COUNT(qq.id) AS questionCount
       FROM quizzes q
       LEFT JOIN questions qq ON qq.quizId = q.id
       GROUP BY q.id
       ORDER BY q.id DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    res.json(rows);
  });

  app.get("/api/admin/quizzes/:id", requireQuizManager, async (req, res) => {
    const id = Number(req.params.id);
    const quiz = await db.get("SELECT * FROM quizzes WHERE id = ?", [id]);
    if (!quiz) return res.status(404).json({ message: "Không tìm thấy đề." });
    const questions = await db.all("SELECT * FROM questions WHERE quizId = ? ORDER BY id", [id]);
    res.json({
      ...quiz,
      questions: questions.map((q) => ({
        id: q.id,
        content: normalizeQuestionContent(q.content),
        options: [q.optionA, q.optionB, q.optionC, q.optionD],
        correctAnswer: q.correctAnswer,
        explanation: q.explanation ?? "",
        imageUrl: q.imageUrl ?? ""
      }))
    });
  });

  app.delete("/api/admin/quizzes/:id", requireQuizManager, async (req, res) => {
    await db.run("DELETE FROM quizzes WHERE id = ?", [Number(req.params.id)]);
    res.json({ ok: true });
  });

  app.post("/api/admin/quizzes", requireQuizManager, async (req, res) => {
    const {
      grade,
      subject,
      title,
      difficulty = "Trung binh",
      durationMinutes = 20,
      questions = []
    } = req.body ?? {};
    const validDifficulty = ["De", "Trung binh", "Kho"];
    if (!grade || !subject || !title || !validDifficulty.includes(difficulty)) {
      return res.status(400).json({ message: "Dữ liệu tạo đề không hợp lệ." });
    }
    if (!Array.isArray(questions) || !questions.length) {
      return res.status(400).json({ message: "Cần ít nhất 1 câu hỏi." });
    }
    const created = await db.run(
      "INSERT INTO quizzes (grade, subject, title, difficulty, durationMinutes) VALUES (?, ?, ?, ?, ?)",
      [Number(grade), String(subject), String(title), String(difficulty), Number(durationMinutes) || 20]
    );
    const quizId = created.lastID;
    for (const q of questions) {
      const options = Array.isArray(q.options) ? q.options.map((x) => String(x ?? "")) : [];
      if (!q.content || options.length < 4) continue;
      await db.run(
        `INSERT INTO questions
          (quizId, content, optionA, optionB, optionC, optionD, correctAnswer, explanation, imageUrl)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          quizId,
          String(q.content),
          options[0],
          options[1],
          options[2],
          options[3],
          Number(q.correctAnswer) || 0,
          String(q.explanation ?? ""),
          q.imageUrl ? String(q.imageUrl) : null
        ]
      );
    }
    res.status(201).json({ ok: true, id: quizId });
  });

  app.put("/api/admin/quizzes/:id", requireQuizManager, async (req, res) => {
    const quizId = Number(req.params.id);
    const { grade, subject, title, difficulty = "Trung binh", durationMinutes = 20, questions = [] } = req.body ?? {};
    const validDifficulty = ["De", "Trung binh", "Kho"];
    if (!quizId || !grade || !subject || !title || !validDifficulty.includes(difficulty)) {
      return res.status(400).json({ message: "Dữ liệu cập nhật đề không hợp lệ." });
    }
    if (!Array.isArray(questions) || !questions.length) {
      return res.status(400).json({ message: "Cần ít nhất 1 câu hỏi." });
    }

    await db.exec("BEGIN TRANSACTION");
    try {
      await db.run(
        "UPDATE quizzes SET grade = ?, subject = ?, title = ?, difficulty = ?, durationMinutes = ? WHERE id = ?",
        [Number(grade), String(subject), String(title), String(difficulty), Number(durationMinutes) || 20, quizId]
      );
      await db.run("DELETE FROM questions WHERE quizId = ?", [quizId]);
      for (const q of questions) {
        const options = Array.isArray(q.options) ? q.options.map((x) => String(x ?? "")) : [];
        if (!q.content || options.length < 4) continue;
        await db.run(
          `INSERT INTO questions
            (quizId, content, optionA, optionB, optionC, optionD, correctAnswer, explanation, imageUrl)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            quizId,
            String(q.content),
            options[0],
            options[1],
            options[2],
            options[3],
            Number(q.correctAnswer) || 0,
            String(q.explanation ?? ""),
            q.imageUrl ? String(q.imageUrl) : null
          ]
        );
      }
      await db.exec("COMMIT");
      res.json({ ok: true, id: quizId });
    } catch (error) {
      await db.exec("ROLLBACK");
      res.status(500).json({ message: "Cập nhật đề thất bại.", detail: String(error.message) });
    }
  });

  app.get("/api/admin/attempts", requireAdmin, async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 300);
    const rows = await db.all(
      `SELECT a.*, u.fullName, u.username, q.title AS quizTitle, q.subject
       FROM attempts a
       LEFT JOIN users u ON u.id = a.userId
       LEFT JOIN quizzes q ON q.id = a.quizId
       ORDER BY a.submittedAt DESC
       LIMIT ?`,
      [limit]
    );
    res.json(rows);
  });

  app.delete("/api/admin/attempts/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Id không hợp lệ." });
    await db.run("DELETE FROM attempts WHERE id = ?", [id]);
    res.json({ ok: true });
  });

  app.delete("/api/admin/attempts", requireAdmin, async (_, res) => {
    await db.run("DELETE FROM attempts");
    res.json({ ok: true });
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = await createApp();
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`SQLite backend running at http://localhost:${port}`);
  });
}
