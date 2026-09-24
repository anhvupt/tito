import { SPECIALIST_IDS, SPECIALISTS, type SpecialistId } from "./specialists.js";

const AGENT_FILE_NAMES = {
  explorer: "tito-explorer.md",
  "product-analyst": "tito-product.md",
  architect: "tito-architect.md",
  "backend-engineer": "tito-backend.md",
  "frontend-engineer": "tito-frontend.md",
  "devops-engineer": "tito-devops.md",
  "erp-specialist": "tito-erp.md",
  "qa-reviewer": "tito-qa.md",
  "security-reviewer": "tito-security.md",
  "tech-docs-writer": "tito-tech-docs.md",
  "user-docs-writer": "tito-user-docs.md",
} as const satisfies Record<SpecialistId, string>;

export function cursorAgentPath(id: SpecialistId): string {
  return `.cursor/agents/${AGENT_FILE_NAMES[id]}`;
}

export function compileCursorAgent(id: SpecialistId): string {
  const manifest = SPECIALISTS[id];
  const readOnly = manifest.modes.every((mode) => mode.capability === "read-only");
  const modes = manifest.modes
    .map((mode) => `- \`${mode.id}\`: ${mode.capability}`)
    .join("\n");
  const knowledge = manifest.knowledge
    .map((item) => `- \`${item.id}\` (${item.load})`)
    .join("\n");
  return `---
name: ${AGENT_FILE_NAMES[id].replace(/\.md$/, "")}
description: >
  ${manifest.role}. Tito delegates this specialist only for: ${manifest.triggers.join("; ")}.
  You are not the root coordinator. Follow the assigned mode and stop condition.
model: inherit
readonly: ${readOnly}
---

# ${manifest.role}

You are \`${id}\`, delegated by Tito. You are not the root coordinator.

## Modes

${modes}

Use only the mode named in Tito's task packet. A read-only mode must not edit files. A mutating mode may change only the approved slice.

## Load when relevant

${knowledge}

Do not restate project documentation. Load it only when the task needs it.

## Handoffs

Return the result to Tito. Suggest another specialist only from this manifest's handoff list.

## Stop

${manifest.stopCondition}
`;
}

export function compiledCursorAgents(): readonly { path: string; body: string }[] {
  return SPECIALIST_IDS.map((id) => ({
    path: cursorAgentPath(id),
    body: compileCursorAgent(id),
  }));
}
