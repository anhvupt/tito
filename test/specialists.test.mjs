import assert from "node:assert/strict";
import test from "node:test";
import {
  DelegationError,
  SPECIALISTS,
  validateDelegation,
} from "../dist/core/specialists.js";

const none = { activeWriters: [], readOnlySpecialists: [] };

function rejects(request, phase, code) {
  assert.throws(
    () => validateDelegation(request, phase),
    (error) => {
      assert.ok(error instanceof DelegationError);
      assert.equal(error.code, code);
      return true;
    },
  );
}

test("specialist catalog separates writers from advisers", () => {
  assert.equal(Object.isFrozen(SPECIALISTS), true);
  assert.equal(SPECIALISTS["backend-engineer"].capability, "write-code");
  assert.equal(SPECIALISTS["frontend-engineer"].capability, "write-code");
  assert.equal(SPECIALISTS["devops-engineer"].capability, "write-infrastructure");
  for (const id of ["explorer", "product-analyst", "architect", "erp-specialist", "qa-reviewer", "security-reviewer"]) {
    assert.equal(SPECIALISTS[id].capability, "read-only");
  }
  assert.equal(SPECIALISTS["erp-specialist"].defaultTier, "Reasoning");
  assert.equal(SPECIALISTS.explorer.defaultTier, "Scout");
});

test("delegation allows one writer and bounded read-only specialists", () => {
  assert.deepEqual(
    validateDelegation(
      {
        activeWriters: ["backend-engineer"],
        readOnlySpecialists: ["erp-specialist", "architect"],
      },
      "implementation",
    ),
    {
      activeWriter: "backend-engineer",
      readOnlySpecialists: ["erp-specialist", "architect"],
    },
  );
  assert.deepEqual(
    validateDelegation(
      { activeWriters: [], readOnlySpecialists: ["explorer", "qa-reviewer"] },
      "review",
    ).activeWriter,
    null,
  );

  rejects({ ...none, activeWriters: ["backend-engineer", "frontend-engineer"] }, "implementation", "multiple-writers");
  rejects({ ...none, activeWriters: ["erp-specialist"] }, "implementation", "read-only-as-writer");
  rejects({ ...none, activeWriters: ["tito"] }, "implementation", "root-recursion");
  rejects({ ...none, activeWriters: ["backend-engineer"] }, "planning", "writer-outside-implementation");
  rejects(
    { activeWriters: ["backend-engineer"], readOnlySpecialists: ["backend-engineer"] },
    "implementation",
    "duplicate-specialist",
  );
  rejects({ ...none, readOnlySpecialists: ["designer"] }, "discovery", "unknown-specialist");
});
