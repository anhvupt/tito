import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { ConfigValidationError, parseConfig } from "./config.js";
import { BRANCH_BASES, type BranchBase } from "./git-flow.js";

export type WorktreeStatus =
  | "merged-clean"
  | "dirty"
  | "unmerged"
  | "behind"
  | "fresh"
  | "missing"
  | "protected";

export type WorktreeRow = {
  readonly path: string;
  readonly branch: string | null;
  readonly status: WorktreeStatus;
  readonly behind: number;
  readonly removable: boolean;
  readonly squashMerged: boolean;
};

export type TidyReport = {
  readonly root: string;
  readonly base: BranchBase;
  readonly rows: readonly WorktreeRow[];
  readonly removed: readonly string[];
  readonly deletedBranches: readonly string[];
  readonly pruned: boolean;
};

/** True when a merged pull request exists, false when `gh` found none, null when `gh` is unavailable. */
export type GhMergedLookup = (branch: string) => boolean | null;

export type WorktreeErrorCode = "git" | "config" | "not-a-directory";

export class WorktreeError extends Error {
  readonly code: WorktreeErrorCode;

  constructor(code: WorktreeErrorCode, message: string) {
    super(message);
    this.name = "WorktreeError";
    this.code = code;
  }
}

type GitResult = {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
};

type PorcelainEntry = {
  readonly path: string;
  readonly branch: string | null;
  readonly prunable: boolean;
};

const BASE_BRANCHES = new Set<string>(BRANCH_BASES);

function errno(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return null;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isMainCheckout(path: string): boolean {
  try {
    return statSync(join(path, ".git")).isDirectory();
  } catch {
    return false;
  }
}

function spawnGit(cwd: string, args: readonly string[]): GitResult {
  const result = spawnSync("git", [...args], { cwd, encoding: "utf8" });
  if (result.error) throw new WorktreeError("git", result.error.message);
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function gitOk(cwd: string, args: readonly string[]): string {
  const result = spawnGit(cwd, args);
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "git command failed").trim();
    throw new WorktreeError("git", detail);
  }
  return result.stdout;
}

function parseCount(stdout: string): number {
  const count = Number(stdout.trim());
  if (!Number.isInteger(count) || count < 0) {
    throw new WorktreeError("git", `Unexpected rev-list count: ${stdout.trim()}`);
  }
  return count;
}

function revCount(cwd: string, range: string): number {
  return parseCount(gitOk(cwd, ["rev-list", "--count", range]));
}

function parsePorcelain(text: string): PorcelainEntry[] {
  const entries: PorcelainEntry[] = [];
  let path: string | null = null;
  let branch: string | null = null;
  let prunable = false;
  let saw = false;

  const flush = (): void => {
    if (!saw || path === null) return;
    entries.push({ path, branch, prunable });
    path = null;
    branch = null;
    prunable = false;
    saw = false;
  };

  for (const line of text.split("\n")) {
    if (line.startsWith("worktree ")) {
      flush();
      path = line.slice("worktree ".length);
      saw = true;
      continue;
    }
    if (!saw) continue;
    if (line.startsWith("branch ")) {
      const ref = line.slice("branch ".length);
      branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
      continue;
    }
    if (line === "detached" || line.startsWith("detached ")) {
      branch = null;
      continue;
    }
    if (line.startsWith("prunable")) {
      prunable = true;
      continue;
    }
    if (line.length === 0) flush();
  }
  flush();
  return entries;
}

function parseMergedBranches(stdout: string): Set<string> {
  const names = new Set<string>();
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    names.add(trimmed.replace(/^[*+]\s+/, ""));
  }
  return names;
}

function readDefaultBase(root: string): BranchBase | undefined {
  const path = join(root, "tito.yaml");
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (errno(error) === "ENOENT") return undefined;
    throw new WorktreeError("config", `Cannot read ${path}.`);
  }
  try {
    return parseConfig(text).git?.defaultBase;
  } catch (error) {
    if (error instanceof ConfigValidationError) throw new WorktreeError("config", error.message);
    throw error;
  }
}

function resolveBase(root: string): BranchBase {
  const configured = readDefaultBase(root);
  if (configured !== undefined) return configured;
  const existing = new Set<string>();
  for (const name of BRANCH_BASES) {
    if (spawnGit(root, ["rev-list", "--count", name]).status === 0) existing.add(name);
  }
  return BRANCH_BASES.find((name) => existing.has(name)) ?? "main";
}

function unpushedCount(worktreePath: string): number | null {
  const result = spawnGit(worktreePath, ["rev-list", "--count", "@{upstream}..HEAD"]);
  if (result.status !== 0) return null;
  return parseCount(result.stdout);
}

function mergedPullRequestListed(stdout: string): boolean {
  const text = stdout.trim();
  if (text.length === 0 || text === "[]") return false;
  try {
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

function defaultGhMerged(root: string): GhMergedLookup {
  let available: boolean | undefined;
  return (branch: string) => {
    if (available === undefined) {
      const probe = spawnSync("gh", ["--version"], { encoding: "utf8" });
      available = probe.error === undefined && probe.status === 0;
    }
    if (!available) return null;
    const result = spawnSync(
      "gh",
      ["pr", "list", "--state", "merged", "--head", branch, "--json", "number"],
      { cwd: root, encoding: "utf8", timeout: 15000 },
    );
    if (result.error || result.status !== 0) return false;
    return mergedPullRequestListed(result.stdout ?? "");
  };
}

function cherryMerged(root: string, base: string, branch: string): boolean {
  const lines = gitOk(root, ["cherry", base, branch])
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length > 0 && lines.every((line) => line.startsWith("-"));
}

function branchMoved(root: string, branch: string): boolean {
  return spawnGit(root, ["rev-parse", "--verify", "--quiet", `${branch}@{1}`]).status === 0;
}

function row(input: {
  path: string;
  branch: string | null;
  status: WorktreeStatus;
  behind: number;
  removable: boolean;
  squashMerged: boolean;
}): WorktreeRow {
  return input;
}

function classifyEntry(input: {
  root: string;
  base: string;
  entry: PorcelainEntry;
  merged: ReadonlySet<string>;
  ghMerged: GhMergedLookup;
}): WorktreeRow {
  const { entry } = input;
  const missing = entry.prunable || !isDirectory(entry.path);
  const behind =
    entry.branch === null ? 0 : revCount(input.root, `${entry.branch}..${input.base}`);
  const baseFields = {
    path: entry.path,
    branch: entry.branch,
    behind,
    squashMerged: false,
  };
  if (missing) return row({ ...baseFields, status: "missing", removable: false });
  const protectedCheckout =
    isMainCheckout(entry.path) || entry.branch === null || BASE_BRANCHES.has(entry.branch);
  if (protectedCheckout) return row({ ...baseFields, status: "protected", removable: false });
  if (gitOk(entry.path, ["status", "--porcelain"]).trim().length > 0) {
    return row({ ...baseFields, status: "dirty", removable: false });
  }
  const unpushed = unpushedCount(entry.path);
  if (unpushed !== null && unpushed > 0) {
    return row({ ...baseFields, status: "unmerged", removable: false });
  }
  const branch = entry.branch;
  if (branch === null) return row({ ...baseFields, status: "unmerged", removable: false });
  const contained = input.merged.has(branch);
  if (contained && behind > 0) {
    return row({ ...baseFields, status: "merged-clean", removable: true });
  }
  const pullRequest = input.ghMerged(branch);
  if (pullRequest === true) {
    return row({ ...baseFields, status: "merged-clean", removable: true, squashMerged: true });
  }
  if (pullRequest === null && cherryMerged(input.root, input.base, branch)) {
    return row({ ...baseFields, status: "merged-clean", removable: true });
  }
  if (contained && behind === 0) {
    if (branchMoved(input.root, branch)) {
      return row({ ...baseFields, status: "merged-clean", removable: true });
    }
    return row({ ...baseFields, status: "fresh", removable: false });
  }
  if (behind > 0) return row({ ...baseFields, status: "behind", removable: false });
  return row({ ...baseFields, status: "unmerged", removable: false });
}

function deleteLocalBranch(root: string, branch: string, squashMerged: boolean): void {
  if (BASE_BRANCHES.has(branch)) {
    throw new WorktreeError("git", `Refusing to delete base branch ${branch}.`);
  }
  const soft = spawnGit(root, ["branch", "-d", branch]);
  if (soft.status === 0) return;
  if (!squashMerged) {
    const detail = (soft.stderr || soft.stdout || "git branch -d failed").trim();
    throw new WorktreeError("git", detail);
  }
  gitOk(root, ["branch", "-D", branch]);
}

export function tidyWorktrees(input: {
  readonly root: string;
  readonly confirm?: boolean;
  readonly ghMerged?: GhMergedLookup;
}): TidyReport {
  const root = resolve(input.root);
  if (!isDirectory(root)) throw new WorktreeError("not-a-directory", `${root} is not a directory.`);
  const base = resolveBase(root);
  const merged = parseMergedBranches(gitOk(root, ["branch", "--merged", base]));
  const ghMerged = input.ghMerged ?? defaultGhMerged(root);
  const rows = parsePorcelain(gitOk(root, ["worktree", "list", "--porcelain"])).map((entry) =>
    classifyEntry({ root, base, entry, merged, ghMerged }),
  );
  const removed: string[] = [];
  const deletedBranches: string[] = [];
  let pruned = false;
  if (input.confirm === true) {
    for (const item of rows) {
      if (!item.removable || item.branch === null || BASE_BRANCHES.has(item.branch)) continue;
      if (isMainCheckout(item.path)) continue;
      gitOk(root, ["worktree", "remove", item.path]);
      removed.push(item.path);
      deleteLocalBranch(root, item.branch, item.squashMerged);
      deletedBranches.push(item.branch);
    }
    if (rows.some((item) => item.status === "missing")) {
      gitOk(root, ["worktree", "prune"]);
      pruned = true;
    }
  }
  return { root, base, rows, removed, deletedBranches, pruned };
}

export function formatTidyReport(report: TidyReport): string {
  const lines = [`base: ${report.base}`];
  for (const item of report.rows) {
    lines.push(
      `worktree: ${item.path}`,
      `branch: ${item.branch ?? "detached"}`,
      `status: ${item.status}`,
      `behind: ${item.behind}`,
      `removable: ${item.removable ? "yes" : "no"}`,
    );
  }
  for (const path of report.removed) lines.push(`removed: ${path}`);
  for (const branch of report.deletedBranches) lines.push(`deleted-branch: ${branch}`);
  if (report.pruned) lines.push("pruned: yes");
  return `${lines.join("\n")}\n`;
}
