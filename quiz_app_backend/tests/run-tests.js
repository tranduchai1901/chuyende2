import assert from "assert";
import { createApp } from "../server_sqlite.js";

async function run() {
  const app = await createApp();
  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/api`;

  const results = [];
  const check = async (name, fn) => {
    try {
      await fn();
      results.push({ name, status: "PASS" });
    } catch (error) {
      results.push({ name, status: "FAIL", error: error.message });
    }
  };

  await check("Health check", async () => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
  });

  await check("Login success", async () => {
    const res = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "student1", password: "123456" })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.token);
    assert.equal(body.user.username, "student1");
  });

  await check("Get quizzes by grade and subject", async () => {
    const q = new URLSearchParams({ grade: "10", subject: "Toán" });
    const res = await fetch(`${base}/quizzes?${q}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body));
    assert.ok(body.length >= 1);
  });

  await check("Submit attempt", async () => {
    const quizRes = await fetch(`${base}/quizzes/1`);
    const quiz = await quizRes.json();
    const answers = quiz.questions.map((q) => ({
      questionId: q.id,
      selectedAnswer: 1
    }));

    const res = await fetch(`${base}/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: 1, quizId: 1, answers })
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(typeof body.score === "number");
  });

  await check("Get user attempts", async () => {
    const res = await fetch(`${base}/attempts?userId=1`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body));
    assert.ok(body.length >= 1);
  });

  server.close();

  console.log("=== API TEST RESULTS ===");
  results.forEach((r, index) => {
    if (r.status === "PASS") {
      console.log(`${index + 1}. [PASS] ${r.name}`);
    } else {
      console.log(`${index + 1}. [FAIL] ${r.name} -> ${r.error}`);
    }
  });
}

run();
