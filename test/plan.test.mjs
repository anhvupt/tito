import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseConfig } from "../dist/core/config.js";
import { PlanError, planAdoption } from "../dist/core/plan.js";

const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

function report(titoYaml, agentsMd) {
  return { root: "/repo", titoYaml, agentsMd };
}

test("adoption plan creates missing files and refuses overwrites", () => {
  const created = planAdoption(report({ status: "absent" }, "absent"), "solo-balanced");
  assert.equal(created.files[0].action, "create");
  assert.equal(created.files[1].action, "create");
  assert.deepEqual(parseConfig(created.files[0].body), {
    schemaVersion: 1,
    profile: "solo-balanced",
  });
  assert.match(created.files[1].body, /^# Tito bootstrap/);

  const existing = planAdoption(
    report({ status: "invalid", issues: [] }, "present"),
    "client-careful",
  );
  assert.deepEqual(
    existing.files.map((file) => file.action),
    ["conflict", "keep"],
  );
  const valid = planAdoption(
    report({ status: "valid", config: { schemaVersion: 1, profile: "solo-fast" } }, "absent"),
    "solo-fast",
  );
  assert.deepEqual(
    valid.files.map((file) => file.action),
    ["conflict", "create"],
  );

  assert.throws(
    () => planAdoption(report({ status: "absent" }, "absent"), "nope"),
    (error) => error instanceof PlanError && error.code === "unknown-profile",
  );
  assert.throws(
    () => planAdoption(report({ status: "absent" }, "absent"), "small-team"),
    (error) => error instanceof PlanError && error.code === "unsupported-profile",
  );
});

test("apply --dry-run prints the plan and does not write", () => {
  const root = mkdtempSync(join(tmpdir(), "tito-plan-"));
  const before = readdirSync(root).sort();
  const run = (args) =>
    spawnSync(process.execPath, [cliPath, ...args], { encoding: "utf8" });

  const planned = run(["apply", "--dry-run", "--profile", "solo-balanced", "--root", root]);
  assert.equal(planned.status, 0);
  assert.equal(planned.stderr, "");
  assert.match(planned.stdout, new RegExp(`root: ${root}`));
  assert.match(planned.stdout, /tito\.yaml: create/);
  assert.match(planned.stdout, /AGENTS\.md: create/);
  assert.deepEqual(readdirSync(root).sort(), before);

  writeFileSync(join(root, "tito.yaml"), "schemaVersion: 1\nprofile: nope\n");
  writeFileSync(join(root, "AGENTS.md"), "keep me\n");
  const occupied = readdirSync(root).sort();
  const refused = run(["apply", "--dry-run", "--profile", "solo-fast", "--root", root]);
  assert.equal(refused.status, 0);
  assert.match(refused.stdout, /tito\.yaml: conflict/);
  assert.match(refused.stdout, /AGENTS\.md: keep/);
  assert.equal(refused.stdout.includes("keep me"), false);
  assert.deepEqual(readdirSync(root).sort(), occupied);

  const writeAttempt = run(["apply", "--profile", "solo-balanced", "--root", root]);
  assert.equal(writeAttempt.status, 1);
  assert.match(writeAttempt.stderr, /Re-run with --dry-run/);
  assert.deepEqual(readdirSync(root).sort(), occupied);
  rmSync(root, { recursive: true, force: true });
});
