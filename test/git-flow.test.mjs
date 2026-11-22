import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
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

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

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
    happyPath: ["Suggest the branch.", "Check out after acceptance."],
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
      "",
      "## Reproduce the happy path",
      "1. Suggest the branch.",
      "2. Check out after acceptance.",
    ].join("\n"),
  );
  assert.match(description, /## Problem/);
  assert.equal(pullRequestTemplate().includes("## Problem"), true);
  assert.equal(pullRequestTemplate().includes("## What changed"), true);
  assert.equal(pullRequestTemplate().includes("## Review fixes"), true);
  assert.equal(pullRequestTemplate().includes("## Checks"), true);
  assert.equal(pullRequestTemplate().includes("## Reproduce the happy path"), true);
  assert.equal(pullRequestTemplate().includes("1."), true);
  assert.match(
    pullRequestDescription({
      problem: "A short problem.",
      done: ["One change."],
      reviewFixes: [],
      checks: ["Build passed."],
      happyPath: ["Open the pull request.", "Follow the numbered steps."],
    }),
    /No review fixes\./,
  );
  assert.equal(
    pullRequestDescription({
      problem: "Two\nlines",
      done: ["One change."],
      reviewFixes: [],
      checks: ["Build passed."],
      happyPath: ["Open the pull request.", "Follow the numbered steps."],
    }),
    null,
  );
  assert.equal(
    pullRequestDescription({
      problem: "A short problem.",
      done: [],
      reviewFixes: [],
      checks: ["Build passed."],
      happyPath: ["Open the pull request.", "Follow the numbered steps."],
    }),
    null,
  );
  assert.equal(
    pullRequestDescription({
      problem: "A short problem.",
      done: Array.from({ length: 41 }, () => "Change."),
      reviewFixes: [],
      checks: ["Build passed."],
      happyPath: ["Open the pull request.", "Follow the numbered steps."],
    }),
    null,
  );
  assert.equal(canApprovePullRequest(), false);
});

test("[unit] PR-1 a valid description includes a happy path outside the 50-line cap", () => {
  // A compact four-section body plus three steps is accepted, and those steps do not consume the 50-line cap.
  // Arrange
  const compactInput = {
    problem: "Reviewers had no happy path.",
    done: ["One change."],
    reviewFixes: [],
    checks: ["Build passed."],
    happyPath: ["Open the pull request.", "Follow step two.", "See the result."],
  };
  const atCapInput = {
    problem: "A short problem.",
    done: Array.from({ length: 40 }, () => "Change."),
    reviewFixes: [],
    checks: ["Build passed."],
    happyPath: ["Open the pull request.", "Follow step two.", "See the result."],
  };

  // Act
  const compact = pullRequestDescription(compactInput);
  const atCap = pullRequestDescription(atCapInput);

  // Assert
  assert.equal(typeof compact, "string");
  assert.match(compact, /## Reproduce the happy path/);
  assert.match(compact, /1\. Open the pull request\./);
  assert.match(compact, /2\. Follow step two\./);
  assert.match(compact, /3\. See the result\./);
  const before = compact.slice(0, compact.indexOf("## Reproduce the happy path")).replace(/\n$/, "");
  const beforeCount = before.split("\n").length;
  assert.ok(beforeCount >= 2 && beforeCount <= 50, `before ${beforeCount}`);
  assert.equal(typeof atCap, "string");
  assert.match(atCap, /## Reproduce the happy path/);
  const capBefore = atCap
    .slice(0, atCap.indexOf("## Reproduce the happy path"))
    .replace(/\n+$/, "");
  assert.equal(capBefore.split("\n").length, 50);
});

test("[unit] PR-2 an unusable happy path is rejected", () => {
  // Arrange
  const base = {
    problem: "A short problem.",
    done: ["One change."],
    reviewFixes: [],
    checks: ["Build passed."],
  };

  // Act
  const missing = pullRequestDescription(base);
  const zero = pullRequestDescription({ ...base, happyPath: [] });
  const one = pullRequestDescription({ ...base, happyPath: ["Only one step."] });
  const empty = pullRequestDescription({ ...base, happyPath: ["Open it.", ""] });
  const newline = pullRequestDescription({
    ...base,
    happyPath: ["Open it.", "Line one\nline two"],
  });

  // Assert
  assert.equal(missing, null);
  assert.equal(zero, null);
  assert.equal(one, null);
  assert.equal(empty, null);
  assert.equal(newline, null);
});

test("[unit] PR-3 the template, rule, and bootstrap name the happy path and one pull request", () => {
  // Arrange
  const template = pullRequestTemplate();
  const rulePaths = [
    ".cursor/rules/pull-request.mdc",
    "templates/cursor/rules/pull-request.mdc",
  ];
  const agentPaths = ["AGENTS.md", "templates/cursor/AGENTS.md"];
  const rules = rulePaths.map((rel) => readFileSync(join(repoRoot, rel), "utf8"));
  const agents = agentPaths.map((rel) => readFileSync(join(repoRoot, rel), "utf8"));
  const bootstrap =
    "One approved plan uses one branch and one pull request. Later slices land on that open pull request. Wait between slices only for `client-careful` or mandatory escalation. The pull request description includes numbered steps to reproduce the happy path.";

  // Act
  const tokens = agents.map((text) => Math.ceil(text.length / 4));

  // Assert
  assert.equal(template.includes("## Reproduce the happy path"), true);
  assert.equal(template.includes("1."), true);
  assert.equal(rules[0], rules[1]);
  for (const rule of rules) {
    assert.match(rule, /Later slices of one approved plan land on that open pull request/);
    assert.equal(rule.includes("A pull request description has four parts"), false);
  }
  for (const [index, text] of agents.entries()) {
    assert.equal(text.includes(bootstrap), true, agentPaths[index]);
    assert.ok(tokens[index] <= 1500, `${tokens[index]} tokens`);
  }
});

test("[unit] M9 user merge call is allowed without an approval", () => {
  assert.equal(mergeDecision({ userAskedToMerge: true }).allowed, true);
});

test("[unit] M10 no merge call and autoMerge false is not allowed", () => {
  assert.equal(
    mergeDecision({ userAskedToMerge: false, autoMerge: false }).allowed,
    false,
  );
});

test("[unit] M11 autoMerge true with solo-balanced is allowed", () => {
  assert.equal(
    mergeDecision({
      userAskedToMerge: false,
      autoMerge: true,
      profile: "solo-balanced",
    }).allowed,
    true,
  );
});

test("[unit] M12 autoMerge true with client-careful is not allowed", () => {
  assert.equal(
    mergeDecision({
      userAskedToMerge: false,
      autoMerge: true,
      profile: "client-careful",
    }).allowed,
    false,
  );
});

test("[unit] M13 autoMerge true with touchesEscalation is not allowed", () => {
  assert.equal(
    mergeDecision({
      userAskedToMerge: false,
      autoMerge: true,
      profile: "solo-balanced",
      touchesEscalation: true,
    }).allowed,
    false,
  );
});

const FINISHER_CATALOG = [
  "grok-4.7-high",
  "claude-sonnet-4-6",
  "claude-sonnet-5-5-high",
  "composer-2.5-fast",
  "composer-2.5",
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
    happyPath: ["Commit a non-test file first.", "See the guard refuse it."],
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
  assert.equal(result.model, "composer-2.5");
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

test("[unit] a missing Composer finisher asks and pushes nothing", async () => {
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
