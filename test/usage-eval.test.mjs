import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import test from "node:test";
import {
  baselineFromRecords,
  buildUsageRecord,
  evalExitCode,
  overBudget,
  persistOutcome,
  thresholdFailures,
  writeBaseline,
} from "../dist/core/usage-eval.js";
import { USAGE_SCENARIOS } from "../scripts/usage-scenarios.mjs";

const SIX_FIELDS = {
  inputTokens: 10,
  outputTokens: 20,
  cacheReadTokens: 4,
  cacheWriteTokens: 2,
  totalTokens: 36,
  reasoningTokens: 7,
};

function listed(root) {
  const names = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const rel = relative(root, full).split(sep).join("/");
      names.push(rel);
      if (statSync(full).isDirectory()) walk(full);
    }
  };
  walk(root);
  return names;
}

test("[unit] USE-1 overBudget is exclusive at 1.25x and fails a positive total against 0", () => {
  // Arrange / Act / Assert
  assert.equal(overBudget(100, 80), false);
  assert.equal(overBudget(101, 80), true);
  assert.equal(overBudget(1, 0), true);
  assert.equal(overBudget(0, 0), false);
});

test("[unit] USE-2 getUsage rejection keeps SDK totals and stores reasoningTokens without adding them", async () => {
  // Arrange
  const result = {
    usage: SIX_FIELDS,
    requestId: "req-1",
    status: "finished",
  };

  // Act
  const outcome = await buildUsageRecord({
    scenario: "ordinary",
    model: "composer-2.5",
    result,
    getUsage: async () => {
      throw new Error("feature_unavailable");
    },
  });

  // Assert
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.record.cost, null);
  assert.equal(outcome.record.usage.totalTokens, SIX_FIELDS.totalTokens);
  assert.equal(outcome.record.usage.reasoningTokens, 7);
  assert.equal(outcome.record.usage.totalTokens, 36);
  assert.equal(
    outcome.record.usage.inputTokens +
      outcome.record.usage.outputTokens +
      outcome.record.usage.cacheReadTokens +
      outcome.record.usage.cacheWriteTokens,
    outcome.record.usage.totalTokens,
  );
});

test("[unit] USE-3 missing usage fails without writing outside .tito/evals/", async () => {
  // Arrange
  const root = mkdtempSync(join(tmpdir(), "tito-usage-eval-"));
  writeFileSync(join(root, "keep.txt"), "ok\n");
  try {
    // Act
    const outcome = await buildUsageRecord({
      scenario: "ordinary",
      model: "composer-2.5",
      result: { usage: undefined, requestId: "req-2", status: "finished" },
      getUsage: async () => ({ cost: { rawCostCents: 1, chargedCents: 1 } }),
    });
    persistOutcome(root, outcome);

    // Assert
    assert.equal(outcome.ok, false);
    if (outcome.ok) return;
    assert.equal(outcome.failure, "missing-usage");
    for (const name of listed(root)) {
      assert.ok(
        name === "keep.txt" || name === ".tito" || name.startsWith(".tito/evals/"),
        `wrote outside .tito/evals/: ${name}`,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("[unit] USE-4 scenario ids are ordinary, plan, and tito with read-only prompts", () => {
  // Arrange / Act
  const ids = USAGE_SCENARIOS.map((scenario) => scenario.id);

  // Assert
  assert.deepEqual(ids, ["ordinary", "plan", "tito"]);
  for (const scenario of USAGE_SCENARIOS) {
    assert.doesNotMatch(scenario.prompt, /\bedit\b/i);
    assert.doesNotMatch(scenario.prompt, /\bshell\b/i);
  }
});

test("[unit] --record overwrites the baseline and ignores the ratio", () => {
  // Arrange
  const root = mkdtempSync(join(tmpdir(), "tito-usage-baseline-"));
  const record = {
    scenario: "ordinary",
    model: "composer-2.5",
    usage: { ...SIX_FIELDS, totalTokens: 200 },
    cost: null,
    requestId: "req-3",
    status: "finished",
  };
  const prior = {
    model: "composer-2.5",
    scenarios: { ordinary: { totalTokens: 80 } },
  };
  try {
    // Act
    const failures = thresholdFailures([record], prior);
    const recorded = evalExitCode({ record: true, missingUsage: false, overBudget: failures.length > 0 });
    const compared = evalExitCode({ record: false, missingUsage: false, overBudget: failures.length > 0 });
    const next = baselineFromRecords([record]);
    writeBaseline(root, next);

    // Assert
    assert.ok(failures.length > 0);
    assert.equal(recorded, 0);
    assert.equal(compared, 1);
    assert.equal(next.scenarios.ordinary.totalTokens, 200);
    assert.deepEqual(listed(root), ["evals", "evals/usage-baseline.json"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
