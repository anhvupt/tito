import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FEEDBACK_OUTCOMES,
  FeedbackError,
  readFeedbackOutcome,
  saveFeedback,
} from "../dist/core/feedback.js";

const plan = "Bases are develop and master.\n";
const review = "Bases are dev, develop, main, and master.\n";

function withOutcome(outcome, text) {
  return `---\noutcome: ${outcome}\n---\n${text}`;
}

test("feedback saves the plan and the review as separate files", () => {
  const root = mkdtempSync(join(tmpdir(), "tito-feedback-"));
  try {
    const saved = saveFeedback(root, "four-base-names", { plan, review, outcome: "edited" });
    assert.equal(readFileSync(saved.planPath, "utf8"), plan);
    assert.equal(readFileSync(saved.reviewPath, "utf8"), withOutcome("edited", review));
    assert.notEqual(readFileSync(saved.planPath, "utf8"), readFileSync(saved.reviewPath, "utf8"));
    assert.throws(
      () =>
        saveFeedback(root, "four-base-names", {
          plan: "changed\n",
          review: "changed\n",
          outcome: "accepted",
        }),
      (error) => error instanceof FeedbackError && error.code === "already-saved",
    );
    assert.equal(readFileSync(saved.planPath, "utf8"), plan);
    assert.equal(readFileSync(saved.reviewPath, "utf8"), withOutcome("edited", review));
    assert.throws(
      () => saveFeedback(root, "../escape", { plan, review, outcome: "edited" }),
      (error) => error instanceof FeedbackError && error.code === "invalid-slug",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("[unit] saveFeedback records the plan outcome", () => {
  // Arrange
  const root = mkdtempSync(join(tmpdir(), "tito-feedback-"));
  const slug = "tenancy-surfaces";
  try {
    // Act
    const saved = saveFeedback(root, slug, { plan, review, outcome: "expanded" });

    // Assert
    const written = readFileSync(saved.reviewPath, "utf8");
    assert.ok(written.startsWith("---\noutcome: expanded\n---\n"));
    assert.equal(written, withOutcome("expanded", review));
    assert.equal(readFileSync(saved.planPath, "utf8"), plan);
    assert.equal(readFeedbackOutcome(written), "expanded");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("[unit] an old review.md without an outcome counts as unknown", () => {
  // Arrange
  const text = review;

  // Act
  const outcome = readFeedbackOutcome(text);

  // Assert
  assert.equal(outcome, "unknown");
});

test("[unit] readFeedbackOutcome reads each outcome from front matter", () => {
  assert.deepEqual([...FEEDBACK_OUTCOMES], ["accepted", "edited", "expanded"]);
  for (const outcome of FEEDBACK_OUTCOMES) {
    assert.equal(readFeedbackOutcome(withOutcome(outcome, review)), outcome);
  }
});

test("[unit] readFeedbackOutcome rejects a bad or missing outcome", () => {
  assert.equal(readFeedbackOutcome(withOutcome("rejected", review)), "unknown");
  assert.equal(readFeedbackOutcome(`---\ntitle: x\n---\n${review}`), "unknown");
  assert.equal(readFeedbackOutcome(`${review}---\noutcome: accepted\n---\n`), "unknown");
  assert.equal(readFeedbackOutcome(""), "unknown");
});

test("[unit] readFeedbackOutcome reads CRLF front matter", () => {
  assert.equal(readFeedbackOutcome(`---\r\noutcome: accepted\r\n---\r\n${review}`), "accepted");
});

test("[unit] saveFeedback rejects an invalid outcome and writes nothing", () => {
  // Arrange
  const root = mkdtempSync(join(tmpdir(), "tito-feedback-"));
  try {
    // Act and Assert
    assert.throws(
      () => saveFeedback(root, "bad-outcome", { plan, review, outcome: "rejected" }),
      (error) => error instanceof FeedbackError && error.code === "invalid-outcome",
    );
    assert.equal(existsSync(join(root, ".tito", "feedback")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
