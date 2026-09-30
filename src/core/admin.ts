import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

export type AdminRepo = { path: string; addedAt: string };

export type RepoContext = {
  path: string;
  branch: string;
  recentCommits: { subject: string; date: string; files: string[] }[];
};

export type GitRunner = (cwd: string, args: readonly string[]) => string;
export type Clock = () => string;

export type AdminErrorCode =
  | "not-a-directory"
  | "not-registered"
  | "filesystem"
  | "git";

export class AdminError extends Error {
  readonly code: AdminErrorCode;
  readonly path: string;

  constructor(code: AdminErrorCode, path: string, message: string) {
    super(message);
    this.name = "AdminError";
    this.code = code;
    this.path = path;
  }
}

const SECRET_BASENAMES = new Set([".env", "credentials.json", "id_rsa"]);

export function isSecretFilename(filePath: string): boolean {
  const name = basename(filePath);
  if (SECRET_BASENAMES.has(name)) return true;
  return name.startsWith(".env.");
}

export function resolveAdminRoot(explicit?: string): string {
  if (explicit !== undefined) return resolve(explicit);
  return join(homedir(), ".config", "tito", "admin");
}

export function reposFilePath(adminRoot: string): string {
  return join(resolve(adminRoot), "repos.json");
}

export function contextFilePath(adminRoot: string): string {
  return join(resolve(adminRoot), "context.json");
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

function assertDirectory(path: string): string {
  const resolved = resolve(path);
  try {
    if (!statSync(resolved).isDirectory()) {
      throw new AdminError("not-a-directory", resolved, `${resolved} is not a directory.`);
    }
  } catch (error) {
    if (error instanceof AdminError) throw error;
    const code = errno(error);
    if (code === "ENOENT") {
      throw new AdminError("not-a-directory", resolved, `${resolved} is not a directory.`);
    }
    throw new AdminError("filesystem", resolved, `Cannot inspect ${resolved}.`);
  }
  return resolved;
}

function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    renameSync(tmp, path);
  } catch (error) {
    throw new AdminError(
      "filesystem",
      path,
      error instanceof Error ? error.message : `Cannot write ${path}.`,
    );
  }
}

function readJsonFile(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const code = errno(error);
    if (code === "ENOENT") return null;
    throw new AdminError(
      "filesystem",
      path,
      error instanceof Error ? error.message : `Cannot read ${path}.`,
    );
  }
}

function isAdminRepo(value: unknown): value is AdminRepo {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.path === "string" && typeof record.addedAt === "string";
}

export function loadRepos(adminRoot: string): AdminRepo[] {
  const path = reposFilePath(adminRoot);
  if (!existsSync(path)) return [];
  const raw = readJsonFile(path);
  if (!Array.isArray(raw)) {
    throw new AdminError("filesystem", path, `${path} must contain a JSON array.`);
  }
  const repos: AdminRepo[] = [];
  for (const item of raw) {
    if (!isAdminRepo(item)) {
      throw new AdminError("filesystem", path, `${path} has an invalid repo entry.`);
    }
    repos.push({ path: item.path, addedAt: item.addedAt });
  }
  return repos;
}

export function saveRepos(adminRoot: string, repos: readonly AdminRepo[]): void {
  writeJsonAtomic(reposFilePath(adminRoot), repos);
}

export function loadContexts(adminRoot: string): RepoContext[] {
  const path = contextFilePath(adminRoot);
  if (!existsSync(path)) return [];
  const raw = readJsonFile(path);
  if (!Array.isArray(raw)) {
    throw new AdminError("filesystem", path, `${path} must contain a JSON array.`);
  }
  return raw as RepoContext[];
}

export function saveContexts(adminRoot: string, contexts: readonly RepoContext[]): void {
  writeJsonAtomic(contextFilePath(adminRoot), contexts);
}

const defaultClock: Clock = () => new Date().toISOString();

export function defaultGitRunner(cwd: string, args: readonly string[]): string {
  const result = spawnSync("git", [...args], {
    cwd,
    encoding: "utf8",
  });
  if (result.error) {
    throw new AdminError("git", cwd, result.error.message);
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "git command failed").trim();
    throw new AdminError("git", cwd, detail);
  }
  return result.stdout ?? "";
}

export function addRepo(
  adminRoot: string,
  repoPath: string,
  options: { clock?: Clock } = {},
): { readonly repo: AdminRepo; readonly created: boolean } {
  const path = assertDirectory(repoPath);
  const repos = loadRepos(adminRoot);
  const existing = repos.find((repo) => repo.path === path);
  if (existing !== undefined) {
    return { repo: existing, created: false };
  }
  const clock = options.clock ?? defaultClock;
  const repo: AdminRepo = { path, addedAt: clock() };
  repos.push(repo);
  saveRepos(adminRoot, repos);
  return { repo, created: true };
}

export function listRepos(adminRoot: string): AdminRepo[] {
  return loadRepos(adminRoot);
}

export function removeRepo(adminRoot: string, repoPath: string): AdminRepo {
  const path = resolve(repoPath);
  const repos = loadRepos(adminRoot);
  const index = repos.findIndex((repo) => repo.path === path);
  if (index < 0) {
    throw new AdminError("not-registered", path, `${path} is not registered.`);
  }
  const [removed] = repos.splice(index, 1);
  if (removed === undefined) {
    throw new AdminError("not-registered", path, `${path} is not registered.`);
  }
  saveRepos(adminRoot, repos);
  return removed;
}

function parseCommitLog(stdout: string): RepoContext["recentCommits"] {
  const commits: RepoContext["recentCommits"] = [];
  const blocks = stdout.split(/\n(?=◆)/);
  for (const block of blocks) {
    const trimmed = block.trim();
    if (trimmed.length === 0) continue;
    const lines = trimmed.split("\n");
    const header = lines[0];
    if (header === undefined || !header.startsWith("◆")) continue;
    const parts = header.slice(1).split("\0");
    const subject = parts[0] ?? "";
    const date = parts[1] ?? "";
    const files: string[] = [];
    for (const line of lines.slice(1)) {
      const file = line.trim();
      if (file.length === 0) continue;
      if (isSecretFilename(file)) continue;
      files.push(file);
    }
    commits.push({ subject, date, files });
  }
  return commits;
}

export function readRepoContext(
  repoPath: string,
  options: { git?: GitRunner } = {},
): RepoContext {
  const path = assertDirectory(repoPath);
  const git = options.git ?? defaultGitRunner;
  const branch = git(path, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  const log = git(path, [
    "log",
    "-n",
    "50",
    "--pretty=format:◆%s%x00%cI",
    "--name-only",
  ]);
  return {
    path,
    branch,
    recentCommits: parseCommitLog(log),
  };
}

export function refreshRepos(
  adminRoot: string,
  options: { git?: GitRunner } = {},
): RepoContext[] {
  const repos = loadRepos(adminRoot);
  const contexts: RepoContext[] = [];
  for (const repo of repos) {
    contexts.push(readRepoContext(repo.path, options));
  }
  saveContexts(adminRoot, contexts);
  return contexts;
}

export function formatRepos(repos: readonly AdminRepo[]): string {
  if (repos.length === 0) return "No registered repositories.\n";
  return `${repos.map((repo) => `${repo.path}\t${repo.addedAt}`).join("\n")}\n`;
}

export function formatContexts(contexts: readonly RepoContext[]): string {
  if (contexts.length === 0) return "No repository context.\n";
  const lines: string[] = [];
  for (const context of contexts) {
    lines.push(`path: ${context.path}`);
    lines.push(`branch: ${context.branch}`);
    lines.push(`commits: ${context.recentCommits.length}`);
    for (const commit of context.recentCommits) {
      lines.push(`- ${commit.date}\t${commit.subject}`);
      for (const file of commit.files) {
        lines.push(`  ${file}`);
      }
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
