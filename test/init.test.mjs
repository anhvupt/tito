import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function run(root, args) {
  return spawnSync(process.execPath, [cliPath, ...args], { encoding: "utf8" });
}

const DEFAULT_MODELS_BLOCK = [
  "models:",
  "  explorer: cursor-grok-4.6-medium-fast",
  "  planner: grok-4.7-high",
  "  advisor: claude-opus-5-5-medium",
  "  implementer: cursor-grok-4.6-high",
  "  reviewer: grok-4.7-high",
  "  finisher: composer-2.5",
];

const CARD_SLUGS = {
  "tito-explorer.md": "cursor-grok-4.6-medium-fast",
  "tito-product.md": "claude-opus-5-5-medium",
  "tito-architect.md": "grok-4.7-high",
  "tito-backend.md": "cursor-grok-4.6-high",
  "tito-frontend.md": "cursor-grok-4.6-high",
  "tito-devops.md": "cursor-grok-4.6-high",
  "tito-erp.md": "claude-opus-5-5-medium",
  "tito-qa.md": "grok-4.7-high",
  "tito-security.md": "grok-4.7-high",
  "tito-tech-docs.md": "composer-2.5",
  "tito-user-docs.md": "composer-2.5",
  "tito-cleaner.md": "composer-2.5",
  "tito-startup.md": "composer-2.5",
};

test("[unit] SU-3 init plan creates .cursor/skills/tito-local-startup/SKILL.md and .cursor/agents/tito-startup.md", async () => {
  const { planInitialization } = await import("../dist/core/init.js");
  const { inspectRepository } = await import("../dist/core/inspect.js");
  const root = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  try {
    const plan = planInitialization(inspectRepository(root), "solo-balanced");
    const created = plan.files
      .filter((file) => file.action === "create")
      .map((file) => file.path);
    assert.equal(created.includes(".cursor/skills/tito-local-startup/SKILL.md"), true);
    assert.equal(created.includes(".cursor/agents/tito-startup.md"), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("[integration] PM-6 fresh init pins every card and writes the default models", async () => {
  const { parseConfig } = await import("../dist/core/config.js");
  const root = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  try {
    const confirmed = run(root, ["init", "--profile", "solo-balanced", "--root", root, "--confirm"]);
    assert.equal(confirmed.status, 0, confirmed.stderr);
    const yaml = readFileSync(join(root, "tito.yaml"), "utf8");
    assert.equal(yaml.endsWith(`${DEFAULT_MODELS_BLOCK.join("\n")}\n`), true, yaml);
    assert.equal(parseConfig(yaml).models.implementer, "cursor-grok-4.6-high");
    const cards = readdirSync(join(root, ".cursor/agents")).sort();
    assert.deepEqual(cards, Object.keys(CARD_SLUGS).sort());
    for (const name of cards) {
      const card = readFileSync(join(root, ".cursor/agents", name), "utf8");
      assert.equal(card.includes("model: inherit"), false, name);
      assert.match(card, new RegExp(`^model: ${CARD_SLUGS[name].replace(/\./g, "\\.")}$`, "m"), name);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("init previews specialist agents and writes only after confirmation", () => {
  const root = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  const preview = run(root, ["init", "--profile", "solo-balanced", "--root", root]);
  assert.equal(preview.status, 0);
  assert.match(preview.stdout, /tito\.yaml: create/);
  assert.match(preview.stdout, /AGENTS\.md: create/);
  assert.match(preview.stdout, /\.cursor\/agents\/tito-frontend\.md: create/);
  assert.equal(readdirSync(root).length, 0);

  writeFileSync(join(root, "AGENTS.md"), "# Tourdef\n\nExisting guidance.\n");
  const confirmed = run(root, ["init", "--profile", "client-careful", "--root", root, "--confirm"]);
  assert.equal(confirmed.status, 0);
  const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
  assert.match(agents, /# Tourdef/);
  assert.match(agents, /Hola, Tito here!/);
  assert.match(readFileSync(join(root, ".cursor/skills/tito/SKILL.md"), "utf8"), /name: tito/);
  const agent = readFileSync(join(root, ".cursor/agents/tito-frontend.md"), "utf8");
  assert.match(agent, /name: tito-frontend/);
  assert.match(agent, /readonly: false/);
  assert.match(readFileSync(join(root, ".cursor/agents/tito-erp.md"), "utf8"), /readonly: true/);

  writeFileSync(join(root, "AGENTS.md"), "project bootstrap\n");
  const kept = run(root, ["init", "--profile", "solo-balanced", "--root", root, "--confirm"]);
  assert.equal(kept.status, 1);
  assert.match(kept.stderr, /conflict:/);
  assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), "project bootstrap\n");

  const missingProfile = run(root, ["init", "--root", root]);
  assert.equal(missingProfile.status, 1);
  assert.match(missingProfile.stderr, /Missing required option --profile/);
  rmSync(root, { recursive: true, force: true });
});

test("init of a repo with no AGENTS.md writes the intent sentence", () => {
  const root = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  const confirmed = run(root, ["init", "--profile", "solo-balanced", "--root", root, "--confirm"]);
  assert.equal(confirmed.status, 0, confirmed.stderr);
  const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
  assert.equal(agents.includes("Confirm intent before clarifying"), true);
  assert.match(agents, /show the test cases/);
  assert.match(agents, /Agent mode does not approve it/);
  assert.equal(agents.includes("Finishing a slice leaves the branch as it is."), true);
  assert.equal(
    agents.includes("The implementation handoff names the skills it will read."),
    true,
  );
  assert.equal(agents.includes("Review fixes lists every comment"), false);
  const pullRequestRule = readFileSync(join(root, ".cursor/rules/pull-request.mdc"), "utf8");
  assert.match(pullRequestRule, /Review fixes lists every comment/);
  rmSync(root, { recursive: true, force: true });
});

test("profile prompt accepts a menu number or a profile id", async () => {
  const { promptForProfile } = await import("../dist/core/init.js");
  assert.equal(await promptForProfile(async () => "1"), "client-careful");
  assert.equal(await promptForProfile(async () => "solo-fast"), "solo-fast");
});

test("init settings prompts render tito.yaml", async () => {
  const { INIT_SETTING_KEYS, promptForSettings, titoYamlBody } = await import("../dist/core/init.js");
  const prompts = [];
  const replies = ["develop", "vi", "single", "admin", "", ""];
  let index = 0;
  const answers = await promptForSettings(async (prompt) => {
    prompts.push(prompt);
    const reply = replies[index];
    index += 1;
    return reply ?? "";
  }, INIT_SETTING_KEYS);
  assert.equal(prompts.length, 6);
  assert.match(prompts[0], /dev/);
  assert.match(prompts[0], /develop/);
  assert.match(prompts[0], /main/);
  assert.match(prompts[0], /master/);
  assert.match(prompts[1], /vi/);
  assert.match(prompts[1], /en/);
  assert.match(prompts[2], /single/);
  assert.match(prompts[2], /multi/);
  assert.match(prompts[3], /comma-separated ids/);
  assert.equal(prompts[4], "Auto-create a pull request after implementation? [Y/n] ");
  assert.equal(prompts[5], "Auto-merge a slice pull request after checks pass? [y/N] ");
  assert.equal(answers.autoPullRequest, true);
  assert.equal(answers.autoMerge, false);
  assert.equal(
    titoYamlBody("solo-balanced", answers),
    [
      "schemaVersion: 1",
      "profile: solo-balanced",
      "git:",
      "  defaultBase: develop",
      "  autoPullRequest: true",
      "  autoMerge: false",
      "product:",
      "  screenLanguage: vi",
      "  tenancy: single",
      "  surfaces:",
      "    - id: admin",
      ...DEFAULT_MODELS_BLOCK,
      "",
    ].join("\n"),
  );

  const declinedPrompts = [];
  const declined = await promptForSettings(async (prompt) => {
    declinedPrompts.push(prompt);
    return "n";
  }, ["autoPullRequest"]);
  assert.equal(declinedPrompts[0], "Auto-create a pull request after implementation? [Y/n] ");
  assert.equal(declined.autoPullRequest, false);
  assert.equal(
    titoYamlBody("solo-balanced", declined),
    [
      "schemaVersion: 1",
      "profile: solo-balanced",
      "git:",
      "  autoPullRequest: false",
      ...DEFAULT_MODELS_BLOCK,
      "",
    ].join("\n"),
  );

  const skipped = await promptForSettings(async (prompt) => {
    if (prompt.startsWith("Git base")) return "main";
    if (prompt.startsWith("Screen language")) return "en";
    if (prompt.startsWith("Tenancy")) return "multi";
    if (prompt.startsWith("Surfaces")) return "";
    return "";
  }, INIT_SETTING_KEYS);
  assert.equal("surfaces" in skipped, false);
  assert.equal(titoYamlBody("solo-fast", skipped).includes("surfaces"), false);
  assert.equal(skipped.autoPullRequest, true);
  assert.equal(skipped.autoMerge, false);
});

test("settings prompts repeat until the answer is allowed", async () => {
  const { promptForSettings } = await import("../dist/core/init.js");
  const prompts = [];
  const replies = ["trunk", "develop", "maybe", "no"];
  let index = 0;
  const answers = await promptForSettings(async (prompt) => {
    prompts.push(prompt);
    const reply = replies[index];
    index += 1;
    return reply ?? "";
  }, ["defaultBase", "autoPullRequest"]);
  assert.equal(prompts.length, 4);
  assert.equal(answers.defaultBase, "develop");
  assert.equal(answers.autoPullRequest, false);
});

test("non-interactive init stores autoPullRequest and does not invent product fields", () => {
  const root = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  const preview = run(root, ["init", "--profile", "solo-balanced", "--root", root]);
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(readdirSync(root).length, 0);
  const yamlPlan = preview.stdout.split("AGENTS.md:")[0] ?? "";
  assert.equal(yamlPlan.includes("Auto-create a pull request"), false);
  assert.match(yamlPlan, /autoPullRequest: true/);
  assert.equal(yamlPlan.includes("screenLanguage"), false);
  assert.equal(yamlPlan.includes("tenancy"), false);
  assert.equal(yamlPlan.includes("surfaces"), false);

  const confirmed = run(root, ["init", "--profile", "solo-balanced", "--root", root, "--confirm"]);
  assert.equal(confirmed.status, 0, confirmed.stderr);
  const yaml = readFileSync(join(root, "tito.yaml"), "utf8");
  assert.match(yaml, /autoPullRequest: true/);
  assert.equal(yaml.includes("screenLanguage"), false);
  assert.equal(yaml.includes("tenancy"), false);
  assert.equal(yaml.includes("surfaces"), false);
  assert.equal(yaml.includes("defaultBase"), false);
  assert.match(yaml, /autoMerge: false/);

  const original = "schemaVersion: 1\nprofile: solo-balanced\n";
  writeFileSync(join(root, "tito.yaml"), original);
  const kept = run(root, ["init", "--profile", "solo-fast", "--root", root, "--confirm"]);
  assert.equal(kept.status, 1);
  assert.match(kept.stderr, /conflict:/);
  assert.equal(readFileSync(join(root, "tito.yaml"), "utf8"), original);
  rmSync(root, { recursive: true, force: true });
});

test("[integration] M4 interactive init answering no stores autoMerge false", async () => {
  const { INIT_SETTING_KEYS, applyInitialization, planInitialization, promptForSettings } =
    await import("../dist/core/init.js");
  const { inspectRepository } = await import("../dist/core/inspect.js");
  const { parseConfig } = await import("../dist/core/config.js");
  const answers = await promptForSettings(async (prompt) => {
    if (prompt.startsWith("Git base")) return "main";
    if (prompt.startsWith("Screen language")) return "en";
    if (prompt.startsWith("Tenancy")) return "single";
    if (prompt.startsWith("Surfaces")) return "";
    if (prompt.startsWith("Auto-create")) return "y";
    if (prompt.startsWith("Auto-merge")) return "n";
    return "n";
  }, INIT_SETTING_KEYS);
  assert.equal(answers.autoMerge, false);
  const root = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  try {
    applyInitialization(planInitialization(inspectRepository(root), "solo-balanced", answers));
    const yaml = readFileSync(join(root, "tito.yaml"), "utf8");
    assert.match(yaml, /autoMerge: false/);
    assert.equal(parseConfig(yaml).git.autoMerge, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("[integration] M5 non-interactive init with --profile stores autoMerge false and does not prompt", () => {
  const root = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  try {
    const preview = run(root, ["init", "--profile", "solo-balanced", "--root", root]);
    assert.equal(preview.status, 0, preview.stderr);
    assert.equal(preview.stdout.includes("Auto-merge a slice pull request"), false);
    const confirmed = run(root, ["init", "--profile", "solo-balanced", "--root", root, "--confirm"]);
    assert.equal(confirmed.status, 0, confirmed.stderr);
    assert.equal(confirmed.stdout.includes("Auto-merge a slice pull request"), false);
    const yaml = readFileSync(join(root, "tito.yaml"), "utf8");
    assert.match(yaml, /autoMerge: false/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("[integration] M7 fresh init AGENTS.md has the new merge line and stays within 1,500 tokens", () => {
  const root = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  try {
    const confirmed = run(root, ["init", "--profile", "solo-balanced", "--root", root, "--confirm"]);
    assert.equal(confirmed.status, 0, confirmed.stderr);
    const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
    assert.match(agents, /gh pr merge --squash/);
    assert.equal(agents.includes("already has an approval"), false);
    assert.ok(Math.ceil(agents.length / 4) <= 1500);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("[integration] M8 repo AGENTS.md and both tito SKILL.md copies omit already has an approval", () => {
  for (const rel of [
    "AGENTS.md",
    ".cursor/skills/tito/SKILL.md",
    "templates/cursor/skills/tito/SKILL.md",
  ]) {
    const body = readFileSync(join(repoRoot, rel), "utf8");
    assert.equal(body.includes("already has an approval"), false, rel);
  }
});

test("fresh init keeps the bootstrap within 1,500 tokens and installs scoped rules", () => {
  const root = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  mkdirSync(join(root, ".cursor/rules"), { recursive: true });
  writeFileSync(join(root, ".cursor/rules/tourdef.mdc"), "consumer rule\n");
  writeFileSync(join(root, ".cursor/rules/pull-request.mdc"), "user edited rule\n");
  const confirmed = run(root, ["init", "--profile", "solo-balanced", "--root", root, "--confirm"]);
  assert.equal(confirmed.status, 0, confirmed.stderr);
  const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
  assert.ok(Math.ceil(agents.length / 4) <= 1500);
  assert.match(agents, /Hola, Tito here!/);
  assert.match(agents, /always Plan first/);
  assert.match(agents, /check out only after the user accepts/);
  assert.match(agents, /Never approve a pull request/);
  assert.match(agents, /Tito does not code in this chat/);
  assert.match(agents, /`client-careful` 3/);
  assert.match(agents, /`solo-balanced` 6/);
  assert.match(agents, /`solo-fast` 12/);
  assert.equal(readFileSync(join(root, ".cursor/rules/tourdef.mdc"), "utf8"), "consumer rule\n");
  assert.equal(readFileSync(join(root, ".cursor/rules/pull-request.mdc"), "utf8"), "user edited rule\n");
  for (const name of ["screen-language.mdc", "init-upgrade-admin.mdc", "commit-branch.mdc"]) {
    const body = readFileSync(join(root, ".cursor/rules", name), "utf8");
    assert.match(body, /^---\n/);
    assert.match(body, /description:/);
    assert.match(body, /alwaysApply:\s*false/);
  }
  const repoAgents = readFileSync(join(repoRoot, "AGENTS.md"), "utf8");
  assert.ok(Math.ceil(repoAgents.length / 4) <= 1500);
  assert.equal(repoAgents.includes("A pull request description has four parts"), false);
  rmSync(root, { recursive: true, force: true });
});

test("[unit] WP-7 skill does not require principle headings; AGENTS.md still adopts maintained tools", () => {
  const skill = readFileSync(
    fileURLToPath(new URL("../templates/cursor/skills/tito/SKILL.md", import.meta.url)),
    "utf8",
  );
  const sentence = skill
    .split(/(?<=[.!?])\s+/)
    .find((item) =>
      ["Domain", "Decisions", "Test cases", "Docs impact", "Slices and branch"].every((name) =>
        item.includes(name),
      ),
    );
  assert.ok(sentence);
  const indexes = ["Domain", "Decisions", "Test cases", "Docs impact", "Slices and branch"].map(
    (name) => sentence.indexOf(name),
  );
  for (let i = 1; i < indexes.length; i += 1) {
    assert.ok(indexes[i] > indexes[i - 1]);
  }
  for (const name of [
    "Research, then judge",
    "Fixed floor, flexible tools",
    "Adopt before building",
    "Business before tech",
    "Clarify, domain, document, test, then code",
    "It depends, so show it",
  ]) {
    assert.equal(skill.includes(name), false, name);
  }
  const agents = readFileSync(join(repoRoot, "AGENTS.md"), "utf8");
  assert.equal(agents.includes("adopt maintained tools"), true);
});

test("[unit] fresh init states small and medium decision authority", () => {
  const root = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  try {
    const confirmed = run(root, ["init", "--profile", "solo-balanced", "--root", root, "--confirm"]);
    assert.equal(confirmed.status, 0, confirmed.stderr);
    const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
    assert.match(agents, /decides small and medium/);
    assert.match(agents, /`client-careful` still asks for medium/);
    assert.match(agents, /Questions are only for large decisions/);
    assert.match(agents, /locking a large decision/);
    assert.match(agents, /premium-model fan-out/);
    assert.match(agents, /`Decided:`/);
    assert.equal(agents.includes("3 to 5"), false);
    assert.ok(Math.ceil(agents.length / 4) <= 1500);
    const repoAgents = readFileSync(join(repoRoot, "AGENTS.md"), "utf8");
    assert.match(repoAgents, /decides small and medium/);
    assert.match(repoAgents, /`Decided:`/);
    assert.ok(Math.ceil(repoAgents.length / 4) <= 1500);

    const brief = readFileSync(join(repoRoot, "TITO-INITIAL-BRIEF.md"), "utf8");
    assert.equal(brief.includes("Tito decides, then reports"), false);
    assert.equal(brief.includes("naming, file placement"), false);
    assert.match(brief, /Rule: \.cursor\/rules\/lifecycle\.mdc/);
    const lifecycle = readFileSync(join(repoRoot, ".cursor/rules/lifecycle.mdc"), "utf8");
    assert.match(lifecycle, /Tito decides, then reports/);
    assert.match(lifecycle, /naming, file placement/);
    assert.match(lifecycle, /Asks, and stops/);
    assert.match(lifecycle, /safety floor/);
    assert.match(lifecycle, /`Decided:`/);
    assert.equal(lifecycle.includes("3 to 5"), false);
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

test("[integration] BT-3 init creates the five topic rules and leaves tourdef unchanged", () => {
  // Arrange
  const root = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  mkdirSync(join(root, ".cursor/rules"), { recursive: true });
  writeFileSync(join(root, ".cursor/rules/tourdef.mdc"), "consumer rule\n");

  try {
    // Act
    const confirmed = run(root, ["init", "--profile", "solo-balanced", "--root", root, "--confirm"]);

    // Assert
    assert.equal(confirmed.status, 0, confirmed.stderr);
    assert.equal(readFileSync(join(root, ".cursor/rules/tourdef.mdc"), "utf8"), "consumer rule\n");
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

function writeHooks(root, body) {
  mkdirSync(join(root, ".cursor"), { recursive: true });
  writeFileSync(join(root, ".cursor/hooks.json"), body);
}

test("[integration] H17 fresh init writes Tito's .cursor/hooks.json", () => {
  const root = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  try {
    const confirmed = run(root, ["init", "--profile", "solo-balanced", "--root", root, "--confirm"]);
    assert.equal(confirmed.status, 0, confirmed.stderr);
    assert.equal(readFileSync(join(root, ".cursor/hooks.json"), "utf8"), titoHooksJson());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("[integration] H18 init keeps a user afterFileEdit entry and appends Tito's hook", () => {
  const root = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  try {
    const userEntry = { command: "user-edit-hook", matcher: "*.ts" };
    writeHooks(
      root,
      `${JSON.stringify(
        { version: 1, extra: "keep-me", hooks: { afterFileEdit: [userEntry] } },
        null,
        2,
      )}\n`,
    );
    const confirmed = run(root, ["init", "--profile", "solo-balanced", "--root", root, "--confirm"]);
    assert.equal(confirmed.status, 0, confirmed.stderr);
    const parsed = JSON.parse(readFileSync(join(root, ".cursor/hooks.json"), "utf8"));
    assert.equal(parsed.extra, "keep-me");
    assert.deepEqual(parsed.hooks.afterFileEdit, [userEntry]);
    assert.deepEqual(parsed.hooks.beforeShellExecution.at(-1), TITO_SHELL_HOOK);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("[integration] H19 init keeps existing Tito hook entries and leaves bytes unchanged", () => {
  const root = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  try {
    const existing =
      '{ "version": 1, "hooks": { "beforeShellExecution": [{ "command": "npx --no-install tito hook before-shell", "timeout": 99 }], "beforeMCPExecution": [{ "command": "npx --no-install tito hook before-mcp", "timeout": 10 }] } }\n';
    writeHooks(root, existing);
    const confirmed = run(root, ["init", "--profile", "solo-balanced", "--root", root, "--confirm"]);
    assert.equal(confirmed.status, 0, confirmed.stderr);
    assert.match(confirmed.stdout, /\.cursor\/hooks\.json: keep/);
    assert.equal(readFileSync(join(root, ".cursor/hooks.json"), "utf8"), existing);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("[integration] MCP-11 fresh init writes both Tito hook entries", () => {
  const root = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  try {
    const confirmed = run(root, ["init", "--profile", "solo-balanced", "--root", root, "--confirm"]);
    assert.equal(confirmed.status, 0, confirmed.stderr);
    const parsed = JSON.parse(readFileSync(join(root, ".cursor/hooks.json"), "utf8"));
    assert.deepEqual(parsed.hooks.beforeShellExecution, [TITO_SHELL_HOOK]);
    assert.deepEqual(parsed.hooks.beforeMCPExecution, [TITO_MCP_HOOK]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("[integration] H20 invalid hooks.json is a conflict and writes nothing", () => {
  const root = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  try {
    const invalid = "{ not-json\n";
    writeHooks(root, invalid);
    const confirmed = run(root, ["init", "--profile", "solo-balanced", "--root", root, "--confirm"]);
    assert.equal(confirmed.status, 1);
    assert.match(confirmed.stderr, /conflict/);
    assert.equal(readFileSync(join(root, ".cursor/hooks.json"), "utf8"), invalid);
    assert.equal(readdirSync(root).sort().join(","), ".cursor");
    assert.deepEqual(readdirSync(join(root, ".cursor")), ["hooks.json"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("[integration] H22 init without --confirm prints hooks.json create or append and writes nothing", () => {
  const root = mkdtempSync(join(repoRoot, ".tmp-tito-init-"));
  try {
    const preview = run(root, ["init", "--profile", "solo-balanced", "--root", root]);
    assert.equal(preview.status, 0, preview.stderr);
    assert.match(preview.stdout, /\.cursor\/hooks\.json: create/);
    assert.equal(readdirSync(root).length, 0);

    const userBody = `${JSON.stringify({ version: 1, hooks: { afterFileEdit: [{ command: "user" }] } }, null, 2)}\n`;
    writeHooks(root, userBody);
    const appendPreview = run(root, ["init", "--profile", "solo-balanced", "--root", root]);
    assert.equal(appendPreview.status, 0, appendPreview.stderr);
    assert.match(appendPreview.stdout, /\.cursor\/hooks\.json: append/);
    assert.equal(readFileSync(join(root, ".cursor/hooks.json"), "utf8"), userBody);
    assert.deepEqual(readdirSync(root), [".cursor"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

