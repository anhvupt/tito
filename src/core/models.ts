export type ModelHost = "cursor" | "claude";
export type ModelClass = "explore" | "docs" | "ordinary" | "core" | "reasoning";
export type PipelineRole =
  | "explorer"
  | "planner"
  | "test-writer"
  | "implementer"
  | "finisher"
  | "sandbox";

export type ModelRecommendation =
  | {
      readonly status: "selected";
      readonly model: string;
      readonly tier: "Scout" | "Standard" | "Reasoning";
      readonly reason: string;
      readonly escalation: string;
      readonly fast?: true;
    }
  | {
      readonly status: "ask";
      readonly family: string;
      readonly reason: string;
    };

type Tier = "Scout" | "Standard" | "Reasoning";

type SelectorRule = {
  readonly family: string;
  readonly matchGroups: readonly ((slug: string) => boolean)[];
  readonly pick: "highest" | "lowest";
};

type Selection = {
  readonly rule: SelectorRule;
  readonly tier: Tier;
  readonly escalation: string;
};

type RecommendInput =
  | {
      readonly host: ModelHost;
      readonly taskClass: ModelClass;
      readonly catalog: readonly string[];
      readonly userModel?: string;
      readonly role?: undefined;
    }
  | {
      readonly host: ModelHost;
      readonly role: PipelineRole;
      readonly catalog: readonly string[];
      readonly userModel?: string;
      readonly taskClass?: undefined;
    };

const CLASS_TIER: Record<ModelClass, Tier> = {
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

const GROK_RULE: SelectorRule = {
  family: "Grok",
  matchGroups: [(slug) => slug.startsWith("grok-"), (slug) => slug.startsWith("cursor-grok-")],
  pick: "highest",
};

const OPUS_RULE: SelectorRule = {
  family: "Opus",
  matchGroups: [(slug) => slug.startsWith("claude-opus-")],
  pick: "highest",
};

const SONNET_HIGHEST: SelectorRule = {
  family: "Sonnet",
  matchGroups: [(slug) => slug.startsWith("claude-sonnet-")],
  pick: "highest",
};

function rulesFor(host: ModelHost, taskClass: ModelClass): SelectorRule {
  if (host === "cursor") {
    if (taskClass === "explore" || taskClass === "docs" || taskClass === "ordinary") {
      return GROK_RULE;
    }
    if (taskClass === "core") {
      return {
        family: "Codex",
        matchGroups: [(slug) => slug.includes("codex"), (slug) => slug.startsWith("composer-")],
        pick: "highest",
      };
    }
    return OPUS_RULE;
  }

  if (taskClass === "explore" || taskClass === "docs") {
    return {
      family: "Sonnet",
      matchGroups: [(slug) => slug.startsWith("claude-sonnet-")],
      pick: "lowest",
    };
  }
  if (taskClass === "ordinary") {
    return SONNET_HIGHEST;
  }
  return OPUS_RULE;
}

function rulesForRole(role: PipelineRole): Selection {
  switch (role) {
    case "explorer":
    case "sandbox":
      return {
        rule: GROK_RULE,
        tier: "Scout",
        escalation: CLASS_ESCALATION.explore,
      };
    case "test-writer":
    case "implementer":
      return {
        rule: GROK_RULE,
        tier: "Standard",
        escalation: CLASS_ESCALATION.ordinary,
      };
    case "planner":
      return {
        rule: OPUS_RULE,
        tier: "Reasoning",
        escalation: CLASS_ESCALATION.reasoning,
      };
    case "finisher":
      return {
        rule: SONNET_HIGHEST,
        tier: "Scout",
        escalation: CLASS_ESCALATION.docs,
      };
  }
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

function isFastSlug(slug: string): boolean {
  return slug.split("-").includes("fast");
}

function selectSlug(
  catalog: readonly string[],
  rule: SelectorRule,
): { readonly model: string; readonly fast?: true } | undefined {
  const groups = rule.matchGroups.map((matcher) => catalog.filter((slug) => matcher(slug)));
  const nonFastGroups = groups.map((group) => group.filter((slug) => !isFastSlug(slug)));
  const preferNonFast = nonFastGroups.some((group) => group.length > 0);
  const eligible = preferNonFast ? nonFastGroups : groups;

  for (const group of eligible) {
    if (group.length === 0) {
      continue;
    }
    const model = pickVersion(group, rule.pick);
    if (preferNonFast) {
      return { model };
    }
    return { model, fast: true };
  }

  return undefined;
}

function selectionFor(input: RecommendInput): Selection {
  if (input.role !== undefined) {
    return rulesForRole(input.role);
  }

  return {
    rule: rulesFor(input.host, input.taskClass),
    tier: CLASS_TIER[input.taskClass],
    escalation: CLASS_ESCALATION[input.taskClass],
  };
}

export function recommendModel(input: RecommendInput): ModelRecommendation {
  const selection = selectionFor(input);

  if (typeof input.userModel === "string" && input.userModel.length > 0) {
    return {
      status: "selected",
      model: input.userModel,
      tier: selection.tier,
      reason: "Used the explicit model requested by the user.",
      escalation: selection.escalation,
    };
  }

  if (input.role !== undefined && input.host !== "cursor") {
    return {
      status: "ask",
      family: selection.rule.family,
      reason: "Pipeline roles are routed on the Cursor host.",
    };
  }

  const picked = selectSlug(input.catalog, selection.rule);
  if (picked === undefined) {
    return {
      status: "ask",
      family: selection.rule.family,
      reason: `No matching ${selection.rule.family} model was found in the current catalog.`,
    };
  }

  const reason = picked.fast
    ? `Selected the ${selection.rule.pick} version in the ${selection.rule.family} family. The only match is a -fast slug.`
    : `Selected the ${selection.rule.pick} version in the ${selection.rule.family} family.`;

  return {
    status: "selected",
    model: picked.model,
    tier: selection.tier,
    reason,
    escalation: selection.escalation,
    ...(picked.fast ? { fast: true as const } : {}),
  };
}
