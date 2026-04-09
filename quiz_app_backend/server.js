import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "data", "db.json");

function ensureSeedData() {
  const dir = path.join(__dirname, "data");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(dbPath)) return;

  const seed = {
    users: [
      { id: 1, username: "student1", password: "123456", fullName: "Nguyen Van A", grade: 10 },
      { id: 2, username: "student2", password: "123456", fullName: "Tran Thi B", grade: 12 }
    ],
    grades: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `Lop ${i + 1}` })),
    subjects: [
      { id: 1, grade: 1, name: "Toan" },
      { id: 2, grade: 1, name: "Tieng Viet" },
      { id: 3, grade: 10, name: "Toan" },
      { id: 4, grade: 10, name: "Vat Ly" },
      { id: 5, grade: 11, name: "Hoa Hoc" },
      { id: 6, grade: 12, name: "Tieng Anh" },
      { id: 7, grade: 12, name: "Ngu Van" }
    ],
    quizzes: [
      {
        id: 1,
        grade: 10,
        subject: "Toan",
        title: "De luyen tap ham so",
        durationMinutes: 15,
        questions: [
          {
            id: 1,
            content: "Ham so y = x^2 co do thi la?",
            options: ["Duong thang", "Parabol", "Hypebol", "Elip"],
            correctAnswer: 1
          },
          {
            id: 2,
            content: "Gia tri cua 2^3 la?",
            options: ["6", "8", "9", "12"],
            correctAnswer: 1
          }
        ]
      },
      {
        id: 2,
        grade: 12,
        subject: "Tieng Anh",
        title: "Mock Test Reading",
        durationMinutes: 20,
        questions: [
          {
            id: 1,
            content: "Choose the synonym of 'rapid'.",
            options: ["slow", "quick", "late", "weak"],
            correctAnswer: 1
          },
          {
            id: 2,
            content: "She ___ to school every day.",
            options: ["go", "goes", "gone", "going"],
            correctAnswer: 1
          }
        ]
      }
    ],
    attempts: []
  };

  fs.writeFileSync(dbPath, JSON.stringify(seed, null, 2), "utf-8");
}

function readDb() {
  ensureSeedData();
  return JSON.parse(fs.readFileSync(dbPath, "utf-8"));
}

function writeDb(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), "utf-8");
}

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_, res) => {
    res.json({ ok: true, message: "Quiz backend is running" });
  });

  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body ?? {};
    const db = readDb();
    const user = db.users.find((u) => u.username === username && u.password === password);
    if (!user) {
      return res.status(401).json({ message: "Thong tin dang nhap khong dung" });
    }
    return res.json({
      token: `fake-token-${user.id}`,
      user: { id: user.id, fullName: user.fullName, grade: user.grade, username: user.username }
    });
  });

  app.get("/api/grades", (_, res) => {
    const db = readDb();
    res.json(db.grades);
  });

  app.get("/api/subjects", (req, res) => {
    const grade = Number(req.query.grade);
    const db = readDb();
    const result = Number.isNaN(grade) ? db.subjects : db.subjects.filter((s) => s.grade === grade);
    res.json(result);
  });

  app.get("/api/quizzes", (req, res) => {
    const grade = Number(req.query.grade);
    const subject = req.query.subject;
    const db = readDb();
    let result = [...db.quizzes];
    if (!Number.isNaN(grade)) {
      result = result.filter((q) => q.grade === grade);
    }
    if (subject) {
      result = result.filter((q) => q.subject.toLowerCase() === String(subject).toLowerCase());
    }
    res.json(
      result.map((q) => ({
        id: q.id,
        grade: q.grade,
        subject: q.subject,
        title: q.title,
        durationMinutes: q.durationMinutes,
        questionCount: q.questions.length
      }))
    );
  });

  app.get("/api/quizzes/:id", (req, res) => {
    const id = Number(req.params.id);
    const db = readDb();
    const quiz = db.quizzes.find((q) => q.id === id);
    if (!quiz) return res.status(404).json({ message: "Khong tim thay de thi" });

    res.json({
      id: quiz.id,
      grade: quiz.grade,
      subject: quiz.subject,
      title: quiz.title,
      durationMinutes: quiz.durationMinutes,
      questions: quiz.questions.map((q) => ({
        id: q.id,
        content: q.content,
        options: q.options
      }))
    });
  });

  app.post("/api/attempts", (req, res) => {
    const { userId, quizId, answers } = req.body ?? {};
    if (!userId || !quizId || !Array.isArray(answers)) {
      return res.status(400).json({ message: "Du lieu khong hop le" });
    }

    const db = readDb();
    const quiz = db.quizzes.find((q) => q.id === Number(quizId));
    if (!quiz) return res.status(404).json({ message: "Khong tim thay de thi" });

    let correct = 0;
    for (const answer of answers) {
      const question = quiz.questions.find((q) => q.id === answer.questionId);
      if (question && question.correctAnswer === answer.selectedAnswer) {
        correct += 1;
      }
    }

    const score = Math.round((correct / quiz.questions.length) * 100);
    const attempt = {
      id: db.attempts.length + 1,
      userId: Number(userId),
      quizId: Number(quizId),
      correct,
      total: quiz.questions.length,
      score,
      submittedAt: new Date().toISOString()
    };
    db.attempts.push(attempt);
    writeDb(db);
    return res.status(201).json(attempt);
  });

  app.get("/api/attempts", (req, res) => {
    const userId = Number(req.query.userId);
    const db = readDb();
    const attempts = Number.isNaN(userId)
      ? db.attempts
      : db.attempts.filter((a) => a.userId === userId);
    res.json(attempts);
  });

  app.get("/api/rankings", (req, res) => {
    const grade = Number(req.query.grade);
    const db = readDb();
    const users = Number.isNaN(grade) ? db.users : db.users.filter((u) => u.grade === grade);
    const ranking = users
      .map((u) => {
        const userAttempts = db.attempts.filter((a) => a.userId === u.id);
        const avgScore = userAttempts.length
          ? Math.round(userAttempts.reduce((sum, a) => sum + a.score, 0) / userAttempts.length)
          : 0;
        return {
          userId: u.id,
          fullName: u.fullName,
          grade: u.grade,
          attempts: userAttempts.length,
          averageScore: avgScore
        };
      })
      .sort((a, b) => b.averageScore - a.averageScore);
    res.json(ranking);
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ensureSeedData();
  const app = createApp();
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Backend running at http://localhost:${port}`);
  });
}
