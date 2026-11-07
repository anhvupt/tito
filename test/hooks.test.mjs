import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

async function hooks() {
  return import("../dist/core/hooks.js");
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return (result.stdout ?? "").trim();
}

function initRepo(branch = "main") {
  const root = mkdtempSync(join(tmpdir(), "tito-hook-"));
  git(root, ["init", "-b", branch]);
  git(root, ["config", "user.email", "tito@example.com"]);
  git(root, ["config", "user.name", "Tito"]);
  writeFileSync(join(root, "README.md"), "base\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "base"]);
  return root;
}

function runHook(payload, cwd = process.cwd()) {
  return spawnSync(process.execPath, [cliPath, "hook", "before-shell"], {
    cwd,
    encoding: "utf8",
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

function named(verdict) {
  return `${verdict.user_message ?? ""} ${verdict.agent_message ?? ""}`;
}

test("H1 git push origin main on feat/x asks and names main", async () => {
  const { decideShell } = await hooks();
  const verdict = decideShell("git push origin main", "feat/x");
  assert.equal(verdict.permission, "ask");
  assert.match(named(verdict), /main/);
});

test("H2 git push on develop asks", async () => {
  const { decideShell } = await hooks();
  assert.equal(decideShell("git push", "develop").permission, "ask");
});

test("H3 git push -u origin feat/x on feat/x allows", async () => {
  const { decideShell } = await hooks();
  assert.equal(decideShell("git push -u origin feat/x", "feat/x").permission, "allow");
});

test("H4 git push origin HEAD:master asks", async () => {
  const { decideShell } = await hooks();
  assert.equal(decideShell("git push origin HEAD:master", "feat/x").permission, "ask");
});

test("H5 git push --force origin feat/x asks", async () => {
  const { decideShell } = await hooks();
  assert.equal(decideShell("git push --force origin feat/x", "feat/x").permission, "ask");
});

test("H6 git merge feat/x on main asks", async () => {
  const { decideShell } = await hooks();
  assert.equal(decideShell("git merge feat/x", "main").permission, "ask");
});

test("H7 git merge main on feat/x allows", async () => {
  const { decideShell } = await hooks();
  assert.equal(decideShell("git merge main", "feat/x").permission, "allow");
});

test("H8 gh pr merge asks unless autoMerge is true", async () => {
  const { decideShell } = await hooks();
  assert.equal(decideShell("gh pr merge 12 --squash", "feat/x").permission, "ask");
  assert.equal(decideShell("gh pr merge 12 --squash", "feat/x", true).permission, "allow");
});

test("H9 gh pr review --approve denies", async () => {
  const { decideShell } = await hooks();
  const verdict = decideShell("gh pr review 12 --approve", "feat/x");
  assert.equal(verdict.permission, "deny");
  assert.match(named(verdict), /Tito never approves a pull request/);
});

test("H10 npm publish --access public asks", async () => {
  const { decideShell } = await hooks();
  assert.equal(decideShell("npm publish --access public", "feat/x").permission, "ask");
});

test("H11 npm test && git push origin main asks", async () => {
  const { decideShell } = await hooks();
  assert.equal(decideShell("npm test && git push origin main", "feat/x").permission, "ask");
});

test("H12 echo quoted git push origin main allows", async () => {
  const { decideShell } = await hooks();
  assert.equal(decideShell('echo "git push origin main"', "feat/x").permission, "allow");
});

test("H13 git status allows", async () => {
  const { decideShell } = await hooks();
  assert.equal(decideShell("git status", "feat/x").permission, "allow");
});

test("[integration] H14 CLI stdin gh pr review -a denies and exits 0", () => {
  const root = initRepo();
  try {
    const run = runHook({ command: "gh pr review 1 -a", cwd: root }, root);
    assert.equal(run.status, 0);
    assert.equal(JSON.parse(run.stdout).permission, "deny");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("[integration] H15 CLI stdin not json allows, exits 0, stderr reason", () => {
  const run = runHook("not json");
  assert.equal(run.status, 0);
  assert.equal(JSON.parse(run.stdout).permission, "allow");
  assert.match(run.stderr, /./);
});

test("[integration] H16 CLI git push in tmp repo on main asks", () => {
  const root = initRepo("main");
  try {
    const run = runHook({ command: "git push", cwd: root }, root);
    assert.equal(run.status, 0);
    assert.equal(JSON.parse(run.stdout).permission, "ask");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("edge git push origin main-fix allows", async () => {
  const { decideShell } = await hooks();
  assert.equal(decideShell("git push origin main-fix", "feat/x").permission, "allow");
});

test("edge git -C x push origin main asks", async () => {
  const { decideShell } = await hooks();
  assert.equal(decideShell("git -C x push origin main", "feat/x").permission, "ask");
});

test("edge MAIN is not a base", async () => {
  const { decideShell } = await hooks();
  assert.equal(decideShell("git push origin MAIN", "feat/x").permission, "allow");
  assert.equal(decideShell("git push", "MAIN").permission, "allow");
  assert.equal(decideShell("git merge feat/x", "MAIN").permission, "allow");
});
