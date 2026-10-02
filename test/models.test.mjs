import assert from "node:assert/strict";
import test from "node:test";
import { recommendModel } from "../dist/core/models.js";

test("MOD-1 explore on Cursor returns the Grok slug", () => {
  const result = recommendModel({
    host: "cursor",
    taskClass: "explore",
    catalog: [
      "claude-opus-5-5-medium",
      "cursor-grok-4.6-xhigh-fast",
      "grok-4.7-high-fast",
    ],
  });
  assert.equal(result.status, "selected");
  if (result.status === "selected") {
    assert.equal(result.model, "grok-4.7-high-fast");
  }
});

test("MOD-2 explore on Claude returns the lowest Sonnet slug", () => {
  const result = recommendModel({
    host: "claude",
    taskClass: "explore",
    catalog: ["claude-opus-5-thinking-high", "claude-sonnet-5-5-high", "claude-sonnet-4-5"],
  });
  assert.equal(result.status, "selected");
  if (result.status === "selected") {
    assert.equal(result.model, "claude-sonnet-4-5");
  }
});

test("MOD-3 docs and explore on Cursor resolve the same slug", () => {
  const catalog = ["claude-opus-5-5-medium", "cursor-grok-4.6-xhigh-fast", "grok-4.7-high-fast"];
  const docs = recommendModel({ host: "cursor", taskClass: "docs", catalog });
  const explore = recommendModel({ host: "cursor", taskClass: "explore", catalog });

  assert.equal(docs.status, "selected");
  assert.equal(explore.status, "selected");
  if (docs.status === "selected" && explore.status === "selected") {
    assert.equal(docs.model, explore.model);
  }
});

test("MOD-4 ordinary and core classes pick cheap and stronger families", () => {
  const cursorCatalog = ["grok-4.7-high-fast", "composer-2.5-fast", "gpt-5.3-codex"];
  const claudeCatalog = [
    "claude-sonnet-4-5",
    "claude-sonnet-5-5-high",
    "claude-opus-5-5-medium",
  ];

  const cursorOrdinary = recommendModel({
    host: "cursor",
    taskClass: "ordinary",
    catalog: cursorCatalog,
  });
  const cursorCore = recommendModel({ host: "cursor", taskClass: "core", catalog: cursorCatalog });
  const claudeOrdinary = recommendModel({
    host: "claude",
    taskClass: "ordinary",
    catalog: claudeCatalog,
  });
  const claudeCore = recommendModel({ host: "claude", taskClass: "core", catalog: claudeCatalog });

  assert.equal(cursorOrdinary.status, "selected");
  assert.equal(cursorCore.status, "selected");
  assert.equal(claudeOrdinary.status, "selected");
  assert.equal(claudeCore.status, "selected");

  if (cursorOrdinary.status === "selected") {
    assert.equal(cursorOrdinary.model, "grok-4.7-high-fast");
  }
  if (cursorCore.status === "selected") {
    assert.equal(cursorCore.model, "gpt-5.3-codex");
  }
  if (claudeOrdinary.status === "selected") {
    assert.equal(claudeOrdinary.model, "claude-sonnet-5-5-high");
  }
  if (claudeCore.status === "selected") {
    assert.equal(claudeCore.model, "claude-opus-5-5-medium");
  }
});

test("MOD-5 explicit userModel is returned unchanged", () => {
  const result = recommendModel({
    host: "cursor",
    taskClass: "explore",
    catalog: ["grok-4.7-high-fast"],
    userModel: "claude-opus-4-8-thinking-high",
  });
  assert.equal(result.status, "selected");
  if (result.status === "selected") {
    assert.equal(result.model, "claude-opus-4-8-thinking-high");
  }
});

test("MOD-6 missing required family asks the user", () => {
  const exploreOnCursor = recommendModel({
    host: "cursor",
    taskClass: "explore",
    catalog: ["composer-2.5-fast"],
  });
  const coreOnCursor = recommendModel({
    host: "cursor",
    taskClass: "core",
    catalog: ["grok-4.7-high-fast"],
  });

  assert.deepEqual(exploreOnCursor, {
    status: "ask",
    family: "Grok",
    reason: "No matching Grok model was found in the current catalog.",
  });
  assert.deepEqual(coreOnCursor, {
    status: "ask",
    family: "Codex",
    reason: "No matching Codex model was found in the current catalog.",
  });
});

test("MOD-7 reasoning on both hosts returns the Opus slug", () => {
  const cursor = recommendModel({
    host: "cursor",
    taskClass: "reasoning",
    catalog: ["claude-opus-5-5-medium", "cursor-grok-4.6-xhigh-fast", "grok-4.7-high-fast"],
  });
  const claude = recommendModel({
    host: "claude",
    taskClass: "reasoning",
    catalog: ["claude-sonnet-4-5", "claude-sonnet-5-5-high", "claude-opus-5-5-medium"],
  });

  assert.equal(cursor.status, "selected");
  assert.equal(claude.status, "selected");
  if (cursor.status === "selected") {
    assert.equal(cursor.model, "claude-opus-5-5-medium");
  }
  if (claude.status === "selected") {
    assert.equal(claude.model, "claude-opus-5-5-medium");
  }
});
