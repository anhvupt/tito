import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class FeedbackError extends Error {
  readonly code: "invalid-slug" | "already-saved";

  constructor(code: "invalid-slug" | "already-saved", message: string) {
    super(message);
    this.name = "FeedbackError";
    this.code = code;
  }
}

function errno(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return null;
}

export function saveFeedback(
  root: string,
  slug: string,
  record: { readonly plan: string; readonly review: string },
): { readonly planPath: string; readonly reviewPath: string } {
  if (!SLUG.test(slug)) {
    throw new FeedbackError("invalid-slug", "Feedback slug must be a lowercase hyphenated name.");
  }
  const dir = join(root, ".tito", "feedback", slug);
  const planPath = join(dir, "plan.md");
  const reviewPath = join(dir, "review.md");
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(planPath, record.plan, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (errno(error) === "EEXIST") {
      throw new FeedbackError("already-saved", "The Tito plan is already saved.");
    }
    throw error;
  }
  try {
    writeFileSync(reviewPath, record.review, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (errno(error) === "EEXIST") {
      throw new FeedbackError("already-saved", "The review is already saved.");
    }
    throw error;
  }
  return { planPath, reviewPath };
}
