# Tito — Initial Product Brief

## Identity

- Product: Tito
- npm package: `@anhvupt/tito`
- CLI: `tito`
- License: Apache-2.0
- Runtime: Node.js 20+
- Implementation: TypeScript, ESM
- Tagline: **Quiet orchestration. Trusted continuity.**

Tito is respectfully inspired by Francesc “Tito” Vilanova: quiet leadership, continuity, trust, and understanding of the complete system.

Tito is not affiliated with FC Barcelona. Do not use protected branding or imply endorsement.

## Vision

Tito is a personal AI engineering staff for solo software builders.

A developer talks to one coordinator. Tito understands the project, chooses an appropriate risk level and model tier, delegates narrowly scoped work, controls review size, and returns a coherent result.

Tito should reduce coordination, review debt, duplicated exploration, and unnecessary model usage.

Success is not measured by how many agents Tito launches. Success means better outcomes with fewer agents, less review burden, and controlled cost.

## Primary user

One developer who:

- Maintains several projects.
- Uses different frameworks and platforms.
- Works across several business domains.
- Sometimes builds carefully for clients.
- Sometimes accepts more risk for personal products.
- Wants AI specialists without manually coordinating them.
- Wants to understand and review important changes.
- Uses Git as the main audit and collaboration mechanism.

Small teams of approximately 2–5 people are a supported secondary use case.

## Non-goals

Tito is not initially:

- An enterprise agent platform.
- A hosted control plane.
- An organization administration product.
- An enterprise SSO product.
- A corporate policy server.
- A remote telemetry service.
- An enterprise billing platform.
- A large-team resource scheduler.
- A replacement for project documentation.

## Core model

The developer communicates with one root coordinator named Tito.

Tito may delegate to:

- Explorer
- Product analyst
- Architect
- Backend engineer
- Frontend engineer
- Domain specialist
- QA reviewer
- Security reviewer
- DevOps specialist
- Project-owned agents

Only specialists relevant to the task should be loaded.

## Configuration layers

Apply policy in this order:

1. Core safety floor
2. Project risk profile
3. Domain packs
4. Technology packs
5. Project-owned rules and documentation
6. Current task instructions

A task may increase caution. It must not silently weaken the project safety floor.

## Project ownership

Every project continues to own:

- Requirements
- Architecture
- Decision records
- Domain knowledge
- Custom agents
- Cursor rules
- Skills
- Operational runbooks
- Client-specific information

Tito discovers and uses these files. It does not move them into the npm package.

## Risk profiles

### client-careful

For client, offshore, financial, sensitive, or high-consequence projects.

- One code-writing agent at a time.
- Independent review required.
- Prefer 100–200 authored changed lines.
- Absolute maximum 300 authored lines without approval.
- Maximum six authored files.
- No stacked unreviewed changes.
- Human approval after every slice.
- Migrations require rollback plans.
- No commit, merge, push, deployment, publication, or external write without approval.

### solo-balanced

For normal personal product development.

- One or two writers on explicitly separate areas.
- Human review at feature boundaries.
- Independent review for security, data, migrations, and architecture.
- Moderate diff limits.
- Automation allowed when deterministic and reversible.

### solo-fast

For experiments and low-consequence personal products.

- Up to three non-overlapping writers.
- Agent self-review allowed.
- Human review at milestones.
- Faster implementation and refactoring.
- Strict safety floor still applies.

### small-team

Future profile for teams of approximately 2–5 people.

- Git-native ownership.
- Checked-in project configuration.
- Basic module ownership.
- Explicit review responsibilities.
- No enterprise control plane.

## Mandatory escalation

Regardless of profile, escalate to careful handling for:

- Authentication and authorization
- Payments
- Secrets
- Production data
- Destructive database changes
- Privacy-sensitive information
- Public infrastructure
- Irreversible external actions
- Accounting and financial invariants

## Token-efficiency contract

Tito can guarantee limits on its own context, fan-out, and retries. It cannot guarantee total model usage where the underlying platform does not expose or control it.

Initial budgets:

- Bootstrap context: maximum 800 estimated tokens
- Task packet: maximum 1,200 estimated tokens
- Specialist card: maximum 400 estimated tokens
- Domain context: maximum 2,000 estimated tokens
- Ordinary task: one agent by default
- Reviewed implementation: maximum two agents by default
- Retry: maximum one per agent without approval

Tito uses progressive disclosure:

- Load a compact bootstrap globally.
- Load the project profile once.
- Load only relevant domain and stack fragments.
- Read project documentation on demand.
- Never preload every specialist.
- Never duplicate the same rules across multiple instruction surfaces.

A trivial task should not spawn another agent.

## Cost-aware model routing

Tito recommends a capability tier before choosing a specific model:

- Scout: search, exploration, classification, routine summaries
- Standard: bounded implementation, tests, ordinary reviews
- Reasoning: architecture, ambiguity, accounting, security, concurrency
- Specialist: visual work, large context, research, or model-specific strengths

Tito should:

- Start with the least expensive tier likely to succeed.
- Escalate only after uncertainty, failure, or increased risk.
- Respect explicit user model choices.
- Avoid parallel premium agents by default.
- Never silently substitute a materially more expensive model.
- Avoid hardcoded pricing assumptions.
- Clearly label token and cost estimates as estimates.

Model recommendation output:

- Task
- Risk
- Recommended tier
- Recommended model
- Relative cost
- Reason
- Cheaper alternative
- Escalation condition

## Existing-project adoption

Tito follows: **adopt, do not replace**.

### Existing BMad repositories

- Detect `_bmad/`.
- Detect `.agents/skills/bmad-*`.
- Register BMad as a legacy workflow provider.
- Do not move or rewrite BMad.
- Prevent duplicate planning.
- Remove BMad only through a later explicit operation.

### Existing project-owned agents

- Discover manifests such as `sub-agents/*/meta.yaml`.
- Preserve agent instructions and knowledge locally.
- Register specialists with Tito.
- Do not copy project knowledge into the public package.

### Repositories without a harness

Create a minimal configuration:

- `tito.yaml`
- `tito.lock`
- A compact `AGENTS.md`
- Scoped generated Cursor rules

Never overwrite existing instructions without approval.

## CLI direction

Planned commands:

- `tito --help`
- `tito init`
- `tito inspect`
- `tito adopt`
- `tito apply`
- `tito apply --dry-run`
- `tito check`
- `tito doctor`
- `tito models list`
- `tito models recommend`
- `tito cost estimate`
- `tito cost report`
- `tito benchmark`

Inspection must be read-only. Mutation commands must show a plan and handle conflicts safely.

## Technical architecture

- CLI: parsing and user output
- Core: configuration, planning, compilation, validation
- Adapters: Cursor first; other environments later
- Detectors: BMad, custom agents, rules, project context
- Packs: core, profiles, domains, stacks
- Filesystem: safe reads, deterministic plans and writes
- Review: diff budgets and review packets
- Cost: local estimates, model recommendations, benchmarks

Use Node built-ins where practical. Keep the dependency tree small.

## Distribution

- Installed as a project development dependency.
- Never required globally.
- No project mutation during `postinstall`.
- Version pinned by each project.
- Explicit upgrades.
- Deterministic generated output.
- Strict npm `files` allowlist.
- No client data, secrets, transcripts, or private fixtures.
- No remote telemetry by default.

## Self-hosting

Tito should eventually develop Tito.

- Version 0.1 is bootstrapped manually.
- Tito 0.1 governs development of 0.2.
- Each release is governed by the previous stable release.
- A development version cannot silently rewrite its own safety policy.
- Maximum delegation depth: two.
- One root coordinator per task.
- npm publication always requires human approval.

## Initial roadmap

1. Package foundation and CLI help
2. Chat-first Cursor skill
3. Configuration model and risk profiles
4. Read-only repository inspection
5. Deterministic dry-run planning
6. Safe initialization
7. Deterministic apply and lock file
8. Check and doctor commands
9. BMad adoption adapter
10. Project-owned agent discovery
11. Model routing and cost estimates
12. Generic domain and stack packs
13. Public release hardening

Each roadmap item is divided into human-reviewable slices.

## Initial success criteria

Tito 0.1 is successful when it can:

- Install locally as `@anhvupt/tito`.
- Run with `npx tito`.
- Start Tito explicitly with `/tito` in Cursor chat.
- Inspect a repository without mutation.
- Generate a dry-run adoption plan.
- Recognize BMad and custom agents.
- Apply a selected risk profile.
- Keep generated context within documented budgets.
- Recommend an appropriate model tier.
- Refuse unsafe overwrites.
- Validate its generated state.
- Develop its next version under its own rules.

## Cursor collaboration

Tito treats Cursor as an execution adapter. Tito owns workflow state, risk policy, cost policy, slice boundaries, delegation decisions, and human approval gates.

Tito must complement Cursor rather than duplicate it.

### Primary interaction surface

Tito is chat-first. Users choose how Tito participates:

- **Implicit:** install a compact `AGENTS.md` bootstrap so ordinary Cursor chat follows Tito's coordination policy by default.
- **Explicit:** install the `/tito` skill and invoke it when Tito coordination is wanted.
- **Combined:** use the bootstrap by default and retain `/tito` as an explicit workflow entry point.

Both surfaces keep Tito in the active conversation as the root coordinator. Neither is a Cursor custom subagent, and neither should imply that it replaces Cursor's main Agent.

The CLI is Tito's local control adapter for setup, configuration, inspection, deterministic planning, validation, and reporting. Normal task coordination should not require the user to leave chat.

Optional `.cursor/agents/*.md` specialists may handle bounded delegated work. They do not become the root Tito coordinator and must follow the delegation and lifecycle policies in this brief.

### Cursor mode routing

For every task, Tito should recommend one of:

1. **Ask mode**

   Use for:
   - read-only repository exploration;
   - understanding existing behavior;
   - impact analysis;
   - explanation;
   - diagnosis without implementation;
   - finding relevant files and contracts.

   Expected output:
   - facts found;
   - affected files;
   - unresolved questions;
   - risks;
   - recommended next mode.

2. **Plan mode**

   Use for:
   - ambiguous requirements;
   - multi-module work;
   - architecture changes;
   - database migrations;
   - security-sensitive work;
   - accounting or financial invariants;
   - work that must be divided into reviewable slices.

   Tito should convert the result into independently reviewable slices and require explicit human approval before implementation.

3. **Agent mode**

   Use only for an approved implementation slice.

   The implementation packet must contain:
   - one objective;
   - acceptance criteria;
   - exact scope;
   - relevant files and contracts;
   - forbidden changes;
   - diff budget;
   - required verification;
   - stop condition.

   The agent must implement only that slice, verify it, prepare the review packet, and stop.

Small and obvious work may use:

**Ask → Agent → Review**

Uncertain or critical work should use:

**Ask → Plan → Human Approval → Agent → Independent Review**

### Cursor lifecycle

Tito maintains its own durable lifecycle:

- `DISCOVERY`
- `PLANNED`
- `APPROVED`
- `IMPLEMENTING`
- `READY_FOR_REVIEW`
- `APPROVED_FOR_COMMIT`
- `DONE`

Do not infer lifecycle state from Cursor's UI.

Do not depend on:

- the currently selected IDE mode;
- whether a Plan Build button was clicked;
- private Cursor storage;
- undocumented tool payloads;
- transcript internals;
- Cursor UI DOM.

Mode transitions require an explicit user action or supported CLI/SDK invocation.

Persist compact handoff artifacts when context must survive a mode change. Do not assume conversation context automatically transfers between modes.

### Browser routing

Use the least expensive browser capability sufficient for verification:

- Static page or documentation: search or fetch.
- One simple navigation or screenshot: direct browser action.
- Multi-step form: browser specialist.
- Authenticated workflow: browser specialist.
- Console or network debugging: browser specialist.
- Visual iteration: browser specialist.
- Isolated full end-to-end workflow: cloud/computer-use agent when explicitly appropriate.

Interactive browser testing belongs in Agent mode.

Tito should specify the required outcome instead of depending on internal browser tool names.

Example browser verification packet:

Verify:

- the user can complete the changed workflow;
- validation appears for invalid input;
- success navigation is correct;
- no browser console errors occur;
- no failed relevant network requests occur;
- capture screenshots of materially changed UI states.

Warn before using shared, sensitive, or production credentials. Never perform production mutations during verification without explicit approval.

### Cursor project surfaces

Use each surface for one purpose:

- `AGENTS.md`: compact, always-relevant Tito bootstrap.
- `.cursor/rules/*.mdc`: scoped architecture or file-specific invariants.
- `.agents/skills/*/SKILL.md` or `.cursor/skills/`: reusable workflows.
- `.cursor/agents/*.md`: project-owned specialists.
- `.cursor/BUGBOT.md`: Bugbot-specific review instructions.
- Project documentation: requirements, architecture, domain truth, and decisions.

Do not duplicate the same instructions across these surfaces.

Keep globally loaded instructions small. Load scoped rules, skills, domain knowledge, and project documentation only when relevant.

### Subagent policy

Default solo behavior:

- one root Tito coordinator;
- one active code writer;
- optional read-only specialist or reviewer;
- no additional agent without a named purpose.

Good subagent uses:

- repository exploration;
- independent verification;
- domain analysis;
- security review;
- browser workflows;
- bounded research.

Avoid:

- redundant agents answering the same question;
- multiple writers editing the same area;
- premium-model fan-out without approval;
- delegating trivial work;
- recursive coordinator creation.

Every delegation must state:

```text
Task:
Why delegation is useful:
Risk:
Required capability:
Recommended model tier:
Expected output:
Allowed files or systems:
Forbidden actions:
Stop condition:
```

### Worktree policy

Do not use a worktree for every small sequential change.

Use a worktree for:

- risky experiments;
- competing implementation attempts;
- long-running isolated work;
- explicitly approved parallel writers;
- work that should not affect the current checkout.

Client-careful mode defaults to one writer and one active implementation branch.

### Review routing

For ordinary small changes:

- focused automated tests;
- Cursor Agent Review where useful;
- human line-by-line review.

For complex behavior:

- independent reviewer;
- deeper Agent Review;
- focused integration tests.

For authentication, permissions, payments, secrets, infrastructure, or sensitive data:

- security review;
- adversarial verification;
- human approval.

For Bugbot review, use `.cursor/BUGBOT.md`. Do not assume ordinary Cursor project rules automatically govern Bugbot.

### Implementation handoff

Before Agent mode, Tito must provide:

```text
Goal:
Approved slice:
Business reason:
Relevant contracts:
Files likely affected:
Files forbidden:
Acceptance criteria:
Diff budget:
Tests required:
Browser verification:
Risk escalation conditions:
Stop condition:
```

### Review handoff

After implementation, Tito must provide:

```text
Goal:
Behavior added:
Behavior deliberately excluded:
Files changed:
Authored line count:
Generated files:
Suggested review order:
Tests run:
Browser verification:
Review findings:
Risks:
Known limitations:
Next proposed slice:
```

### Cursor integration stages

Implement integration incrementally:

**Stage 1**

- recommend Ask, Plan, or Agent;
- print a focused handoff prompt;
- maintain Tito lifecycle state.

**Stage 2**

- create durable plans and review packets;
- generate compact Cursor rules and skills;
- discover project-owned specialists.

**Stage 3**

- optional Cursor CLI adapter using documented arguments;
- explicit modes;
- optional isolated worktrees.

**Stage 4**

- optional Cursor SDK adapter;
- model discovery;
- programmatic runs;
- usage reporting where available;
- restricted tools and sandboxing.

Do not block Tito's core functionality on Cursor-specific APIs.

Cursor integration must remain an adapter around Tito's tool-independent workflow core.

### First implementation constraint

Do not implement all Cursor integration stages together.

During initial development:

- document the mode-routing contract;
- define tool-independent lifecycle types;
- avoid Cursor SDK dependencies;
- avoid browser automation implementation;
- avoid worktree orchestration;
- defer programmatic Cursor integration until the core CLI, configuration, inspection, planning, and safety behavior are stable.