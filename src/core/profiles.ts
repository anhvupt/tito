export const MANDATORY_ESCALATION_TOPICS = Object.freeze([
  "authentication-and-authorization",
  "payments",
  "secrets",
  "production-data",
  "destructive-database-changes",
  "privacy-sensitive-information",
  "public-infrastructure",
  "irreversible-external-actions",
  "accounting-and-financial-invariants",
] as const);

export type EscalationTopic = (typeof MANDATORY_ESCALATION_TOPICS)[number];

export const ACTIVE_RISK_PROFILE_IDS = [
  "client-careful",
  "solo-balanced",
  "solo-fast",
] as const;

export type ActiveRiskProfileId = (typeof ACTIVE_RISK_PROFILE_IDS)[number];

export const FUTURE_RISK_PROFILE_IDS = ["small-team"] as const;

export type FutureRiskProfileId = (typeof FUTURE_RISK_PROFILE_IDS)[number];

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const nested of Object.values(value as object)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export const RISK_PROFILES = deepFreeze({
  "client-careful": {
    id: "client-careful",
    status: "active",
    maxWriters: 1,
    writerConstraint: "one-at-a-time",
    independentReview: "required",
    preferredAuthoredLines: { min: 100, max: 200 },
    maxAuthoredLinesWithoutApproval: 300,
    maxAuthoredFiles: 6,
    stackedUnreviewedChanges: false,
    humanApproval: "every-slice",
    migrationsRequireRollbackPlans: true,
    unapprovedActions: [
      "commit",
      "merge",
      "push",
      "deployment",
      "publication",
      "external-write",
    ],
    safetyFloor: MANDATORY_ESCALATION_TOPICS,
  },
  "solo-balanced": {
    id: "solo-balanced",
    status: "active",
    maxWriters: 1,
    writerConstraint: "one-at-a-time",
    humanReview: "feature-boundaries",
    independentReviewFor: ["security", "data", "migrations", "architecture"],
    diffLimits: "moderate",
    automation: "deterministic-and-reversible",
    safetyFloor: MANDATORY_ESCALATION_TOPICS,
  },
  "solo-fast": {
    id: "solo-fast",
    status: "active",
    maxWriters: 1,
    writerConstraint: "one-at-a-time",
    agentSelfReview: "allowed",
    humanReview: "milestones",
    safetyFloor: MANDATORY_ESCALATION_TOPICS,
  },
} as const);

export type RiskProfile = (typeof RISK_PROFILES)[ActiveRiskProfileId];

export const FUTURE_RISK_PROFILES = deepFreeze({
  "small-team": {
    id: "small-team",
    status: "unavailable",
  },
} as const);

export type FutureRiskProfile =
  (typeof FUTURE_RISK_PROFILES)[FutureRiskProfileId];

export function isActiveRiskProfileId(
  value: string,
): value is ActiveRiskProfileId {
  return (ACTIVE_RISK_PROFILE_IDS as readonly string[]).includes(value);
}

export function isFutureRiskProfileId(
  value: string,
): value is FutureRiskProfileId {
  return (FUTURE_RISK_PROFILE_IDS as readonly string[]).includes(value);
}
