import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  budgetFailures,
  descriptionCatalog,
  estimateTokens,
  measurePaths,
} from "../dist/core/budgets.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "tito-budgets-"));
  return {
    root,
    write(path, body) {
      const full = join(root, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, body);
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function report(reports, id) {
  const found = reports.find((item) => item.id === id);
  assert.ok(found, `missing path ${id}`);
  return found;
}

function printTable(t, reports) {
  for (const item of reports) {
    const status =
      item.tokens <= item.budget
        ? "ok"
        : item.ceiling !== undefined && item.tokens <= item.ceiling
          ? "at-ceiling"
          : "over";
    t.diagnostic(
      `${item.id}\t${item.tokens}\t${item.budget}\t${item.ceiling ?? ""}\t${status}`,
    );
  }
}

test("[unit] E1 estimateTokens ceil-divides characters by four", () => {
  // Arrange
  const text = "abcde";

  // Act
  const tokens = estimateTokens(text);

  // Assert
  assert.equal(tokens, 2);
});

test("[unit] E2 planning adds referenced markdown to always-on", () => {
  // Arrange
  const dir = fixture();
  dir.write("AGENTS.md", "Read `X.md` for the domain.\n");
  dir.write("X.md", "x".repeat(400));
  try {
    // Act
    const reports = measurePaths(dir.root);
    const alwaysOn = report(reports, "always-on");
    const planning = report(reports, "planning");

    // Assert
    assert.ok(planning.files.includes("X.md"));
    assert.equal(planning.tokens, alwaysOn.tokens + 100);
  } finally {
    dir.cleanup();
  }
});

test("[unit] E3 planning matches always-on when no markdown is named", () => {
  // Arrange
  const dir = fixture();
  dir.write("AGENTS.md", "No extra docs here.\n");
  try {
    // Act
    const reports = measurePaths(dir.root);
    const alwaysOn = report(reports, "always-on");
    const planning = report(reports, "planning");

    // Assert
    assert.equal(planning.tokens, alwaysOn.tokens);
  } finally {
    dir.cleanup();
  }
});

test("[unit] E4 a missing referenced file is listed without throwing", () => {
  // Arrange
  const dir = fixture();
  dir.write("AGENTS.md", "Read `gone.md` next.\n");
  try {
    // Act
    const reports = measurePaths(dir.root);
    const planning = report(reports, "planning");

    // Assert
    assert.ok(planning.missing.includes("gone.md"));
  } finally {
    dir.cleanup();
  }
});

test("[unit] E5 the description catalog keeps only shown descriptions", () => {
  // Arrange
  const dir = fixture();
  dir.write(
    ".cursor/agents/folded-card.md",
    "---\nname: folded-card\ndescription: >\n  FOLDED_CARD_DESC\n  still shown\nmodel: inherit\n---\n# Card\n",
  );
  dir.write(
    ".cursor/rules/desc-only.mdc",
    "---\ndescription: DESC_ONLY_RULE\nalwaysApply: false\n---\n# Rule\n",
  );
  dir.write(
    ".cursor/rules/with-globs.mdc",
    "---\ndescription: GLOBS_RULE\nglobs: **/*.md\nalwaysApply: false\n---\n# Globs\n",
  );
  dir.write(
    ".cursor/skills/invocable/SKILL.md",
    "---\nname: invocable\ndescription: INVOCABLE_SKILL\n---\n# Skill\n",
  );
  dir.write(
    ".cursor/skills/silent/SKILL.md",
    "---\nname: silent\ndescription: SILENT_SKILL\ndisable-model-invocation: true\n---\n# Silent\n",
  );
  try {
    // Act
    const catalog = descriptionCatalog(dir.root);

    // Assert
    assert.equal(catalog.length, 3);
    assert.deepEqual(
      catalog.map((item) => item.source).sort(),
      [
        ".cursor/agents/folded-card.md",
        ".cursor/rules/desc-only.mdc",
        ".cursor/skills/invocable/SKILL.md",
      ],
    );
    const texts = catalog.map((item) => item.text).join("\n");
    assert.match(texts, /FOLDED_CARD_DESC/);
    assert.match(texts, /DESC_ONLY_RULE/);
    assert.match(texts, /INVOCABLE_SKILL/);
    assert.equal(texts.includes("GLOBS_RULE"), false);
    assert.equal(texts.includes("SILENT_SKILL"), false);
  } finally {
    dir.cleanup();
  }
});

test("[unit] E6 alwaysApply rules count in ordinary as whole files", () => {
  // Arrange
  const dir = fixture();
  const agents = "hello";
  const rule = "---\nalwaysApply: true\n---\n" + "x".repeat(374);
  dir.write("AGENTS.md", agents);
  dir.write(".cursor/rules/always.mdc", rule);
  try {
    // Act
    const reports = measurePaths(dir.root);
    const ordinary = report(reports, "ordinary");

    // Assert
    assert.ok(ordinary.files.includes(".cursor/rules/always.mdc"));
    assert.equal(ordinary.tokens, estimateTokens(agents) + estimateTokens(rule));
  } finally {
    dir.cleanup();
  }
});

test("[unit] E7 budgetFailures names the path that exceeded its ceiling", () => {
  // Arrange
  const reports = [
    {
      id: "planning",
      files: [],
      missing: [],
      tokens: 11812,
      budget: 4100,
      ceiling: 11800,
    },
    {
      id: "tito-skill",
      files: [],
      missing: [],
      tokens: 15100,
      budget: 5300,
      ceiling: 15100,
    },
  ];

  // Act
  const failures = budgetFailures(reports);

  // Assert
  assert.deepEqual(failures, ["planning: 11812 > ceiling 11800"]);
});

test("[integration] E8 repo root stays within budgets or ceilings", (t) => {
  // Arrange
  const root = repoRoot;

  // Act
  const reports = measurePaths(root);
  printTable(t, reports);

  // Assert
  assert.deepEqual(budgetFailures(reports), []);
});

test("[integration] E9 the cursor template stays within budgets without a brief reference", (t) => {
  // Arrange
  const root = join(repoRoot, "templates/cursor");

  // Act
  const reports = measurePaths(root);
  printTable(t, reports);
  const planning = report(reports, "planning");

  // Assert
  assert.deepEqual(budgetFailures(reports), []);
  assert.equal(planning.missing.includes("TITO-INITIAL-BRIEF.md"), false);
  assert.equal(planning.files.includes("TITO-INITIAL-BRIEF.md"), false);
});

test("[integration] E10 every specialist card stays within 400 tokens", () => {
  // Arrange
  const root = repoRoot;

  // Act
  const cards = measurePaths(root).filter((item) => item.id.startsWith("card:"));

  // Assert
  assert.ok(cards.length > 0);
  for (const card of cards) {
    assert.ok(card.tokens <= 400, `${card.id} ${card.tokens}`);
  }
});
