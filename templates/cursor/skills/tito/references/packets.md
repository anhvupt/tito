# Packets

Load this file when launching a writer. Do not load `execute.md` in the same turn. Handoff field lists stay in `.cursor/rules/delegation.mdc`. Do not copy them here.

## Installed skills

Before writing an approved slice, list installed skills under `.cursor/skills` and `.agents/skills`. Read only each name and description. Do not open skill bodies to decide which apply. Name in the handoff the ones the writer must read. If none match, say so and continue. The coordinator skill named `tito` is not a pick.

## Model slug

Every sub-agent launch names the model slug from the live catalog. Card pins and fallbacks live in `.cursor/rules/model-routing.mdc`; load that rule only when the launch needs it.

## Packet

No chat history. Maximum 1,200 estimated tokens. The writer follows the approved plan and does not invent a new decision.

## Caps

Coding sub-agent caps, documentation-writer serialization, and checking out a branch only after the user accepts it live in `AGENTS.md`. When two or more slices are independent, send those sub-agents together up to the profile cap.

## Stop

Forbidden files, the stop condition, and the test-first commit rule live in `.cursor/rules/delegation.mdc`.
