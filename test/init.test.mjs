import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function run(root, args) {
  return spawnSync(process.execPath, [cliPath, ...args], { encoding: "utf8" });
}

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
  const replies = ["develop", "vi", "single", "admin", ""];
  let index = 0;
  const answers = await promptForSettings(async (prompt) => {
    prompts.push(prompt);
    const reply = replies[index];
    index += 1;
    return reply ?? "";
  }, INIT_SETTING_KEYS);
  assert.equal(prompts.length, 5);
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
  assert.equal(answers.autoPullRequest, true);
  assert.equal(
    titoYamlBody("solo-balanced", answers),
    [
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
    ["schemaVersion: 1", "profile: solo-balanced", "git:", "  autoPullRequest: false", ""].join("\n"),
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

  const original = "schemaVersion: 1\nprofile: solo-balanced\n";
  writeFileSync(join(root, "tito.yaml"), original);
  const kept = run(root, ["init", "--profile", "solo-fast", "--root", root, "--confirm"]);
  assert.equal(kept.status, 1);
  assert.match(kept.stderr, /conflict:/);
  assert.equal(readFileSync(join(root, "tito.yaml"), "utf8"), original);
  rmSync(root, { recursive: true, force: true });
});
