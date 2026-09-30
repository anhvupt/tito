import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  AdminError,
  addRepo,
  isSecretFilename,
  listRepos,
  loadContexts,
  refreshRepos,
  removeRepo,
  resolveAdminRoot,
} from "../dist/core/admin.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function adminFixture() {
  const root = mkdtempSync(join(tmpdir(), "tito-admin-"));
  return {
    root,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test("resolveAdminRoot defaults under the home config path", () => {
  const explicit = resolve("/tmp/tito-admin-explicit");
  assert.equal(resolveAdminRoot(explicit), explicit);
  assert.match(resolveAdminRoot(), /\.config[/\\]tito[/\\]admin$/);
});

test("add list remove keep duplicates and skip real home", () => {
  const admin = adminFixture();
  const repoA = mkdtempSync(join(tmpdir(), "tito-repo-a-"));
  const repoB = mkdtempSync(join(tmpdir(), "tito-repo-b-"));
  try {
    const first = addRepo(admin.root, repoA, { clock: () => "2026-01-01T00:00:00.000Z" });
    assert.equal(first.created, true);
    assert.equal(first.repo.path, resolve(repoA));
    assert.equal(first.repo.addedAt, "2026-01-01T00:00:00.000Z");

    const duplicate = addRepo(admin.root, repoA, { clock: () => "2026-02-02T00:00:00.000Z" });
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.repo.addedAt, "2026-01-01T00:00:00.000Z");

    addRepo(admin.root, repoB, { clock: () => "2026-01-03T00:00:00.000Z" });
    const listed = listRepos(admin.root);
    assert.equal(listed.length, 2);
    assert.deepEqual(
      listed.map((repo) => repo.path),
      [resolve(repoA), resolve(repoB)],
    );

    const removed = removeRepo(admin.root, repoA);
    assert.equal(removed.path, resolve(repoA));
    assert.deepEqual(
      listRepos(admin.root).map((repo) => repo.path),
      [resolve(repoB)],
    );
    assert.throws(
      () => removeRepo(admin.root, repoA),
      (error) => error instanceof AdminError && error.code === "not-registered",
    );
  } finally {
    admin.cleanup();
    rmSync(repoA, { recursive: true, force: true });
    rmSync(repoB, { recursive: true, force: true });
  }
});

test("refresh stores subjects dates and filtered paths without diffs", () => {
  const admin = adminFixture();
  const repo = mkdtempSync(join(tmpdir(), "tito-repo-refresh-"));
  try {
    writeFileSync(
      join(admin.root, "repos.json"),
      `${JSON.stringify([{ path: resolve(repo), addedAt: "2026-01-01T00:00:00.000Z" }], null, 2)}\n`,
    );
    const injected = (cwd, args) => {
      assert.equal(cwd, resolve(repo));
      if (args[0] === "rev-parse") return "feat/local-admin\n";
      if (args[0] === "log") {
        return [
          "◆First change\u00002026-01-01T10:00:00+00:00",
          "src/cli.ts",
          ".env",
          ".env.local",
          "credentials.json",
          "id_rsa",
          "README.md",
          "",
          "◆Second change\u00002026-01-02T11:00:00+00:00",
          "src/core/admin.ts",
          "",
        ].join("\n");
      }
      throw new Error(`unexpected git args: ${args.join(" ")}`);
    };
    const contexts = refreshRepos(admin.root, { git: injected });
    assert.equal(contexts.length, 1);
    assert.equal(contexts[0].path, resolve(repo));
    assert.equal(contexts[0].branch, "feat/local-admin");
    assert.deepEqual(contexts[0].recentCommits, [
      {
        subject: "First change",
        date: "2026-01-01T10:00:00+00:00",
        files: ["src/cli.ts", "README.md"],
      },
      {
        subject: "Second change",
        date: "2026-01-02T11:00:00+00:00",
        files: ["src/core/admin.ts"],
      },
    ]);
    const stored = loadContexts(admin.root);
    assert.deepEqual(stored, contexts);
    assert.equal(JSON.stringify(stored).includes("diff --git"), false);
    assert.equal(isSecretFilename(".env"), true);
    assert.equal(isSecretFilename(".env.local"), true);
    assert.equal(isSecretFilename("credentials.json"), true);
    assert.equal(isSecretFilename("id_rsa"), true);
    assert.equal(isSecretFilename("src/cli.ts"), false);
  } finally {
    admin.cleanup();
    rmSync(repo, { recursive: true, force: true });
  }
});

test("refresh can read a real local git repository", () => {
  const admin = adminFixture();
  const tmpRepo = join(repoRoot, `.tmp-tito-admin-${process.pid}`);
  rmSync(tmpRepo, { recursive: true, force: true });
  mkdirSync(tmpRepo, { recursive: true });
  const git = (args) => {
    const result = spawnSync("git", args, { cwd: tmpRepo, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  try {
    git(["init"]);
    git(["config", "user.email", "tito@example.com"]);
    git(["config", "user.name", "Tito"]);
    writeFileSync(join(tmpRepo, "note.txt"), "one\n");
    writeFileSync(join(tmpRepo, ".env"), "SECRET=1\n");
    git(["add", "note.txt", ".env"]);
    git(["commit", "-m", "Add note and env"]);
    writeFileSync(join(tmpRepo, "note.txt"), "two\n");
    git(["add", "note.txt"]);
    git(["commit", "-m", "Update note"]);

    addRepo(admin.root, tmpRepo, { clock: () => "2026-03-01T00:00:00.000Z" });
    const contexts = refreshRepos(admin.root);
    assert.equal(contexts.length, 1);
    assert.equal(contexts[0].path, resolve(tmpRepo));
    assert.ok(contexts[0].branch.length > 0);
    assert.equal(contexts[0].recentCommits.length, 2);
    assert.equal(contexts[0].recentCommits[0].subject, "Update note");
    assert.deepEqual(contexts[0].recentCommits[0].files, ["note.txt"]);
    assert.equal(contexts[0].recentCommits[1].subject, "Add note and env");
    assert.deepEqual(contexts[0].recentCommits[1].files, ["note.txt"]);
    assert.equal(existsSync(join(admin.root, "context.json")), true);
    assert.equal(readFileSync(join(admin.root, "context.json"), "utf8").includes("SECRET"), false);
  } finally {
    admin.cleanup();
    rmSync(tmpRepo, { recursive: true, force: true });
  }
});
