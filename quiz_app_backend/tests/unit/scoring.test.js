import assert from "assert";
import test from "node:test";
import { computeScorePercent } from "../../utils/scoring.js";

test("computeScorePercent: full correct", () => {
  assert.strictEqual(computeScorePercent(10, 10), 100);
});

test("computeScorePercent: half", () => {
  assert.strictEqual(computeScorePercent(1, 2), 50);
});

test("computeScorePercent: zero total", () => {
  assert.strictEqual(computeScorePercent(0, 0), 0);
});
