import assert from "node:assert/strict";
import test from "node:test";
import { compiledCursorAgents, compileCursorAgent } from "../dist/core/agents.js";
import {
  DelegationError,
  documentationHandoff,
  SPECIALISTS,
  validateDelegation,
} from "../dist/core/specialists.js";

function activation(specialistId, modeId, purpose = "Bounded purpose") {
  return { specialistId, modeId, purpose };
}

function rejects(activations, phase, code, maxWriters) {
  assert.throws(
    () => validateDelegation(activations, phase, maxWriters),
    (error) => {
      assert.ok(error instanceof DelegationError);
      assert.equal(error.code, code);
      return true;
    },
  );
}

test("specialist manifests describe modes, knowledge, and handoffs", () => {
  assert.equal(Object.isFrozen(SPECIALISTS), true);
  for (const manifest of Object.values(SPECIALISTS)) {
    assert.equal(manifest.version, 1);
    assert.equal("preferred" in manifest.model, false);
    assert.equal(manifest.model.fallbackPolicy, "ask-user");
    assert.ok(manifest.triggers.length > 0);
    assert.equal(manifest.handoffs.includes(manifest.id), false);
    assert.equal(manifest.handoffs.length, Object.keys(SPECIALISTS).length - 1);
  }
  assert.equal(SPECIALISTS.explorer.model.tier, "Scout");
  assert.equal(SPECIALISTS["erp-specialist"].model.tier, "Reasoning");
  assert.deepEqual(
    SPECIALISTS["frontend-engineer"].modes.map((mode) => [mode.id, mode.capability]),
    [["design", "read-only"], ["implement", "write-files"]],
  );
  assert.deepEqual(
    SPECIALISTS["devops-engineer"].modes.map((mode) => [mode.id, mode.capability, mode.gates]),
    [["plan", "read-only", []], ["implement", "write-infrastructure", ["human-approval"]]],
  );
  assert.equal(
    SPECIALISTS["frontend-engineer"].knowledge.some((item) => item.load === "stack"),
    true,
  );
  assert.deepEqual(
    ["tech-docs-writer", "user-docs-writer"].map(
      (id) => SPECIALISTS[id].modes[0].capability,
    ),
    ["write-files", "write-files"],
  );
  assert.equal(SPECIALISTS["tech-docs-writer"].model.tier, "Scout");
  assert.equal(SPECIALISTS["user-docs-writer"].model.tier, "Scout");
});

test("delegation follows the selected specialist mode", () => {
  assert.deepEqual(
    validateDelegation(
      [
        activation("frontend-engineer", "implement", "Build the approved form"),
        activation("erp-specialist", "advise", "Check inventory rules"),
      ],
      "implementation",
    ).mutator?.specialistId,
    "frontend-engineer",
  );
  assert.equal(
    validateDelegation(
      [
        activation("qa-reviewer", "review"),
        activation("security-reviewer", "review"),
      ],
      "review",
    ).mutator,
    null,
  );
  assert.equal(
    validateDelegation([activation("frontend-engineer", "design")], "planning").mutator,
    null,
  );

  rejects(
    [
      activation("backend-engineer", "implement"),
      activation("frontend-engineer", "implement"),
    ],
    "implementation",
    "multiple-mutators",
  );
  const parallel = validateDelegation(
    [
      activation("backend-engineer", "implement"),
      activation("frontend-engineer", "implement"),
      activation("devops-engineer", "implement"),
    ],
    "implementation",
    3,
  );
  assert.equal(parallel.mutators.length, 3);
  assert.equal(parallel.mutator, null);
  rejects(
    [
      activation("backend-engineer", "implement"),
      activation("frontend-engineer", "implement"),
      activation("devops-engineer", "implement"),
      activation("tech-docs-writer", "update"),
    ],
    "implementation",
    "multiple-mutators",
    3,
  );
  rejects([activation("erp-specialist", "implement")], "implementation", "unknown-mode");
  rejects([activation("frontend-engineer", "implement")], "planning", "wrong-phase");
  rejects([activation("explorer", "scout", "  ")], "discovery", "missing-purpose");
  rejects(
    [activation("architect", "plan"), activation("architect", "plan")],
    "planning",
    "duplicate-specialist",
  );
  rejects([activation("tito", "scout")], "discovery", "root-recursion");
  rejects([activation("designer", "plan")], "planning", "unknown-specialist");
});

test("a finished module schedules documentation writers one at a time", () => {
  const handoff = documentationHandoff("billing");
  assert.deepEqual(
    handoff.map((item) => item.specialistId),
    ["tech-docs-writer", "user-docs-writer"],
  );
  assert.match(handoff[0].purpose, /technical documentation for billing/);
  assert.match(handoff[1].purpose, /user documentation for billing/);
  rejects(handoff, "implementation", "multiple-mutators");
  assert.equal(
    validateDelegation([handoff[0]], "implementation").mutator?.specialistId,
    "tech-docs-writer",
  );
});

test("[unit] WP-2 every compiled specialist card stays within 400 tokens", () => {
  for (const card of compiledCursorAgents()) {
    assert.ok(Math.ceil(card.body.length / 4) <= 400, `${card.path} ${card.body.length}`);
  }
});

test("[unit] WP-3 stack cards use official sources and do not name angular", () => {
  const official =
    "For a stack entry, use the stack owner's official resource for the project's version. Judge it before use. Do not copy it into the repo.";
  for (const id of ["frontend-engineer", "backend-engineer", "devops-engineer"]) {
    const card = compileCursorAgent(id);
    assert.match(card, /`official-stack-sources` \(stack\)/);
    assert.equal(card.includes("angular"), false);
    assert.equal(card.includes(official), true);
  }
  assert.equal(compileCursorAgent("qa-reviewer").includes(official), false);
});

test("[unit] WP-4 architect card weighs options for this risk profile", () => {
  const card = compileCursorAgent("architect");
  assert.match(card, /options with pros and cons/);
  assert.match(card, /risk profile/);
  assert.match(card, /the pick for this project's risk profile/);
  assert.match(card, /purpose is unclear/);
});

test("[unit] WP-5 explorer card reports the official source and a verdict", () => {
  const card = compileCursorAgent("explorer");
  assert.match(card, /officially maintained resource/);
  assert.match(card, /maintainer/);
  assert.match(card, /last update/);
  assert.match(card, /verdict/);
});

const ROLE_OF = {
  explorer: "explorer",
  "backend-engineer": "implementer",
  "frontend-engineer": "implementer",
  "devops-engineer": "implementer",
  "qa-reviewer": "reviewer",
  "tech-docs-writer": "finisher",
  "user-docs-writer": "finisher",
  architect: "planner",
  "product-analyst": "planner",
  "security-reviewer": "planner",
  "erp-specialist": "planner",
};

const DEFAULT_SLUGS = {
  explorer: "cursor-grok-4.6-medium-fast",
  planner: "claude-opus-5-5-medium",
  implementer: "grok-4.7-high",
  reviewer: "grok-4.7-high",
  finisher: "claude-sonnet-5-5-high",
};

function cardModel(card) {
  return card.match(/^model: (.+)$/m)?.[1];
}

test("[unit] PM-1 every specialist maps to its model role", () => {
  for (const [id, role] of Object.entries(ROLE_OF)) {
    assert.equal(SPECIALISTS[id].model.role, role, id);
  }
});

test("[unit] PM-2 compiled cards pin the role's default slug and never inherit", () => {
  for (const [id, role] of Object.entries(ROLE_OF)) {
    const card = compileCursorAgent(id);
    assert.equal(card.includes("model: inherit"), false, id);
    assert.equal(cardModel(card), DEFAULT_SLUGS[role], id);
  }
  for (const card of compiledCursorAgents()) {
    assert.equal(card.body.includes("model: inherit"), false, card.path);
  }
});

test("[unit] PM-3 a tito.yaml implementer override reaches the writer cards", () => {
  const models = { implementer: "gpt-5.3-codex" };
  for (const id of ["backend-engineer", "frontend-engineer", "devops-engineer"]) {
    assert.equal(cardModel(compileCursorAgent(id, models)), "gpt-5.3-codex", id);
  }
  assert.equal(cardModel(compileCursorAgent("qa-reviewer", models)), DEFAULT_SLUGS.reviewer);
  assert.equal(cardModel(compileCursorAgent("architect", models)), DEFAULT_SLUGS.planner);
  const compiled = compiledCursorAgents(models);
  assert.equal(
    cardModel(compiled.find((card) => card.path === ".cursor/agents/tito-backend.md").body),
    "gpt-5.3-codex",
  );
});

test("[unit] WP-6 product analyst returns Domain and at most one suggestion", () => {
  const card = compileCursorAgent("product-analyst");
  assert.match(card, /Domain/);
  assert.match(card, /business impact/);
  assert.match(card, /at most one optional/);
});
