import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return (result.stdout ?? "").trim();
}

function initRepo() {
  const root = mkdtempSync(join(tmpdir(), "tito-test-first-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "tito@example.com"]);
  git(root, ["config", "user.name", "Tito"]);
  writeFileSync(join(root, "README.md"), "base\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "base"]);
  git(root, ["checkout", "-b", "feat/slice"]);
  return root;
}

function write(root, path, body) {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, body);
}

function commit(root, paths, message) {
  git(root, ["add", ...paths]);
  git(root, ["commit", "-m", message]);
  return git(root, ["rev-parse", "HEAD"]);
}

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], { encoding: "utf8" });
}

test("[unit] guard fails when commit 1 touches a file outside the test list", async () => {
  const root = initRepo();
  try {
    write(root, "test/guard.test.mjs", "test\n");
    write(root, "src/app.ts", "app\n");
    const first = commit(root, ["test/guard.test.mjs", "src/app.ts"], "commit 1");
    const { guardTestFirst } = await import("../dist/core/test-first.js");
    const report = guardTestFirst({
      root,
      base: "main",
      testFiles: ["test/guard.test.mjs"],
    });
    assert.equal(report.ok, false);
    assert.equal(report.retry, false);
    assert.equal(report.file, "src/app.ts");
    assert.equal(report.commit, first);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("[unit] guard fails when commit 1 changes a test file that is not listed", async () => {
  const root = initRepo();
  try {
    write(root, "test/guard.test.mjs", "listed\n");
    write(root, "test/other.test.mjs", "unlisted\n");
    const first = commit(
      root,
      ["test/guard.test.mjs", "test/other.test.mjs"],
      "commit 1",
    );
    const { guardTestFirst } = await import("../dist/core/test-first.js");
    const report = guardTestFirst({
      root,
      base: "main",
      testFiles: ["test/guard.test.mjs"],
    });
    assert.equal(report.ok, false);
    assert.equal(report.retry, false);
    assert.equal(report.file, "test/other.test.mjs");
    assert.equal(report.commit, first);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("[unit] guard fails when a later commit edits a test file", async () => {
  const { guardTestFirst } = await import("../dist/core/test-first.js");
  for (const file of ["test/guard.test.mjs", "src/widget.test.ts", "src/widget.spec.ts"]) {
    const root = initRepo();
    try {
      write(root, "test/guard.test.mjs", "one\n");
      const first = commit(root, ["test/guard.test.mjs"], "commit 1");
      write(root, file, "two\n");
      write(root, "src/ok.ts", "ok\n");
      const second = commit(root, [file, "src/ok.ts"], "commit 2");
      const report = guardTestFirst({
        root,
        base: "main",
        testFiles: ["test/guard.test.mjs"],
      });
      assert.equal(report.ok, false, file);
      assert.equal(report.retry, false, file);
      assert.equal(report.file, file, file);
      assert.equal(report.commit, second, file);
      assert.notEqual(report.commit, first, file);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("[unit] guard passes when later commits leave test files untouched", async () => {
  const root = initRepo();
  try {
    write(root, "test/guard.test.mjs", "one\n");
    write(root, "test/git-flow.test.mjs", "flow\n");
    commit(root, ["test/guard.test.mjs", "test/git-flow.test.mjs"], "commit 1");
    write(root, "src/core/test-first.ts", "export {}\n");
    commit(root, ["src/core/test-first.ts"], "commit 2");
    write(root, "README.md", "docs\n");
    commit(root, ["README.md"], "commit 3");
    const { guardTestFirst } = await import("../dist/core/test-first.js");
    const report = guardTestFirst({
      root,
      base: "main",
      testFiles: ["test/guard.test.mjs", "test/git-flow.test.mjs"],
    });
    assert.equal(report.ok, true);
    assert.equal(report.retry, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("[integration] tito guard test-first names the offending file and commit", () => {
  const root = initRepo();
  try {
    write(root, "test/guard.test.mjs", "test\n");
    write(root, "src/app.ts", "app\n");
    const first = commit(root, ["test/guard.test.mjs", "src/app.ts"], "commit 1");
    const run = runCli([
      "guard",
      "test-first",
      "--base",
      "main",
      "--root",
      root,
      "--test",
      "test/guard.test.mjs",
    ]);
    assert.equal(run.status, 1);
    assert.equal(
      run.stdout,
      [
        "ok: false",
        "retry: false",
        "file: src/app.ts",
        `commit: ${first}`,
        "message: Commit 1 changes src/app.ts, which is outside the listed test files.",
        "",
      ].join("\n"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("[integration] tito guard test-first passes a clean slice", () => {
  const root = initRepo();
  try {
    write(root, "test/guard.test.mjs", "test\n");
    commit(root, ["test/guard.test.mjs"], "commit 1");
    write(root, "src/ok.ts", "ok\n");
    commit(root, ["src/ok.ts"], "commit 2");
    const run = runCli([
      "guard",
      "test-first",
      "--base",
      "main",
      "--root",
      root,
      "--test",
      "test/guard.test.mjs",
    ]);
    assert.equal(run.status, 0);
    assert.equal(run.stderr, "");
    assert.equal(run.stdout, "ok: true\nretry: false\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("[integration] help lists tito guard test-first", () => {
  const help = runCli(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /tito guard test-first/);
});
