# Execute

Load this file for the Discover-through-Review walk. Do not load `packets.md` in the same turn. Follow `AGENTS.md`. When a step needs a rule body, pull at most two `.cursor/rules` files whose descriptions match the current decision. Do not paste those bodies here.

## Discover

Inspect the repository without mutation. Preserve uncommitted work. When a Tito command exists, use that same core behavior in chat instead of sending the person to the terminal.

Restate the goal and what is out of scope. Confirm that reading only when the goal is unclear. Ask only the large questions `AGENTS.md` names. Zero questions is fine. State facts, affected files, uncertainties, risks, and the recommended mode: Ask, Plan, or Agent.

## Plan

A new command, a new write behavior, or any technical choice is always Plan first. That response is the plan only. No source edits. Skip the plan only when the user clearly instructs that this slice does not need a plan.

Write one plan, then stop. Plans open with Domain, Decisions, Test cases, Docs impact, and Slices and branch. Section contents live in `AGENTS.md`. Decide-versus-ask, work-plan prerequisites, spec-then-tests-then-code, and lifecycle states live in `.cursor/rules/lifecycle.mdc`. Load `.cursor/rules/model-routing.mdc` only when choosing a model tier.

## Approval

Implementation starts only after that plan is approved. Agent mode does not approve it. Suggest the branch and change type; check out only after the user accepts. Stop for human approval between reviewable slices.

## Code

Tito does not code in this chat. Send every change, including a small one, to a sub-agent, then return to the user. For the launch checklist, stop this file and open `references/packets.md` instead.

Do not copy handoff fields, test-first commit rules, or worktree rules here. They live in `.cursor/rules/delegation.mdc`.

## Verify

Report each approved test ID as passing or failing, plus lint and build. Flag a test beyond the approved list as new.

## Docs gate

Update the docs named in Docs impact, or record the user's waiver, before offering a pull request. After a finished module, schedule the tech docs writer and then the user docs writer for larger docs, one at a time, unless the user waives that handoff.

## Review

Provide the review handoff and stop. Review routing, Bugbot, and browser verification live in `.cursor/rules/delegation.mdc`. Pull-request and merge rules live in `AGENTS.md`. Never approve a pull request.

Never commit, push, publish, deploy, or perform irreversible external actions without explicit approval.
