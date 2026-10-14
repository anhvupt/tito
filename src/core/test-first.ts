import { spawnSync } from "node:child_process";

export type TestFirstGuardReport =
  | { readonly ok: true; readonly retry: false }
  | {
      readonly ok: false;
      readonly retry: false;
      readonly file: string;
      readonly commit: string;
      readonly message: string;
    };

export class TestFirstError extends Error {
  readonly code = "git" as const;

  constructor(message: string) {
    super(message);
    this.name = "TestFirstError";
  }
}

function git(root: string, args: readonly string[]): string {
  const result = spawnSync("git", [...args], { cwd: root, encoding: "utf8" });
  if (result.error) throw new TestFirstError(result.error.message);
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "git command failed").trim();
    throw new TestFirstError(detail);
  }
  return result.stdout ?? "";
}

function normalize(file: string): string {
  return file.replaceAll("\\", "/").replace(/^\.\//, "");
}

function hasMarker(base: string, marker: string): boolean {
  const index = base.indexOf(marker);
  return index >= 0 && index + marker.length < base.length;
}

function isTestFile(file: string): boolean {
  const path = normalize(file);
  if (path === "test" || path.startsWith("test/")) return true;
  const base = path.slice(path.lastIndexOf("/") + 1);
  return hasMarker(base, ".test.") || hasMarker(base, ".spec.");
}

function changedFiles(root: string, sha: string): string[] {
  const output = git(root, [
    "diff-tree",
    "--no-commit-id",
    "--name-only",
    "-r",
    "-m",
    "--root",
    sha,
  ]);
  const files: string[] = [];
  const seen = new Set<string>();
  for (const line of output.split("\n")) {
    const file = line.trim();
    if (file.length === 0 || seen.has(file)) continue;
    seen.add(file);
    files.push(file);
  }
  return files;
}

function fail(file: string, commit: string, message: string): TestFirstGuardReport {
  return { ok: false, retry: false, file, commit, message };
}

export function guardTestFirst(input: {
  readonly root: string;
  readonly base: string;
  readonly testFiles: readonly string[];
}): TestFirstGuardReport {
  const listed = new Set(input.testFiles.map(normalize));
  const commits = git(input.root, ["rev-list", "--reverse", `${input.base}..HEAD`])
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const first = commits[0];
  if (first === undefined) {
    return fail("(none)", input.base, "The slice branch has no commits after its base.");
  }
  for (const file of changedFiles(input.root, first)) {
    if (!listed.has(normalize(file))) {
      return fail(
        file,
        first,
        `Commit 1 changes ${file}, which is outside the listed test files.`,
      );
    }
  }
  for (let index = 1; index < commits.length; index += 1) {
    const sha = commits[index];
    if (sha === undefined) continue;
    for (const file of changedFiles(input.root, sha)) {
      if (!isTestFile(file)) continue;
      return fail(file, sha, `Commit ${index + 1} changes test file ${file}.`);
    }
  }
  return { ok: true, retry: false };
}

export function formatTestFirstReport(report: TestFirstGuardReport): string {
  if (report.ok) return "ok: true\nretry: false\n";
  return [
    "ok: false",
    "retry: false",
    `file: ${report.file}`,
    `commit: ${report.commit}`,
    `message: ${report.message}`,
    "",
  ].join("\n");
}
