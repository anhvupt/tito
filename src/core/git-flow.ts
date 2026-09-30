export const BRANCH_TYPES = [
  "feat",
  "fix",
  "hot-fix",
  "chores",
  "refactor",
  "debug",
] as const;

export const BRANCH_BASES = ["dev", "develop", "main", "master"] as const;

export type BranchType = (typeof BRANCH_TYPES)[number];
export type BranchBase = (typeof BRANCH_BASES)[number];
export type TaskKind =
  | "feature"
  | "bug"
  | "production-emergency"
  | "tooling"
  | "refactor"
  | "investigation";

export type BranchSuggestion = {
  readonly type: BranchType;
  readonly base: BranchBase;
  readonly name: string;
  readonly reason: string;
  readonly line: string;
};

const TYPE_BY_KIND: Record<TaskKind, BranchType> = {
  feature: "feat",
  bug: "fix",
  "production-emergency": "hot-fix",
  tooling: "chores",
  refactor: "refactor",
  investigation: "debug",
};

export function branchSlug(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug.length > 0 ? slug : "change";
}

function isBranchBase(value: string): value is BranchBase {
  return (BRANCH_BASES as readonly string[]).includes(value);
}

function firstExisting(
  names: readonly BranchBase[],
  existing: ReadonlySet<string>,
  fallback: BranchBase,
): BranchBase {
  return names.find((name) => existing.has(name)) ?? fallback;
}

export function suggestBranch(input: {
  taskKind: TaskKind;
  slug: string;
  existingBases: readonly BranchBase[];
  currentBranch: string;
  continuesFromCurrent: boolean;
  defaultBase?: BranchBase;
}): BranchSuggestion {
  const type = TYPE_BY_KIND[input.taskKind];
  const existing = new Set(input.existingBases);
  const current = input.currentBranch;
  let base: BranchBase;
  let reason: string;
  if (type === "hot-fix") {
    base =
      input.defaultBase === "main" || input.defaultBase === "master"
        ? input.defaultBase
        : firstExisting(["main", "master"], existing, "main");
    reason = `A production emergency starts from ${base}.`;
  } else if (input.continuesFromCurrent && isBranchBase(current)) {
    base = current;
    reason = `The work continues from ${current}.`;
  } else if (input.defaultBase) {
    base = input.defaultBase;
    reason = `The project default base is ${input.defaultBase}.`;
  } else {
    base = firstExisting(BRANCH_BASES, existing, "main");
    reason =
      base === "dev" || base === "develop"
        ? `Feature work starts from ${base}.`
        : "This repository has no dev or develop branch.";
  }
  const name = `${type}/${branchSlug(input.slug)}`;
  return {
    type,
    base,
    name,
    reason,
    line: `Suggested branch: ${name} from ${base}`,
  };
}

export function checkoutCommands(base: BranchBase, branch: string): readonly string[] {
  return [`git checkout ${base}`, `git checkout -b ${branch}`];
}

export type PlanIndexEntry = {
  readonly name: string;
  readonly cursorPlanPath: string;
  readonly branch: string;
};

export function prunePlanIndex(
  entries: readonly PlanIndexEntry[],
  planExists: (path: string) => boolean,
): PlanIndexEntry[] {
  return entries.filter((entry) => planExists(entry.cursorPlanPath));
}

export function linearReference(input: {
  linearConnected: boolean;
  userAskedToCreate: boolean;
  issueId?: string;
}): { readonly issueId: string | null; readonly createIssue: boolean } {
  if (input.issueId && input.issueId.trim().length > 0) {
    return { issueId: input.issueId.trim(), createIssue: false };
  }
  return {
    issueId: null,
    createIssue: input.userAskedToCreate,
  };
}

export type PullRequestDescriptionInput = {
  readonly problem: string;
  readonly done: readonly string[];
  readonly reviewFixes: readonly string[];
  readonly checks: readonly string[];
};

export const PULL_REQUEST_TEMPLATE_PATH = ".github/pull_request_template.md";

const PULL_REQUEST_HEADINGS = {
  problem: "## Problem",
  done: "## What changed",
  review: "## Review fixes",
  checks: "## Checks",
} as const;

const MAX_PULL_REQUEST_LINES = 50;

export function pullRequestTemplate(): string {
  return [
    PULL_REQUEST_HEADINGS.problem,
    "",
    PULL_REQUEST_HEADINGS.done,
    "",
    "-",
    "",
    PULL_REQUEST_HEADINGS.review,
    "",
    "-",
    "",
    PULL_REQUEST_HEADINGS.checks,
    "",
    "- Lint:",
    "- Code quality:",
    "- Conventions:",
    "- Tests:",
    "- Build:",
    "",
  ].join("\n");
}

function bullet(item: string): string | null {
  const text = item.trim();
  if (text.length === 0 || text.includes("\n")) return null;
  return `- ${text}`;
}

function bullets(items: readonly string[]): string[] | null {
  const lines: string[] = [];
  for (const item of items) {
    const line = bullet(item);
    if (line === null) return null;
    lines.push(line);
  }
  return lines;
}

export function pullRequestDescription(input: PullRequestDescriptionInput): string | null {
  const problem = input.problem.trim();
  if (problem.length === 0 || problem.includes("\n")) return null;
  const done = bullets(input.done);
  const checks = bullets(input.checks);
  if (done === null || checks === null || done.length === 0 || checks.length === 0) return null;
  const review = bullets(input.reviewFixes.length > 0 ? input.reviewFixes : ["No review fixes."]);
  if (review === null) return null;
  const lines = [
    PULL_REQUEST_HEADINGS.problem,
    problem,
    "",
    PULL_REQUEST_HEADINGS.done,
    ...done,
    "",
    PULL_REQUEST_HEADINGS.review,
    ...review,
    "",
    PULL_REQUEST_HEADINGS.checks,
    ...checks,
  ];
  if (lines.length < 2 || lines.length > MAX_PULL_REQUEST_LINES) return null;
  return lines.join("\n");
}

export function mergeDecision(input: {
  userAskedToMerge: boolean;
  hasApproval: boolean;
}): { readonly allowed: boolean; readonly reason: string } {
  if (!input.userAskedToMerge) {
    return { allowed: false, reason: "Wait for the user to call for the merge." };
  }
  if (!input.hasApproval) {
    return { allowed: false, reason: "The pull request has no approval." };
  }
  return {
    allowed: true,
    reason: "The user called for the merge and the pull request has an approval.",
  };
}

export function canApprovePullRequest(): false {
  return false;
}
