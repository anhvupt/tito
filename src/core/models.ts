export type ModelHost = "cursor" | "claude";
export type ModelClass = "explore" | "docs" | "ordinary" | "core" | "reasoning";

export type ModelRecommendation =
  | {
      readonly status: "selected";
      readonly model: string;
      readonly tier: "Scout" | "Standard" | "Reasoning";
      readonly reason: string;
      readonly escalation: string;
    }
  | {
      readonly status: "ask";
      readonly family: string;
      readonly reason: string;
    };

type SelectorRule = {
  readonly family: string;
  readonly matchGroups: readonly ((slug: string) => boolean)[];
  readonly pick: "highest" | "lowest";
};

type RecommendInput = {
  readonly host: ModelHost;
  readonly taskClass: ModelClass;
  readonly catalog: readonly string[];
  readonly userModel?: string;
};

const CLASS_TIER: Record<ModelClass, "Scout" | "Standard" | "Reasoning"> = {
  explore: "Scout",
  docs: "Scout",
  ordinary: "Standard",
  core: "Standard",
  reasoning: "Reasoning",
};

const CLASS_ESCALATION: Record<ModelClass, string> = {
  explore: "Step up when the slice is foundation, a core feature, or a core calculation.",
  docs: "Step up when the slice is foundation, a core feature, or a core calculation.",
  ordinary: "Step up when the slice is foundation, a core feature, or a core calculation.",
  core: "Ask the user before selecting a more expensive model.",
  reasoning: "Ask the user before selecting a more expensive model.",
};

function rulesFor(host: ModelHost, taskClass: ModelClass): SelectorRule {
  if (host === "cursor") {
    if (taskClass === "explore" || taskClass === "docs" || taskClass === "ordinary") {
      return {
        family: "Grok",
        matchGroups: [(slug) => slug.startsWith("grok-"), (slug) => slug.startsWith("cursor-grok-")],
        pick: "highest",
      };
    }
    if (taskClass === "core") {
      return {
        family: "Codex",
        matchGroups: [(slug) => slug.includes("codex"), (slug) => slug.startsWith("composer-")],
        pick: "highest",
      };
    }
    return {
      family: "Opus",
      matchGroups: [(slug) => slug.startsWith("claude-opus-")],
      pick: "highest",
    };
  }

  if (taskClass === "explore" || taskClass === "docs") {
    return {
      family: "Sonnet",
      matchGroups: [(slug) => slug.startsWith("claude-sonnet-")],
      pick: "lowest",
    };
  }
  if (taskClass === "ordinary") {
    return {
      family: "Sonnet",
      matchGroups: [(slug) => slug.startsWith("claude-sonnet-")],
      pick: "highest",
    };
  }
  return {
    family: "Opus",
    matchGroups: [(slug) => slug.startsWith("claude-opus-")],
    pick: "highest",
  };
}

function versionTuple(slug: string): readonly number[] {
  const groups = slug.match(/\d+/g) ?? [];
  return groups.map((value) => Number.parseInt(value, 10));
}

function compareVersions(left: readonly number[], right: readonly number[]): number {
  const limit = Math.max(left.length, right.length);
  for (let index = 0; index < limit; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === undefined && b === undefined) {
      return 0;
    }
    if (a === undefined) {
      return -1;
    }
    if (b === undefined) {
      return 1;
    }
    if (a !== b) {
      return a - b;
    }
  }
  return 0;
}

function pickVersion(slugs: readonly string[], pick: "highest" | "lowest"): string {
  const direction = pick === "highest" ? 1 : -1;
  return [...slugs].sort((a, b) => compareVersions(versionTuple(a), versionTuple(b)) * direction).at(-1) ?? slugs[0]!;
}

export function recommendModel({
  host,
  taskClass,
  catalog,
  userModel,
}: RecommendInput): ModelRecommendation {
  const tier = CLASS_TIER[taskClass];
  const escalation = CLASS_ESCALATION[taskClass];

  if (typeof userModel === "string" && userModel.length > 0) {
    return {
      status: "selected",
      model: userModel,
      tier,
      reason: "Used the explicit model requested by the user.",
      escalation,
    };
  }

  const rule = rulesFor(host, taskClass);
  for (const matcher of rule.matchGroups) {
    const matches = catalog.filter((slug) => matcher(slug));
    if (matches.length > 0) {
      const model = pickVersion(matches, rule.pick);
      return {
        status: "selected",
        model,
        tier,
        reason: `Selected the ${rule.pick} version in the ${rule.family} family.`,
        escalation,
      };
    }
  }

  return {
    status: "ask",
    family: rule.family,
    reason: `No matching ${rule.family} model was found in the current catalog.`,
  };
}
