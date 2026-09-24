import {
  LIFECYCLE_STATES,
  type LifecycleState,
} from "./lifecycle.js";
import {
  isActiveRiskProfileId,
  type ActiveRiskProfileId,
} from "./profiles.js";
import {
  SPECIALISTS,
  type ReadOnlySpecialistId,
  type SpecialistId,
  type WriterSpecialistId,
} from "./specialists.js";

type SliceBase = {
  readonly id: string;
  readonly title: string;
  readonly dependsOn: readonly string[];
};

export type ReadOnlySlice = SliceBase & {
  readonly kind: "read-only";
  readonly specialist: ReadOnlySpecialistId;
};

export type ImplementationSlice = SliceBase & {
  readonly kind: "implementation";
  readonly specialist: WriterSpecialistId;
  readonly reviewRequirement: "self" | "independent";
};

export type ReviewSlice = SliceBase & {
  readonly kind: "review";
  readonly specialist: ReadOnlySpecialistId;
  readonly reviews: string;
};

export type WorkPlanSlice = ReadOnlySlice | ImplementationSlice | ReviewSlice;

export type WorkPlan = {
  readonly profile: ActiveRiskProfileId;
  readonly slices: readonly WorkPlanSlice[];
};

export type ValidatedWorkPlan = Readonly<WorkPlan>;

export type WorkPlanProgress = {
  readonly activeReadOnlySliceIds: readonly string[];
  readonly completedSliceIds: readonly string[];
  readonly implementationStates: Readonly<Record<string, LifecycleState>>;
};

export type BlockedSlice = {
  readonly sliceId: string;
  readonly reasons: readonly string[];
};

export type WorkPlanReadiness = {
  readonly readyReadOnly: readonly (ReadOnlySlice | ReviewSlice)[];
  readonly readyWriterCandidates: readonly ImplementationSlice[];
  readonly blocked: readonly BlockedSlice[];
};

export type WorkPlanErrorCode =
  | "invalid-plan"
  | "invalid-profile"
  | "invalid-id"
  | "duplicate-id"
  | "duplicate-prerequisite"
  | "missing-prerequisite"
  | "self-prerequisite"
  | "cycle"
  | "invalid-slice-kind"
  | "invalid-specialist"
  | "invalid-review-requirement"
  | "invalid-review-target"
  | "missing-independent-review"
  | "invalid-progress"
  | "multiple-active-writers";

export class WorkPlanError extends Error {
  readonly code: WorkPlanErrorCode;

  constructor(code: WorkPlanErrorCode, message: string) {
    super(message);
    this.name = "WorkPlanError";
    this.code = code;
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as object)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function reject(code: WorkPlanErrorCode, message: string): never {
  throw new WorkPlanError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function specialistManifest(id: string) {
  if (!Object.hasOwn(SPECIALISTS, id)) {
    reject("invalid-specialist", `Unknown specialist "${id}".`);
  }
  return SPECIALISTS[id as SpecialistId];
}

function hasMode(
  id: string,
  predicate: (mode: (typeof SPECIALISTS)[SpecialistId]["modes"][number]) => boolean,
): boolean {
  return specialistManifest(id).modes.some(predicate);
}

export function validateWorkPlan(plan: WorkPlan): ValidatedWorkPlan {
  const input = plan as unknown;
  if (
    !isRecord(input) ||
    typeof input.profile !== "string" ||
    !Array.isArray(input.slices)
  ) {
    reject("invalid-plan", "Work plan must contain a profile and slice array.");
  }
  for (const slice of input.slices) {
    if (
      !isRecord(slice) ||
      typeof slice.id !== "string" ||
      typeof slice.title !== "string" ||
      typeof slice.kind !== "string" ||
      typeof slice.specialist !== "string" ||
      !Array.isArray(slice.dependsOn) ||
      !slice.dependsOn.every((dependency) => typeof dependency === "string")
    ) {
      reject("invalid-plan", "Every slice must use the work-plan slice shape.");
    }
  }
  if (!isActiveRiskProfileId(plan.profile)) {
    reject("invalid-profile", `Unknown active profile "${plan.profile}".`);
  }

  const byId = new Map<string, WorkPlanSlice>();
  for (const slice of plan.slices) {
    if (slice.id.trim() === "") reject("invalid-id", "Slice IDs cannot be empty.");
    if (byId.has(slice.id)) {
      reject("duplicate-id", `Slice "${slice.id}" is declared more than once.`);
    }
    byId.set(slice.id, slice);
    const prerequisites = new Set<string>();
    for (const dependency of slice.dependsOn) {
      if (dependency === slice.id) {
        reject("self-prerequisite", `Slice "${slice.id}" cannot depend on itself.`);
      }
      if (prerequisites.has(dependency)) {
        reject(
          "duplicate-prerequisite",
          `Slice "${slice.id}" repeats prerequisite "${dependency}".`,
        );
      }
      prerequisites.add(dependency);
    }
  }

  for (const slice of plan.slices) {
    if (!["read-only", "implementation", "review"].includes(slice.kind)) {
      reject("invalid-slice-kind", `Slice "${slice.id}" has an invalid kind.`);
    }
    for (const dependency of slice.dependsOn) {
      if (!byId.has(dependency)) {
        reject(
          "missing-prerequisite",
          `Slice "${slice.id}" references missing prerequisite "${dependency}".`,
        );
      }
    }
    if (slice.kind === "implementation") {
      if (!["self", "independent"].includes(slice.reviewRequirement)) {
        reject(
          "invalid-review-requirement",
          `Implementation slice "${slice.id}" has an invalid review requirement.`,
        );
      }
      if (
        !hasMode(
          slice.specialist,
          (mode) =>
            mode.capability !== "read-only" && mode.phases.includes("implementation"),
        )
      ) {
        reject("invalid-specialist", `${slice.specialist} cannot implement a slice.`);
      }
    }
    if (
      slice.kind !== "implementation" &&
      !hasMode(slice.specialist, (mode) => mode.capability === "read-only")
    ) {
      reject("invalid-specialist", `${slice.specialist} cannot run a read-only slice.`);
    }
    if (slice.kind === "review") {
      const target = byId.get(slice.reviews);
      const canReview = hasMode(
        slice.specialist,
        (mode) => mode.capability === "read-only" && mode.phases.includes("review"),
      );
      if (
        target?.kind !== "implementation" ||
        !slice.dependsOn.includes(slice.reviews) ||
        !canReview
      ) {
        reject(
          "invalid-review-target",
          `Review slice "${slice.id}" must depend on an implementation it can review.`,
        );
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) reject("cycle", `Slice graph contains a cycle at "${id}".`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const slice of plan.slices) visit(slice.id);

  for (const slice of plan.slices) {
    if (
      slice.kind === "implementation" &&
      (plan.profile === "client-careful" ||
        slice.reviewRequirement === "independent") &&
      (slice.reviewRequirement !== "independent" ||
        !plan.slices.some(
          (candidate) =>
            candidate.kind === "review" && candidate.reviews === slice.id,
        ))
    ) {
      reject(
        "missing-independent-review",
        `Implementation slice "${slice.id}" requires an independent review slice.`,
      );
    }
  }

  const copy: WorkPlan = {
    profile: plan.profile,
    slices: plan.slices.map((slice) => ({
      ...slice,
      dependsOn: [...slice.dependsOn],
    })),
  };
  return deepFreeze(copy);
}

function lifecycleRank(state: LifecycleState): number {
  return LIFECYCLE_STATES.indexOf(state);
}

function reached(state: LifecycleState | undefined, threshold: LifecycleState): boolean {
  return state !== undefined && lifecycleRank(state) >= lifecycleRank(threshold);
}

export function evaluateWorkPlan(
  plan: WorkPlan,
  progress: WorkPlanProgress,
): WorkPlanReadiness {
  const validated = validateWorkPlan(plan);
  const progressInput = progress as unknown;
  if (
    !isRecord(progressInput) ||
    !Array.isArray(progressInput.activeReadOnlySliceIds) ||
    !progressInput.activeReadOnlySliceIds.every((id) => typeof id === "string") ||
    !Array.isArray(progressInput.completedSliceIds) ||
    !progressInput.completedSliceIds.every((id) => typeof id === "string") ||
    !isRecord(progressInput.implementationStates)
  ) {
    reject("invalid-progress", "Progress must use the work-plan progress shape.");
  }
  const byId = new Map(validated.slices.map((slice) => [slice.id, slice]));
  const active = new Set(progress.activeReadOnlySliceIds);
  const completed = new Set(progress.completedSliceIds);

  if (
    active.size !== progress.activeReadOnlySliceIds.length ||
    completed.size !== progress.completedSliceIds.length
  ) {
    reject("invalid-progress", "Progress cannot repeat slice IDs.");
  }
  for (const id of [...active, ...completed]) {
    const slice = byId.get(id);
    if (slice === undefined || slice.kind === "implementation") {
      reject("invalid-progress", `Progress references invalid read-only slice "${id}".`);
    }
    if (active.has(id) && completed.has(id)) {
      reject("invalid-progress", `Slice "${id}" cannot be active and completed.`);
    }
  }
  for (const [id, state] of Object.entries(progress.implementationStates)) {
    if (
      byId.get(id)?.kind !== "implementation" ||
      !(LIFECYCLE_STATES as readonly string[]).includes(state)
    ) {
      reject("invalid-progress", `Invalid implementation progress for "${id}".`);
    }
  }

  const activeWriters = validated.slices.filter(
    (slice) =>
      slice.kind === "implementation" &&
      progress.implementationStates[slice.id] === "IMPLEMENTING",
  );
  if (activeWriters.length > 1) {
    reject("multiple-active-writers", "Only one implementation slice may be active.");
  }
  const unreviewedSlices = validated.slices.filter(
    (slice) =>
      slice.kind === "implementation" &&
      progress.implementationStates[slice.id] === "READY_FOR_REVIEW",
  );
  if (
    validated.profile === "client-careful" &&
    activeWriters.length + unreviewedSlices.length > 1
  ) {
    reject("invalid-progress", "Client-careful cannot stack unreviewed work.");
  }

  const dependencyReasons = (slice: WorkPlanSlice): string[] => {
    const reasons: string[] = [];
    for (const dependencyId of slice.dependsOn) {
      const dependency = byId.get(dependencyId);
      if (dependency?.kind !== "implementation") {
        if (!completed.has(dependencyId)) reasons.push(`waiting-for:${dependencyId}`);
        continue;
      }
      const threshold =
        slice.kind === "review" && slice.reviews === dependencyId
          ? "READY_FOR_REVIEW"
          : validated.profile === "client-careful" ||
              dependency.reviewRequirement === "independent"
            ? "APPROVED_FOR_COMMIT"
            : "READY_FOR_REVIEW";
      if (!reached(progress.implementationStates[dependencyId], threshold)) {
        reasons.push(`waiting-for:${dependencyId}:${threshold}`);
      }
    }
    return reasons;
  };
  for (const id of [...active, ...completed]) {
    const slice = byId.get(id);
    if (slice !== undefined && dependencyReasons(slice).length > 0) {
      reject("invalid-progress", `Progressed slice "${id}" has unmet prerequisites.`);
    }
  }
  for (const slice of validated.slices) {
    if (
      slice.kind === "implementation" &&
      reached(progress.implementationStates[slice.id], "IMPLEMENTING") &&
      dependencyReasons(slice).length > 0
    ) {
      reject(
        "invalid-progress",
        `Implementation slice "${slice.id}" has unmet prerequisites.`,
      );
    }
    if (
      slice.kind === "implementation" &&
      reached(progress.implementationStates[slice.id], "APPROVED_FOR_COMMIT") &&
      (validated.profile === "client-careful" ||
        slice.reviewRequirement === "independent") &&
      !validated.slices.some(
        (candidate) =>
          candidate.kind === "review" &&
          candidate.reviews === slice.id &&
          completed.has(candidate.id),
      )
    ) {
      reject(
        "invalid-progress",
        `Implementation slice "${slice.id}" lacks completed independent review.`,
      );
    }
  }

  const writerBlocker =
    activeWriters[0] ??
    (validated.profile === "client-careful"
      ? validated.slices.find(
          (slice) =>
            slice.kind === "implementation" &&
            progress.implementationStates[slice.id] === "READY_FOR_REVIEW",
        )
      : undefined);
  const readyReadOnly: (ReadOnlySlice | ReviewSlice)[] = [];
  const readyWriterCandidates: ImplementationSlice[] = [];
  const blocked: BlockedSlice[] = [];

  for (const slice of validated.slices) {
    if (
      completed.has(slice.id) ||
      active.has(slice.id) ||
      (slice.kind === "implementation" &&
        reached(progress.implementationStates[slice.id], "IMPLEMENTING"))
    ) {
      continue;
    }

    const reasons = dependencyReasons(slice);

    if (slice.kind === "implementation") {
      if (progress.implementationStates[slice.id] !== "APPROVED") {
        reasons.push("awaiting-approval");
      }
      if (writerBlocker !== undefined) {
        const reason =
          progress.implementationStates[writerBlocker.id] === "IMPLEMENTING"
            ? "writer-active"
            : "unreviewed-slice";
        reasons.push(`${reason}:${writerBlocker.id}`);
      }
    }

    if (reasons.length > 0) {
      blocked.push({ sliceId: slice.id, reasons });
    } else if (slice.kind === "implementation") {
      readyWriterCandidates.push(slice);
    } else {
      readyReadOnly.push(slice);
    }
  }

  return deepFreeze({ readyReadOnly, readyWriterCandidates, blocked });
}
