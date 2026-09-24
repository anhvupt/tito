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

  const confirmed = run(root, ["init", "--profile", "solo-balanced", "--root", root, "--confirm"]);
  assert.equal(confirmed.status, 0);
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

test("profile prompt accepts a menu number or a profile id", async () => {
  const { promptForProfile } = await import("../dist/core/init.js");
  assert.equal(await promptForProfile(async () => "1"), "client-careful");
  assert.equal(await promptForProfile(async () => "solo-fast"), "solo-fast");
});
