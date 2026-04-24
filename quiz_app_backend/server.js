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
      { id: 1, username: "student1", password: "123456", fullName: "Nguyen Van A", grade: 10, role: "user" },
      { id: 2, username: "student2", password: "123456", fullName: "Tran Thi B", grade: 12, role: "user" },
      { id: 3, username: "admin", password: "admin123", fullName: "System Admin", grade: 12, role: "admin" }
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
    attempts: [],
    aiConfig: {
      provider: "gemini",
      apiKey: "",
      model: "gemini-1.5-flash"
    }
  };

  fs.writeFileSync(dbPath, JSON.stringify(seed, null, 2), "utf-8");
}

function readDb() {
  ensureSeedData();
  const db = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
  if (!Array.isArray(db.users)) db.users = [];
  if (!db.users.some((u) => u.role === "admin")) {
    const nextId = db.users.length ? Math.max(...db.users.map((u) => Number(u.id) || 0)) + 1 : 1;
    db.users.push({
      id: nextId,
      username: "admin",
      password: "admin123",
      fullName: "System Admin",
      grade: 12,
      role: "admin"
    });
  }
  if (!db.aiConfig) {
    db.aiConfig = { provider: "gemini", apiKey: "", model: "gemini-1.5-flash" };
  }
  writeDb(db);
  return db;
}

function writeDb(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), "utf-8");
}

function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickUniqueQuestions(questions, count) {
  if (!Array.isArray(questions) || questions.length === 0) return [];
  const seen = new Set();
  const deduplicated = questions.filter((q) => {
    const key = String(q.content ?? "")
      .trim()
      .toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const target = Math.min(Math.max(1, count), questions.length);
  return shuffleArray(deduplicated).slice(0, target);
}

function makeAttemptComparison(quizAttempts) {
  const sortedAttempts = [...quizAttempts].sort(
    (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
  );
  return sortedAttempts.map((attempt, idx) => {
    const previous = idx > 0 ? sortedAttempts[idx - 1] : null;
    const scoreDiff = previous ? attempt.score - previous.score : 0;
    return {
      ...attempt,
      scoreDiffFromPrevious: scoreDiff,
      trend: scoreDiff > 0 ? "up" : scoreDiff < 0 ? "down" : "same"
    };
  });
}

function cleanQuestionContent(content) {
  return String(content ?? "")
    .replace(/^cau\s*\d+\s*[:.)-]\s*/i, "")
    .trim();
}

function getUserFromHeader(req, db) {
  const userId = Number(req.headers["x-user-id"]);
  if (Number.isNaN(userId)) return null;
  return db.users.find((u) => u.id === userId) ?? null;
}

function requireAdmin(req, res, db) {
  const user = getUserFromHeader(req, db);
  if (!user || (user.role ?? "user") !== "admin") {
    res.status(403).json({ message: "Ban khong co quyen admin" });
    return null;
  }
  return user;
}

async function generateQuestionsWithGemini({ apiKey, model, grade, subject, difficulty, questionCount, prompt }) {
  const instruction = `
Ban la he thong tao de thi trac nghiem.
Hay tao ${questionCount} cau hoi KHONG TRUNG NHAU cho mon ${subject}, lop ${grade}, muc do ${difficulty}.
Tra ve JSON thuần theo schema:
{
  "questions":[
    {
      "content":"...",
      "options":["A","B","C","D"],
      "correctAnswer":0
    }
  ]
}
Yeu cau:
- correctAnswer la index 0..3
- options phai co 4 lua chon
- KHONG giai thich them ngoai JSON.
- Neu co prompt bo sung thi can tuan theo: ${prompt || "khong co"}
`.trim();

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: instruction }] }]
      })
    }
  );
  if (!response.ok) {
    throw new Error(`Gemini error: ${response.status}`);
  }
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned);
  return Array.isArray(parsed.questions) ? parsed.questions : [];
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
      user: {
        id: user.id,
        fullName: user.fullName,
        grade: user.grade,
        username: user.username,
        role: user.role ?? "user"
      }
    });
  });

  app.post("/api/auth/register", (req, res) => {
    const { username, password, fullName, grade } = req.body ?? {};
    if (!username || !password || !fullName || !grade) {
      return res.status(400).json({ message: "Thieu thong tin dang ky" });
    }
    const db = readDb();
    const existed = db.users.some((u) => u.username.toLowerCase() === String(username).toLowerCase());
    if (existed) {
      return res.status(409).json({ message: "Ten dang nhap da ton tai" });
    }
    const user = {
      id: db.users.length ? Math.max(...db.users.map((u) => u.id)) + 1 : 1,
      username: String(username),
      password: String(password),
      fullName: String(fullName),
      grade: Number(grade),
      role: "user"
    };
    db.users.push(user);
    writeDb(db);
    return res.status(201).json({
      message: "Dang ky thanh cong",
      user: { id: user.id, username: user.username, fullName: user.fullName, grade: user.grade, role: user.role }
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
    const questionCount = Number(req.query.questionCount);
    const shouldShuffle =
      String(req.query.shuffle).toLowerCase() === "true" ||
      String(req.query.shuffle).toLowerCase() === "1";
    const db = readDb();
    const quiz = db.quizzes.find((q) => q.id === id);
    if (!quiz) return res.status(404).json({ message: "Khong tim thay de thi" });

    const sourceQuestions = shouldShuffle ? shuffleArray(quiz.questions) : [...quiz.questions];
    const selectedQuestions = Number.isNaN(questionCount)
      ? sourceQuestions
      : pickUniqueQuestions(sourceQuestions, questionCount);

    res.json({
      id: quiz.id,
      grade: quiz.grade,
      subject: quiz.subject,
      title: quiz.title,
      durationMinutes: quiz.durationMinutes,
      questionCount: selectedQuestions.length,
      questions: selectedQuestions.map((q) => ({
        id: q.id,
        content: cleanQuestionContent(q.content),
        options: q.options
      }))
    });
  });

  app.post("/api/quizzes", (req, res) => {
    const { grade, subject, title, durationMinutes, questions } = req.body ?? {};
    if (
      !grade ||
      !subject ||
      !title ||
      !durationMinutes ||
      !Array.isArray(questions) ||
      questions.length === 0
    ) {
      return res.status(400).json({ message: "Du lieu tao de thi khong hop le" });
    }

    const normalizedQuestions = questions.map((q, idx) => ({
      id: idx + 1,
      content: String(q.content ?? "").trim(),
      options: Array.isArray(q.options) ? q.options.map((opt) => String(opt)) : [],
      correctAnswer: Number(q.correctAnswer)
    }));

    const hasInvalidQuestion = normalizedQuestions.some(
      (q) => !q.content || q.options.length < 2 || Number.isNaN(q.correctAnswer)
    );
    if (hasInvalidQuestion) {
      return res.status(400).json({ message: "Cau hoi hoac dap an khong hop le" });
    }

    const db = readDb();
    const newQuiz = {
      id: db.quizzes.length ? Math.max(...db.quizzes.map((q) => q.id)) + 1 : 1,
      grade: Number(grade),
      subject: String(subject),
      title: String(title),
      durationMinutes: Number(durationMinutes),
      questions: normalizedQuestions
    };

    db.quizzes.push(newQuiz);
    writeDb(db);
    return res.status(201).json({
      message: "Tao de thi thanh cong",
      quiz: {
        id: newQuiz.id,
        grade: newQuiz.grade,
        subject: newQuiz.subject,
        title: newQuiz.title,
        durationMinutes: newQuiz.durationMinutes,
        questionCount: newQuiz.questions.length
      }
    });
  });

  app.post("/api/quizzes/auto-generate", async (req, res) => {
    const { grade, subject, difficulty = "Trung binh", questionCount = 40, durationMinutes = 20, title, prompt } = req.body ?? {};
    if (!grade || !subject) {
      return res.status(400).json({ message: "Can truyen grade va subject" });
    }
    const db = readDb();
    const user = getUserFromHeader(req, db);
    if (!user) return res.status(401).json({ message: "Can dang nhap de tao de" });

    const count = Math.min(60, Math.max(5, Number(questionCount) || 40));
    let generatedQuestions = [];
    try {
      if (!db.aiConfig?.apiKey) {
        return res.status(400).json({ message: "Admin chua cau hinh Gemini API key" });
      }
      generatedQuestions = await generateQuestionsWithGemini({
        apiKey: db.aiConfig.apiKey,
        model: db.aiConfig.model || "gemini-1.5-flash",
        grade: Number(grade),
        subject: String(subject),
        difficulty: String(difficulty),
        questionCount: count,
        prompt: String(prompt ?? "")
      });
    } catch (error) {
      return res.status(500).json({ message: `Khong the tao de bang AI: ${error.message}` });
    }

    const normalized = pickUniqueQuestions(
      generatedQuestions.map((q, idx) => ({
        id: idx + 1,
        content: cleanQuestionContent(q.content),
        options: Array.isArray(q.options) ? q.options.map((opt) => String(opt)) : [],
        correctAnswer: Number(q.correctAnswer)
      })),
      count
    ).filter((q) => q.content && q.options.length >= 4 && !Number.isNaN(q.correctAnswer));

    if (normalized.length < 5) {
      return res.status(500).json({ message: "AI tra ve du lieu khong hop le, vui long thu lai" });
    }

    const newQuiz = {
      id: db.quizzes.length ? Math.max(...db.quizzes.map((q) => q.id)) + 1 : 1,
      grade: Number(grade),
      subject: String(subject),
      title: title ? String(title) : `De AI ${subject} lop ${grade} - ${difficulty}`,
      durationMinutes: Number(durationMinutes) || 20,
      difficulty: String(difficulty),
      createdBy: user.id,
      createdByName: user.fullName,
      questions: normalized.map((q, idx) => ({ ...q, id: idx + 1 }))
    };
    db.quizzes.push(newQuiz);
    writeDb(db);
    return res.status(201).json({
      message: "Tao de AI thanh cong",
      quizId: newQuiz.id,
      title: newQuiz.title,
      questionCount: newQuiz.questions.length
    });
  });

  app.get("/api/admin/ai-config", (req, res) => {
    const db = readDb();
    if (!requireAdmin(req, res, db)) return;
    return res.json({
      provider: db.aiConfig.provider,
      model: db.aiConfig.model,
      hasApiKey: Boolean(db.aiConfig.apiKey)
    });
  });

  app.patch("/api/admin/ai-config", (req, res) => {
    const { apiKey, model } = req.body ?? {};
    const db = readDb();
    if (!requireAdmin(req, res, db)) return;
    if (typeof apiKey === "string") db.aiConfig.apiKey = apiKey.trim();
    if (typeof model === "string" && model.trim()) db.aiConfig.model = model.trim();
    writeDb(db);
    return res.json({
      message: "Da cap nhat cau hinh AI",
      provider: db.aiConfig.provider,
      model: db.aiConfig.model,
      hasApiKey: Boolean(db.aiConfig.apiKey)
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
    const quizId = Number(req.query.quizId);
    const db = readDb();
    let attempts = [...db.attempts];
    if (!Number.isNaN(userId)) {
      attempts = attempts.filter((a) => a.userId === userId);
    }
    if (!Number.isNaN(quizId)) {
      attempts = attempts.filter((a) => a.quizId === quizId);
    }
    res.json(attempts);
  });

  app.get("/api/attempts/stats", (req, res) => {
    const userId = Number(req.query.userId);
    const db = readDb();
    const attempts = Number.isNaN(userId)
      ? db.attempts
      : db.attempts.filter((a) => a.userId === userId);

    if (attempts.length === 0) {
      return res.json({
        totalAttempts: 0,
        averageScore: 0,
        bestScore: 0,
        lowestScore: 0,
        byQuiz: []
      });
    }

    const byQuiz = db.quizzes.map((quiz) => {
      const quizAttempts = attempts.filter((a) => a.quizId === quiz.id);
      if (!quizAttempts.length) return null;
      const averageScore = Math.round(
        quizAttempts.reduce((sum, item) => sum + item.score, 0) / quizAttempts.length
      );
      const bestScore = Math.max(...quizAttempts.map((a) => a.score));
      const latestAttempt = [...quizAttempts].sort(
        (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
      )[0];
      return {
        quizId: quiz.id,
        title: quiz.title,
        subject: quiz.subject,
        attempts: quizAttempts.length,
        averageScore,
        bestScore,
        latestScore: latestAttempt.score
      };
    });

    const scores = attempts.map((a) => a.score);
    return res.json({
      totalAttempts: attempts.length,
      averageScore: Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length),
      bestScore: Math.max(...scores),
      lowestScore: Math.min(...scores),
      byQuiz: byQuiz.filter(Boolean)
    });
  });

  app.get("/api/attempts/compare", (req, res) => {
    const userId = Number(req.query.userId);
    const quizId = Number(req.query.quizId);
    if (Number.isNaN(userId) || Number.isNaN(quizId)) {
      return res.status(400).json({ message: "Can truyen userId va quizId hop le" });
    }

    const db = readDb();
    const quiz = db.quizzes.find((q) => q.id === quizId);
    if (!quiz) return res.status(404).json({ message: "Khong tim thay de thi" });

    const quizAttempts = db.attempts.filter((a) => a.userId === userId && a.quizId === quizId);
    const comparedAttempts = makeAttemptComparison(quizAttempts);
    const latest = comparedAttempts.length ? comparedAttempts[comparedAttempts.length - 1] : null;

    return res.json({
      userId,
      quizId,
      title: quiz.title,
      attempts: comparedAttempts,
      latestTrend: latest ? latest.trend : "none"
    });
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
