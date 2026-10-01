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
  assert.equal(careful.maxWriters, 3);
  assert.equal(careful.independentReview, "required");
  assert.deepEqual(careful.preferredAuthoredLines, { min: 100, max: 200 });
  assert.equal(careful.maxAuthoredLinesWithoutApproval, 300);
  assert.equal(careful.maxAuthoredFiles, 6);
  assert.equal(careful.stackedUnreviewedChanges, false);
  assert.equal(careful.humanApproval, "every-slice");
  assert.equal(careful.migrationsRequireRollbackPlans, true);
  assert.equal(careful.writerConstraint, "bounded-parallel");
  assert.deepEqual(careful.unapprovedActions, [
    "commit",
    "merge",
    "push",
    "deployment",
    "publication",
    "external-write",
  ]);
  assert.equal(balanced.maxWriters, 6);
  assert.equal(balanced.writerConstraint, "bounded-parallel");
  assert.equal(balanced.humanReview, "feature-boundaries");
  assert.deepEqual(balanced.independentReviewFor, [
    "security",
    "data",
    "migrations",
    "architecture",
  ]);
  assert.equal(balanced.diffLimits, "moderate");
  assert.equal(balanced.automation, "deterministic-and-reversible");
  assert.equal(fast.maxWriters, 12);
  assert.equal(fast.writerConstraint, "bounded-parallel");
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
  for (const defaultBase of ["dev", "develop", "main", "master"]) {
    assert.deepEqual(
      parseConfig(`schemaVersion: 1\nprofile: solo-balanced\ngit:\n  defaultBase: ${defaultBase}\n`),
      { schemaVersion: 1, profile: "solo-balanced", git: { defaultBase } },
    );
  }

  const cases = [
    ["schemaVersion: [\n", ["yaml-syntax"]],
    ["schemaVersion: 1\nprofile: solo-fast\n---\na: 1\n", ["yaml-syntax"]],
    ["", ["not-a-mapping"]],
    ["- a\n", ["not-a-mapping"]],
    ["schemaVersion: 1\nschemaVersion: 2\nprofile: solo-balanced\n", ["duplicate-key"]],
    ["schemaVersion: 1\nprofile: solo-balanced\nsafetyFloor: []\n", ["unknown-field"]],
    ["schemaVersion: 1\nprofile: solo-balanced\ngit:\n  defaultBase: trunk\n", ["unknown-field"]],
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

test("parses optional product.screenLanguage and rejects other product fields", () => {
  const vietnamese = parseConfig(
    "schemaVersion: 1\nprofile: solo-balanced\nproduct:\n  screenLanguage: vi\n",
  );
  assert.deepEqual(vietnamese, {
    schemaVersion: 1,
    profile: "solo-balanced",
    product: { screenLanguage: "vi" },
  });
  assert.equal("tenancy" in vietnamese.product, false);
  assert.equal("surfaces" in vietnamese.product, false);
  assert.deepEqual(
    parseConfig("schemaVersion: 1\nprofile: solo-balanced\nproduct:\n  screenLanguage: en\n"),
    { schemaVersion: 1, profile: "solo-balanced", product: { screenLanguage: "en" } },
  );
  assert.deepEqual(parseConfig("schemaVersion: 1\nprofile: solo-balanced\n"), {
    schemaVersion: 1,
    profile: "solo-balanced",
  });
  assert.deepEqual(parseConfig("schemaVersion: 1\nprofile: solo-balanced\nproduct: {}\n"), {
    schemaVersion: 1,
    profile: "solo-balanced",
  });
  assert.deepEqual(
    issueCodes(
      "schemaVersion: 1\nprofile: solo-balanced\nproduct:\n  screenLanguage: fr\n",
    ).map((item) => item.code),
    ["unknown-field"],
  );
  assert.equal(
    issueCodes("schemaVersion: 1\nprofile: solo-balanced\nproduct:\n  locale: vi\n")[0].path,
    "product.locale",
  );
});

test("T1 multi-tenant config parses surfaces in order", () => {
  const config = parseConfig(
    "schemaVersion: 1\nprofile: solo-balanced\nproduct:\n  tenancy: multi\n  surfaces:\n    - id: admin\n    - id: portal\n    - id: api\n",
  );
  assert.equal(config.product.tenancy, "multi");
  assert.deepEqual(
    config.product.surfaces.map((surface) => surface.id),
    ["admin", "portal", "api"],
  );
});

test("T3 unknown tenancy throws ConfigValidationError", () => {
  const issues = issueCodes(
    "schemaVersion: 1\nprofile: solo-balanced\nproduct:\n  tenancy: shared\n",
  );
  assert.ok(issues.some((item) => item.path?.includes("product.tenancy")));
});

test("T4 duplicate surface ids throw ConfigValidationError", () => {
  const issues = issueCodes(
    "schemaVersion: 1\nprofile: solo-balanced\nproduct:\n  surfaces:\n    - id: admin\n    - id: admin\n",
  );
  assert.ok(issues.some((item) => item.path?.includes("product.surfaces")));
});

test("T5 single tenancy with two surfaces parses", () => {
  assert.deepEqual(
    parseConfig(
      "schemaVersion: 1\nprofile: solo-balanced\nproduct:\n  tenancy: single\n  surfaces:\n    - id: admin\n    - id: portal\n",
    ),
    {
      schemaVersion: 1,
      profile: "solo-balanced",
      product: {
        tenancy: "single",
        surfaces: [{ id: "admin" }, { id: "portal" }],
      },
    },
  );
});

test("rejects an empty surface id and a non-string surface id", () => {
  const emptyId = issueCodes(
    'schemaVersion: 1\nprofile: solo-balanced\nproduct:\n  surfaces:\n    - id: ""\n',
  );
  assert.ok(emptyId.some((item) => item.path?.includes("product.surfaces")));
  const numericId = issueCodes(
    "schemaVersion: 1\nprofile: solo-balanced\nproduct:\n  surfaces:\n    - id: 1\n",
  );
  assert.ok(numericId.some((item) => item.path?.includes("product.surfaces")));
});

test("tenancy or surfaces alone stay valid and an empty surfaces list is rejected", () => {
  assert.deepEqual(
    parseConfig("schemaVersion: 1\nprofile: solo-balanced\nproduct:\n  tenancy: multi\n"),
    { schemaVersion: 1, profile: "solo-balanced", product: { tenancy: "multi" } },
  );
  assert.deepEqual(
    parseConfig(
      "schemaVersion: 1\nprofile: solo-balanced\nproduct:\n  surfaces:\n    - id: admin\n",
    ),
    {
      schemaVersion: 1,
      profile: "solo-balanced",
      product: { surfaces: [{ id: "admin" }] },
    },
  );
  const emptyList = issueCodes(
    "schemaVersion: 1\nprofile: solo-balanced\nproduct:\n  surfaces: []\n",
  );
  assert.ok(emptyList.some((item) => item.path?.includes("product.surfaces")));
  const badId = issueCodes(
    "schemaVersion: 1\nprofile: solo-balanced\nproduct:\n  surfaces:\n    - id: Admin\n",
  );
  assert.ok(badId.some((item) => item.path?.includes("product.surfaces")));
  assert.deepEqual(
    parseConfig(
      "schemaVersion: 1\nprofile: solo-balanced\nproduct:\n  screenLanguage: vi\n  tenancy: single\n  surfaces:\n    - id: admin\n",
    ),
    {
      schemaVersion: 1,
      profile: "solo-balanced",
      product: {
        screenLanguage: "vi",
        tenancy: "single",
        surfaces: [{ id: "admin" }],
      },
    },
  );
});
