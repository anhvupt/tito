# working-principles plan

Turn six working principles into Tito's shipped behavior, so every project gets them through `tito init` and `tito upgrade`: the brief, the `/tito` skill, the `AGENTS.md` bootstrap, and the specialist cards.

## Domain

Business impact: every project gets a coordinator that checks current sources, reuses what framework teams maintain, and weighs choices against what the project is for, so there are fewer rewrites, less stale advice, and less time spent building what already exists.

- Official source: a rules file, skill, MCP server, `llms.txt`, or doc maintained by the tool's owner, for example the Angular team's resources at angular.dev/ai.
- Verdict: trusted, use with care, or rejected.
- Fixed: never bends. Flexible: chosen per project.
- Project purpose: client work, commercial product, showcase, or experiment.
- Rules: research never weakens a fixed rule. A business suggestion is never added to scope without asking. Purpose is asked during development and recorded in the plan.

## Decisions

1. A "Working principles" section in the brief. A condensed copy in the `/tito` skill, because the brief is not shipped. One added line in the bootstrap, within the 800-token budget.
2. No new `tito.yaml` field. Start from the risk profile (`client-careful` proven, `solo-balanced` proven core with modern where it helps pace, `solo-fast` modern and fast). Ask when a choice depends on the project's purpose and it is unclear. The plan records the answer, and Tito reuses an answer already recorded in this project's plans.
3. Plans have five sections: Domain (opens with `Business impact:`), Decisions, Test cases, Docs impact, Slices and branch. `PLANNED` means all five. State names stay.
4. Code order: write the spec doc, then failing tests, then code. Writing is not committing. The spec doc is waived when no behavior changes. The docs gate and the module-end writers stay.
5. One business impact line per plan, plus at most one optional suggestion. An accepted suggestion records `outcome: expanded`.
6. Official sources are a rule only. Nothing is vendored. The frontend `angular` knowledge entry becomes `official-stack-sources` (stack). Backend and DevOps gain it. The compiled card adds one official-source line only when the card has a stack entry.
7. Explorer reports the official source with maintainer, last update, and verdict. Architect returns options with pros and cons and the pick for the risk profile, and asks when the purpose is unclear. Product analyst returns the Domain section with at most one optional suggestion. Each card stays within 400 tokens.
8. This repo is updated by hand. Do not run `tito upgrade` here: this `AGENTS.md` has a `# Tito bootstrap` heading without markers, and upgrade would replace the hand-written file.

## Test cases

- `[unit]` `WP-1` Bootstrap contains the research-and-judge line and "Domain", and estimates at 800 tokens or fewer.
- `[unit]` `WP-2` Every compiled card estimates at 400 tokens or fewer.
- `[unit]` `WP-3` Frontend, backend, and DevOps cards list `official-stack-sources` (stack), none lists `angular`, and each has the official-source line.
- `[unit]` `WP-4` Architect stop condition requires options with pros and cons, a pick for the risk profile, and asking when the purpose is unclear.
- `[unit]` `WP-5` Explorer asks for the official source with maintainer, last update, and verdict.
- `[unit]` `WP-6` Product analyst returns the Domain section with a business impact line and at most one optional suggestion.
- `[unit]` `WP-7` The shipped skill has the five sections in order, the six principles, and the order spec doc, failing tests, code.
- `[integration]` `WP-8` Upgrade on a temporary consumer repo replaces the old card and skill, keeps a consumer skill, adds the principle line inside the bootstrap markers, and keeps text outside them.
- Edge: a card with no stack entry has no official-source line. A second upgrade reports keep. Appending the bootstrap keeps the user's text above it.

## Docs impact

- `TITO-INITIAL-BRIEF.md` (the spec, written first), `templates/cursor/skills/tito/SKILL.md` and `.cursor/skills/tito/SKILL.md`, this repo's `AGENTS.md`, `README.md` ("How work moves" and "Specialists"), regenerated `.cursor/agents/*.md`.

## Slices and branch

One slice on `feat/working-principles` from `main`. Type `feat`. About 200 to 250 authored lines. Forbidden: `profiles.ts`, the safety floor, lifecycle state names, the config schema, model routing, running `tito upgrade` here, and any commit or push without approval. Later slices: `tito inspect` suggests the official source for a detected stack, and a `fix` so upgrade does not overwrite a hand-written `AGENTS.md`.
