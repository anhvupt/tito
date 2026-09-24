export const SPECIALIST_IDS = [
  "explorer",
  "product-analyst",
  "architect",
  "backend-engineer",
  "frontend-engineer",
  "devops-engineer",
  "erp-specialist",
  "qa-reviewer",
  "security-reviewer",
  "tech-docs-writer",
  "user-docs-writer",
] as const;

export const WRITER_SPECIALIST_IDS = [
  "backend-engineer",
  "frontend-engineer",
  "devops-engineer",
  "tech-docs-writer",
  "user-docs-writer",
] as const;

export const READ_ONLY_SPECIALIST_IDS = [
  "explorer",
  "product-analyst",
  "architect",
  "erp-specialist",
  "qa-reviewer",
  "security-reviewer",
] as const;

export type SpecialistId = (typeof SPECIALIST_IDS)[number];
export type WriterSpecialistId = (typeof WRITER_SPECIALIST_IDS)[number];
export type ReadOnlySpecialistId = (typeof READ_ONLY_SPECIALIST_IDS)[number];
export type MutationCapability =
  | "read-only"
  | "write-files"
  | "write-infrastructure"
  | "write-external";
export type ModelTier = "Scout" | "Standard" | "Reasoning";
export type SpecialistPhase = "discovery" | "planning" | "implementation" | "review";
export type KnowledgeLoad = "always" | "task" | "stack" | "project";
export type ApprovalGate = "preview" | "confirm" | "human-approval";

export type SpecialistMode = {
  readonly id: string;
  readonly capability: MutationCapability;
  readonly phases: readonly SpecialistPhase[];
  readonly gates: readonly ApprovalGate[];
};

export type SpecialistManifest = {
  readonly id: SpecialistId;
  readonly version: 1;
  readonly role: string;
  readonly model: {
    readonly tier: ModelTier;
    readonly preferred: "inherit";
    readonly fallbackPolicy: "ask-user";
  };
  readonly triggers: readonly string[];
  readonly knowledge: readonly { readonly id: string; readonly load: KnowledgeLoad }[];
  readonly handoffs: readonly SpecialistId[];
  readonly modes: readonly SpecialistMode[];
  readonly stopCondition: string;
};

type ManifestSeed = Omit<SpecialistManifest, "id" | "handoffs" | "model" | "version"> & {
  readonly tier: ModelTier;
};

const phase = Object.freeze({
  discovery: ["discovery"],
  planning: ["planning"],
  implementation: ["implementation"],
  review: ["review"],
  advise: ["discovery", "planning", "implementation"],
} as const satisfies Record<string, readonly SpecialistPhase[]>);

function knowledge(id: string, load: KnowledgeLoad) {
  return Object.freeze({ id, load });
}

function specialistMode(
  id: string,
  capability: MutationCapability,
  phases: readonly SpecialistPhase[],
  gates: readonly ApprovalGate[] = [],
): SpecialistMode {
  return Object.freeze({ id, capability, phases, gates: Object.freeze([...gates]) });
}

function manifest(id: SpecialistId, seed: ManifestSeed): SpecialistManifest {
  return Object.freeze({
    id,
    version: 1,
    role: seed.role,
    model: Object.freeze({
      tier: seed.tier,
      preferred: "inherit",
      fallbackPolicy: "ask-user",
    }),
    triggers: Object.freeze([...seed.triggers]),
    knowledge: seed.knowledge,
    handoffs: Object.freeze(SPECIALIST_IDS.filter((candidate) => candidate !== id)),
    modes: seed.modes,
    stopCondition: seed.stopCondition,
  });
}

export const SPECIALISTS = Object.freeze({
  explorer: manifest("explorer", {
    tier: "Scout",
    role: "Repository scout",
    triggers: ["where code lives", "how behavior works"],
    knowledge: [knowledge("explorer-scout", "always")],
    modes: [specialistMode("scout", "read-only", phase.discovery)],
    stopCondition: "Return evidence, gaps, and the next specialist.",
  }),
  "product-analyst": manifest("product-analyst", {
    tier: "Standard",
    role: "Requirements analyst",
    triggers: ["clarify requirements", "define acceptance"],
    knowledge: [knowledge("product-analysis", "task")],
    modes: [specialistMode("analyze", "read-only", phase.planning)],
    stopCondition: "Return one slice and its acceptance criteria.",
  }),
  architect: manifest("architect", {
    tier: "Reasoning",
    role: "Technical planner",
    triggers: ["choose architecture", "resolve a technical trade-off"],
    knowledge: [knowledge("architecture-decisions", "task")],
    modes: [specialistMode("plan", "read-only", phase.planning)],
    stopCondition: "Return the decided approach and guidance code.",
  }),
  "backend-engineer": manifest("backend-engineer", {
    tier: "Standard",
    role: "Backend implementer",
    triggers: ["backend implementation", "API or data change"],
    knowledge: [knowledge("backend-implementation", "task")],
    modes: [specialistMode("implement", "write-files", phase.implementation)],
    stopCondition: "Stop after the approved backend slice is verified.",
  }),
  "frontend-engineer": manifest("frontend-engineer", {
    tier: "Standard",
    role: "Frontend designer and implementer",
    triggers: ["frontend design", "frontend implementation"],
    knowledge: [
      knowledge("frontend-ux", "always"),
      knowledge("angular", "stack"),
    ],
    modes: [
      specialistMode("design", "read-only", phase.planning, ["preview"]),
      specialistMode("implement", "write-files", phase.implementation),
    ],
    stopCondition: "Stop after the approved frontend slice is verified.",
  }),
  "devops-engineer": manifest("devops-engineer", {
    tier: "Standard",
    role: "Infrastructure implementer",
    triggers: ["infrastructure plan", "deployment change"],
    knowledge: [knowledge("devops-safety", "always")],
    modes: [
      specialistMode("plan", "read-only", phase.planning),
      specialistMode("implement", "write-infrastructure", phase.implementation, [
        "human-approval",
      ]),
    ],
    stopCondition: "Stop after the approved infrastructure slice is verified.",
  }),
  "erp-specialist": manifest("erp-specialist", {
    tier: "Reasoning",
    role: "ERP domain adviser",
    triggers: ["ERP workflow", "inventory procurement or accounting review"],
    knowledge: [knowledge("erp-domain", "task")],
    modes: [
      specialistMode("advise", "read-only", phase.advise),
      specialistMode("review", "read-only", phase.review),
    ],
    stopCondition: "Return domain constraints without editing files.",
  }),
  "qa-reviewer": manifest("qa-reviewer", {
    tier: "Standard",
    role: "Independent QA reviewer",
    triggers: ["review correctness", "check edge cases"],
    knowledge: [knowledge("qa-review", "always")],
    modes: [specialistMode("review", "read-only", phase.review)],
    stopCondition: "Return findings without editing the slice.",
  }),
  "security-reviewer": manifest("security-reviewer", {
    tier: "Reasoning",
    role: "Independent security reviewer",
    triggers: ["security review", "authorization or secrets review"],
    knowledge: [knowledge("security-review", "task")],
    modes: [specialistMode("review", "read-only", phase.review)],
    stopCondition: "Return security findings without editing the slice.",
  }),
  "tech-docs-writer": manifest("tech-docs-writer", {
    tier: "Standard",
    role: "Technical documentation writer",
    triggers: ["module finished", "update technical documentation"],
    knowledge: [knowledge("tech-docs", "task")],
    modes: [specialistMode("update", "write-files", phase.implementation)],
    stopCondition: "Stop after the technical docs match the finished module.",
  }),
  "user-docs-writer": manifest("user-docs-writer", {
    tier: "Standard",
    role: "User documentation writer",
    triggers: ["module finished", "update user documentation"],
    knowledge: [knowledge("user-docs", "task")],
    modes: [specialistMode("update", "write-files", phase.implementation)],
    stopCondition: "Stop after the user docs match the finished module.",
  }),
} as const satisfies Record<SpecialistId, SpecialistManifest>);

export type SpecialistActivation = {
  readonly specialistId: string;
  readonly modeId: string;
  readonly purpose: string;
};

export type ResolvedActivation = {
  readonly specialistId: SpecialistId;
  readonly modeId: string;
  readonly purpose: string;
  readonly capability: MutationCapability;
};

export type DelegationResult = {
  readonly mutator: ResolvedActivation | null;
  readonly advisers: readonly ResolvedActivation[];
};

export type DelegationErrorCode =
  | "unknown-specialist"
  | "unknown-mode"
  | "wrong-phase"
  | "missing-purpose"
  | "duplicate-specialist"
  | "root-recursion"
  | "multiple-mutators";

export class DelegationError extends Error {
  readonly code: DelegationErrorCode;

  constructor(code: DelegationErrorCode, message: string) {
    super(message);
    this.name = "DelegationError";
    this.code = code;
  }
}

const ROOT_IDS = new Set(["tito", "tito-root"]);
const MAX_PURPOSE_LENGTH = 200;

function reject(code: DelegationErrorCode, message: string): never {
  throw new DelegationError(code, message);
}

function isSpecialistId(value: string): value is SpecialistId {
  return (SPECIALIST_IDS as readonly string[]).includes(value);
}

export function validateDelegation(
  activations: readonly SpecialistActivation[],
  phaseName: SpecialistPhase,
): DelegationResult {
  const seen = new Set<string>();
  const resolved: ResolvedActivation[] = [];

  for (const activation of activations) {
    if (ROOT_IDS.has(activation.specialistId)) {
      reject("root-recursion", "Tito remains the root coordinator.");
    }
    if (!isSpecialistId(activation.specialistId)) {
      reject("unknown-specialist", `Unknown specialist "${activation.specialistId}".`);
    }
    if (seen.has(activation.specialistId)) {
      reject(
        "duplicate-specialist",
        `Specialist "${activation.specialistId}" is activated more than once.`,
      );
    }
    seen.add(activation.specialistId);

    const purpose = activation.purpose.trim();
    if (purpose.length === 0 || purpose.length > MAX_PURPOSE_LENGTH) {
      reject("missing-purpose", "Each activation needs one short purpose.");
    }
    const manifestFor = SPECIALISTS[activation.specialistId];
    const selected = manifestFor.modes.find((item) => item.id === activation.modeId);
    if (selected === undefined) {
      reject(
        "unknown-mode",
        `${activation.specialistId} has no mode "${activation.modeId}".`,
      );
    }
    if (!(selected.phases as readonly string[]).includes(phaseName)) {
      reject(
        "wrong-phase",
        `${activation.specialistId}:${selected.id} cannot run during ${phaseName}.`,
      );
    }
    resolved.push({
      specialistId: activation.specialistId,
      modeId: selected.id,
      purpose,
      capability: selected.capability,
    });
  }

  const mutators = resolved.filter((item) => item.capability !== "read-only");
  if (mutators.length > 1) {
    reject("multiple-mutators", "Only one specialist mode may mutate at a time.");
  }
  return {
    mutator: mutators[0] ?? null,
    advisers: resolved.filter((item) => item.capability === "read-only"),
  };
}

export const DOCUMENTATION_HANDOFF = Object.freeze([
  "tech-docs-writer",
  "user-docs-writer",
] as const);

export function documentationHandoff(moduleName: string): readonly SpecialistActivation[] {
  const moduleLabel = moduleName.trim();
  if (moduleLabel.length === 0) {
    reject("missing-purpose", "Documentation handoff needs the finished module name.");
  }
  return DOCUMENTATION_HANDOFF.map((specialistId) =>
    Object.freeze({
      specialistId,
      modeId: "update",
      purpose:
        specialistId === "tech-docs-writer"
          ? `Update technical documentation for ${moduleLabel}.`
          : `Update user documentation for ${moduleLabel}.`,
    }),
  );
}
