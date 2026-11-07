import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

async function hooks() {
  return import("../dist/core/hooks.js");
}

function decide(decideMcp, extra) {
  return decideMcp({
    toolName: "git_push",
    toolInput: "{}",
    currentBranch: "feat/x",
    autoMerge: false,
    ...extra,
  });
}

function runHook(payload) {
  return spawnSync(process.execPath, [cliPath, "hook", "before-mcp"], {
    encoding: "utf8",
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

test("MCP-1 list_issues allows with no messages", async () => {
  const { decideMcp } = await hooks();
  const verdict = decide(decideMcp, { toolName: "list_issues", toolInput: "{}" });
  assert.equal(verdict.permission, "allow");
  assert.equal(verdict.user_message, undefined);
  assert.equal(verdict.agent_message, undefined);
});

test('MCP-2 git_push {"force":true} on feat/x asks', async () => {
  const { decideMcp } = await hooks();
  assert.equal(
    decide(decideMcp, { toolInput: JSON.stringify({ force: true }) }).permission,
    "ask",
  );
});

test("MCP-3 git_push feat/x from feat/x without force allows", async () => {
  const { decideMcp } = await hooks();
  assert.equal(
    decide(decideMcp, { toolInput: JSON.stringify({ branch: "feat/x" }) }).permission,
    "allow",
  );
  assert.equal(
    decide(decideMcp, { toolInput: JSON.stringify({ ref: "feat/x" }) }).permission,
    "allow",
  );
});

test("MCP-4 git_push while currentBranch is a base asks", async () => {
  const { decideMcp } = await hooks();
  for (const currentBranch of ["main", "master", "dev", "develop"]) {
    assert.equal(decide(decideMcp, { currentBranch }).permission, "ask", currentBranch);
  }
});

test("MCP-5 git_branch merge on dev asks; list on dev allows", async () => {
  const { decideMcp } = await hooks();
  assert.equal(
    decide(decideMcp, {
      toolName: "git_branch",
      toolInput: JSON.stringify({ action: "merge" }),
      currentBranch: "dev",
    }).permission,
    "ask",
  );
  assert.equal(
    decide(decideMcp, {
      toolName: "git_branch",
      toolInput: JSON.stringify({ action: "list" }),
      currentBranch: "dev",
    }).permission,
    "allow",
  );
});

test("MCP-6 merge_pull_request asks unless autoMerge is true", async () => {
  const { decideMcp } = await hooks();
  assert.equal(
    decide(decideMcp, { toolName: "merge_pull_request", toolInput: "{}" }).permission,
    "ask",
  );
  assert.equal(
    decide(decideMcp, { toolName: "merge_pull_request", toolInput: "{}", autoMerge: true })
      .permission,
    "allow",
  );
});

test("MCP-7 create_pull_request_review APPROVE denies; COMMENT allows", async () => {
  const { decideMcp } = await hooks();
  const deny = decide(decideMcp, {
    toolName: "create_pull_request_review",
    toolInput: JSON.stringify({ event: "APPROVE" }),
  });
  assert.equal(deny.permission, "deny");
  assert.equal(
    decide(decideMcp, {
      toolName: "create_pull_request_review",
      toolInput: JSON.stringify({ event: "COMMENT" }),
    }).permission,
    "allow",
  );
});

test("MCP-8 npm_publish asks even with autoMerge true", async () => {
  const { decideMcp } = await hooks();
  assert.equal(
    decide(decideMcp, { toolName: "npm_publish", toolInput: "{}", autoMerge: true }).permission,
    "ask",
  );
});

test("MCP-9 guarded name with unreadable tool_input asks", async () => {
  const { decideMcp } = await hooks();
  assert.equal(decide(decideMcp, { toolInput: "{" }).permission, "ask");
});

test("[cli] MCP-10 empty stdin exits 0 with allow", () => {
  const run = runHook("");
  assert.equal(run.status, 0);
  assert.equal(JSON.parse(run.stdout).permission, "allow");
});

test("edge approve lowercase denies", async () => {
  const { decideMcp } = await hooks();
  assert.equal(
    decide(decideMcp, {
      toolName: "create_pull_request_review",
      toolInput: JSON.stringify({ event: "approve" }),
    }).permission,
    "deny",
  );
  assert.equal(
    decide(decideMcp, {
      toolName: "create_pull_request_review",
      toolInput: JSON.stringify({ state: "APPROVE" }),
    }).permission,
    "deny",
  );
});

test("edge missing mcp_server_name with git_push still asks", () => {
  const run = runHook({ tool_name: "git_push", tool_input: JSON.stringify({ force: true }) });
  assert.equal(run.status, 0);
  assert.equal(JSON.parse(run.stdout).permission, "ask");
});

test("edge git_branch with no action allows", async () => {
  const { decideMcp } = await hooks();
  assert.equal(
    decide(decideMcp, { toolName: "git_branch", toolInput: "{}", currentBranch: "dev" })
      .permission,
    "allow",
  );
});
