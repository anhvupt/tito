import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LOCKED_MODEL_ID,
  USAGE_BASELINE_PATH,
  baselineFromRecords,
  buildUsageRecord,
  evalExitCode,
  missingCursorApiKey,
  nodeVersionTooOld,
  persistOutcome,
  thresholdFailures,
  writeBaseline,
} from "../dist/core/usage-eval.js";
import { USAGE_SCENARIOS } from "./usage-scenarios.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const record = process.argv.includes("--record");
if (nodeVersionTooOld(process.versions.node)) {
  console.error(`eval:usage needs Node.js 22.13 or newer; this is ${process.versions.node}.`);
  process.exit(1);
}
if (missingCursorApiKey(process.env.CURSOR_API_KEY)) {
  console.error("eval:usage needs CURSOR_API_KEY.");
  process.exit(1);
}

const { Agent, Cursor } = await import("@cursor/sdk");
const models = await Cursor.models.list({ apiKey: process.env.CURSOR_API_KEY });
const composer = models.find((model) => model.id === LOCKED_MODEL_ID);
if (!composer?.parameters?.some((p) => p.id === "fast" && p.values.some((v) => v.value === "true"))) {
  console.error(`${LOCKED_MODEL_ID} with the fast param is missing from the SDK catalog; refusing to substitute.`);
  process.exit(1);
}

const model = { id: LOCKED_MODEL_ID, params: [{ id: "fast", value: "true" }] };
const records = [];
let missingUsage = false;
for (const scenario of USAGE_SCENARIOS) {
  const agent = await Agent.create({
    apiKey: process.env.CURSOR_API_KEY,
    model,
    mode: scenario.mode,
    disallowedTools: ["shell", "edit", "delete", "task", "applyAgentDiff", "generateImage", "mcp"],
    local: { cwd: root },
  });
  try {
    const result = await (await agent.send(scenario.prompt)).wait();
    const outcome = await buildUsageRecord({
      scenario: scenario.id,
      model: LOCKED_MODEL_ID,
      result: { usage: result.usage, requestId: result.requestId, status: result.status },
      getUsage: () => agent.getUsage(),
    });
    persistOutcome(root, outcome);
    if (outcome.ok) records.push(outcome.record);
    else {
      missingUsage = true;
      console.error(`${scenario.id}: missing-usage`);
    }
  } finally {
    await agent[Symbol.asyncDispose]();
  }
}

if (record && !missingUsage) writeBaseline(root, baselineFromRecords(records));
let over = false;
if (!record) {
  let baseline;
  try {
    baseline = JSON.parse(readFileSync(join(root, USAGE_BASELINE_PATH), "utf8"));
  } catch {
    console.error("eval:usage needs evals/usage-baseline.json (run with --record).");
    process.exit(1);
  }
  const failures = thresholdFailures(records, baseline);
  over = failures.length > 0;
  for (const failure of failures) console.error(failure);
}
process.exit(evalExitCode({ record, missingUsage, overBudget: over }));
