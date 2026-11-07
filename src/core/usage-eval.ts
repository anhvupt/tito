import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const LOCKED_MODEL_ID = "composer-2.5";
export const USAGE_BASELINE_PATH = "evals/usage-baseline.json";

export function overBudget(actual: number, baseline: number): boolean {
  return actual > baseline * 1.25;
}

export type TokenUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly totalTokens: number;
  readonly reasoningTokens?: number;
};
export type UsageCost = { readonly rawCostCents: number; readonly chargedCents: number };
export type UsageRecord = {
  readonly scenario: string;
  readonly model: string;
  readonly usage: TokenUsage;
  readonly cost: UsageCost | null;
  readonly requestId: string;
  readonly status: string;
};
export type RunResultInput = {
  readonly usage: TokenUsage | undefined;
  readonly requestId: string;
  readonly status: string;
};
export type UsageOutcome =
  | { readonly ok: true; readonly record: UsageRecord }
  | { readonly ok: false; readonly failure: "missing-usage" };
export type BaselineFile = {
  readonly model: string;
  readonly scenarios: { readonly [id: string]: { readonly totalTokens: number } };
};

function copyUsage(usage: TokenUsage): TokenUsage {
  const copied: TokenUsage = {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    totalTokens: usage.totalTokens,
  };
  return usage.reasoningTokens === undefined ? copied : { ...copied, reasoningTokens: usage.reasoningTokens };
}

export async function buildUsageRecord(input: {
  scenario: string;
  model: string;
  result: RunResultInput;
  getUsage: () => Promise<{ cost?: UsageCost }>;
}): Promise<UsageOutcome> {
  if (input.result.usage === undefined) return { ok: false, failure: "missing-usage" };
  let cost: UsageCost | null = null;
  try {
    cost = (await input.getUsage()).cost ?? null;
  } catch {
    cost = null;
  }
  return {
    ok: true,
    record: {
      scenario: input.scenario,
      model: input.model,
      usage: copyUsage(input.result.usage),
      cost,
      requestId: input.result.requestId,
      status: input.result.status,
    },
  };
}

export function persistOutcome(root: string, outcome: UsageOutcome): void {
  if (!outcome.ok) return;
  const dir = join(root, ".tito", "evals", "usage");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${outcome.record.scenario}.json`), `${JSON.stringify(outcome.record, null, 2)}\n`);
}

export function baselineFromRecords(records: readonly UsageRecord[]): BaselineFile {
  const scenarios: { [id: string]: { totalTokens: number } } = {};
  for (const record of records) scenarios[record.scenario] = { totalTokens: record.usage.totalTokens };
  return { model: LOCKED_MODEL_ID, scenarios };
}

export function writeBaseline(root: string, baseline: BaselineFile): void {
  mkdirSync(join(root, "evals"), { recursive: true });
  writeFileSync(join(root, USAGE_BASELINE_PATH), `${JSON.stringify(baseline, null, 2)}\n`);
}

export function thresholdFailures(records: readonly UsageRecord[], baseline: BaselineFile): string[] {
  const failures: string[] = [];
  for (const record of records) {
    const expected = baseline.scenarios[record.scenario]?.totalTokens;
    if (expected === undefined) failures.push(`${record.scenario}: missing-baseline`);
    else if (overBudget(record.usage.totalTokens, expected)) failures.push(`${record.scenario}: over-budget`);
  }
  return failures;
}

export function evalExitCode(input: {
  readonly record: boolean;
  readonly missingUsage: boolean;
  readonly overBudget: boolean;
}): number {
  if (input.missingUsage) return 1;
  if (input.record) return 0;
  return input.overBudget ? 1 : 0;
}

export function nodeVersionTooOld(version: string): boolean {
  const [major, minor] = version.split(".").map((part) => Number(part));
  return (major ?? 0) < 22 || ((major ?? 0) === 22 && (minor ?? 0) < 13);
}

export function missingCursorApiKey(apiKey: string | undefined): boolean {
  return apiKey === undefined || apiKey.trim() === "";
}
