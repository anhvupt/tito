import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export type PathReport = {
  readonly id: string;
  readonly files: string[];
  readonly missing: string[];
  readonly tokens: number;
  readonly budget: number;
  readonly ceiling?: number;
};

export type CatalogEntry = {
  readonly source: string;
  readonly text: string;
};

export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

export const BUDGETS = Object.freeze({
  ordinary: 1500,
  "always-on": 2100,
  planning: 4100,
  "tito-skill": 5300,
  command: 2500,
  card: 400,
});

export const CEILINGS: Readonly<Record<string, number>> = Object.freeze({
  planning: 12192,
  "tito-skill": 15433,
});

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const FIELD = /^(description|alwaysApply|globs|disable-model-invocation):[ \t]*(.*)$/;
const FOLDED = /^>([+-])?$/;
const MD_REF = /`([^`\n]+\.md)`/g;

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function rel(root: string, abs: string): string {
  return relative(root, abs).split(sep).join("/");
}

function surfaceDir(root: string, name: "rules" | "agents" | "skills"): string | null {
  const nested = join(root, ".cursor", name);
  if (isDir(nested)) return nested;
  const flat = join(root, name);
  return isDir(flat) ? flat : null;
}

function listFiles(dir: string, suffix: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
      .map((entry) => entry.name)
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  } catch {
    return [];
  }
}

function listDirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  } catch {
    return [];
  }
}

function parseFrontMatter(text: string): Record<string, string> {
  const block = FRONT_MATTER.exec(text)?.[1];
  if (block === undefined) return {};
  const fields: Record<string, string> = {};
  const lines = block.replace(/\r/g, "").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const match = FIELD.exec(line);
    if (match === null) {
      i += 1;
      continue;
    }
    const key = match[1] ?? "";
    const rest = (match[2] ?? "").trim();
    if (FOLDED.test(rest)) {
      const folded: string[] = [];
      i += 1;
      while (i < lines.length) {
        const next = lines[i] ?? "";
        if (next !== "" && !/^[ \t]/.test(next)) break;
        folded.push(next.replace(/^[ \t]+/, ""));
        i += 1;
      }
      fields[key] = folded.filter((part) => part.length > 0).join(" ");
      continue;
    }
    fields[key] = rest;
    i += 1;
  }
  return fields;
}

function sumTokens(parts: readonly string[]): number {
  return parts.reduce((total, part) => total + estimateTokens(part), 0);
}

function budgetFor(id: string): number {
  if (id.startsWith("command:")) return BUDGETS.command;
  if (id.startsWith("card:")) return BUDGETS.card;
  if (id === "ordinary") return BUDGETS.ordinary;
  if (id === "always-on") return BUDGETS["always-on"];
  if (id === "planning") return BUDGETS.planning;
  if (id === "tito-skill") return BUDGETS["tito-skill"];
  return 0;
}

function makeReport(
  id: string,
  files: string[],
  missing: string[],
  tokens: number,
): PathReport {
  const budget = budgetFor(id);
  const ceiling = CEILINGS[id];
  if (ceiling === undefined) {
    return { id, files, missing, tokens, budget };
  }
  return { id, files, missing, tokens, budget, ceiling };
}

function referencedMarkdown(agentsText: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of agentsText.matchAll(MD_REF)) {
    const name = match[1];
    if (name === undefined || seen.has(name)) continue;
    seen.add(name);
    found.push(name);
  }
  return found;
}

export function descriptionCatalog(root: string): CatalogEntry[] {
  const items: CatalogEntry[] = [];

  const agentsDir = surfaceDir(root, "agents");
  if (agentsDir !== null) {
    for (const name of listFiles(agentsDir, ".md")) {
      const abs = join(agentsDir, name);
      const text = readText(abs);
      if (text === null) continue;
      const description = parseFrontMatter(text).description ?? "";
      if (description === "") continue;
      items.push({ source: rel(root, abs), text: description });
    }
  }

  const rulesDir = surfaceDir(root, "rules");
  if (rulesDir !== null) {
    for (const name of listFiles(rulesDir, ".mdc")) {
      const abs = join(rulesDir, name);
      const text = readText(abs);
      if (text === null) continue;
      const fields = parseFrontMatter(text);
      const description = fields.description ?? "";
      if (description === "") continue;
      if (fields.alwaysApply !== "false") continue;
      if ((fields.globs ?? "") !== "") continue;
      items.push({ source: rel(root, abs), text: description });
    }
  }

  const skillsDir = surfaceDir(root, "skills");
  if (skillsDir !== null) {
    for (const folder of listDirs(skillsDir)) {
      const abs = join(skillsDir, folder, "SKILL.md");
      const text = readText(abs);
      if (text === null) continue;
      const fields = parseFrontMatter(text);
      if (fields["disable-model-invocation"] === "true") continue;
      const description = fields.description ?? "";
      if (description === "") continue;
      items.push({ source: rel(root, abs), text: description });
    }
  }

  return items;
}

export function measurePaths(root: string): PathReport[] {
  const reports: PathReport[] = [];
  const ordinaryFiles: string[] = [];
  const ordinaryTexts: string[] = [];
  const ordinaryMissing: string[] = [];
  const agentsText = readText(join(root, "AGENTS.md"));
  if (agentsText === null) {
    ordinaryMissing.push("AGENTS.md");
  } else {
    ordinaryFiles.push("AGENTS.md");
    ordinaryTexts.push(agentsText);
  }

  const rulesDir = surfaceDir(root, "rules");
  if (rulesDir !== null) {
    for (const name of listFiles(rulesDir, ".mdc")) {
      const abs = join(rulesDir, name);
      const text = readText(abs);
      if (text === null) continue;
      if (parseFrontMatter(text).alwaysApply !== "true") continue;
      ordinaryFiles.push(rel(root, abs));
      ordinaryTexts.push(text);
    }
  }

  const catalog = descriptionCatalog(root);
  const alwaysOnFiles = [...ordinaryFiles];
  const alwaysOnTexts = [...ordinaryTexts];
  for (const item of catalog) {
    if (!alwaysOnFiles.includes(item.source)) alwaysOnFiles.push(item.source);
    alwaysOnTexts.push(item.text);
  }

  reports.push(makeReport("ordinary", ordinaryFiles, [...ordinaryMissing], sumTokens(ordinaryTexts)));
  reports.push(
    makeReport("always-on", alwaysOnFiles, [...ordinaryMissing], sumTokens(alwaysOnTexts)),
  );

  const planningFiles = [...alwaysOnFiles];
  const planningTexts = [...alwaysOnTexts];
  const planningMissing = [...ordinaryMissing];
  if (agentsText !== null) {
    for (const ref of referencedMarkdown(agentsText)) {
      const abs = join(root, ref);
      const text = readText(abs);
      if (text === null) {
        planningMissing.push(ref);
        continue;
      }
      if (!planningFiles.includes(ref)) planningFiles.push(ref);
      planningTexts.push(text);
    }
  }
  reports.push(makeReport("planning", planningFiles, planningMissing, sumTokens(planningTexts)));

  const skillsDir = surfaceDir(root, "skills");
  const titoAbs = join(skillsDir ?? join(root, ".cursor", "skills"), "tito", "SKILL.md");
  const titoText = readText(titoAbs);
  const titoFiles = [...planningFiles];
  const titoTexts = [...planningTexts];
  const titoMissing = [...planningMissing];
  if (titoText === null) {
    titoMissing.push(rel(root, titoAbs));
  } else {
    titoFiles.push(rel(root, titoAbs));
    titoTexts.push(titoText);
  }
  reports.push(makeReport("tito-skill", titoFiles, titoMissing, sumTokens(titoTexts)));

  if (skillsDir !== null) {
    for (const folder of listDirs(skillsDir)) {
      if (folder === "tito") continue;
      const abs = join(skillsDir, folder, "SKILL.md");
      const text = readText(abs);
      if (text === null) continue;
      reports.push(
        makeReport(
          `command:${folder}`,
          [...alwaysOnFiles, rel(root, abs)],
          [...ordinaryMissing],
          sumTokens([...alwaysOnTexts, text]),
        ),
      );
    }
  }

  const agentsDir = surfaceDir(root, "agents");
  if (agentsDir !== null) {
    for (const name of listFiles(agentsDir, ".md")) {
      const abs = join(agentsDir, name);
      const text = readText(abs);
      if (text === null) continue;
      reports.push(
        makeReport(`card:${name.replace(/\.md$/, "")}`, [rel(root, abs)], [], estimateTokens(text)),
      );
    }
  }

  return reports;
}

export function budgetFailures(reports: PathReport[]): string[] {
  const failures: string[] = [];
  for (const item of reports) {
    if (item.tokens <= item.budget) continue;
    if (item.ceiling !== undefined) {
      if (item.tokens <= item.ceiling) continue;
      failures.push(`${item.id}: ${item.tokens} > ceiling ${item.ceiling}`);
      continue;
    }
    failures.push(`${item.id}: ${item.tokens} > budget ${item.budget}`);
  }
  return failures;
}
