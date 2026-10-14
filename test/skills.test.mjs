import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { listSkillCards } from "../dist/core/skills.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function skillFile(dir, folder, body) {
  const skillDir = join(dir, folder);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), body);
}

test("T1 [unit] a skill card is the name and description", () => {
  const dir = mkdtempSync(join(repoRoot, ".tmp-tito-skills-"));
  try {
    skillFile(
      dir,
      "angular-forms",
      [
        "---",
        "name: angular-forms",
        "description: Angular reactive forms",
        "---",
        "do not load me",
        "",
      ].join("\n"),
    );
    const cards = listSkillCards(dir);
    assert.deepEqual(cards, [
      {
        name: "angular-forms",
        description: "Angular reactive forms",
        role: "candidate",
      },
    ]);
    assert.equal(JSON.stringify(cards).includes("do not load me"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("T2 [unit] Tito's own skill is not a pick", () => {
  const dir = mkdtempSync(join(repoRoot, ".tmp-tito-skills-"));
  try {
    skillFile(
      dir,
      "tito",
      ["---", "name: tito", "description: Coordinate the work", "---", ""].join("\n"),
    );
    skillFile(
      dir,
      "angular-forms",
      ["---", "name: angular-forms", "description: Angular reactive forms", "---", ""].join("\n"),
    );
    const cards = listSkillCards(dir);
    const tito = cards.find((card) => card.name === "tito");
    const angular = cards.find((card) => card.name === "angular-forms");
    assert.equal(tito?.role, "coordinator");
    assert.equal(angular?.role, "candidate");
    assert.deepEqual(
      cards.map((card) => card.name),
      ["angular-forms", "tito"],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("[unit] the installed tito skill uses small and medium decision authority", () => {
  for (const path of [
    "../.cursor/skills/tito/SKILL.md",
    "../templates/cursor/skills/tito/SKILL.md",
  ]) {
    const skill = readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
    assert.equal(skill.includes("3 to 5 clarifying questions"), false);
    assert.equal(skill.includes("Decided:"), true);
    assert.equal(skill.includes("clarifying batch"), false);
  }
  const brief = readFileSync(
    fileURLToPath(new URL("../TITO-INITIAL-BRIEF.md", import.meta.url)),
    "utf8",
  );
  assert.equal(brief.includes("ask before locking a technical decision"), false);
  assert.match(brief, /Plan mode should use the Reasoning tier by default when technical decisions/);
});

test("a missing skill directory returns no cards", () => {
  const dir = mkdtempSync(join(repoRoot, ".tmp-tito-skills-"));
  try {
    assert.deepEqual(listSkillCards(join(dir, "does-not-exist")), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
