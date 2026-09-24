import assert from "node:assert/strict";
import test from "node:test";
import {
  WorkPlanError,
  evaluateWorkPlan,
  validateWorkPlan,
} from "../dist/core/work-plan.js";

const read = (id, dependsOn = [], specialist = "explorer") => ({
  id,
  title: id,
  kind: "read-only",
  specialist,
  dependsOn,
});
const write = (id, dependsOn = [], reviewRequirement = "self") => ({
  id,
  title: id,
  kind: "implementation",
  specialist: "backend-engineer",
  reviewRequirement,
  dependsOn,
});
const review = (id, reviews, dependsOn = [reviews]) => ({
  id,
  title: id,
  kind: "review",
  specialist: "qa-reviewer",
  reviews,
  dependsOn,
});
const plan = (slices, profile = "solo-balanced") => ({ profile, slices });
const progress = (overrides = {}) => ({
  activeReadOnlySliceIds: [],
  completedSliceIds: [],
  implementationStates: {},
  ...overrides,
});

function rejects(candidate, code, candidateProgress) {
  assert.throws(
    () =>
      candidateProgress === undefined
        ? validateWorkPlan(candidate)
        : evaluateWorkPlan(candidate, candidateProgress),
    (error) => {
      assert.ok(error instanceof WorkPlanError);
      assert.equal(error.code, code);
      return true;
    },
  );
}

test("validates and freezes a fan-out and fan-in work plan", () => {
  const validated = validateWorkPlan(
    plan([
      read("requirements"),
      read("architecture"),
      write("backend", ["requirements", "architecture"], "independent"),
      review("backend-review", "backend"),
      write("frontend", ["backend", "backend-review"]),
    ]),
  );
  assert.equal(Object.isFrozen(validated), true);
  assert.equal(Object.isFrozen(validated.slices), true);
  assert.equal(Object.isFrozen(validated.slices[2].dependsOn), true);
  assert.deepEqual(validated.slices.map(({ id }) => id), [
    "requirements",
    "architecture",
    "backend",
    "backend-review",
    "frontend",
  ]);
});

test("rejects every structural and capability error", () => {
  const cases = [
    ["invalid-plan", null],
    ["invalid-plan", { profile: "solo-balanced", slices: [{ id: "a" }] }],
    ["invalid-profile", plan([], "unknown")],
    ["invalid-id", plan([read(" ")])],
    ["duplicate-id", plan([read("same"), read("same")])],
    ["duplicate-prerequisite", plan([read("a"), read("b", ["a", "a"])])],
    ["missing-prerequisite", plan([read("a", ["missing"])])],
    ["self-prerequisite", plan([read("a", ["a"])])],
    ["cycle", plan([read("a", ["b"]), read("b", ["a"])])],
    ["invalid-slice-kind", plan([{ ...read("a"), kind: "unknown" }])],
    ["invalid-specialist", plan([read("a", [], "backend-engineer")])],
    ["invalid-specialist", plan([{ ...write("a"), specialist: "toString" }])],
    ["invalid-review-requirement", plan([{ ...write("a"), reviewRequirement: "none" }])],
    ["invalid-review-target", plan([read("a"), review("review", "a")])],
    ["missing-independent-review", plan([write("a", [], "independent")])],
    ["missing-independent-review", plan([write("a")], "client-careful")],
  ];
  for (const [code, candidate] of cases) rejects(candidate, code);
});

test("returns concurrent read-only work and serial approved writer candidates", () => {
  const candidate = plan([
    read("requirements"),
    read("architecture"),
    write("backend", ["requirements", "architecture"]),
    write("ops"),
  ]);
  const initial = evaluateWorkPlan(
    candidate,
    progress({ implementationStates: { backend: "APPROVED", ops: "APPROVED" } }),
  );
  assert.deepEqual(initial.readyReadOnly.map(({ id }) => id), [
    "requirements",
    "architecture",
  ]);
  assert.deepEqual(initial.readyWriterCandidates.map(({ id }) => id), ["ops"]);

  const active = evaluateWorkPlan(
    candidate,
    progress({
      completedSliceIds: ["requirements", "architecture"],
      implementationStates: { backend: "IMPLEMENTING", ops: "APPROVED" },
    }),
  );
  assert.deepEqual(active.readyWriterCandidates, []);
  assert.deepEqual(active.blocked.find(({ sliceId }) => sliceId === "ops")?.reasons, [
    "writer-active:backend",
  ]);
});

test("applies review and profile-specific prerequisite thresholds", () => {
  const balanced = plan([
    write("backend"),
    review("backend-review", "backend"),
    write("frontend", ["backend"]),
  ]);
  const atReview = progress({
    implementationStates: {
      backend: "READY_FOR_REVIEW",
      frontend: "APPROVED",
    },
  });
  assert.deepEqual(
    evaluateWorkPlan(balanced, atReview).readyReadOnly.map(({ id }) => id),
    ["backend-review"],
  );
  assert.deepEqual(
    evaluateWorkPlan(balanced, atReview).readyWriterCandidates.map(({ id }) => id),
    ["frontend"],
  );
  const careful = plan([
    write("backend", [], "independent"),
    review("backend-review", "backend"),
    write("frontend", ["backend"], "independent"),
    review("frontend-review", "frontend"),
  ], "client-careful");
  const carefulReadiness = evaluateWorkPlan(careful, atReview);
  assert.deepEqual(carefulReadiness.readyWriterCandidates, []);
  assert.ok(
    carefulReadiness.blocked
      .find(({ sliceId }) => sliceId === "frontend")
      ?.reasons.includes("unreviewed-slice:backend"),
  );

  const independent = plan([
    write("backend", [], "independent"),
    review("backend-review", "backend"),
    write("frontend", ["backend"]),
  ], "solo-fast");
  assert.deepEqual(evaluateWorkPlan(independent, atReview).readyWriterCandidates, []);
  assert.deepEqual(
    evaluateWorkPlan(
      independent,
      progress({
        completedSliceIds: ["backend-review"],
        implementationStates: {
          backend: "APPROVED_FOR_COMMIT",
          frontend: "APPROVED",
        },
      }),
    ).readyWriterCandidates.map(({ id }) => id),
    ["frontend"],
  );
});

test("rejects inconsistent progress and multiple active writers", () => {
  const candidate = plan([read("analysis"), write("a"), write("b")]);
  rejects(candidate, "invalid-progress", null);
  rejects(
    candidate,
    "invalid-progress",
    progress({ activeReadOnlySliceIds: ["missing"] }),
  );
  rejects(
    candidate,
    "multiple-active-writers",
    progress({ implementationStates: { a: "IMPLEMENTING", b: "IMPLEMENTING" } }),
  );
  rejects(
    plan([write("a"), review("review", "a")]),
    "invalid-progress",
    progress({
      activeReadOnlySliceIds: ["review"],
      implementationStates: { a: "APPROVED" },
    }),
  );
  rejects(
    plan([write("a"), review("review", "a")]),
    "invalid-progress",
    progress({
      completedSliceIds: ["review"],
      implementationStates: { a: "APPROVED" },
    }),
  );
  rejects(
    plan([read("analysis"), write("a", ["analysis"])]),
    "invalid-progress",
    progress({ implementationStates: { a: "IMPLEMENTING" } }),
  );
  rejects(
    plan([write("a", [], "independent"), review("a-review", "a")]),
    "invalid-progress",
    progress({ implementationStates: { a: "APPROVED_FOR_COMMIT" } }),
  );
  rejects(
    plan([
      write("a", [], "independent"),
      review("a-review", "a"),
      write("b", [], "independent"),
      review("b-review", "b"),
    ], "client-careful"),
    "invalid-progress",
    progress({
      implementationStates: { a: "READY_FOR_REVIEW", b: "IMPLEMENTING" },
    }),
  );
  rejects(
    plan([
      write("a", [], "independent"),
      review("a-review", "a"),
      write("b", [], "independent"),
      review("b-review", "b"),
    ], "client-careful"),
    "invalid-progress",
    progress({
      implementationStates: {
        a: "READY_FOR_REVIEW",
        b: "READY_FOR_REVIEW",
      },
    }),
  );
});
