import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";
import { fileURLToPath } from "url";
import { computeScorePercent } from "./utils/scoring.js";

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "root",
  database: process.env.MYSQL_DATABASE || "quizmaster",
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true
});

function parseQuestion(row) {
  return {
    id: row.id,
    content: row.content,
    options: [row.optionA, row.optionB, row.optionC, row.optionD]
  };
}

async function attachUser(req, res, next) {
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
  const [rows] = await pool.query("SELECT id, username, fullName, grade, role FROM users WHERE id = ?", [id]);
  req.authUser = rows[0] ?? null;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.authUser) return res.status(401).json({ message: "Cần đăng nhập quản trị (header x-user-id)." });
  if (req.authUser.role !== "admin") return res.status(403).json({ message: "Chỉ quản trị viên được thực hiện." });
  next();
}

export async function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(attachUser);

  app.get("/api/health", async (_, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ ok: true, engine: "mysql", message: "Backend MySQL hoạt động." });
    } catch (e) {
      res.status(503).json({ ok: false, message: "Không kết nối được MySQL.", detail: String(e.message) });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body ?? {};
    const [rows] = await pool.query(
      "SELECT id, username, fullName, grade, role FROM users WHERE username = ? AND password = ?",
      [username, password]
    );
    if (!rows.length) return res.status(401).json({ message: "Thông tin đăng nhập không đúng." });
    const user = rows[0];
    res.json({
      token: `fake-token-${user.id}`,
      user: { id: user.id, username: user.username, fullName: user.fullName, grade: user.grade, role: user.role }
    });
  });

  app.get("/api/grades", async (_, res) => {
    const [rows] = await pool.query("SELECT * FROM grades ORDER BY id");
    res.json(rows);
  });

  app.get("/api/subjects", async (req, res) => {
    const grade = Number(req.query.grade);
    if (Number.isNaN(grade)) {
      const [rows] = await pool.query("SELECT * FROM subjects ORDER BY grade, name");
      return res.json(rows);
    }
    const [rows] = await pool.query("SELECT * FROM subjects WHERE grade = ? ORDER BY name", [grade]);
    res.json(rows);
  });

  app.get("/api/quizzes", async (req, res) => {
    const grade = Number(req.query.grade);
    const subject = req.query.subject ? String(req.query.subject) : null;
    const search = req.query.search ? String(req.query.search) : null;
    const difficulty = req.query.difficulty ? String(req.query.difficulty) : null;

    const vals = [];
    let w = "WHERE 1=1";
    if (!Number.isNaN(grade)) {
      w += " AND q.grade = ?";
      vals.push(grade);
    }
    if (subject) {
      w += " AND LOWER(q.subject) = LOWER(?)";
      vals.push(subject);
    }
    if (search) {
      w += " AND LOWER(q.title) LIKE LOWER(?)";
      vals.push(`%${search}%`);
    }
    if (difficulty) {
      w += " AND q.difficulty = ?";
      vals.push(difficulty);
    }
    const [rows] = await pool.query(
      `SELECT q.*, (SELECT COUNT(*) FROM questions qq WHERE qq.quizId = q.id) AS questionCount
       FROM quizzes q ${w}
       ORDER BY q.grade, q.subject, q.title`,
      vals
    );
    res.json(rows);
  });

  app.get("/api/quizzes/:id", async (req, res) => {
    const id = Number(req.params.id);
    const [qrows] = await pool.query("SELECT * FROM quizzes WHERE id = ?", [id]);
    if (!qrows.length) return res.status(404).json({ message: "Không tìm thấy đề thi." });
    const quiz = qrows[0];
    const [qst] = await pool.query("SELECT * FROM questions WHERE quizId = ? ORDER BY id", [id]);
    res.json({ ...quiz, questions: qst.map(parseQuestion) });
  });

  app.post("/api/attempts", async (req, res) => {
    const { userId, quizId, answers } = req.body ?? {};
    if (!userId || !quizId || !Array.isArray(answers)) {
      return res.status(400).json({ message: "Dữ liệu không hợp lệ." });
    }
    const [qst] = await pool.query("SELECT id, correctAnswer FROM questions WHERE quizId = ?", [quizId]);
    if (!qst.length) return res.status(404).json({ message: "Không tìm thấy đề thi." });
    let correct = 0;
    for (const a of answers) {
      const q = qst.find((x) => x.id === Number(a.questionId));
      if (q && q.correctAnswer === Number(a.selectedAnswer)) correct += 1;
    }
    const total = qst.length;
    const score = computeScorePercent(correct, total);
    const submittedAt = new Date();
    const [ins] = await pool.query(
      "INSERT INTO attempts (userId, quizId, correct, total, score, submittedAt) VALUES (?,?,?,?,?,?)",
      [userId, quizId, correct, total, score, submittedAt]
    );
    res.status(201).json({
      id: ins.insertId,
      userId: Number(userId),
      quizId: Number(quizId),
      correct,
      total,
      score,
      submittedAt: submittedAt.toISOString()
    });
  });

  app.get("/api/attempts", async (req, res) => {
    const userId = Number(req.query.userId);
    if (Number.isNaN(userId)) {
      const [rows] = await pool.query("SELECT * FROM attempts ORDER BY submittedAt DESC");
      return res.json(rows);
    }
    const [rows] = await pool.query("SELECT * FROM attempts WHERE userId = ? ORDER BY submittedAt DESC", [userId]);
    res.json(rows);
  });

  app.get("/api/stats/:userId", async (req, res) => {
    const userId = Number(req.params.userId);
    const [rows] = await pool.query("SELECT score, submittedAt FROM attempts WHERE userId = ? ORDER BY submittedAt", [
      userId
    ]);
    const totalAttempts = rows.length;
    const avgScore = totalAttempts ? Math.round(rows.reduce((s, r) => s + r.score, 0) / totalAttempts) : 0;
    const bestScore = totalAttempts ? Math.max(...rows.map((r) => r.score)) : 0;
    res.json({ totalAttempts, avgScore, bestScore, trend: rows });
  });

  app.get("/api/rankings", async (req, res) => {
    const grade = Number(req.query.grade);
    const where = Number.isNaN(grade) ? "" : "WHERE u.grade = ?";
    const params = Number.isNaN(grade) ? [] : [grade];
    const [rows] = await pool.query(
      `SELECT u.id AS userId, u.fullName, u.grade, COUNT(a.id) AS attempts, COALESCE(ROUND(AVG(a.score)),0) AS averageScore
       FROM users u
       LEFT JOIN attempts a ON a.userId = u.id
       ${where}
       GROUP BY u.id, u.fullName, u.grade
       ORDER BY averageScore DESC, attempts DESC`,
      params
    );
    res.json(rows);
  });

  app.get("/api/recommendations/:userId", async (req, res) => {
    const userId = Number(req.params.userId);
    const [urows] = await pool.query("SELECT grade FROM users WHERE id = ?", [userId]);
    if (!urows.length) return res.status(404).json({ message: "Không tìm thấy người dùng." });
    const grade = urows[0].grade;
    const [rows] = await pool.query(
      `SELECT q.*, (SELECT COUNT(*) FROM questions qq WHERE qq.quizId = q.id) AS questionCount
       FROM quizzes q
       WHERE q.grade = ?
       ORDER BY CASE q.difficulty WHEN 'De' THEN 1 WHEN 'Trung binh' THEN 2 ELSE 3 END, q.id
       LIMIT 12`,
      [grade]
    );
    res.json(rows.slice(0, 3));
  });

  app.get("/api/favorites", async (req, res) => {
    const userId = Number(req.query.userId);
    if (Number.isNaN(userId)) return res.status(400).json({ message: "Thiếu tham số userId." });
    const [rows] = await pool.query(
      `SELECT q.*, f.id AS favoriteId FROM favorite_quizzes f JOIN quizzes q ON q.id = f.quizId WHERE f.userId = ?`,
      [userId]
    );
    res.json(rows);
  });

  app.post("/api/favorites", async (req, res) => {
    const { userId, quizId } = req.body ?? {};
    if (!userId || !quizId) return res.status(400).json({ message: "Dữ liệu không hợp lệ." });
    await pool.query("INSERT IGNORE INTO favorite_quizzes (userId, quizId) VALUES (?, ?)", [userId, quizId]);
    res.status(201).json({ ok: true });
  });

  app.delete("/api/favorites", async (req, res) => {
    const { userId, quizId } = req.body ?? {};
    if (!userId || !quizId) return res.status(400).json({ message: "Dữ liệu không hợp lệ." });
    await pool.query("DELETE FROM favorite_quizzes WHERE userId = ? AND quizId = ?", [userId, quizId]);
    res.json({ ok: true });
  });

  // --- Admin (RBAC) ---
  app.get("/api/admin/overview", requireAdmin, async (_, res) => {
    const [[u]] = await pool.query("SELECT COUNT(*) AS c FROM users");
    const [[q]] = await pool.query("SELECT COUNT(*) AS c FROM quizzes");
    const [[a]] = await pool.query("SELECT COUNT(*) AS c FROM attempts");
    const [[qs]] = await pool.query("SELECT COUNT(*) AS c FROM questions");
    res.json({
      users: u.c,
      quizzes: q.c,
      attempts: a.c,
      questions: qs.c
    });
  });

  app.get("/api/admin/users", requireAdmin, async (_, res) => {
    const [rows] = await pool.query(
      "SELECT id, username, fullName, grade, role, createdAt FROM users ORDER BY id"
    );
    res.json(rows);
  });

  app.get("/api/admin/quizzes", requireAdmin, async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const [rows] = await pool.query(
      `SELECT q.*, (SELECT COUNT(*) FROM questions qq WHERE qq.quizId = q.id) AS questionCount
       FROM quizzes q ORDER BY q.id DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    res.json(rows);
  });

  app.delete("/api/admin/quizzes/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    await pool.query("DELETE FROM quizzes WHERE id = ?", [id]);
    res.json({ ok: true });
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = await createApp();
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`MySQL backend: http://localhost:${port}`);
  });
}
