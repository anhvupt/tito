import { mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compiledCursorAgents } from "./agents.js";
import {
  SCREEN_LANGUAGES,
  TENANCY_VALUES,
  isSurfaceId,
  type ProductSurface,
  type ScreenLanguage,
  type Tenancy,
} from "./config.js";
import {
  BRANCH_BASES,
  PULL_REQUEST_TEMPLATE_PATH,
  pullRequestTemplate,
  type BranchBase,
} from "./git-flow.js";
import type { InspectionReport } from "./inspect.js";
import { ACTIVE_RISK_PROFILE_IDS } from "./profiles.js";
import {
  PlanError,
  TITO_BOOTSTRAP_START,
  planAdoption,
  titoBootstrapBlock,
  type PlannedFile,
} from "./plan.js";

export type InitFile = PlannedFile | {
  readonly path: string;
  readonly action: "create" | "append";
  readonly body: string;
} | {
  readonly path: string;
  readonly action: "conflict" | "keep";
};

export class InitError extends Error {
  readonly code: "conflict";

  constructor(message: string) {
    super(message);
    this.name = "InitError";
    this.code = "conflict";
  }
}

export async function promptForProfile(
  ask: (prompt: string) => Promise<string>,
): Promise<string> {
  const choices = ACTIVE_RISK_PROFILE_IDS.map(
    (id, index) => `  ${index + 1}. ${id}`,
  ).join("\n");
  const answer = (await ask(`Profiles:\n${choices}\nProfile: `)).trim();
  const index = Number(answer);
  if (
    Number.isInteger(index) &&
    index >= 1 &&
    index <= ACTIVE_RISK_PROFILE_IDS.length
  ) {
    return ACTIVE_RISK_PROFILE_IDS[index - 1] ?? answer;
  }
  return answer;
}

export const GIT_BASE_PROMPT = "Git base (dev, develop, main, master): ";
export const SCREEN_LANGUAGE_PROMPT = "Screen language (vi, en): ";
export const TENANCY_PROMPT = "Tenancy (single, multi): ";
export const SURFACES_PROMPT = "Surfaces (comma-separated ids): ";
export const AUTO_PULL_REQUEST_PROMPT =
  "Auto-create a pull request after implementation? [Y/n] ";

export const INIT_SETTING_KEYS = [
  "defaultBase",
  "screenLanguage",
  "tenancy",
  "surfaces",
  "autoPullRequest",
] as const;

export type SettingKey = (typeof INIT_SETTING_KEYS)[number];

export type TitoSettings = {
  readonly defaultBase?: BranchBase;
  readonly screenLanguage?: ScreenLanguage;
  readonly tenancy?: Tenancy;
  readonly surfaces?: readonly ProductSurface[];
  readonly autoPullRequest?: boolean;
};

async function askOneOf<T extends string>(
  ask: (prompt: string) => Promise<string>,
  prompt: string,
  allowed: readonly T[],
): Promise<T> {
  for (;;) {
    const answer = (await ask(prompt)).trim();
    if ((allowed as readonly string[]).includes(answer)) return answer as T;
  }
}

async function askSurfaces(
  ask: (prompt: string) => Promise<string>,
): Promise<readonly ProductSurface[] | undefined> {
  for (;;) {
    const answer = (await ask(SURFACES_PROMPT)).trim();
    if (answer === "") return undefined;
    const ids = answer
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (ids.length === 0) return undefined;
    const seen = new Set<string>();
    const valid = ids.every((id) => {
      if (!isSurfaceId(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    if (valid) return ids.map((id) => ({ id }));
  }
}

async function askAutoPullRequest(ask: (prompt: string) => Promise<string>): Promise<boolean> {
  for (;;) {
    const answer = (await ask(AUTO_PULL_REQUEST_PROMPT)).trim().toLowerCase();
    if (answer === "" || answer === "y" || answer === "yes") return true;
    if (answer === "n" || answer === "no") return false;
  }
}

export async function promptForSettings(
  ask: (prompt: string) => Promise<string>,
  keys: readonly SettingKey[],
): Promise<TitoSettings> {
  const answers: {
    defaultBase?: BranchBase;
    screenLanguage?: ScreenLanguage;
    tenancy?: Tenancy;
    surfaces?: readonly ProductSurface[];
    autoPullRequest?: boolean;
  } = {};
  for (const key of keys) {
    if (key === "defaultBase") {
      answers.defaultBase = await askOneOf(ask, GIT_BASE_PROMPT, BRANCH_BASES);
      continue;
    }
    if (key === "screenLanguage") {
      answers.screenLanguage = await askOneOf(ask, SCREEN_LANGUAGE_PROMPT, SCREEN_LANGUAGES);
      continue;
    }
    if (key === "tenancy") {
      answers.tenancy = await askOneOf(ask, TENANCY_PROMPT, TENANCY_VALUES);
      continue;
    }
    if (key === "surfaces") {
      const surfaces = await askSurfaces(ask);
      if (surfaces !== undefined) answers.surfaces = surfaces;
      continue;
    }
    answers.autoPullRequest = await askAutoPullRequest(ask);
  }
  return answers;
}

export function titoYamlBody(profile: string, settings: TitoSettings): string {
  const lines = ["schemaVersion: 1", `profile: ${profile}`];
  const gitLines: string[] = [];
  if (settings.defaultBase !== undefined) gitLines.push(`  defaultBase: ${settings.defaultBase}`);
  if (settings.autoPullRequest !== undefined) {
    gitLines.push(`  autoPullRequest: ${settings.autoPullRequest}`);
  }
  if (gitLines.length > 0) lines.push("git:", ...gitLines);
  const productLines: string[] = [];
  if (settings.screenLanguage !== undefined) {
    productLines.push(`  screenLanguage: ${settings.screenLanguage}`);
  }
  if (settings.tenancy !== undefined) productLines.push(`  tenancy: ${settings.tenancy}`);
  if (settings.surfaces !== undefined && settings.surfaces.length > 0) {
    productLines.push("  surfaces:");
    for (const surface of settings.surfaces) productLines.push(`    - id: ${surface.id}`);
  }
  if (productLines.length > 0) lines.push("product:", ...productLines);
  return `${lines.join("\n")}\n`;
}

function exists(root: string, path: string): boolean {
  try {
    return statSync(join(root, path)).isFile();
  } catch {
    return false;
  }
}

export function shippedSkills(): { path: string; body: string }[] {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../templates/cursor/skills");
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      path: `.cursor/skills/${entry.name}/SKILL.md`,
      body: readFileSync(join(root, entry.name, "SKILL.md"), "utf8"),
    }));
}

function agentsBootstrap(report: InspectionReport): InitFile {
  if (report.agentsMd === "absent") {
    return { path: "AGENTS.md", action: "create", body: titoBootstrapBlock() };
  }
  const current = readFileSync(join(report.root, "AGENTS.md"), "utf8");
  if (
    current.includes(TITO_BOOTSTRAP_START) ||
    current.includes("Hola, Tito here!")
  ) {
    return { path: "AGENTS.md", action: "keep" };
  }
  return {
    path: "AGENTS.md",
    action: "append",
    body: `\n${titoBootstrapBlock()}`,
  };
}

export function planInitialization(
  report: InspectionReport,
  profile: string,
  settings?: TitoSettings,
): {
  root: string;
  profile: ReturnType<typeof planAdoption>["profile"];
  files: InitFile[];
} {
  const adoption = planAdoption(report, profile);
  const files: InitFile[] = adoption.files.map((file) => {
    if (file.path === "AGENTS.md") return agentsBootstrap(report);
    if (file.path === "tito.yaml" && file.action === "create" && settings !== undefined) {
      return {
        path: "tito.yaml" as const,
        action: "create" as const,
        body: titoYamlBody(adoption.profile, settings),
      };
    }
    return file;
  });
  const agents = compiledCursorAgents().map((agent) =>
    exists(report.root, agent.path)
      ? { path: agent.path, action: "conflict" as const }
      : { path: agent.path, action: "create" as const, body: agent.body },
  );
  const skills = shippedSkills().map((skill) =>
    exists(report.root, skill.path)
      ? { path: skill.path, action: "keep" as const }
      : { path: skill.path, action: "create" as const, body: skill.body },
  );
  const template = pullRequestTemplate();
  const pullRequest = exists(report.root, PULL_REQUEST_TEMPLATE_PATH)
    ? { path: PULL_REQUEST_TEMPLATE_PATH, action: "keep" as const }
    : { path: PULL_REQUEST_TEMPLATE_PATH, action: "create" as const, body: template };
  return {
    root: adoption.root,
    profile: adoption.profile,
    files: [...files, ...agents, ...skills, pullRequest],
  };
}

export function formatInitialization(plan: ReturnType<typeof planInitialization>): string {
  const lines = [`root: ${plan.root}`, `profile: ${plan.profile}`];
  for (const file of plan.files) {
    lines.push(`${file.path}: ${file.action}`);
    if (file.action === "create" || file.action === "append") {
      lines.push("---", file.body.trimEnd(), "---");
    }
  }
  return `${lines.join("\n")}\n`;
}

export function applyInitialization(plan: ReturnType<typeof planInitialization>): void {
  const conflicts = plan.files.filter((file) => file.action === "conflict");
  if (conflicts.length > 0) {
    throw new InitError(
      `Refusing to write because ${conflicts.map((file) => file.path).join(", ")} already exists.`,
    );
  }
  const created: string[] = [];
  try {
    for (const file of plan.files) {
      if (file.action === "append") {
        const absolute = join(plan.root, file.path);
        const current = readFileSync(absolute, "utf8");
        const separator = current.endsWith("\n") ? "\n" : "\n\n";
        writeFileSync(absolute, `${current}${separator}${file.body}`, "utf8");
        continue;
      }
      if (file.action !== "create") continue;
      const absolute = join(plan.root, file.path);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, file.body, { encoding: "utf8", flag: "wx" });
      created.push(absolute);
    }
  } catch (error) {
    for (const absolute of created) {
      try {
        unlinkSync(absolute);
      } catch {
        // Keep the original write error.
      }
    }
    throw error;
  }
}

export { PlanError };
