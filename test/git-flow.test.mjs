import assert from "node:assert/strict";
import test from "node:test";
import {
  canApprovePullRequest,
  checkoutCommands,
  linearReference,
  mergeDecision,
  prunePlanIndex,
  pullRequestDescription,
  pullRequestTemplate,
  suggestBranch,
} from "../dist/core/git-flow.js";

test("Tito suggests the branch and waits for acceptance", () => {
  const feature = suggestBranch({
    taskKind: "feature",
    slug: "Git Flow Gate",
    existingBases: ["develop"],
    currentBranch: "feat/old",
    continuesFromCurrent: false,
  });
  assert.equal(feature.line, "Suggested branch: feat/git-flow-gate from develop");
  assert.match(feature.reason, /develop/);
  assert.deepEqual(checkoutCommands(feature.base, feature.name), [
    "git checkout develop",
    "git checkout -b feat/git-flow-gate",
  ]);
  assert.equal(
    suggestBranch({
      taskKind: "feature",
      slug: "notes",
      existingBases: ["develop", "dev"],
      currentBranch: "topic",
      continuesFromCurrent: false,
    }).base,
    "dev",
  );
  assert.equal(
    suggestBranch({
      taskKind: "feature",
      slug: "notes",
      existingBases: ["master"],
      currentBranch: "topic",
      continuesFromCurrent: false,
      defaultBase: "master",
    }).base,
    "master",
  );

  const emergency = suggestBranch({
    taskKind: "production-emergency",
    slug: "auth outage",
    existingBases: ["develop", "master"],
    currentBranch: "develop",
    continuesFromCurrent: true,
    defaultBase: "develop",
  });
  assert.equal(emergency.base, "master");
  assert.equal(emergency.type, "hot-fix");
  assert.equal(
    suggestBranch({
      taskKind: "production-emergency",
      slug: "auth outage",
      existingBases: ["dev", "main"],
      currentBranch: "dev",
      continuesFromCurrent: true,
      defaultBase: "dev",
    }).base,
    "main",
  );
  assert.equal(
    suggestBranch({
      taskKind: "production-emergency",
      slug: "auth outage",
      existingBases: ["main"],
      currentBranch: "develop",
      continuesFromCurrent: false,
      defaultBase: "master",
    }).base,
    "master",
  );
  assert.equal(
    suggestBranch({
      taskKind: "production-emergency",
      slug: "auth outage",
      existingBases: ["master"],
      currentBranch: "topic",
      continuesFromCurrent: false,
    }).base,
    "master",
  );

  const continued = suggestBranch({
    taskKind: "bug",
    slug: "login",
    existingBases: ["dev", "master"],
    currentBranch: "master",
    continuesFromCurrent: true,
  });
  assert.equal(continued.line, "Suggested branch: fix/login from master");

  const missingDevelopment = suggestBranch({
    taskKind: "tooling",
    slug: "notes",
    existingBases: ["main"],
    currentBranch: "topic",
    continuesFromCurrent: false,
  });
  assert.equal(missingDevelopment.base, "main");
  assert.match(missingDevelopment.reason, /no dev or develop/);
});

test("plan index, Linear, pull requests, and merge stay gated", () => {
  assert.deepEqual(
    prunePlanIndex(
      [
        { name: "kept", cursorPlanPath: "/plans/kept.md", branch: "feat/kept" },
        { name: "gone", cursorPlanPath: "/plans/gone.md", branch: "feat/gone" },
      ],
      (path) => path.endsWith("kept.md"),
    ),
    [{ name: "kept", cursorPlanPath: "/plans/kept.md", branch: "feat/kept" }],
  );
  assert.deepEqual(
    linearReference({ linearConnected: true, userAskedToCreate: false }),
    { issueId: null, createIssue: false },
  );
  assert.equal(
    linearReference({
      linearConnected: false,
      userAskedToCreate: true,
      issueId: "ENG-1",
    }).createIssue,
    false,
  );
  const description = pullRequestDescription({
    problem: "Branch names had no shared git-flow rules.",
    done: ["Suggest a branch before checkout."],
    reviewFixes: ["Accept dev, develop, main, and master."],
    checks: ["npm test passed."],
  });
  assert.equal(
    description,
    [
      "## Problem",
      "Branch names had no shared git-flow rules.",
      "",
      "## What changed",
      "- Suggest a branch before checkout.",
      "",
      "## Review fixes",
      "- Accept dev, develop, main, and master.",
      "",
      "## Checks",
      "- npm test passed.",
    ].join("\n"),
  );
  assert.match(description, /## Problem/);
  assert.equal(pullRequestTemplate().includes("## Problem"), true);
  assert.equal(pullRequestTemplate().includes("## What changed"), true);
  assert.equal(pullRequestTemplate().includes("## Review fixes"), true);
  assert.equal(pullRequestTemplate().includes("## Checks"), true);
  assert.match(
    pullRequestDescription({
      problem: "A short problem.",
      done: ["One change."],
      reviewFixes: [],
      checks: ["Build passed."],
    }),
    /No review fixes\./,
  );
  assert.equal(
    pullRequestDescription({
      problem: "Two\nlines",
      done: ["One change."],
      reviewFixes: [],
      checks: ["Build passed."],
    }),
    null,
  );
  assert.equal(
    pullRequestDescription({
      problem: "A short problem.",
      done: [],
      reviewFixes: [],
      checks: ["Build passed."],
    }),
    null,
  );
  assert.equal(
    pullRequestDescription({
      problem: "A short problem.",
      done: Array.from({ length: 41 }, () => "Change."),
      reviewFixes: [],
      checks: ["Build passed."],
    }),
    null,
  );
  assert.equal(canApprovePullRequest(), false);
  assert.equal(mergeDecision({ userAskedToMerge: true, hasApproval: false }).allowed, false);
  assert.equal(mergeDecision({ userAskedToMerge: false, hasApproval: true }).allowed, false);
  assert.equal(mergeDecision({ userAskedToMerge: true, hasApproval: true }).allowed, true);
});
