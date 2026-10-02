import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { addRepo } from "../dist/core/admin.js";
import {
  buildRetro,
  countPrefixMisses,
  countReviewOutcomes,
  isoWeekId,
  weekRange,
} from "../dist/core/retro.js";

const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const PREFIX_RULE = "A commit subject is `<type>: <sentence>`.";

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], { encoding: "utf8" });
}

function git(cwd, args, env = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function initRepo(repo) {
  git(repo, ["init"]);
  git(repo, ["config", "user.email", "tito@example.com"]);
  git(repo, ["config", "user.name", "Tito"]);
}

test("[unit] a rule counts only after it landed", () => {
  // Arrange
  const range = weekRange("2026-W40", "UTC");
  const commits = [
    { subject: "ship the notes", date: "2026-09-30T01:00:00Z" },
    { subject: "ship the notes again", date: "2026-09-30T23:00:00Z" },
    { subject: "ship the notes late", date: "2026-10-02T12:00:00Z" },
    { subject: "feat: ship the notes", date: "2026-10-02T15:00:00Z" },
  ];

  // Act
  const misses = countPrefixMisses(commits, "2026-10-01T00:00:00Z", range);

  // Assert
  assert.equal(range.start.toISOString(), "2026-09-28T00:00:00.000Z");
  assert.equal(range.end.toISOString(), "2026-10-05T00:00:00.000Z");
  assert.ok(commits.every((commit) => {
    const at = Date.parse(commit.date);
    return at >= range.start.getTime() && at < range.end.getTime();
  }));
  assert.equal(misses, 1);
  assert.equal(countPrefixMisses(commits, null, range), 0);
});

test("[unit] merge commits are not prefix misses", () => {
  const range = weekRange("2026-W40", "UTC");
  const misses = countPrefixMisses(
    [
      { subject: "Merge pull request #12 from a/b", date: "2026-10-02T12:00:00Z" },
      { subject: "Merge branch 'main' into feat", date: "2026-10-02T13:00:00Z" },
    ],
    "2026-10-01T00:00:00Z",
    range,
  );
  assert.equal(misses, 0);
  for (const subject of [
    "feat: add a note",
    "fix: reject a duplicate",
    "hot-fix: stop a bad build",
    "chores: record the rule",
    "refactor: split the parser",
    "debug: trace the week",
  ]) {
    assert.equal(
      countPrefixMisses([{ subject, date: "2026-10-02T12:00:00Z" }], "2026-10-01T00:00:00Z", range),
      0,
      subject,
    );
  }
});

test("[unit] Sunday 2026-10-04 23:30 Asia/Ho_Chi_Minh is ISO week 2026-W40", () => {
  const instant = new Date("2026-10-04T23:30:00+07:00");
  assert.equal(isoWeekId(instant, "Asia/Ho_Chi_Minh"), "2026-W40");
  const range = weekRange("2026-W40", "Asia/Ho_Chi_Minh");
  assert.ok(instant.getTime() >= range.start.getTime());
  assert.ok(instant.getTime() < range.end.getTime());
});

test("[unit] review texts count accepted, unknown, and expanded", () => {
  // Arrange
  const texts = [
    "---\noutcome: accepted\n---\nShip it.\n",
    "No front matter here.\n",
    "---\noutcome: expanded\n---\nWider than the plan.\n",
  ];

  // Act
  const outcomes = countReviewOutcomes(texts);

  // Assert
  assert.deepEqual(outcomes, {
    accepted: 1,
    edited: 0,
    expanded: 1,
    unknown: 1,
  });
});

test("[unit] a missing repo does not stop the others", () => {
  const admin = mkdtempSync(join(tmpdir(), "tito-retro-admin-"));
  const present = mkdtempSync(join(tmpdir(), "tito-retro-repo-"));
  const missing = join(admin, "gone");
  const reviewText = "---\noutcome: accepted\n---\nLooks good.\n";
  try {
    writeFileSync(join(present, "tito.yaml"), "schemaVersion: 1\nprofile: client-careful\n");
    writeFileSync(
      join(admin, "repos.json"),
      `${JSON.stringify(
        [
          { path: resolve(present), addedAt: "2026-01-01T00:00:00.000Z" },
          { path: resolve(missing), addedAt: "2026-01-02T00:00:00.000Z" },
        ],
        null,
        2,
      )}\n`,
    );
    const files = [
      "1.ts",
      "2.ts",
      "3.ts",
      "4.ts",
      "5.ts",
      "6.ts",
      ".tito/feedback/slice-two/review.md",
      ".env",
    ];
    const git = (cwd, args) => {
      assert.equal(cwd, resolve(present));
      if (args[0] === "log" && args.includes("AGENTS.md")) {
        return `landed1\u00002026-10-01T00:00:00Z\n`;
      }
      if (args[0] === "log") {
        return [
          "◆merge1\u0000Merge pull request #4 from a/b\u00002026-10-03T12:00:00Z",
          "",
          "◆feat1\u0000Update the notes\u00002026-10-02T12:00:00Z",
          ...files,
          "",
        ].join("\n");
      }
      if (args[0] === "show" && args[1] === "landed1:AGENTS.md") return `${PREFIX_RULE}\n`;
      if (args[0] === "show" && args[1] === "feat1:.tito/feedback/slice-two/review.md") {
        return reviewText;
      }
      throw new Error(`unexpected git args: ${args.join(" ")}`);
    };

    const report = buildRetro({
      adminRoot: admin,
      week: "2026-W40",
      timezone: "UTC",
      git,
    });

    assert.equal(report.prefixMisses, 1);
    assert.equal(report.sliceOverLimit, 1);
    assert.equal(report.merged, 1);
    assert.deepEqual(report.outcomes, { accepted: 1, edited: 0, expanded: 0, unknown: 0 });
    assert.deepEqual(report.repos, [
      { path: resolve(present) },
      { path: resolve(missing), missing: true },
    ]);
    assert.equal(JSON.stringify(report).includes("Looks good"), false);
    assert.equal(JSON.stringify(report).includes("diff --git"), false);
    assert.equal(JSON.stringify(report).includes(".env"), false);
  } finally {
    rmSync(admin, { recursive: true, force: true });
    rmSync(present, { recursive: true, force: true });
  }
});

test("[integration] --week nope and 2026-W60 exit non-zero without a registered repo", () => {
  const admin = mkdtempSync(join(tmpdir(), "tito-retro-admin-"));
  try {
    for (const week of ["nope", "2026-W60"]) {
      const result = runCli(["admin", "retro", "--week", week, "--admin-root", admin]);
      assert.notEqual(result.status, 0, result.stderr);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, new RegExp(week));
      assert.equal(/git/i.test(result.stderr), false);
    }
    assert.equal(existsSync(join(admin, "repos.json")), false);
    assert.equal(existsSync(join(admin, "retros")), false);
  } finally {
    rmSync(admin, { recursive: true, force: true });
  }
});

test("[unit] admin help lists retro", () => {
  const help = runCli(["--help"]);
  assert.equal(help.status, 0);
  assert.match(
    help.stdout,
    /tito admin retro \[--week <YYYY-Www>\] \[--timezone <IANA>\] \[--json\] \[--admin-root <path>\]/,
  );
});

test("[integration] T9 a quiet week stays quiet", () => {
  // Arrange
  const admin = mkdtempSync(join(tmpdir(), "tito-retro-admin-"));
  const repo = mkdtempSync(join(repoRoot, ".tmp-tito-retro-"));
  try {
    initRepo(repo);
    writeFileSync(join(repo, "note.txt"), "outside the week\n");
    git(repo, ["add", "note.txt"]);
    git(repo, ["commit", "-m", "feat: note from june"], {
      GIT_AUTHOR_DATE: "2026-06-15T12:00:00Z",
      GIT_COMMITTER_DATE: "2026-06-15T12:00:00Z",
    });
    addRepo(admin, repo, { clock: () => "2026-01-01T00:00:00.000Z" });

    // Act
    const result = runCli([
      "admin",
      "retro",
      "--json",
      "--week",
      "2026-W40",
      "--admin-root",
      admin,
    ]);

    // Assert
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.alerts, []);
    assert.equal(report.summary, "No Tito activity this week.");
  } finally {
    rmSync(admin, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

test("[integration] T10 JSON is machine-readable and saved by week", () => {
  // Arrange
  const admin = mkdtempSync(join(tmpdir(), "tito-retro-admin-"));
  const repo = mkdtempSync(join(repoRoot, ".tmp-tito-retro-"));
  try {
    initRepo(repo);
    writeFileSync(join(repo, "note.txt"), "inside the week\n");
    git(repo, ["add", "note.txt"]);
    git(repo, ["commit", "-m", "feat: record a week"], {
      GIT_AUTHOR_DATE: "2026-10-01T12:00:00Z",
      GIT_COMMITTER_DATE: "2026-10-01T12:00:00Z",
    });
    addRepo(admin, repo, { clock: () => "2026-01-01T00:00:00.000Z" });

    // Act
    const result = runCli([
      "admin",
      "retro",
      "--json",
      "--week",
      "2026-W40",
      "--timezone",
      "UTC",
      "--admin-root",
      admin,
    ]);

    // Assert
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes("Hola"), false);
    const report = JSON.parse(result.stdout);
    assert.equal(report.source, "local");
    assert.equal(report.reviewFixes, "unavailable");
    assert.equal(report.week, "2026-W40");
    assert.equal(report.timezone, "UTC");
    const jsonPath = join(admin, "retros", "2026-W40.json");
    const markdownPath = join(admin, "retros", "2026-W40.md");
    assert.equal(existsSync(jsonPath), true);
    assert.equal(existsSync(markdownPath), true);
    assert.deepEqual(JSON.parse(readFileSync(jsonPath, "utf8")), report);
  } finally {
    rmSync(admin, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});
