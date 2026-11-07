import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const TOPIC_RULES = [
  "lifecycle.mdc",
  "risk-and-escalation.mdc",
  "model-routing.mdc",
  "delegation.mdc",
  "context-budgets.mdc",
];

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
