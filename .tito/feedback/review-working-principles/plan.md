# review/working-principles plan

Review fixes for `working-principles`, on the same branch `feat/working-principles`.

## Domain

Business impact: consumer projects get a bootstrap that names all five plan sections correctly, and the tests guard the wording that matters.

## Decisions

1. `src/core/plan.ts` bootstrap names the five sections in order: Domain, Decisions, Test cases, Docs impact, and Slices and branch.
2. This repo's `AGENTS.md` keeps the five names, and the second sentence covers conventions only.
3. `README.md` no longer says the agent files are not generated yet. Init writes them from the roster.
4. The skill says "do not copy it into the repo", matching the brief.

## Test cases

- `[unit]` `WP-1` also requires the five section names in order.
- `[unit]` `WP-4` requires "the pick for this project's risk profile".
- `[unit]` `WP-5` requires "officially maintained resource".
- `[integration]` `WP-8` adds the append case: a file with user text and no Tito heading keeps that text and gains the block.

## Docs impact

- `AGENTS.md`, `README.md`, `templates/cursor/skills/tito/SKILL.md` and `.cursor/skills/tito/SKILL.md`.

## Slices and branch

One slice on `feat/working-principles`. About 20 authored lines. No other changes.
