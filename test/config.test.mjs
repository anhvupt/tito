import assert from "node:assert/strict";
import test from "node:test";
import { ConfigValidationError, parseConfig } from "../dist/core/config.js";
import {
  FUTURE_RISK_PROFILES,
  MANDATORY_ESCALATION_TOPICS,
  RISK_PROFILES,
} from "../dist/core/profiles.js";

function issueCodes(text) {
  assert.throws(
    () => parseConfig(text),
    (error) => {
      assert.ok(error instanceof ConfigValidationError);
      issueCodes.issues = error.issues;
      return true;
    },
  );
  return issueCodes.issues;
}

test("risk profiles preserve the brief and shared safety floor", () => {
  const careful = RISK_PROFILES["client-careful"];
  const balanced = RISK_PROFILES["solo-balanced"];
  const fast = RISK_PROFILES["solo-fast"];
  assert.deepEqual(MANDATORY_ESCALATION_TOPICS, [
    "authentication-and-authorization",
    "payments",
    "secrets",
    "production-data",
    "destructive-database-changes",
    "privacy-sensitive-information",
    "public-infrastructure",
    "irreversible-external-actions",
    "accounting-and-financial-invariants",
  ]);
  assert.equal(careful.maxWriters, 1);
  assert.equal(careful.independentReview, "required");
  assert.deepEqual(careful.preferredAuthoredLines, { min: 100, max: 200 });
  assert.equal(careful.maxAuthoredLinesWithoutApproval, 300);
  assert.equal(careful.maxAuthoredFiles, 6);
  assert.equal(careful.stackedUnreviewedChanges, false);
  assert.equal(careful.humanApproval, "every-slice");
  assert.equal(careful.migrationsRequireRollbackPlans, true);
  assert.equal(careful.writerConstraint, "one-at-a-time");
  assert.deepEqual(careful.unapprovedActions, [
    "commit",
    "merge",
    "push",
    "deployment",
    "publication",
    "external-write",
  ]);
  assert.equal(balanced.maxWriters, 1);
  assert.equal(balanced.writerConstraint, "one-at-a-time");
  assert.equal(balanced.humanReview, "feature-boundaries");
  assert.deepEqual(balanced.independentReviewFor, [
    "security",
    "data",
    "migrations",
    "architecture",
  ]);
  assert.equal(balanced.diffLimits, "moderate");
  assert.equal(balanced.automation, "deterministic-and-reversible");
  assert.equal(fast.maxWriters, 1);
  assert.equal(fast.writerConstraint, "one-at-a-time");
  assert.equal(fast.agentSelfReview, "allowed");
  assert.equal(fast.humanReview, "milestones");
  assert.equal(fast.safetyFloor, MANDATORY_ESCALATION_TOPICS);
  assert.equal(balanced.safetyFloor, MANDATORY_ESCALATION_TOPICS);
  assert.equal(FUTURE_RISK_PROFILES["small-team"].status, "unavailable");
  assert.equal(Object.isFrozen(RISK_PROFILES), true);
  assert.equal(Object.isFrozen(MANDATORY_ESCALATION_TOPICS), true);
});

test("parses every active profile and rejects closed-schema violations", () => {
  for (const profile of ["client-careful", "solo-balanced", "solo-fast"]) {
    assert.deepEqual(parseConfig(`schemaVersion: 1\nprofile: ${profile}\n`), {
      schemaVersion: 1,
      profile,
    });
  }

  const cases = [
    ["schemaVersion: [\n", ["yaml-syntax"]],
    ["schemaVersion: 1\nprofile: solo-fast\n---\na: 1\n", ["yaml-syntax"]],
    ["", ["not-a-mapping"]],
    ["- a\n", ["not-a-mapping"]],
    ["schemaVersion: 1\nschemaVersion: 2\nprofile: solo-balanced\n", ["duplicate-key"]],
    ["schemaVersion: 1\nprofile: solo-balanced\nsafetyFloor: []\n", ["unknown-field"]],
    ["profile: solo-balanced\n", ["missing-field"]],
    ["schemaVersion: 1\n", ["missing-field"]],
    ["schemaVersion: 2\nprofile: solo-balanced\n", ["unsupported-schema-version"]],
    ['schemaVersion: "1"\nprofile: solo-balanced\n', ["unsupported-schema-version"]],
    ["schemaVersion: 1\nprofile: nope\n", ["unknown-profile"]],
    ["schemaVersion: 1\nprofile: 4\n", ["unknown-profile"]],
    ["schemaVersion: 1\nprofile: small-team\n", ["unsupported-profile"]],
    ["review: none\n", ["unknown-field", "missing-field", "missing-field"]],
  ];
  for (const [text, codes] of cases) {
    assert.deepEqual(
      issueCodes(text).map((item) => item.code),
      codes,
      text,
    );
  }
  assert.equal(
    issueCodes("schemaVersion: 1\nprofile: small-team\n")[0].message,
    'Profile "small-team" is recognized but not available.',
  );
  assert.match(
    issueCodes("schemaVersion: 1\nprofile: nope\n")[0].message,
    /Active profiles: client-careful, solo-balanced, solo-fast/,
  );
  assert.equal(
    issueCodes("schemaVersion: 1\nschemaVersion: 2\nprofile: solo-balanced\n")[0].path,
    "schemaVersion",
  );
});
