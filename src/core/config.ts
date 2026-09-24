import { isMap, isScalar, parseAllDocuments } from "yaml";
import {
  ACTIVE_RISK_PROFILE_IDS,
  isActiveRiskProfileId,
  isFutureRiskProfileId,
  type ActiveRiskProfileId,
} from "./profiles.js";

export const CONFIG_SCHEMA_VERSION = 1;
const FIELDS = new Set(["schemaVersion", "profile"]);
const NON_SCALAR = Symbol("non-scalar");

export type ConfigIssueCode =
  | "yaml-syntax"
  | "not-a-mapping"
  | "duplicate-key"
  | "unknown-field"
  | "missing-field"
  | "unsupported-schema-version"
  | "unknown-profile"
  | "unsupported-profile";

export type ConfigIssue = {
  readonly code: ConfigIssueCode;
  readonly message: string;
  readonly path?: string;
};

export type TitoConfig = {
  readonly schemaVersion: typeof CONFIG_SCHEMA_VERSION;
  readonly profile: ActiveRiskProfileId;
};

export class ConfigValidationError extends Error {
  readonly issues: readonly ConfigIssue[];

  constructor(issues: readonly ConfigIssue[]) {
    super(issues.map((item) => item.message).join("\n"));
    this.name = "ConfigValidationError";
    this.issues = issues;
  }
}

function issue(code: ConfigIssueCode, message: string, path?: string): ConfigIssue {
  return path === undefined ? { code, message } : { code, message, path };
}

function shown(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    value === null
  ) {
    return String(value);
  }
  return "a non-scalar value";
}

function profileIssue(value: unknown): ConfigIssue | null {
  if (typeof value !== "string") {
    return issue("unknown-profile", "Profile must be a string.", "profile");
  }
  if (isFutureRiskProfileId(value)) {
    return issue(
      "unsupported-profile",
      `Profile "${value}" is recognized but not available.`,
      "profile",
    );
  }
  if (isActiveRiskProfileId(value)) return null;
  return issue(
    "unknown-profile",
    `Unknown profile "${value}". Active profiles: ${ACTIVE_RISK_PROFILE_IDS.join(", ")}.`,
    "profile",
  );
}

export function parseConfig(text: string): TitoConfig {
  const documents = parseAllDocuments(text, {
    logLevel: "silent",
    merge: false,
    stringKeys: true,
    uniqueKeys: true,
    version: "1.2",
  });
  const document = documents[0];
  if (documents.length !== 1 || !document) {
    const multiple = documents.length > 1;
    throw new ConfigValidationError([
      issue(
        multiple ? "yaml-syntax" : "not-a-mapping",
        multiple
          ? "Multiple YAML documents are not allowed."
          : "Configuration must be a mapping.",
      ),
    ]);
  }

  const syntax = document.errors.filter(
    (error) => error.code !== "DUPLICATE_KEY" && error.code !== "NON_STRING_KEY",
  );
  if (syntax.length > 0) {
    throw new ConfigValidationError(
      syntax.map((error) => issue("yaml-syntax", `YAML syntax error (${error.code}).`)),
    );
  }
  if (!isMap(document.contents)) {
    throw new ConfigValidationError([
      issue("not-a-mapping", "Configuration must be a mapping."),
    ]);
  }

  const issues: ConfigIssue[] = [];
  const occurrences = new Map<string, number>();
  const values = new Map<string, unknown>();
  for (const item of document.contents.items) {
    const key = isScalar(item.key) && typeof item.key.value === "string" ? item.key.value : null;
    if (key === null) {
      issues.push(issue("unknown-field", "Mapping keys must be strings."));
      continue;
    }
    const count = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, count);
    if (count > 1) {
      issues.push(issue("duplicate-key", `Duplicate key "${key}".`, key));
      continue;
    }
    if (!FIELDS.has(key)) {
      issues.push(issue("unknown-field", `Unknown field "${key}".`, key));
      continue;
    }
    values.set(key, isScalar(item.value) ? item.value.value : NON_SCALAR);
  }

  if ((occurrences.get("schemaVersion") ?? 0) === 0) {
    issues.push(issue("missing-field", 'Missing required field "schemaVersion".', "schemaVersion"));
  } else if (occurrences.get("schemaVersion") === 1 && values.get("schemaVersion") !== CONFIG_SCHEMA_VERSION) {
    issues.push(
      issue(
        "unsupported-schema-version",
        `Unsupported schemaVersion ${shown(values.get("schemaVersion"))}. Expected ${CONFIG_SCHEMA_VERSION}.`,
        "schemaVersion",
      ),
    );
  }
  const profileError = (occurrences.get("profile") ?? 0) === 0
    ? issue("missing-field", 'Missing required field "profile".', "profile")
    : occurrences.get("profile") === 1
      ? profileIssue(values.get("profile"))
      : null;
  if (profileError) issues.push(profileError);
  if (issues.length > 0) throw new ConfigValidationError(issues);

  const profile = values.get("profile");
  if (typeof profile !== "string" || !isActiveRiskProfileId(profile)) {
    throw new ConfigValidationError([
      issue("unknown-profile", "Profile must be a string.", "profile"),
    ]);
  }
  return { schemaVersion: CONFIG_SCHEMA_VERSION, profile };
}
