# subagent-model-fit plan

Every sub-agent launch names one concrete model from that host's live catalog. The choice follows the task class. An explicit user model is returned unchanged. A family with no matching slug asks, and Tito does not substitute a different model.

## Decisions

1. The delegation packet names the model slug beside the tier. Tito passes that slug as the host model argument. Compiled agent files keep `model: inherit`. Principle: the model is a property of the launch, not of the agent file. Convention: cost-aware model routing in `TITO-INITIAL-BRIEF.md`.
2. Docs use the same family as explore. Tech docs and user docs move from Standard to Scout.
3. Ordinary code uses the cheap host family. Core code (new foundation, a core feature, or a core calculation: money, quantities, permissions, concurrency, or a shared-data migration) uses the stronger coding family. Unsure work starts ordinary and escalates after a failed attempt, or when the slice turns out to be core.
4. Architecture, security review, and ERP advice stay on the reasoning family. Product analysis and QA stay on the ordinary family.
5. No prices are stored. The table is a family preference resolved against the session catalog.

The user accepted this plan ("yeah") and confirmed: on Claude, ordinary work uses the current Sonnet and core work uses Opus; architect, security, and ERP stay on the stronger reasoning model.

## Family table

Versions are the number groups in the slug. `5.5` is higher than `5`. `4.7` is higher than `4.6`.

| Host | Class | Family | Which match |
| --- | --- | --- | --- |
| Cursor | explore, docs, ordinary | Grok. Prefer a slug that starts with `grok-`. If none, a slug that starts with `cursor-grok-`. | Highest version |
| Cursor | core | A slug that contains `codex`. If none, a slug that starts with `composer-`. | Highest version |
| Cursor | reasoning | A slug that starts with `claude-opus-`. | Highest version |
| Claude | explore, docs | A slug that starts with `claude-sonnet-`. | Lowest version |
| Claude | ordinary | A slug that starts with `claude-sonnet-`. | Highest version |
| Claude | core, reasoning | A slug that starts with `claude-opus-`. | Highest version |

Default class by specialist, unless the slice is marked core:

- explorer, tech-docs-writer, user-docs-writer: explore or docs
- product-analyst, qa-reviewer, and ordinary implementation: ordinary
- architect, security-reviewer, erp-specialist: reasoning
- backend, frontend, and devops implementation: ordinary, or core when the slice is foundation, a core feature, or a core calculation

## Test cases

- `[unit]` `MOD-1` Arrange a Cursor catalog that contains a Grok slug and an Opus slug. Act: recommend explore. Assert: the Grok slug.
- `[unit]` `MOD-2` Arrange a Claude catalog with two Sonnet slugs. Act: recommend explore. Assert: the lower Sonnet.
- `[unit]` `MOD-3` Arrange either host. Act: recommend docs and explore. Assert: the same slug.
- `[unit]` `MOD-4` Arrange a catalog with the ordinary family and the core family. Act: recommend ordinary and core. Assert: ordinary is the cheap family and core is the stronger coding family.
- `[unit]` `MOD-5` Arrange an explicit user model. Act: recommend any class. Assert: that model is returned unchanged.
- `[unit]` `MOD-6` Arrange a catalog with no slug in the required family. Act: recommend that class. Assert: the result asks, and names the family.
- `[unit]` `MOD-7` Arrange both hosts. Act: recommend reasoning. Assert: the Opus slug on that host.

## Docs impact

- `TITO-INITIAL-BRIEF.md`: cost-aware routing and the delegation packet gain the class table and `Recommended model:`.
- `README.md`: the controlled-model paragraph names the class rule.
- `AGENTS.md`: one line that a launch names the model slug.

`tito models recommend` stays a later command. This slice does not add it.

## Slice and branch

One slice on `feat/subagent-model-fit` from `main`. Type `feat`.
