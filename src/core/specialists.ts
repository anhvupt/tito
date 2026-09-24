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
] as const;

export const WRITER_SPECIALIST_IDS = [
  "backend-engineer",
  "frontend-engineer",
  "devops-engineer",
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
export type MutationCapability = "read-only" | "write-code" | "write-infrastructure";
export type ModelTier = "Scout" | "Standard" | "Reasoning";
export type SpecialistPhase = "discovery" | "planning" | "implementation" | "review";

export type SpecialistCard = {
  readonly id: SpecialistId;
  readonly capability: MutationCapability;
  readonly defaultTier: ModelTier;
  readonly phases: readonly SpecialistPhase[];
  readonly purpose: string;
  readonly stopCondition: string;
};

const READ_ONLY_PHASES = Object.freeze([
  "discovery",
  "planning",
  "implementation",
  "review",
] as const satisfies readonly SpecialistPhase[]);
const IMPLEMENTATION_PHASE = Object.freeze([
  "implementation",
] as const satisfies readonly SpecialistPhase[]);

export const SPECIALISTS = Object.freeze({
  explorer: Object.freeze({
    id: "explorer",
    capability: "read-only",
    defaultTier: "Scout",
    phases: READ_ONLY_PHASES,
    purpose: "Find relevant repository facts without changing files.",
    stopCondition: "Return facts, affected files, and unresolved questions.",
  }),
  "product-analyst": Object.freeze({
    id: "product-analyst",
    capability: "read-only",
    defaultTier: "Standard",
    phases: READ_ONLY_PHASES,
    purpose: "Clarify requirements and acceptance criteria.",
    stopCondition: "Return the behavior and acceptance criteria for one slice.",
  }),
  architect: Object.freeze({
    id: "architect",
    capability: "read-only",
    defaultTier: "Reasoning",
    phases: READ_ONLY_PHASES,
    purpose: "Decide the technical approach and provide guidance code.",
    stopCondition: "Return decided contracts and rejected alternatives.",
  }),
  "backend-engineer": Object.freeze({
    id: "backend-engineer",
    capability: "write-code",
    defaultTier: "Standard",
    phases: IMPLEMENTATION_PHASE,
    purpose: "Implement one approved backend slice.",
    stopCondition: "Stop after the approved slice and its verification.",
  }),
  "frontend-engineer": Object.freeze({
    id: "frontend-engineer",
    capability: "write-code",
    defaultTier: "Standard",
    phases: IMPLEMENTATION_PHASE,
    purpose: "Implement one approved frontend slice.",
    stopCondition: "Stop after the approved slice and its verification.",
  }),
  "devops-engineer": Object.freeze({
    id: "devops-engineer",
    capability: "write-infrastructure",
    defaultTier: "Standard",
    phases: IMPLEMENTATION_PHASE,
    purpose: "Implement one approved infrastructure slice.",
    stopCondition: "Stop after the approved slice and its verification.",
  }),
  "erp-specialist": Object.freeze({
    id: "erp-specialist",
    capability: "read-only",
    defaultTier: "Reasoning",
    phases: READ_ONLY_PHASES,
    purpose: "Advise on ERP workflow, inventory, procurement, permissions, and accounting.",
    stopCondition: "Return domain constraints without editing files.",
  }),
  "qa-reviewer": Object.freeze({
    id: "qa-reviewer",
    capability: "read-only",
    defaultTier: "Standard",
    phases: Object.freeze(["review"] as const satisfies readonly SpecialistPhase[]),
    purpose: "Review correctness and edge cases.",
    stopCondition: "Return findings without editing the slice.",
  }),
  "security-reviewer": Object.freeze({
    id: "security-reviewer",
    capability: "read-only",
    defaultTier: "Reasoning",
    phases: Object.freeze(["review"] as const satisfies readonly SpecialistPhase[]),
    purpose: "Review security-sensitive changes.",
    stopCondition: "Return security findings without editing the slice.",
  }),
} as const satisfies Record<SpecialistId, SpecialistCard>);

export type DelegationPhase = SpecialistPhase;

export type DelegationRequest = {
  readonly activeWriters: readonly string[];
  readonly readOnlySpecialists: readonly string[];
};

export type DelegationPlan = {
  readonly activeWriter: WriterSpecialistId | null;
  readonly readOnlySpecialists: readonly ReadOnlySpecialistId[];
};

export type DelegationErrorCode =
  | "multiple-writers"
  | "read-only-as-writer"
  | "duplicate-specialist"
  | "root-recursion"
  | "writer-outside-implementation"
  | "unknown-specialist";

export class DelegationError extends Error {
  readonly code: DelegationErrorCode;

  constructor(code: DelegationErrorCode, message: string) {
    super(message);
    this.name = "DelegationError";
    this.code = code;
  }
}

const ROOT_IDS = new Set(["tito", "tito-root"]);

function isSpecialistId(value: string): value is SpecialistId {
  return (SPECIALIST_IDS as readonly string[]).includes(value);
}

function isWriterId(value: string): value is WriterSpecialistId {
  return (WRITER_SPECIALIST_IDS as readonly string[]).includes(value);
}

function isReadOnlyId(value: string): value is ReadOnlySpecialistId {
  return (READ_ONLY_SPECIALIST_IDS as readonly string[]).includes(value);
}

function reject(code: DelegationErrorCode, message: string): never {
  throw new DelegationError(code, message);
}

function classify(id: string): SpecialistId {
  if (ROOT_IDS.has(id)) reject("root-recursion", "Tito remains the root coordinator.");
  if (!isSpecialistId(id)) reject("unknown-specialist", `Unknown specialist "${id}".`);
  return id;
}

export function validateDelegation(
  request: DelegationRequest,
  phase: DelegationPhase,
): DelegationPlan {
  if (request.activeWriters.length > 1) {
    reject("multiple-writers", "Only one specialist may write at a time.");
  }

  const writer = request.activeWriters[0];
  let activeWriter: WriterSpecialistId | null = null;
  if (writer !== undefined) {
    const id = classify(writer);
    if (!isWriterId(id)) reject("read-only-as-writer", `${id} cannot write code.`);
    if (phase !== "implementation") {
      reject("writer-outside-implementation", "A writer is only active during implementation.");
    }
    activeWriter = id;
  }

  const seen = new Set<string>(activeWriter === null ? [] : [activeWriter]);
  const readOnlySpecialists: ReadOnlySpecialistId[] = [];
  for (const candidate of request.readOnlySpecialists) {
    const id = classify(candidate);
    if (seen.has(id)) reject("duplicate-specialist", `Specialist "${id}" is listed more than once.`);
    if (!isReadOnlyId(id)) {
      reject("read-only-as-writer", `${id} is a writer and cannot join the adviser list.`);
    }
    seen.add(id);
    readOnlySpecialists.push(id);
  }

  return { activeWriter, readOnlySpecialists };
}
