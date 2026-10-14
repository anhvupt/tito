import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACTIVE_RISK_PROFILE_IDS,
  isActiveRiskProfileId,
  isFutureRiskProfileId,
  type ActiveRiskProfileId,
} from "./profiles.js";
import type { InspectionReport } from "./inspect.js";

export const TITO_BOOTSTRAP_START = "<!-- tito:bootstrap start -->";
export const TITO_BOOTSTRAP_END = "<!-- tito:bootstrap end -->";

export const ADOPTION_AGENTS_MD = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../templates/cursor/AGENTS.md"),
  "utf8",
);

export function titoBootstrapBlock(): string {
  return `${TITO_BOOTSTRAP_START}\n${ADOPTION_AGENTS_MD.trim()}\n${TITO_BOOTSTRAP_END}\n`;
}

export type PlanErrorCode = "missing-profile" | "unknown-profile" | "unsupported-profile";

export class PlanError extends Error {
  readonly code: PlanErrorCode;

  constructor(code: PlanErrorCode, message: string) {
    super(message);
    this.name = "PlanError";
    this.code = code;
  }
}

type PlannedPath = "tito.yaml" | "AGENTS.md";

export type PlannedFile =
  | { readonly path: PlannedPath; readonly action: "create"; readonly body: string }
  | { readonly path: PlannedPath; readonly action: "conflict" | "keep" };

export type AdoptionPlan = {
  readonly root: string;
  readonly profile: ActiveRiskProfileId;
  readonly files: readonly [PlannedFile, PlannedFile];
};

function configBody(profile: ActiveRiskProfileId): string {
  return `schemaVersion: 1\nprofile: ${profile}\n`;
}

function requireProfile(profile: string): ActiveRiskProfileId {
  if (profile.trim() === "") {
    throw new PlanError("missing-profile", "Missing required profile.");
  }
  if (isFutureRiskProfileId(profile)) {
    throw new PlanError(
      "unsupported-profile",
      `Profile "${profile}" is recognized but not available.`,
    );
  }
  if (!isActiveRiskProfileId(profile)) {
    throw new PlanError(
      "unknown-profile",
      `Unknown profile "${profile}". Active profiles: ${ACTIVE_RISK_PROFILE_IDS.join(", ")}.`,
    );
  }
  return profile;
}

export function planAdoption(report: InspectionReport, profile: string): AdoptionPlan {
  const selected = requireProfile(profile);
  const titoYaml: PlannedFile =
    report.titoYaml.status === "absent"
      ? { path: "tito.yaml", action: "create", body: configBody(selected) }
      : { path: "tito.yaml", action: "conflict" };
  const agentsMd: PlannedFile =
    report.agentsMd === "absent"
      ? { path: "AGENTS.md", action: "create", body: ADOPTION_AGENTS_MD }
      : { path: "AGENTS.md", action: "keep" };
  return { root: report.root, profile: selected, files: [titoYaml, agentsMd] };
}

export function formatAdoptionPlan(plan: AdoptionPlan): string {
  const lines = [`root: ${plan.root}`, `profile: ${plan.profile}`];
  for (const file of plan.files) {
    lines.push(`${file.path}: ${file.action}`);
    if (file.action === "create") lines.push("---", file.body.trimEnd(), "---");
  }
  return `${lines.join("\n")}\n`;
}

export type TestFirstExpectation = {
  readonly file: string;
  readonly expectedFailure: string;
};

export type ImplementationPlanDocument = {
  readonly domain: string;
  readonly decisions: readonly string[];
  readonly testCases: readonly string[];
  readonly docsImpact: readonly string[];
  readonly slicesAndBranch: readonly string[];
  readonly testFirst: readonly TestFirstExpectation[];
};

function bulletSection(title: string, lines: readonly string[]): string {
  const body = lines.length > 0 ? lines.map((line) => `- ${line}`).join("\n") : "-";
  return `## ${title}\n${body}`;
}

export function renderImplementationPlan(plan: ImplementationPlanDocument): string {
  const cases =
    plan.testFirst.length > 0
      ? plan.testFirst.map((item) => `- \`${item.file}\`: ${item.expectedFailure}`).join("\n")
      : "-";
  return [
    bulletSection("Domain", [plan.domain]),
    bulletSection("Decisions", plan.decisions),
    bulletSection("Test cases", plan.testCases),
    `## Test-first commit\n${cases}`,
    bulletSection("Docs impact", plan.docsImpact),
    bulletSection("Slices and branch", plan.slicesAndBranch),
    "",
  ].join("\n\n");
}
