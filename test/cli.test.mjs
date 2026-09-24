import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cliUrl = new URL("../dist/cli.js", import.meta.url);
const cliPath = fileURLToPath(cliUrl);

function runCli(argument) {
  return spawnSync(process.execPath, [cliPath, argument], {
    encoding: "utf8",
  });
}

test("compiled CLI exposes help and version", async () => {
  const help = runCli("--help");
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage:\s+tito \[options\]/);
  assert.equal(help.stderr, "");

  const version = runCli("--version");
  assert.equal(version.status, 0);
  assert.equal(version.stdout, "0.1.0\n");
  assert.equal(version.stderr, "");

  const compiled = await readFile(cliUrl, "utf8");
  assert.ok(compiled.startsWith("#!/usr/bin/env node\n"));
});
