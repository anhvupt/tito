import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `${args.join(" ")}\n${result.stderr}`);
  return result.stdout;
}

function runCli(repo, args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repo,
    encoding: "utf8",
  });
}

function initRepo(dir) {
  const repo = join(dir, "repo");
  git(dir, ["init", "-b", "main", repo]);
  git(repo, ["config", "user.email", "tito@example.com"]);
  git(repo, ["config", "user.name", "Tito"]);
  writeFileSync(join(repo, "readme.txt"), "one\n");
  git(repo, ["add", "readme.txt"]);
  git(repo, ["commit", "-m", "one"]);
  return repo;
}

function addWorktree(repo, dir, branch, folder) {
  const wt = join(dir, folder);
  git(repo, ["branch", branch]);
  git(repo, ["worktree", "add", wt, branch]);
  return wt;
}

test("a merged clean worktree is reported removable and removed only on confirm", () => {
  const dir = mkdtempSync(join(tmpdir(), "tito-worktree-"));
  try {
    const origin = join(dir, "origin.git");
    const repo = initRepo(dir);
    git(dir, ["init", "--bare", origin]);
    git(repo, ["remote", "add", "origin", origin]);
    git(repo, ["push", "-u", "origin", "main"]);
    const wt = addWorktree(repo, dir, "feat/clean", "wt-clean");
    writeFileSync(join(wt, "feature.txt"), "work\n");
    git(wt, ["add", "feature.txt"]);
    git(wt, ["commit", "-m", "Add feature"]);
    git(wt, ["push", "-u", "origin", "feat/clean"]);
    git(repo, ["merge", "--ff-only", "feat/clean"]);
    git(repo, ["push", "origin", "main"]);

    const report = runCli(repo, ["worktree", "tidy", "--root", repo]);
    assert.equal(report.status, 0, report.stderr);
    assert.match(report.stdout, /branch: feat\/clean/);
    assert.match(report.stdout, /status: merged-clean/);
    assert.match(report.stdout, /removable: yes/);
    assert.equal(report.stdout.includes("removed:"), false);
    assert.equal(existsSync(wt), true);
    assert.match(git(repo, ["show-ref", "--verify", "refs/heads/feat/clean"]), /refs\/heads\/feat\/clean/);
    assert.match(
      git(origin, ["show-ref", "--verify", "refs/heads/feat/clean"]),
      /refs\/heads\/feat\/clean/,
    );

    const confirmed = runCli(repo, ["worktree", "tidy", "--confirm", "--root", repo]);
    assert.equal(confirmed.status, 0, confirmed.stderr);
    assert.match(confirmed.stdout, /removed: /);
    assert.match(confirmed.stdout, /deleted-branch: feat\/clean/);
    assert.equal(existsSync(wt), false);
    assert.equal(existsSync(join(repo, ".git")), true);
    const local = spawnSync("git", ["show-ref", "--verify", "refs/heads/feat/clean"], {
      cwd: repo,
      encoding: "utf8",
    });
    assert.notEqual(local.status, 0);
    assert.match(
      git(origin, ["show-ref", "--verify", "refs/heads/feat/clean"]),
      /refs\/heads\/feat\/clean/,
    );
    assert.match(git(repo, ["show-ref", "--verify", "refs/heads/main"]), /refs\/heads\/main/);
    assert.match(git(origin, ["show-ref", "--verify", "refs/heads/main"]), /refs\/heads\/main/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a merged worktree with uncommitted files is kept and reported dirty", () => {
  const dir = mkdtempSync(join(tmpdir(), "tito-worktree-"));
  try {
    const repo = initRepo(dir);
    const wt = addWorktree(repo, dir, "feat/dirty", "wt-dirty");
    writeFileSync(join(wt, "feature.txt"), "work\n");
    git(wt, ["add", "feature.txt"]);
    git(wt, ["commit", "-m", "Add feature"]);
    git(repo, ["merge", "--ff-only", "feat/dirty"]);
    writeFileSync(join(wt, "scratch.txt"), "dirty\n");

    const result = runCli(repo, ["worktree", "tidy", "--confirm", "--root", repo]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /branch: feat\/dirty/);
    assert.match(result.stdout, /status: dirty/);
    assert.equal(result.stdout.includes("removed:"), false);
    assert.equal(existsSync(join(wt, "scratch.txt")), true);
    assert.match(git(repo, ["show-ref", "--verify", "refs/heads/feat/dirty"]), /refs\/heads\/feat\/dirty/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a worktree with commits not in main is kept", () => {
  const dir = mkdtempSync(join(tmpdir(), "tito-worktree-"));
  try {
    const repo = initRepo(dir);
    const wt = addWorktree(repo, dir, "feat/open", "wt-open");
    writeFileSync(join(wt, "open.txt"), "open\n");
    git(wt, ["add", "open.txt"]);
    git(wt, ["commit", "-m", "Open work"]);

    const result = runCli(repo, ["worktree", "tidy", "--confirm", "--root", repo]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /branch: feat\/open/);
    assert.match(result.stdout, /status: unmerged/);
    assert.equal(result.stdout.includes("removed:"), false);
    assert.equal(existsSync(wt), true);
    assert.match(git(repo, ["show-ref", "--verify", "refs/heads/feat/open"]), /refs\/heads\/feat\/open/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a squash-merged branch whose pull request is merged is reported merged", async () => {
  const { formatTidyReport, tidyWorktrees } = await import("../dist/core/worktree.js");
  const dir = mkdtempSync(join(tmpdir(), "tito-worktree-"));
  try {
    const repo = initRepo(dir);
    const wt = addWorktree(repo, dir, "feat/squash", "wt-squash");
    writeFileSync(join(wt, "a.txt"), "a\n");
    git(wt, ["add", "a.txt"]);
    git(wt, ["commit", "-m", "Add a"]);
    writeFileSync(join(wt, "b.txt"), "b\n");
    git(wt, ["add", "b.txt"]);
    git(wt, ["commit", "-m", "Add b"]);
    git(repo, ["merge", "--squash", "feat/squash"]);
    git(repo, ["commit", "-m", "Squash feature"]);

    const text = formatTidyReport(
      tidyWorktrees({
        root: repo,
        ghMerged: (branch) => branch === "feat/squash",
      }),
    );
    assert.match(text, /branch: feat\/squash/);
    assert.match(text, /status: merged-clean/);
    assert.equal(text.includes("removed:"), false);
    assert.equal(existsSync(wt), true);
    assert.match(git(repo, ["show-ref", "--verify", "refs/heads/feat/squash"]), /refs\/heads\/feat\/squash/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a worktree whose folder was deleted is pruned on confirm", () => {
  const dir = mkdtempSync(join(tmpdir(), "tito-worktree-"));
  try {
    const repo = initRepo(dir);
    const wt = addWorktree(repo, dir, "feat/gone", "wt-gone");
    rmSync(wt, { recursive: true, force: true });

    const result = runCli(repo, ["worktree", "tidy", "--confirm", "--root", repo]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /branch: feat\/gone/);
    assert.match(result.stdout, /status: missing/);
    assert.match(result.stdout, /pruned: yes/);
    assert.equal(git(repo, ["worktree", "list", "--porcelain"]).includes(wt), false);
    assert.match(git(repo, ["show-ref", "--verify", "refs/heads/main"]), /refs\/heads\/main/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a worktree behind main reports the behind count and is not rebased", () => {
  const dir = mkdtempSync(join(tmpdir(), "tito-worktree-"));
  try {
    const repo = initRepo(dir);
    const wt = addWorktree(repo, dir, "feat/behind", "wt-behind");
    const headBefore = git(wt, ["rev-parse", "HEAD"]).trim();
    writeFileSync(join(repo, "two.txt"), "two\n");
    git(repo, ["add", "two.txt"]);
    git(repo, ["commit", "-m", "two"]);
    writeFileSync(join(repo, "three.txt"), "three\n");
    git(repo, ["add", "three.txt"]);
    git(repo, ["commit", "-m", "three"]);

    const result = runCli(repo, ["worktree", "tidy", "--root", repo]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /branch: feat\/behind/);
    assert.match(result.stdout, /behind: 2/);
    assert.equal(result.stdout.includes("rebase"), false);
    assert.equal(git(wt, ["rev-parse", "HEAD"]).trim(), headBefore);
    assert.equal(existsSync(wt), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a merged clean worktree three commits behind main stays removable", () => {
  const dir = mkdtempSync(join(tmpdir(), "tito-worktree-"));
  try {
    const origin = join(dir, "origin.git");
    const repo = initRepo(dir);
    git(dir, ["init", "--bare", origin]);
    git(repo, ["remote", "add", "origin", origin]);
    git(repo, ["push", "-u", "origin", "main"]);
    const wt = addWorktree(repo, dir, "feat/behind-merged", "wt-behind-merged");
    writeFileSync(join(wt, "feature.txt"), "work\n");
    git(wt, ["add", "feature.txt"]);
    git(wt, ["commit", "-m", "Add feature"]);
    git(wt, ["push", "-u", "origin", "feat/behind-merged"]);
    git(repo, ["merge", "--ff-only", "feat/behind-merged"]);
    for (const name of ["two.txt", "three.txt", "four.txt"]) {
      writeFileSync(join(repo, name), `${name}\n`);
      git(repo, ["add", name]);
      git(repo, ["commit", "-m", name]);
    }

    const report = runCli(repo, ["worktree", "tidy", "--root", repo]);
    assert.equal(report.status, 0, report.stderr);
    assert.match(report.stdout, /branch: feat\/behind-merged/);
    assert.match(report.stdout, /status: merged-clean/);
    assert.match(report.stdout, /behind: 3/);
    assert.match(report.stdout, /removable: yes/);
    assert.equal(report.stdout.includes("removed:"), false);
    assert.equal(existsSync(wt), true);
    assert.match(
      git(repo, ["show-ref", "--verify", "refs/heads/feat/behind-merged"]),
      /refs\/heads\/feat\/behind-merged/,
    );

    const confirmed = runCli(repo, ["worktree", "tidy", "--confirm", "--root", repo]);
    assert.equal(confirmed.status, 0, confirmed.stderr);
    assert.match(confirmed.stdout, /status: merged-clean/);
    assert.match(confirmed.stdout, /behind: 3/);
    assert.match(confirmed.stdout, /removed: /);
    assert.match(confirmed.stdout, /deleted-branch: feat\/behind-merged/);
    assert.equal(existsSync(wt), false);
    assert.equal(existsSync(join(repo, ".git")), true);
    const local = spawnSync("git", ["show-ref", "--verify", "refs/heads/feat/behind-merged"], {
      cwd: repo,
      encoding: "utf8",
    });
    assert.notEqual(local.status, 0);
    assert.match(
      git(origin, ["show-ref", "--verify", "refs/heads/feat/behind-merged"]),
      /refs\/heads\/feat\/behind-merged/,
    );
    assert.match(git(repo, ["show-ref", "--verify", "refs/heads/main"]), /refs\/heads\/main/);
    assert.match(git(origin, ["show-ref", "--verify", "refs/heads/main"]), /refs\/heads\/main/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a worktree whose branch tip equals the base is fresh and kept", () => {
  const dir = mkdtempSync(join(tmpdir(), "tito-worktree-"));
  try {
    const repo = initRepo(dir);
    const wt = addWorktree(repo, dir, "feat/fresh", "wt-fresh");

    const result = runCli(repo, ["worktree", "tidy", "--confirm", "--root", repo]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /branch: feat\/fresh/);
    assert.match(result.stdout, /status: fresh/);
    assert.match(result.stdout, /removable: no/);
    assert.equal(result.stdout.includes("removed:"), false);
    assert.equal(existsSync(wt), true);
    assert.match(git(repo, ["show-ref", "--verify", "refs/heads/feat/fresh"]), /refs\/heads\/feat\/fresh/);
    assert.match(git(repo, ["show-ref", "--verify", "refs/heads/main"]), /refs\/heads\/main/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
