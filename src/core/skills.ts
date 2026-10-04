import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

export type SkillCard = {
  readonly name: string;
  readonly description: string;
  readonly role: "coordinator" | "candidate";
};

function frontMatter(text: string): string | null {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== "---") return null;
  const close = lines.indexOf("---", 1);
  if (close < 1) return null;
  return lines.slice(1, close).join("\n");
}

function cardFrom(matter: string): SkillCard | null {
  let value: unknown;
  try {
    value = parse(matter);
  } catch {
    return null;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const nameValue = record.name;
  if (typeof nameValue !== "string" || nameValue.trim() === "") return null;
  const name = nameValue.trim();
  const descriptionValue = record.description;
  const description = typeof descriptionValue === "string" ? descriptionValue.trim() : "";
  return {
    name,
    description,
    role: name === "tito" ? "coordinator" : "candidate",
  };
}

export function listSkillCards(dir: string): SkillCard[] {
  let folders: string[];
  try {
    folders = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  } catch {
    return [];
  }

  const cards: SkillCard[] = [];
  for (const folder of folders) {
    let text: string;
    try {
      text = readFileSync(join(dir, folder, "SKILL.md"), "utf8");
    } catch {
      continue;
    }
    const matter = frontMatter(text);
    if (matter === null) continue;
    const card = cardFrom(matter);
    if (card !== null) cards.push(card);
  }
  return cards;
}
