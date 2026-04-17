import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "data");
const dbFile = path.join(dataDir, "quiz.sqlite");

async function initDb() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
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
  `);

  try {
    await db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`);
  } catch (_) {
    /* column exists */
  }

  const row = await db.get("SELECT COUNT(*) AS count FROM users");
  if (row.count === 0) {
    await seedDb(db);
  }
  await migrateLegacyVietnamese(db);

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

function parseQuestion(row) {
  return {
    id: row.id,
    content: row.content,
    options: [row.optionA, row.optionB, row.optionC, row.optionD]
  };
}

export async function createApp() {
  const db = await initDb();
  const app = express();
  app.use(cors());
  app.use(express.json());

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

  app.get("/api/health", (_, res) => {
    res.json({ ok: true, engine: "sqlite", message: "Quiz backend with SQLite is running" });
  });

  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body ?? {};
    const user = await db.get(
      "SELECT id, username, fullName, grade, role FROM users WHERE username = ? AND password = ?",
      [username, password]
    );
    if (!user) return res.status(401).json({ message: "Thông tin đăng nhập không đúng." });
    res.json({ token: `fake-token-${user.id}`, user });
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
    const quiz = await db.get("SELECT * FROM quizzes WHERE id = ?", [id]);
    if (!quiz) return res.status(404).json({ message: "Không tìm thấy đề thi." });
    const questions = await db.all("SELECT * FROM questions WHERE quizId = ? ORDER BY id", [id]);
    res.json({ ...quiz, questions: questions.map(parseQuestion) });
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
    if (Number.isNaN(userId)) {
      return res.json(await db.all("SELECT * FROM attempts ORDER BY submittedAt DESC"));
    }
    res.json(await db.all("SELECT * FROM attempts WHERE userId = ? ORDER BY submittedAt DESC", [userId]));
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
    res.json(rows.slice(0, 3));
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

  app.get("/api/admin/overview", requireAdmin, async (_, res) => {
    const u = await db.get("SELECT COUNT(*) AS c FROM users");
    const q = await db.get("SELECT COUNT(*) AS c FROM quizzes");
    const a = await db.get("SELECT COUNT(*) AS c FROM attempts");
    const qs = await db.get("SELECT COUNT(*) AS c FROM questions");
    res.json({ users: u.c, quizzes: q.c, attempts: a.c, questions: qs.c });
  });

  app.get("/api/admin/users", requireAdmin, async (_, res) => {
    res.json(await db.all("SELECT id, username, fullName, grade, role FROM users ORDER BY id"));
  });

  app.get("/api/admin/quizzes", requireAdmin, async (req, res) => {
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

  app.delete("/api/admin/quizzes/:id", requireAdmin, async (req, res) => {
    await db.run("DELETE FROM quizzes WHERE id = ?", [Number(req.params.id)]);
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
