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
  writeFileSync(join(root, ".cursor/rules/pull-request.mdc"), "old layout\n");
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
  assert.equal(
    agents.split("The implementation handoff names the skills it will read.").length - 1,
    1,
  );
  assert.equal(agents.split("Review fixes lists every comment").length - 1, 0);
  const pullRequestRule = readFileSync(join(root, ".cursor/rules/pull-request.mdc"), "utf8");
  assert.equal(pullRequestRule.includes("old layout"), false);
  assert.match(pullRequestRule, /^---\n/);
  assert.match(pullRequestRule, /description:/);
  assert.match(pullRequestRule, /globs:/);
  assert.match(pullRequestRule, /alwaysApply:\s*false/);
  assert.match(pullRequestRule, /Review fixes lists every comment/);
  assert.match(pullRequestRule, /A pull request description has four parts/);
  for (const name of ["screen-language.mdc", "init-upgrade-admin.mdc", "commit-branch.mdc"]) {
    const body = readFileSync(join(root, ".cursor/rules", name), "utf8");
    assert.match(body, /^---\n/);
    assert.match(body, /description:/);
    assert.match(body, /alwaysApply:\s*false/);
  }
  assert.match(
    readFileSync(join(root, ".cursor/rules/screen-language.mdc"), "utf8"),
    /screenLanguage: vi/,
  );
  assert.match(
    readFileSync(join(root, ".cursor/rules/screen-language.mdc"), "utf8"),
    /timestamps in UTC/,
  );
  assert.match(
    readFileSync(join(root, ".cursor/rules/init-upgrade-admin.mdc"), "utf8"),
    /tito init --confirm/,
  );
  assert.match(
    readFileSync(join(root, ".cursor/rules/init-upgrade-admin.mdc"), "utf8"),
    /tito admin add/,
  );
  assert.match(
    readFileSync(join(root, ".cursor/rules/commit-branch.mdc"), "utf8"),
    /A commit subject is/,
  );
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

test("[unit] upgrade of an old AGENTS.md installs the decision-authority rule", () => {
  const root = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  try {
    writeFileSync(join(root, "AGENTS.md"), "# Tito bootstrap\n\nOld Tito text.\n");
    const result = spawnSync(
      process.execPath,
      [cliPath, "upgrade", "--confirm", "--files-only", "--root", root],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
    assert.equal(agents.includes("Old Tito text."), false);
    assert.match(agents, /decides small and medium/);
    assert.match(agents, /`client-careful` still asks for medium/);
    assert.match(agents, /premium-model fan-out/);
    assert.match(agents, /`Decided:`/);
    assert.equal(agents.split("show the test cases").length - 1, 1);
    assert.match(agents, /Agent mode does not approve it/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("[unit] UT-3 a current bootstrap is kept", async () => {
  const { titoBootstrapBlock } = await import("../dist/core/plan.js");
  const root = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  try {
    writeFileSync(join(root, "AGENTS.md"), titoBootstrapBlock());
    const agents = planUpgrade(root, []).find((file) => file.path === "AGENTS.md");
    assert.equal(agents?.action, "keep");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
  const after = readFileSync(join(root, "tito.yaml"), "utf8");
  assert.equal(after.startsWith(original), true, after);
  assert.equal(after.includes("autoPullRequest"), false);
  rmSync(root, { recursive: true, force: true });
});

const DEFAULT_MODELS = {
  explorer: "cursor-grok-4.6-medium-fast",
  planner: "grok-4.7-high",
  advisor: "claude-opus-5-5-medium",
  implementer: "cursor-grok-4.6-high",
  reviewer: "grok-4.7-high",
  finisher: "composer-2.5",
};

function upgradeFilesOnly(root) {
  return spawnSync(
    process.execPath,
    [cliPath, "upgrade", "--confirm", "--files-only", "--root", root],
    { encoding: "utf8", input: "" },
  );
}

function cardModel(root, name) {
  return readFileSync(join(root, ".cursor/agents", name), "utf8").match(/^model: (.+)$/m)?.[1];
}

test("[integration] PM-7 upgrade adds default models and replaces inherit cards", async () => {
  const { parseConfig } = await import("../dist/core/config.js");
  const root = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  try {
    mkdirSync(join(root, ".cursor/agents"), { recursive: true });
    for (const name of ["tito-backend.md", "tito-architect.md", "tito-qa.md", "tito-explorer.md"]) {
      writeFileSync(join(root, ".cursor/agents", name), "---\nname: old\nmodel: inherit\n---\n");
    }
    writeFileSync(join(root, "tito.yaml"), "schemaVersion: 1\nprofile: solo-balanced\n");
    const result = upgradeFilesOnly(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /tito\.yaml: replace/);
    assert.deepEqual(parseConfig(readFileSync(join(root, "tito.yaml"), "utf8")).models, DEFAULT_MODELS);
    for (const card of titoOwnedFiles().filter((file) => file.path.startsWith(".cursor/agents/"))) {
      const body = readFileSync(join(root, card.path), "utf8");
      assert.equal(body.includes("model: inherit"), false, card.path);
    }
    assert.equal(cardModel(root, "tito-backend.md"), DEFAULT_MODELS.implementer);
    assert.equal(cardModel(root, "tito-architect.md"), DEFAULT_MODELS.planner);
    assert.equal(cardModel(root, "tito-qa.md"), DEFAULT_MODELS.reviewer);
    assert.equal(cardModel(root, "tito-explorer.md"), DEFAULT_MODELS.explorer);
    assert.equal(cardModel(root, "tito-tech-docs.md"), DEFAULT_MODELS.finisher);

    const again = upgradeFilesOnly(root);
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /tito\.yaml: keep/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("[integration] PM-8 upgrade keeps an existing models value and pins it", async () => {
  const { parseConfig } = await import("../dist/core/config.js");
  const root = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  try {
    writeFileSync(
      join(root, "tito.yaml"),
      "schemaVersion: 1\nprofile: solo-balanced\nmodels:\n  planner: gpt-5.6-sol-high\n  implementer: gpt-5.3-codex\n",
    );
    const result = upgradeFilesOnly(root);
    assert.equal(result.status, 0, result.stderr);
    const models = parseConfig(readFileSync(join(root, "tito.yaml"), "utf8")).models;
    assert.deepEqual(models, {
      ...DEFAULT_MODELS,
      planner: "gpt-5.6-sol-high",
      implementer: "gpt-5.3-codex",
    });
    assert.equal(cardModel(root, "tito-architect.md"), "gpt-5.6-sol-high");
    assert.equal(cardModel(root, "tito-backend.md"), "gpt-5.3-codex");
    assert.equal(cardModel(root, "tito-qa.md"), DEFAULT_MODELS.reviewer);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("[integration] M6 upgrade missing autoMerge asks only that and keeps other settings", async () => {
  const { missingSettings, mergeSettings } = await import("../dist/core/upgrade.js");
  const { parseConfig } = await import("../dist/core/config.js");
  const { promptForSettings } = await import("../dist/core/init.js");
  const text = [
    "schemaVersion: 1",
    "profile: solo-balanced",
    "git:",
    "  defaultBase: develop",
    "  autoPullRequest: true",
    "product:",
    "  screenLanguage: vi",
    "  tenancy: single",
    "  surfaces:",
    "    - id: admin",
    "",
  ].join("\n");
  const missing = missingSettings(parseConfig(text));
  assert.deepEqual(missing, ["autoMerge"]);
  const prompts = [];
  const answers = await promptForSettings(async (prompt) => {
    prompts.push(prompt);
    return "n";
  }, missing);
  assert.deepEqual(prompts, ["Auto-merge a slice pull request after checks pass? [y/N] "]);
  assert.equal(answers.autoMerge, false);
  const merged = mergeSettings(text, answers);
  const next = parseConfig(merged);
  assert.equal(next.git.autoMerge, false);
  assert.equal(next.git.autoPullRequest, true);
  assert.equal(next.git.defaultBase, "develop");
  assert.equal(next.product.screenLanguage, "vi");
  assert.equal(next.product.tenancy, "single");
  assert.deepEqual(
    next.product.surfaces.map((surface) => surface.id),
    ["admin"],
  );
  assert.equal(next.profile, "solo-balanced");
});

test("[unit] PM-9 settings merge keeps models and fills missing roles", async () => {
  const { mergeSettings } = await import("../dist/core/upgrade.js");
  const { parseConfig } = await import("../dist/core/config.js");
  const text = "schemaVersion: 1\nprofile: solo-balanced\nmodels:\n  planner: gpt-5.6-sol-high\n";
  const merged = parseConfig(mergeSettings(text, { autoPullRequest: true }));
  assert.equal(merged.git.autoPullRequest, true);
  assert.deepEqual(merged.models, { ...DEFAULT_MODELS, planner: "gpt-5.6-sol-high" });
});

test("[unit] AD-3 upgrade of a yaml that has planner but no advisor adds advisor and keeps planner", async () => {
  const { addMissingModels } = await import("../dist/core/upgrade.js");
  const { parseConfig } = await import("../dist/core/config.js");
  const text =
    "schemaVersion: 1\nprofile: solo-balanced\nmodels:\n  planner: gpt-5.6-sol-high\n";
  const next = addMissingModels(text);
  assert.notEqual(next, null);
  const models = parseConfig(next).models;
  assert.equal(models.advisor, "claude-opus-5-5-medium");
  assert.equal(models.planner, "gpt-5.6-sol-high");
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
    assert.match(skill, /name: tito/);
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

const TOPIC_RULES = [
  "lifecycle.mdc",
  "risk-and-escalation.mdc",
  "model-routing.mdc",
  "delegation.mdc",
  "context-budgets.mdc",
];

function assertTopicRuleFrontMatter(body, name) {
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(body);
  assert.ok(match, `${name} missing front matter`);
  const front = match[1] ?? "";
  assert.match(front, /^description: .+$/m);
  assert.match(front, /^alwaysApply: false$/m);
  assert.equal(front.includes("globs:"), false, `${name} must not set globs`);
}

test("[integration] SK-3 init ships references; upgrade replaces an edited one and backfills an old install", () => {
  // Arrange
  const root = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  mkdirSync(join(root, ".cursor/skills/project-skill"), { recursive: true });
  writeFileSync(join(root, ".cursor/skills/project-skill/SKILL.md"), "consumer skill\n");

  try {
    // Act
    const confirmed = spawnSync(
      process.execPath,
      [cliPath, "init", "--profile", "solo-balanced", "--root", root, "--confirm"],
      { encoding: "utf8" },
    );

    // Assert
    assert.equal(confirmed.status, 0, confirmed.stderr);
    const executePath = join(root, ".cursor/skills/tito/references/execute.md");
    const packetsPath = join(root, ".cursor/skills/tito/references/packets.md");
    const execute = readFileSync(executePath, "utf8");
    const packets = readFileSync(packetsPath, "utf8");
    assert.ok(execute.length > 0);
    assert.ok(packets.length > 0);
    assert.equal(
      readFileSync(join(root, ".cursor/skills/project-skill/SKILL.md"), "utf8"),
      "consumer skill\n",
    );

    writeFileSync(executePath, "edited reference\n");
    const upgraded = spawnSync(
      process.execPath,
      [cliPath, "upgrade", "--confirm", "--files-only", "--root", root],
      { encoding: "utf8" },
    );
    assert.equal(upgraded.status, 0, upgraded.stderr);
    assert.equal(readFileSync(executePath, "utf8").includes("edited reference"), false);
    assert.equal(readFileSync(executePath, "utf8"), execute);
    assert.equal(
      readFileSync(join(root, ".cursor/skills/project-skill/SKILL.md"), "utf8"),
      "consumer skill\n",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  const oldRoot = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  try {
    mkdirSync(join(oldRoot, ".cursor/skills/tito"), { recursive: true });
    writeFileSync(join(oldRoot, ".cursor/skills/tito/SKILL.md"), "old tito skill\n");
    writeFileSync(join(oldRoot, "AGENTS.md"), "# Tito bootstrap\n\nOld Tito text.\n");

    const backfill = spawnSync(
      process.execPath,
      [cliPath, "upgrade", "--confirm", "--files-only", "--root", oldRoot],
      { encoding: "utf8" },
    );
    assert.equal(backfill.status, 0, backfill.stderr);
    assert.ok(readFileSync(join(oldRoot, ".cursor/skills/tito/references/execute.md"), "utf8").length > 0);
    assert.ok(readFileSync(join(oldRoot, ".cursor/skills/tito/references/packets.md"), "utf8").length > 0);
  } finally {
    rmSync(oldRoot, { recursive: true, force: true });
  }
});

test("[integration] BT-3 upgrade creates missing topic rules and replaces an edited Tito rule", () => {
  // Arrange
  const root = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  mkdirSync(join(root, ".cursor/rules"), { recursive: true });
  writeFileSync(join(root, ".cursor/rules/tourdef.mdc"), "consumer rule\n");
  writeFileSync(join(root, ".cursor/rules/commit-branch.mdc"), "edited tito rule\n");

  try {
    // Act
    const result = spawnSync(
      process.execPath,
      [cliPath, "upgrade", "--confirm", "--files-only", "--root", root],
      { encoding: "utf8" },
    );

    // Assert
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(root, ".cursor/rules/tourdef.mdc"), "utf8"), "consumer rule\n");
    const replaced = readFileSync(join(root, ".cursor/rules/commit-branch.mdc"), "utf8");
    assert.equal(replaced.includes("edited tito rule"), false);
    assert.match(replaced, /A commit subject is/);
    for (const name of TOPIC_RULES) {
      const body = readFileSync(join(root, ".cursor/rules", name), "utf8");
      assertTopicRuleFrontMatter(body, name);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const TITO_SHELL_HOOK = {
  command: "npx --no-install tito hook before-shell",
  matcher: "\\b(git|gh|npm)\\b",
  timeout: 10,
};

const TITO_MCP_HOOK = {
  command: "npx --no-install tito hook before-mcp",
  timeout: 10,
};

function titoHooksJson() {
  return `${JSON.stringify(
    {
      version: 1,
      hooks: {
        beforeShellExecution: [TITO_SHELL_HOOK],
        beforeMCPExecution: [TITO_MCP_HOOK],
      },
    },
    null,
    2,
  )}\n`;
}

test("[integration] H19 upgrade keeps existing Tito hook entries and leaves bytes unchanged", () => {
  const root = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  try {
    const existing =
      '{ "version": 1, "hooks": { "beforeShellExecution": [{ "command": "npx --no-install tito hook before-shell", "timeout": 99 }], "beforeMCPExecution": [{ "command": "npx --no-install tito hook before-mcp", "timeout": 10 }] } }\n';
    mkdirSync(join(root, ".cursor"), { recursive: true });
    writeFileSync(join(root, ".cursor/hooks.json"), existing);
    const result = upgradeFilesOnly(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\.cursor\/hooks\.json: keep/);
    assert.equal(readFileSync(join(root, ".cursor/hooks.json"), "utf8"), existing);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("[integration] MCP-12 upgrade appends the MCP entry when only the shell entry exists", () => {
  const root = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  try {
    const userEdit = { command: "user-edit-hook" };
    mkdirSync(join(root, ".cursor"), { recursive: true });
    writeFileSync(
      join(root, ".cursor/hooks.json"),
      `${JSON.stringify(
        {
          version: 1,
          extra: "keep-me",
          hooks: {
            afterFileEdit: [userEdit],
            beforeShellExecution: [
              { command: "npx --no-install tito hook before-shell", timeout: 99 },
            ],
          },
        },
        null,
        2,
      )}\n`,
    );
    const result = upgradeFilesOnly(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\.cursor\/hooks\.json: append/);
    const parsed = JSON.parse(readFileSync(join(root, ".cursor/hooks.json"), "utf8"));
    assert.equal(parsed.extra, "keep-me");
    assert.deepEqual(parsed.hooks.afterFileEdit, [userEdit]);
    assert.deepEqual(parsed.hooks.beforeShellExecution, [
      { command: "npx --no-install tito hook before-shell", timeout: 99 },
    ]);
    assert.deepEqual(parsed.hooks.beforeMCPExecution.at(-1), TITO_MCP_HOOK);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("[integration] H21 upgrade --confirm creates .cursor/hooks.json when missing", () => {
  const root = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  try {
    const result = upgradeFilesOnly(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\.cursor\/hooks\.json: create/);
    assert.equal(readFileSync(join(root, ".cursor/hooks.json"), "utf8"), titoHooksJson());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
