import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { measurePaths } from "../dist/core/budgets.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const TOPIC_RULES = [
  "lifecycle.mdc",
  "risk-and-escalation.mdc",
  "model-routing.mdc",
  "delegation.mdc",
  "context-budgets.mdc",
];

const OLD_BRIEF_BULLET =
  "- Read `TITO-INITIAL-BRIEF.md` when planning, editing, or resolving policy.";
const NEW_BRIEF_BULLET =
  "- When planning, editing, or resolving policy, read at most two .cursor/rules bodies whose descriptions match the decision.";

function parseRule(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  assert.ok(match, "missing front matter");
  const front = match[1] ?? "";
  const description = /^description:[ \t]*(.*)$/m.exec(front)?.[1] ?? "";
  return { body: text.slice(match[0].length), description };
}

test("[unit] BT-1 each topic rule body is at most 1600 characters and each description is at most 160", () => {
  // Arrange
  const names = TOPIC_RULES;

  for (const name of names) {
    // Act
    const text = readFileSync(join(repoRoot, ".cursor/rules", name), "utf8");
    const { body, description } = parseRule(text);

    // Assert
    assert.ok(
      description.length <= 160,
      `${name} description ${description.length}`,
    );
    assert.ok(body.length <= 1600, `${name} body ${body.length}`);
  }
});

test("[unit] BT-1 planning path (repo root) is at most 4100", () => {
  // Arrange
  const root = repoRoot;

  // Act
  const planning = measurePaths(root).find((item) => item.id === "planning");

  // Assert
  assert.ok(planning, "missing planning path");
  assert.ok(planning.tokens <= 4100, `planning ${planning.tokens}`);
});

test("[unit] BT-2 both AGENTS.md files point at topic rules and stay within 1500 tokens", () => {
  // Arrange
  const paths = ["AGENTS.md", "templates/cursor/AGENTS.md"];

  for (const rel of paths) {
    // Act
    const text = readFileSync(join(repoRoot, rel), "utf8");

    // Assert
    assert.equal(text.includes(OLD_BRIEF_BULLET), false, `${rel} still has the old brief-read bullet`);
    assert.equal(text.includes(NEW_BRIEF_BULLET), true, `${rel} missing the topic-rule bullet`);
    assert.equal(text.includes("`TITO-INITIAL-BRIEF.md`"), false, `${rel} still backticks the brief`);
    assert.ok(
      Math.ceil(text.length / 4) <= 1500,
      `${rel} ${Math.ceil(text.length / 4)} tokens`,
    );
  }
});

test("[unit] BT-4 decide phrases live in lifecycle.mdc and the brief points at all five topic rules", () => {
  // Arrange
  const brief = readFileSync(join(repoRoot, "TITO-INITIAL-BRIEF.md"), "utf8");
  const lifecycle = readFileSync(join(repoRoot, ".cursor/rules/lifecycle.mdc"), "utf8");

  // Act
  const inLifecycleDecide = lifecycle.includes("Tito decides, then reports");
  const inLifecycleNaming = lifecycle.includes("naming, file placement");
  const inBriefDecide = brief.includes("Tito decides, then reports");
  const inBriefNaming = brief.includes("naming, file placement");

  // Assert
  assert.equal(inLifecycleDecide, true);
  assert.equal(inLifecycleNaming, true);
  assert.equal(inBriefDecide, false);
  assert.equal(inBriefNaming, false);
  for (const name of TOPIC_RULES) {
    const pointer = `Rule: .cursor/rules/${name}`;
    assert.equal(brief.includes(pointer), true, pointer);
  }
});

test("[unit] BT-5 each topic rule is byte-identical in .cursor/rules and templates/cursor/rules", () => {
  // Arrange
  const names = TOPIC_RULES;

  for (const name of names) {
    // Act
    const live = readFileSync(join(repoRoot, ".cursor/rules", name));
    const shipped = readFileSync(join(repoRoot, "templates/cursor/rules", name));

    // Assert
    assert.equal(Buffer.compare(live, shipped), 0, name);
  }
});
