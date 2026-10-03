import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { pullRequestTemplate } from "../dist/core/git-flow.js";
import { applyUpgrade, planUpgrade, titoOwnedFiles } from "../dist/core/upgrade.js";

const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

test("upgrade replaces Tito files and leaves consumer rules", () => {
  const root = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  mkdirSync(join(root, ".cursor/rules"), { recursive: true });
  mkdirSync(join(root, ".cursor/agents"), { recursive: true });
  mkdirSync(join(root, ".cursor/skills/tito"), { recursive: true });
  mkdirSync(join(root, ".cursor/skills/project-skill"), { recursive: true });
  writeFileSync(join(root, ".cursor/rules/tourdef.mdc"), "consumer rule\n");
  writeFileSync(join(root, ".cursor/agents/elado-ui.md"), "consumer agent\n");
  writeFileSync(join(root, ".cursor/skills/project-skill/SKILL.md"), "consumer skill\n");
  writeFileSync(join(root, ".cursor/agents/tito-frontend.md"), "old tito agent\n");
  writeFileSync(join(root, ".cursor/skills/tito/SKILL.md"), "old tito skill\n");
  mkdirSync(join(root, ".github"), { recursive: true });
  writeFileSync(join(root, ".github/pull_request_template.md"), "old template\n");
  writeFileSync(
    join(root, "AGENTS.md"),
    "# Tourdef\n\nKeep this.\n\n# Tito bootstrap\n\nOld Tito text.\n",
  );

  const result = spawnSync(
    process.execPath,
    [cliPath, "upgrade", "--confirm", "--files-only", "--root", root],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(root, ".cursor/rules/tourdef.mdc"), "utf8"), "consumer rule\n");
  assert.equal(readFileSync(join(root, ".cursor/agents/elado-ui.md"), "utf8"), "consumer agent\n");
  assert.equal(
    readFileSync(join(root, ".cursor/skills/project-skill/SKILL.md"), "utf8"),
    "consumer skill\n",
  );
  const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
  assert.match(agents, /# Tourdef/);
  assert.match(agents, /Keep this/);
  assert.equal(agents.split("Confirm intent before clarifying").length - 1, 1);
  assert.equal(agents.split("Finishing a slice leaves the branch as it is.").length - 1, 1);
  assert.equal(agents.split("Review fixes lists every comment").length - 1, 1);
  assert.equal(agents.includes("Old Tito text."), false);
  assert.match(readFileSync(join(root, ".cursor/agents/tito-frontend.md"), "utf8"), /name: tito-frontend/);
  assert.match(readFileSync(join(root, ".cursor/skills/tito/SKILL.md"), "utf8"), /name: tito/);
  assert.equal(
    readFileSync(join(root, ".github/pull_request_template.md"), "utf8"),
    pullRequestTemplate(),
  );
  assert.equal(pullRequestTemplate().includes("Docs"), true);
  rmSync(root, { recursive: true, force: true });
});

test("upgrade merge fills only missing settings", async () => {
  const { missingSettings, mergeSettings } = await import("../dist/core/upgrade.js");
  const { parseConfig } = await import("../dist/core/config.js");
  const text = "schemaVersion: 1\nprofile: solo-balanced\nproduct:\n  screenLanguage: vi\n";
  const missing = missingSettings(parseConfig(text));
  assert.equal(missing.includes("autoPullRequest"), true);
  assert.equal(missing.includes("screenLanguage"), false);
  const merged = mergeSettings(text, { autoPullRequest: true, screenLanguage: "en" });
  const next = parseConfig(merged);
  assert.equal(next.git.autoPullRequest, true);
  assert.equal(next.product.screenLanguage, "vi");
  assert.equal(next.profile, "solo-balanced");
  assert.match(merged, /screenLanguage: vi/);
  assert.match(merged, /autoPullRequest: true/);
});

test("non-TTY upgrade does not require settings answers", { timeout: 5000 }, () => {
  const root = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  const original = "schemaVersion: 1\nprofile: solo-balanced\nproduct:\n  screenLanguage: vi\n";
  writeFileSync(join(root, "tito.yaml"), original);
  const result = spawnSync(
    process.execPath,
    [cliPath, "upgrade", "--confirm", "--files-only", "--root", root],
    { encoding: "utf8", input: "" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(root, "tito.yaml"), "utf8"), original);
  rmSync(root, { recursive: true, force: true });
});

test("[integration] WP-8 upgrade replaces Tito surfaces and keeps outside text", () => {
  const root = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  try {
    mkdirSync(join(root, ".cursor/agents"), { recursive: true });
    mkdirSync(join(root, ".cursor/skills/tito"), { recursive: true });
    mkdirSync(join(root, ".cursor/skills/project-skill"), { recursive: true });
    writeFileSync(
      join(root, ".cursor/agents/tito-frontend.md"),
      "old card\n- `angular` (stack)\n",
    );
    writeFileSync(join(root, ".cursor/skills/tito/SKILL.md"), "old tito skill\n");
    writeFileSync(join(root, ".cursor/skills/project-skill/SKILL.md"), "consumer skill\n");
    const above = "Project notes stay.\n";
    const below = "\nMore project notes.\n";
    writeFileSync(
      join(root, "AGENTS.md"),
      `${above}<!-- tito:bootstrap start -->\nOld Tito text.\n<!-- tito:bootstrap end -->${below}`,
    );

    const owned = titoOwnedFiles();
    applyUpgrade(root, planUpgrade(root, owned));

    const frontend = readFileSync(join(root, ".cursor/agents/tito-frontend.md"), "utf8");
    const shippedFrontend = owned.find((file) => file.path === ".cursor/agents/tito-frontend.md");
    assert.equal(frontend, shippedFrontend.body);
    assert.equal(frontend.includes("angular"), false);
    assert.match(frontend, /`official-stack-sources` \(stack\)/);
    const skill = readFileSync(join(root, ".cursor/skills/tito/SKILL.md"), "utf8");
    const shippedSkill = owned.find((file) => file.path === ".cursor/skills/tito/SKILL.md");
    assert.equal(skill, shippedSkill.body);
    assert.match(skill, /Research, then judge/);
    assert.equal(
      readFileSync(join(root, ".cursor/skills/project-skill/SKILL.md"), "utf8"),
      "consumer skill\n",
    );
    const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
    assert.equal(agents.startsWith(above), true);
    assert.equal(agents.endsWith(below), true);
    assert.equal(agents.includes("Old Tito text."), false);
    assert.match(agents, /official sources/);
    assert.match(agents, /judge/);

    const again = planUpgrade(root, titoOwnedFiles());
    assert.equal(
      again.every((file) => file.action === "keep"),
      true,
      again.filter((file) => file.action !== "keep").map((file) => file.path).join(", "),
    );

    const appendRoot = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
    try {
      const notes = "Project notes with no Tito heading.\n";
      writeFileSync(join(appendRoot, "AGENTS.md"), notes);
      applyUpgrade(appendRoot, planUpgrade(appendRoot, titoOwnedFiles()));
      const appended = readFileSync(join(appendRoot, "AGENTS.md"), "utf8");
      const marker = appended.indexOf("<!-- tito:bootstrap start -->");
      assert.equal(appended.includes(notes.trimEnd()), true);
      assert.ok(marker > appended.indexOf(notes.trimEnd()));
      assert.equal(notes.includes("# Tito bootstrap"), false);
      assert.equal(notes.includes("<!-- tito:bootstrap"), false);
    } finally {
      rmSync(appendRoot, { recursive: true, force: true });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
