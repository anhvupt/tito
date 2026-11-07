import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const PRINCIPLE_HEADINGS = [
  "Research, then judge",
  "Fixed floor, flexible tools",
  "Adopt before building",
  "Business before tech",
  "Clarify, domain, document, test, then code",
  "It depends, so show it",
];

const FORBIDDEN = [
  "TITO-INITIAL-BRIEF",
  "screen-language",
  "screenLanguage",
  "commit-branch",
  "A commit subject is",
  ...PRINCIPLE_HEADINGS,
];

function read(rel) {
  return readFileSync(join(repoRoot, rel));
}

function readText(rel) {
  return readFileSync(join(repoRoot, rel), "utf8");
}

test("[unit] SK-1 both skill trees match, omit the brief, and stay within size caps", () => {
  // Arrange
  const stubCursor = read(".cursor/skills/tito/SKILL.md");
  const stubTemplate = read("templates/cursor/skills/tito/SKILL.md");
  const cursorRefs = join(repoRoot, ".cursor/skills/tito/references");
  const templateRefs = join(repoRoot, "templates/cursor/skills/tito/references");

  // Act
  const cursorNames = readdirSync(cursorRefs).sort();
  const templateNames = readdirSync(templateRefs).sort();
  const stub = stubCursor.toString("utf8");
  const execute = readText(".cursor/skills/tito/references/execute.md");
  const packets = readText(".cursor/skills/tito/references/packets.md");
  const larger = Math.max(execute.length, packets.length);
  const combinedTokens = Math.ceil((stub.length + larger) / 4);
  const surfaces = [
    stub,
    execute,
    packets,
    readText("templates/cursor/skills/tito/SKILL.md"),
    readText("templates/cursor/skills/tito/references/execute.md"),
    readText("templates/cursor/skills/tito/references/packets.md"),
  ];

  // Assert
  assert.deepEqual(stubCursor, stubTemplate);
  assert.deepEqual(cursorNames, templateNames);
  assert.deepEqual(cursorNames, ["execute.md", "packets.md"]);
  for (const name of cursorNames) {
    assert.deepEqual(read(join(".cursor/skills/tito/references", name)), read(join("templates/cursor/skills/tito/references", name)));
  }
  assert.ok(stub.length <= 4800, `stub ${stub.length}`);
  assert.ok(execute.length <= 6000, `execute ${execute.length}`);
  assert.ok(packets.length <= 6000, `packets ${packets.length}`);
  assert.ok(combinedTokens <= 3600, `combined ${combinedTokens}`);
  for (const text of surfaces) {
    for (const needle of FORBIDDEN) {
      assert.equal(text.includes(needle), false, needle);
    }
  }
});

test("[unit] SK-2 shippedSkills returns sorted tito references and SKILL.md only when references are absent", async () => {
  // Arrange
  const { shippedSkills } = await import("../dist/core/init.js");

  // Act
  const paths = shippedSkills().map((file) => file.path);
  const titoRefs = paths.filter((path) => path.startsWith(".cursor/skills/tito/references/"));
  const initPaths = paths.filter((path) => path.startsWith(".cursor/skills/tito-init/"));

  // Assert
  assert.equal(paths.includes(".cursor/skills/tito/SKILL.md"), true);
  assert.deepEqual(titoRefs, [
    ".cursor/skills/tito/references/execute.md",
    ".cursor/skills/tito/references/packets.md",
  ]);
  assert.deepEqual(initPaths, [".cursor/skills/tito-init/SKILL.md"]);
});
