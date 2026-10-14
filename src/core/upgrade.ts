import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseDocument } from "yaml";
import { compiledCursorAgents } from "./agents.js";
import {
  ConfigValidationError,
  DEFAULT_MODELS,
  MODEL_ROLES,
  parseConfig,
  type ModelsConfig,
  type ProductSurface,
  type ScreenLanguage,
  type Tenancy,
  type TitoConfig,
} from "./config.js";
import { PULL_REQUEST_TEMPLATE_PATH, pullRequestTemplate, type BranchBase } from "./git-flow.js";
import {
  shippedCursorRules,
  shippedSkills,
  titoYamlBody,
  type SettingKey,
  type TitoSettings,
} from "./init.js";
import {
  TITO_BOOTSTRAP_END,
  TITO_BOOTSTRAP_START,
  titoBootstrapBlock,
} from "./plan.js";

export type UpgradeFile = {
  readonly path: string;
  readonly action: "create" | "replace" | "keep";
  readonly body?: string;
};

function readIfFile(root: string, path: string): string | null {
  try {
    return readFileSync(join(root, path), "utf8");
  } catch {
    return null;
  }
}

function ownedText(current: string | null, next: string): "create" | "replace" | "keep" {
  if (current === null) return "create";
  return current === next ? "keep" : "replace";
}

export function refreshAgentsBootstrap(current: string): string {
  const block = titoBootstrapBlock().trimEnd();
  const start = current.indexOf(TITO_BOOTSTRAP_START);
  const end = current.indexOf(TITO_BOOTSTRAP_END);
  if (start >= 0 && end > start) {
    return `${current.slice(0, start)}${block}${current.slice(end + TITO_BOOTSTRAP_END.length)}`;
  }
  const heading = current.indexOf("# Tito bootstrap");
  if (heading >= 0) {
    const prefix = current.slice(0, heading).trimEnd();
    return prefix.length === 0 ? `${block}\n` : `${prefix}\n\n${block}\n`;
  }
  const trimmed = current.trimEnd();
  return `${trimmed}\n\n${block}\n`;
}

export function planUpgrade(
  root: string,
  ownedFiles: readonly { path: string; body: string }[],
): UpgradeFile[] {
  const files: UpgradeFile[] = ownedFiles.map((file) => {
    const current = readIfFile(root, file.path);
    const action = ownedText(current, file.body);
    return action === "keep"
      ? { path: file.path, action }
      : { path: file.path, action, body: file.body };
  });
  const yaml = readIfFile(root, "tito.yaml");
  const withModels = yaml === null ? null : addMissingModels(yaml);
  if (yaml !== null && withModels !== null) {
    files.push(
      withModels === yaml
        ? { path: "tito.yaml", action: "keep" }
        : { path: "tito.yaml", action: "replace", body: withModels },
    );
  }
  const agents = readIfFile(root, "AGENTS.md");
  if (agents === null) {
    files.push({ path: "AGENTS.md", action: "create", body: titoBootstrapBlock() });
  } else {
    const next = refreshAgentsBootstrap(agents);
    files.push(
      next === agents
        ? { path: "AGENTS.md", action: "keep" }
        : { path: "AGENTS.md", action: "replace", body: next },
    );
  }
  return files;
}

function readConfigText(text: string): TitoConfig | null {
  try {
    return parseConfig(text);
  } catch (error) {
    if (error instanceof ConfigValidationError) return null;
    throw error;
  }
}

export function addMissingModels(yamlText: string): string | null {
  const config = readConfigText(yamlText);
  if (config === null) return null;
  const missing = MODEL_ROLES.filter((role) => config.models?.[role] === undefined);
  if (missing.length === 0) return yamlText;
  const document = parseDocument(yamlText, { version: "1.2" });
  for (const role of missing) document.setIn(["models", role], DEFAULT_MODELS[role]);
  return document.toString();
}

export function projectModels(root: string): ModelsConfig | undefined {
  const text = readIfFile(root, "tito.yaml");
  return text === null ? undefined : readConfigText(text)?.models;
}

export function titoOwnedFiles(models?: ModelsConfig): { path: string; body: string }[] {
  return [
    ...compiledCursorAgents(models),
    ...shippedSkills(),
    ...shippedCursorRules(),
    { path: PULL_REQUEST_TEMPLATE_PATH, body: pullRequestTemplate() },
  ];
}

export function formatUpgrade(root: string, files: readonly UpgradeFile[]): string {
  const lines = [`root: ${root}`, "consumer rules: untouched"];
  for (const file of files) {
    lines.push(`${file.path}: ${file.action}`);
  }
  return `${lines.join("\n")}\n`;
}

export function missingSettings(config: TitoConfig): SettingKey[] {
  const missing: SettingKey[] = [];
  if (config.git?.defaultBase === undefined) missing.push("defaultBase");
  if (config.product?.screenLanguage === undefined) missing.push("screenLanguage");
  if (config.product?.tenancy === undefined) missing.push("tenancy");
  if (config.product?.surfaces === undefined) missing.push("surfaces");
  if (config.git?.autoPullRequest === undefined) missing.push("autoPullRequest");
  return missing;
}

export function mergeSettings(yamlText: string, answers: TitoSettings): string {
  const config = parseConfig(yamlText);
  const settings: {
    defaultBase?: BranchBase;
    screenLanguage?: ScreenLanguage;
    tenancy?: Tenancy;
    surfaces?: readonly ProductSurface[];
    autoPullRequest?: boolean;
  } = {};
  let changed = false;

  const existingBase = config.git?.defaultBase;
  if (existingBase !== undefined) settings.defaultBase = existingBase;
  else if (answers.defaultBase !== undefined) {
    settings.defaultBase = answers.defaultBase;
    changed = true;
  }

  const existingAuto = config.git?.autoPullRequest;
  if (existingAuto !== undefined) settings.autoPullRequest = existingAuto;
  else if (answers.autoPullRequest !== undefined) {
    settings.autoPullRequest = answers.autoPullRequest;
    changed = true;
  }

  const existingLanguage = config.product?.screenLanguage;
  if (existingLanguage !== undefined) settings.screenLanguage = existingLanguage;
  else if (answers.screenLanguage !== undefined) {
    settings.screenLanguage = answers.screenLanguage;
    changed = true;
  }

  const existingTenancy = config.product?.tenancy;
  if (existingTenancy !== undefined) settings.tenancy = existingTenancy;
  else if (answers.tenancy !== undefined) {
    settings.tenancy = answers.tenancy;
    changed = true;
  }

  const existingSurfaces = config.product?.surfaces;
  if (existingSurfaces !== undefined) settings.surfaces = existingSurfaces;
  else if (answers.surfaces !== undefined && answers.surfaces.length > 0) {
    settings.surfaces = answers.surfaces;
    changed = true;
  }

  if (!changed) return yamlText;
  return titoYamlBody(
    config.profile,
    config.models === undefined ? settings : { ...settings, models: config.models },
  );
}

export function applyUpgrade(root: string, files: readonly UpgradeFile[]): void {
  for (const file of files) {
    if (file.action === "keep" || file.body === undefined) continue;
    const absolute = join(root, file.path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, file.body, "utf8");
  }
}
