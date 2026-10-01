import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const OUTCOME_LINE = /^outcome:[ \t]*(\S+)[ \t]*$/m;

export const FEEDBACK_OUTCOMES = ["accepted", "edited", "expanded"] as const;

export type FeedbackOutcome = (typeof FEEDBACK_OUTCOMES)[number];

export type FeedbackErrorCode = "invalid-slug" | "invalid-outcome" | "already-saved";

export class FeedbackError extends Error {
  readonly code: FeedbackErrorCode;

  constructor(code: FeedbackErrorCode, message: string) {
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

function isFeedbackOutcome(value: unknown): value is FeedbackOutcome {
  return typeof value === "string" && (FEEDBACK_OUTCOMES as readonly string[]).includes(value);
}

export function readFeedbackOutcome(reviewText: string): FeedbackOutcome | "unknown" {
  const frontMatter = FRONT_MATTER.exec(reviewText)?.[1];
  if (frontMatter === undefined) {
    return "unknown";
  }
  const value = OUTCOME_LINE.exec(frontMatter.replace(/\r/g, ""))?.[1];
  return isFeedbackOutcome(value) ? value : "unknown";
}

export function saveFeedback(
  root: string,
  slug: string,
  record: {
    readonly plan: string;
    readonly review: string;
    readonly outcome: FeedbackOutcome;
  },
): { readonly planPath: string; readonly reviewPath: string } {
  if (!SLUG.test(slug)) {
    throw new FeedbackError("invalid-slug", "Feedback slug must be a lowercase hyphenated name.");
  }
  if (!isFeedbackOutcome(record.outcome)) {
    throw new FeedbackError(
      "invalid-outcome",
      `Feedback outcome must be one of: ${FEEDBACK_OUTCOMES.join(", ")}.`,
    );
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
    writeFileSync(reviewPath, `---\noutcome: ${record.outcome}\n---\n${record.review}`, {
      encoding: "utf8",
      flag: "wx",
    });
  } catch (error) {
    if (errno(error) === "EEXIST") {
      throw new FeedbackError("already-saved", "The review is already saved.");
    }
    throw error;
  }
  return { planPath, reviewPath };
}
