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

const FINISHER_CATALOG = [
  "grok-4.7-high",
  "claude-sonnet-4-6",
  "claude-sonnet-5-5-high",
  "cursor-grok-4.6-medium-fast",
];

const PASSING_CHECKS = {
  guard: true,
  lint: true,
  tests: true,
  build: true,
  docs: true,
};

function sliceDescription(reviewFixes = ["Name the offending file."]) {
  return {
    problem: "Slices could change code before a failing test.",
    done: ["Guard the two test-first commits."],
    reviewFixes,
    checks: [
      "Guard passed.",
      "Lint passed.",
      "Tests passed.",
      "Build passed.",
      "Docs passed.",
    ],
  };
}

function recordingAdapter() {
  const calls = [];
  return {
    calls,
    adapter: {
      push(branch) {
        calls.push({ kind: "push", branch });
      },
      openPullRequest(request) {
        calls.push({ kind: "open", request });
        return { url: "https://example.test/pr/1" };
      },
    },
  };
}

async function finish(input) {
  const { finishSlice } = await import("../dist/core/git-flow.js");
  return finishSlice(input);
}

test("[unit] the finisher opens one ready-for-review pull request when every check passes", async () => {
  const description = sliceDescription([
    "Name the offending file.",
    "Do not push when a check fails.",
  ]);
  const { calls, adapter } = recordingAdapter();
  const result = await finish({
    role: "finisher",
    autoPullRequest: true,
    branch: "feat/test-first-guard",
    base: "main",
    checks: PASSING_CHECKS,
    description,
    catalog: FINISHER_CATALOG,
    adapter,
  });
  assert.equal(result.status, "opened");
  assert.equal(result.model, "claude-sonnet-5-5-high");
  assert.equal(result.pushed, true);
  assert.equal(result.readyForReview, true);
  assert.equal(result.url, "https://example.test/pr/1");
  assert.deepEqual(
    calls.map((call) => call.kind),
    ["push", "open"],
  );
  assert.equal(calls[0].branch, "feat/test-first-guard");
  assert.equal(calls[1].request.head, "feat/test-first-guard");
  assert.equal(calls[1].request.base, "main");
  assert.equal(calls[1].request.title, description.problem);
  assert.equal(calls[1].request.readyForReview, true);
  assert.equal(calls[1].request.body, pullRequestDescription(description));
  assert.match(calls[1].request.body, /## Problem/);
  assert.match(calls[1].request.body, /## What changed/);
  assert.match(calls[1].request.body, /## Review fixes/);
  assert.match(calls[1].request.body, /## Checks/);
  assert.match(calls[1].request.body, /Name the offending file\./);
  assert.match(calls[1].request.body, /Do not push when a check fails\./);
});

test("[unit] a failed check pushes nothing", async () => {
  for (const check of ["guard", "lint", "tests", "build", "docs"]) {
    const { calls, adapter } = recordingAdapter();
    const result = await finish({
      role: "finisher",
      autoPullRequest: true,
      branch: "feat/test-first-guard",
      base: "main",
      checks: { ...PASSING_CHECKS, [check]: false },
      description: sliceDescription(),
      catalog: FINISHER_CATALOG,
      adapter,
    });
    assert.equal(result.status, "failed", check);
    assert.equal(result.pushed, false, check);
    assert.equal(result.check, check);
    assert.match(result.reason, new RegExp(check, "i"));
    assert.equal(calls.length, 0, check);
  }
});

test("[unit] autoPullRequest off or unset asks before opening", async () => {
  for (const autoPullRequest of [false, undefined]) {
    const { calls, adapter } = recordingAdapter();
    const input = {
      role: "finisher",
      branch: "feat/test-first-guard",
      base: "main",
      checks: PASSING_CHECKS,
      description: sliceDescription(),
      catalog: FINISHER_CATALOG,
      adapter,
    };
    if (autoPullRequest !== undefined) input.autoPullRequest = autoPullRequest;
    const result = await finish(input);
    assert.equal(result.status, "ask");
    assert.equal(result.pushed, false);
    assert.match(result.reason, /ask/i);
    assert.equal(calls.length, 0);
  }
});

test("[unit] the implementer and the sandbox are refused a pull request", async () => {
  for (const role of ["implementer", "sandbox"]) {
    const { calls, adapter } = recordingAdapter();
    const result = await finish({
      role,
      autoPullRequest: true,
      branch: "feat/test-first-guard",
      base: "main",
      checks: PASSING_CHECKS,
      description: sliceDescription(),
      catalog: FINISHER_CATALOG,
      adapter,
    });
    assert.equal(result.status, "refused", role);
    assert.equal(result.pushed, false, role);
    assert.match(result.reason, new RegExp(role, "i"));
    assert.equal(calls.length, 0, role);
  }
});

test("[unit] pushing a base branch is refused", async () => {
  for (const branch of ["main", "master", "dev", "develop"]) {
    const { calls, adapter } = recordingAdapter();
    const result = await finish({
      role: "finisher",
      autoPullRequest: true,
      branch,
      base: "main",
      checks: PASSING_CHECKS,
      description: sliceDescription(),
      catalog: FINISHER_CATALOG,
      adapter,
    });
    assert.equal(result.status, "refused", branch);
    assert.equal(result.pushed, false, branch);
    assert.match(result.reason, new RegExp(branch));
    assert.equal(calls.length, 0, branch);
  }
});

test("[unit] a missing Sonnet finisher asks and pushes nothing", async () => {
  const { calls, adapter } = recordingAdapter();
  const result = await finish({
    role: "finisher",
    autoPullRequest: true,
    branch: "feat/test-first-guard",
    base: "main",
    checks: PASSING_CHECKS,
    description: sliceDescription(),
    catalog: ["grok-4.7-high"],
    adapter,
  });
  assert.equal(result.status, "ask");
  assert.equal(result.pushed, false);
  assert.equal(calls.length, 0);
});
