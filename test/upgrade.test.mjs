import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

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
  assert.equal(agents.includes("Old Tito text."), false);
  assert.match(readFileSync(join(root, ".cursor/agents/tito-frontend.md"), "utf8"), /name: tito-frontend/);
  assert.match(readFileSync(join(root, ".cursor/skills/tito/SKILL.md"), "utf8"), /name: tito/);
  rmSync(root, { recursive: true, force: true });
});
