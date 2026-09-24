import { mkdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compiledCursorAgents } from "./agents.js";
import type { InspectionReport } from "./inspect.js";
import { ACTIVE_RISK_PROFILE_IDS } from "./profiles.js";
import {
  PlanError,
  planAdoption,
  type PlannedFile,
} from "./plan.js";

export type InitFile = PlannedFile | {
  readonly path: string;
  readonly action: "create";
  readonly body: string;
} | {
  readonly path: string;
  readonly action: "conflict" | "keep";
};

export class InitError extends Error {
  readonly code: "conflict";

  constructor(message: string) {
    super(message);
    this.name = "InitError";
    this.code = "conflict";
  }
}

export async function promptForProfile(
  ask: (prompt: string) => Promise<string>,
): Promise<string> {
  const choices = ACTIVE_RISK_PROFILE_IDS.map(
    (id, index) => `  ${index + 1}. ${id}`,
  ).join("\n");
  const answer = (await ask(`Profiles:\n${choices}\nProfile: `)).trim();
  const index = Number(answer);
  if (
    Number.isInteger(index) &&
    index >= 1 &&
    index <= ACTIVE_RISK_PROFILE_IDS.length
  ) {
    return ACTIVE_RISK_PROFILE_IDS[index - 1] ?? answer;
  }
  return answer;
}

function exists(root: string, path: string): boolean {
  try {
    return statSync(join(root, path)).isFile();
  } catch {
    return false;
  }
}

export function planInitialization(report: InspectionReport, profile: string): {
  root: string;
  profile: ReturnType<typeof planAdoption>["profile"];
  files: InitFile[];
} {
  const adoption = planAdoption(report, profile);
  const agents = compiledCursorAgents().map((agent) =>
    exists(report.root, agent.path)
      ? { path: agent.path, action: "conflict" as const }
      : { path: agent.path, action: "create" as const, body: agent.body },
  );
  return { root: adoption.root, profile: adoption.profile, files: [...adoption.files, ...agents] };
}

export function formatInitialization(plan: ReturnType<typeof planInitialization>): string {
  const lines = [`root: ${plan.root}`, `profile: ${plan.profile}`];
  for (const file of plan.files) {
    lines.push(`${file.path}: ${file.action}`);
    if (file.action === "create") lines.push("---", file.body.trimEnd(), "---");
  }
  return `${lines.join("\n")}\n`;
}

export function applyInitialization(plan: ReturnType<typeof planInitialization>): void {
  const conflicts = plan.files.filter((file) => file.action === "conflict");
  if (conflicts.length > 0) {
    throw new InitError(
      `Refusing to write because ${conflicts.map((file) => file.path).join(", ")} already exists.`,
    );
  }
  const created: string[] = [];
  try {
    for (const file of plan.files) {
      if (file.action !== "create") continue;
      const absolute = join(plan.root, file.path);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, file.body, { encoding: "utf8", flag: "wx" });
      created.push(absolute);
    }
  } catch (error) {
    for (const absolute of created) {
      try {
        unlinkSync(absolute);
      } catch {
        // Keep the original write error.
      }
    }
    throw error;
  }
}

export { PlanError };
