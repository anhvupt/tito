import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cliUrl = new URL("../dist/cli.js", import.meta.url);
const cliPath = fileURLToPath(cliUrl);

function runCli(args, cwd) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
  });
}

test("compiled CLI exposes help and version", async () => {
  const help = runCli(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage:\s+tito \[options\]/);
  assert.match(help.stdout, /tito inspect \[--root <path>\]/);
  assert.match(help.stdout, /tito apply --dry-run --profile <id>/);
  assert.equal(help.stderr, "");

  const version = runCli(["--version"]);
  assert.equal(version.status, 0);
  assert.equal(version.stdout, "0.1.0\n");
  assert.equal(version.stderr, "");

  const compiled = await readFile(cliUrl, "utf8");
  assert.ok(compiled.startsWith("#!/usr/bin/env node\n"));
});

test("inspect reports an explicit root and the default root", () => {
  const root = mkdtempSync(join(tmpdir(), "tito-cli-inspect-"));
  writeFileSync(join(root, "AGENTS.md"), "do not print\n");
  const before = readdirSync(root).sort();
  const explicit = runCli(["inspect", "--root", root]);
  assert.equal(explicit.status, 0);
  assert.equal(explicit.stderr, "");
  assert.equal(
    explicit.stdout,
    `root: ${root}\ntito.yaml: absent\nAGENTS.md: present\n`,
  );
  assert.equal(explicit.stdout.includes("do not print"), false);
  assert.deepEqual(readdirSync(root).sort(), before);

  const defaults = runCli(["inspect"], root);
  assert.equal(defaults.status, 0);
  assert.match(defaults.stdout, /^root: .+\ntito.yaml: absent\nAGENTS.md: present\n$/);
  assert.deepEqual(readdirSync(root).sort(), before);

  const missing = runCli(["inspect", "--root", join(root, "missing")]);
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, "");
  assert.match(missing.stderr, /^not-a-directory: /);
  rmSync(root, { recursive: true, force: true });
});
