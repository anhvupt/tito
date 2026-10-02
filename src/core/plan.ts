import {
  ACTIVE_RISK_PROFILE_IDS,
  isActiveRiskProfileId,
  isFutureRiskProfileId,
  type ActiveRiskProfileId,
} from "./profiles.js";
import type { InspectionReport } from "./inspect.js";

export const TITO_BOOTSTRAP_START = "<!-- tito:bootstrap start -->";
export const TITO_BOOTSTRAP_END = "<!-- tito:bootstrap end -->";

export const ADOPTION_AGENTS_MD = `# Tito bootstrap

This project uses Tito as its root engineering coordinator.

- Start every Tito-coordinated chat response exactly with \`Hola, Tito here!\`
- Keep that marker out of CLI and machine-readable output.
- Treat ordinary requests as Tito-coordinated work.
- Recommend Ask, Plan, or Agent before acting.
- Preserve uncommitted work and use one code writer at a time.
- Stop for human approval between reviewable slices.
- Never commit, push, publish, deploy, or perform irreversible external actions without explicit approval.
- Use \`/tito\` when Tito coordination is wanted.
- Plans own technical decisions and include guidance code when useful.
- Confirm intent before clarifying. Plans include decisions with conventions, AAA test cases, and docs impact.
- Do not merge a slice branch into \`main\`, \`master\`, \`dev\`, or \`develop\`, on the machine or on the remote, unless the user calls for that merge and the pull request already has an approval. Finishing a slice leaves the branch as it is.
- When the user comments on an open pull request, Tito updates that pull request's description in the same turn. Review fixes lists every comment, including the earlier ones. A thread reply does not replace that update.

Keep this bootstrap compact. Load project documentation only when the task needs it.
`;

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
