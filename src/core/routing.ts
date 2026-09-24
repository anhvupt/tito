import type { EscalationTopic } from "./profiles.js";

export const CURSOR_MODES = Object.freeze(["Ask", "Plan", "Agent"] as const);

export type CursorMode = (typeof CURSOR_MODES)[number];

export type TaskFacts = {
  readonly intent: "read-only" | "change";
  readonly ambiguous: boolean;
  readonly multiModule: boolean;
  readonly architectureChange: boolean;
  readonly migration: boolean;
  readonly securitySensitive: boolean;
  readonly accountingInvariant: boolean;
  readonly requiresSlicing: boolean;
  readonly escalationTopics: readonly EscalationTopic[];
  readonly approvedImplementationSlice: boolean;
};

export type RoutingReasonCode =
  | "approved-implementation-slice"
  | "mandatory-escalation"
  | "critical-work"
  | "planning-required"
  | "read-only-discovery"
  | "change-needs-approval";

export type ModeRecommendation = {
  readonly mode: CursorMode;
  readonly reasonCodes: readonly RoutingReasonCode[];
  readonly carefulHandling: boolean;
  readonly independentReview: boolean;
};

export function recommendMode(facts: TaskFacts): ModeRecommendation {
  const escalation = facts.escalationTopics.length > 0;
  const criticalWork =
    facts.migration || facts.securitySensitive || facts.accountingInvariant;
  const planning =
    facts.ambiguous ||
    facts.multiModule ||
    facts.architectureChange ||
    facts.requiresSlicing;
  const carefulHandling = escalation || criticalWork;
  const independentReview = carefulHandling || facts.architectureChange;
  const reasonCodes: RoutingReasonCode[] = [];

  if (facts.approvedImplementationSlice) {
    reasonCodes.push("approved-implementation-slice");
  }
  if (escalation) reasonCodes.push("mandatory-escalation");
  if (criticalWork) reasonCodes.push("critical-work");
  if (planning) reasonCodes.push("planning-required");
  if (facts.approvedImplementationSlice) {
    return { mode: "Agent", reasonCodes, carefulHandling, independentReview };
  }
  if (reasonCodes.length > 0) {
    return { mode: "Plan", reasonCodes, carefulHandling, independentReview };
  }

  return {
    mode: "Ask",
    reasonCodes: [
      facts.intent === "read-only" ? "read-only-discovery" : "change-needs-approval",
    ],
    carefulHandling: false,
    independentReview: false,
  };
}
