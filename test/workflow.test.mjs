import assert from "node:assert/strict";
import test from "node:test";
import {
  LifecycleTransitionError,
  transitionLifecycle,
} from "../dist/core/lifecycle.js";
import { recommendMode } from "../dist/core/routing.js";

const none = { approvedSmallSlice: false, inScopeReviewRevision: false };
const small = { approvedSmallSlice: true, inScopeReviewRevision: false };
const revision = { approvedSmallSlice: false, inScopeReviewRevision: true };

function rejects(from, to, authorization, code) {
  assert.throws(
    () => transitionLifecycle(from, to, authorization),
    (error) => {
      assert.ok(error instanceof LifecycleTransitionError);
      assert.equal(error.code, code);
      return true;
    },
  );
}

test("lifecycle allows the brief path and rejects skips", () => {
  const linear = [
    ["DISCOVERY", "PLANNED"],
    ["PLANNED", "APPROVED"],
    ["APPROVED", "IMPLEMENTING"],
    ["IMPLEMENTING", "READY_FOR_REVIEW"],
    ["READY_FOR_REVIEW", "APPROVED_FOR_COMMIT"],
    ["APPROVED_FOR_COMMIT", "DONE"],
  ];
  for (const [from, to] of linear) {
    assert.equal(transitionLifecycle(from, to, none), to);
  }
  assert.equal(transitionLifecycle("DISCOVERY", "APPROVED", small), "APPROVED");
  assert.equal(
    transitionLifecycle("READY_FOR_REVIEW", "IMPLEMENTING", revision),
    "IMPLEMENTING",
  );
  rejects("DISCOVERY", "APPROVED", none, "missing-authorization");
  rejects("READY_FOR_REVIEW", "IMPLEMENTING", none, "missing-authorization");
  rejects("DISCOVERY", "IMPLEMENTING", small, "illegal-transition");
  rejects("PLANNED", "DONE", none, "illegal-transition");
  rejects("DONE", "DISCOVERY", none, "illegal-transition");
  rejects("DISCOVERY", "DISCOVERY", none, "illegal-transition");
  rejects("PLAN_BUILD_CLICKED", "APPROVED", small, "invalid-state");
  rejects("DISCOVERY", "AGENT_MODE", none, "invalid-state");
});

const facts = {
  intent: "read-only",
  ambiguous: false,
  multiModule: false,
  architectureChange: false,
  migration: false,
  securitySensitive: false,
  accountingInvariant: false,
  requiresSlicing: false,
  escalationTopics: [],
  approvedImplementationSlice: false,
};

function route(overrides) {
  return recommendMode({ ...facts, ...overrides });
}

test("mode routing follows explicit facts and escalation", () => {
  assert.deepEqual(route({}), {
    mode: "Ask",
    reasonCodes: ["read-only-discovery"],
    carefulHandling: false,
    independentReview: false,
  });
  assert.deepEqual(route({ intent: "change" }).reasonCodes, ["change-needs-approval"]);

  for (const key of ["ambiguous", "multiModule", "requiresSlicing"]) {
    const result = route({ [key]: true });
    assert.equal(result.mode, "Plan");
    assert.deepEqual(result.reasonCodes, ["planning-required"]);
    assert.equal(result.independentReview, false);
  }
  const architecture = route({ architectureChange: true });
  assert.equal(architecture.mode, "Plan");
  assert.equal(architecture.independentReview, true);
  assert.equal(architecture.carefulHandling, false);

  for (const key of ["migration", "securitySensitive", "accountingInvariant"]) {
    const result = route({ [key]: true });
    assert.equal(result.mode, "Plan");
    assert.deepEqual(result.reasonCodes, ["critical-work"]);
    assert.equal(result.carefulHandling, true);
    assert.equal(result.independentReview, true);
  }

  const escalated = route({ escalationTopics: ["secrets"] });
  assert.equal(escalated.mode, "Plan");
  assert.deepEqual(escalated.reasonCodes, ["mandatory-escalation"]);
  assert.equal(escalated.carefulHandling, true);
  assert.equal(escalated.independentReview, true);

  assert.deepEqual(
    route({
      intent: "change",
      ambiguous: true,
      securitySensitive: true,
      escalationTopics: ["payments"],
      approvedImplementationSlice: true,
    }),
    {
      mode: "Agent",
      reasonCodes: [
        "approved-implementation-slice",
        "mandatory-escalation",
        "critical-work",
        "planning-required",
      ],
      carefulHandling: true,
      independentReview: true,
    },
  );
  assert.equal(route({ approvedImplementationSlice: true }).mode, "Agent");
});
