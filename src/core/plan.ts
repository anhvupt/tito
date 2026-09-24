import {
  ACTIVE_RISK_PROFILE_IDS,
  isActiveRiskProfileId,
  isFutureRiskProfileId,
  type ActiveRiskProfileId,
} from "./profiles.js";
import type { InspectionReport } from "./inspect.js";

export const ADOPTION_AGENTS_MD = `# Tito bootstrap

This project uses Tito as its root engineering coordinator.

- Treat ordinary requests as Tito-coordinated work.
- Recommend Ask, Plan, or Agent before acting.
- Preserve uncommitted work and use one code writer at a time.
- Stop for human approval between reviewable slices.
- Never commit, push, publish, deploy, or perform irreversible external actions without explicit approval.
- Use \`/tito\` when Tito coordination is wanted.
- Plans own technical decisions and include guidance code when useful.

Keep this bootstrap compact. Load project documentation only when the task needs it.
`;

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
