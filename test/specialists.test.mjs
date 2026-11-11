import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compiledCursorAgents, compileCursorAgent, cursorAgentPath } from "../dist/core/agents.js";
import {
  DelegationError,
  documentationHandoff,
  READ_ONLY_SPECIALIST_IDS,
  SPECIALISTS,
  WRITER_SPECIALIST_IDS,
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
  cleaner: "finisher",
  startup: "finisher",
  architect: "planner",
  "product-analyst": "advisor",
  "security-reviewer": "planner",
  "erp-specialist": "advisor",
};

const DEFAULT_SLUGS = {
  explorer: "cursor-grok-4.6-medium-fast",
  planner: "grok-4.7-high",
  advisor: "claude-opus-5-5-medium",
  implementer: "cursor-grok-4.6-high",
  reviewer: "grok-4.7-high",
  finisher: "composer-2.5",
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

test("[unit] MD-2 compileCursorAgent pins implementer and planner slugs", () => {
  for (const id of ["backend-engineer", "frontend-engineer", "devops-engineer"]) {
    assert.equal(cardModel(compileCursorAgent(id)), "cursor-grok-4.6-high", id);
  }
  for (const id of ["architect", "security-reviewer"]) {
    assert.equal(cardModel(compileCursorAgent(id)), "grok-4.7-high", id);
  }
});

test("[unit] AD-2 compileCursorAgent product and erp pin claude-opus-5-5-medium; architect and security pin grok-4.7-high", () => {
  for (const id of ["product-analyst", "erp-specialist"]) {
    assert.equal(cardModel(compileCursorAgent(id)), "claude-opus-5-5-medium", id);
  }
  for (const id of ["architect", "security-reviewer"]) {
    assert.equal(cardModel(compileCursorAgent(id)), "grok-4.7-high", id);
  }
});

test("[unit] CL-1 SPECIALISTS.cleaner is a Scout finisher with a compiled card", () => {
  const manifest = SPECIALISTS.cleaner;
  assert.equal(manifest.id, "cleaner");
  assert.equal(manifest.model.role, "finisher");
  assert.equal(manifest.model.tier, "Scout");
  assert.deepEqual(
    manifest.modes.map((mode) => [mode.id, mode.capability]),
    [["implement", "write-files"]],
  );
  assert.equal(WRITER_SPECIALIST_IDS.includes("cleaner"), true);
  assert.equal(READ_ONLY_SPECIALIST_IDS.includes("cleaner"), false);
  assert.equal(cursorAgentPath("cleaner"), ".cursor/agents/tito-cleaner.md");
  const card = compileCursorAgent("cleaner");
  assert.equal(cardModel(card), "composer-2.5");
  assert.match(card, /^name: tito-cleaner$/m);
});

test("[unit] CL-2 validateDelegation can run cleaner as a writer; two documentation writers still reject", () => {
  const result = validateDelegation(
    [activation("cleaner", "implement", "Remove leftover files")],
    "implementation",
  );
  assert.equal(result.mutator?.specialistId, "cleaner");
  assert.equal(result.mutator?.capability, "write-files");
  rejects(
    [
      activation("tech-docs-writer", "update"),
      activation("user-docs-writer", "update"),
    ],
    "implementation",
    "multiple-mutators",
  );
});

test("[unit] SU-1 SPECIALISTS.startup is Scout finisher, mode start write-infrastructure with human-approval; compiled card model composer-2.5; Math.ceil(card.length/4) <= 400", () => {
  const manifest = SPECIALISTS.startup;
  assert.equal(manifest.id, "startup");
  assert.equal(manifest.model.role, "finisher");
  assert.equal(manifest.model.tier, "Scout");
  assert.equal(manifest.role, "Local startup");
  assert.deepEqual(manifest.triggers, ["local infra", "start apps", "pending migrations"]);
  assert.deepEqual(manifest.knowledge, [{ id: "local-startup", load: "task" }]);
  assert.deepEqual(
    manifest.modes.map((mode) => [mode.id, mode.capability, mode.gates, [...mode.phases]]),
    [["start", "write-infrastructure", ["human-approval"], ["implementation"]]],
  );
  assert.equal(WRITER_SPECIALIST_IDS.includes("startup"), true);
  assert.equal(READ_ONLY_SPECIALIST_IDS.includes("startup"), false);
  assert.equal(cursorAgentPath("startup"), ".cursor/agents/tito-startup.md");
  const card = compileCursorAgent("startup");
  assert.equal(cardModel(card), "composer-2.5");
  assert.match(card, /^name: tito-startup$/m);
  assert.ok(Math.ceil(card.length / 4) <= 400, `${card.length} chars`);
  assert.match(card, /do not checkout, pull, stash/i);
  assert.match(card, /task packet records the user's answer/i);
});

test("[unit] SU-2 shipped skill has name tito-local-startup, disable-model-invocation: true, and tells the agent to ask before migrate", () => {
  const skill = readFileSync(
    fileURLToPath(new URL("../templates/cursor/skills/tito-local-startup/SKILL.md", import.meta.url)),
    "utf8",
  );
  assert.match(skill, /^name: tito-local-startup$/m);
  assert.match(skill, /^disable-model-invocation: true$/m);
  assert.match(skill, /ask before/i);
  assert.match(skill, /migrat/i);
});

test("[unit] SU-4 validateDelegation can activate startup:start in implementation", () => {
  const result = validateDelegation(
    [activation("startup", "start", "Start missing local processes")],
    "implementation",
  );
  assert.equal(result.mutator?.specialistId, "startup");
  assert.equal(result.mutator?.modeId, "start");
  assert.equal(result.mutator?.capability, "write-infrastructure");
});

test("[unit] SU-5 both local-startup skill copies are byte-identical and mention the git check", () => {
  // Arrange
  const livePath = fileURLToPath(
    new URL("../.cursor/skills/tito-local-startup/SKILL.md", import.meta.url),
  );
  const shippedPath = fileURLToPath(
    new URL("../templates/cursor/skills/tito-local-startup/SKILL.md", import.meta.url),
  );

  // Act
  const live = readFileSync(livePath);
  const shipped = readFileSync(shippedPath);
  const text = live.toString("utf8");

  // Assert
  assert.equal(Buffer.compare(live, shipped), 0);
  assert.match(text, /git status/);
  assert.match(text, /stay on the current branch or switch to the base/);
  assert.match(text, /git pull --ff-only/);
  assert.match(text, /dirty tree is solved only after the user says yes/);
  assert.match(text, /pull that cannot fast-forward is solved only after the user says yes/);
  assert.match(text, /ask before applying them/);
});
