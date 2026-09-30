import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FeedbackError, saveFeedback } from "../dist/core/feedback.js";

const plan = "Bases are develop and master.\n";
const review = "Bases are dev, develop, main, and master.\n";

test("feedback saves the plan and the review as separate files", () => {
  const root = mkdtempSync(join(tmpdir(), "tito-feedback-"));
  try {
    const saved = saveFeedback(root, "four-base-names", { plan, review });
    assert.equal(readFileSync(saved.planPath, "utf8"), plan);
    assert.equal(readFileSync(saved.reviewPath, "utf8"), review);
    assert.notEqual(readFileSync(saved.planPath, "utf8"), readFileSync(saved.reviewPath, "utf8"));
    assert.throws(
      () => saveFeedback(root, "four-base-names", { plan: "changed\n", review: "changed\n" }),
      (error) => error instanceof FeedbackError && error.code === "already-saved",
    );
    assert.equal(readFileSync(saved.planPath, "utf8"), plan);
    assert.equal(readFileSync(saved.reviewPath, "utf8"), review);
    assert.throws(
      () => saveFeedback(root, "../escape", { plan, review }),
      (error) => error instanceof FeedbackError && error.code === "invalid-slug",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
