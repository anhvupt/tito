export const LIFECYCLE_STATES = Object.freeze([
  "DISCOVERY",
  "PLANNED",
  "APPROVED",
  "IMPLEMENTING",
  "READY_FOR_REVIEW",
  "APPROVED_FOR_COMMIT",
  "DONE",
] as const);

export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

const LINEAR_NEXT: Record<LifecycleState, LifecycleState | null> = {
  DISCOVERY: "PLANNED",
  PLANNED: "APPROVED",
  APPROVED: "IMPLEMENTING",
  IMPLEMENTING: "READY_FOR_REVIEW",
  READY_FOR_REVIEW: "APPROVED_FOR_COMMIT",
  APPROVED_FOR_COMMIT: "DONE",
  DONE: null,
};

export type TransitionAuthorization = {
  readonly approvedSmallSlice: boolean;
  readonly inScopeReviewRevision: boolean;
};

export type TransitionErrorCode =
  | "invalid-state"
  | "illegal-transition"
  | "missing-authorization";

export class LifecycleTransitionError extends Error {
  readonly code: TransitionErrorCode;
  readonly from: string;
  readonly to: string;

  constructor(
    code: TransitionErrorCode,
    from: string,
    to: string,
    message: string,
  ) {
    super(message);
    this.name = "LifecycleTransitionError";
    this.code = code;
    this.from = from;
    this.to = to;
  }
}

function isLifecycleState(value: string): value is LifecycleState {
  return (LIFECYCLE_STATES as readonly string[]).includes(value);
}

function reject(
  code: TransitionErrorCode,
  from: string,
  to: string,
  message: string,
): never {
  throw new LifecycleTransitionError(code, from, to, message);
}

export function transitionLifecycle(
  from: string,
  to: string,
  authorization: TransitionAuthorization,
): LifecycleState {
  if (!isLifecycleState(from) || !isLifecycleState(to)) {
    reject("invalid-state", from, to, "Lifecycle transition requires known states.");
  }
  if (LINEAR_NEXT[from] === to) return to;
  if (from === "DISCOVERY" && to === "APPROVED") {
    if (authorization.approvedSmallSlice) return to;
    reject(
      "missing-authorization",
      from,
      to,
      "DISCOVERY can move to APPROVED only for an explicitly approved small slice.",
    );
  }
  if (from === "READY_FOR_REVIEW" && to === "IMPLEMENTING") {
    if (authorization.inScopeReviewRevision) return to;
    reject(
      "missing-authorization",
      from,
      to,
      "READY_FOR_REVIEW can return to IMPLEMENTING only for an in-scope review revision.",
    );
  }
  reject("illegal-transition", from, to, `Cannot transition from ${from} to ${to}.`);
}
