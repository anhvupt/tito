# Tito

**Quiet orchestration. Trusted continuity.**

Tito is a chat-first engineering coordinator for solo builders. You talk to one
coordinator; Tito explores the repository, chooses the right working mode,
turns larger work into reviewable slices, and keeps implementation inside the
scope you approved.

It is local-first, Git-friendly, and designed to add coordination without
replacing your project documentation, rules, or specialists.

## What Tito helps with

- **One place to ask:** use ordinary Cursor chat or `/tito` instead of manually
  coordinating several agents.
- **The right amount of process:** Tito recommends Ask for discovery, Plan for
  uncertain or critical work, and Agent only for an approved implementation
  slice.
- **Plans that make decisions:** the planner owns technical choices, records
  important trade-offs, and includes signatures, schemas, pseudocode, or
  guidance code when that makes implementation clearer.
- **Smaller reviews:** work is split into bounded slices with acceptance
  criteria, tests, forbidden changes, risks, and a stop condition.
- **Safer changes:** Tito preserves uncommitted work, refuses silent overwrites,
  and requires approval before commits, pushes, deployments, publication, or
  irreversible external actions.
- **Project-aware adoption:** Tito is intended to discover and preserve existing
  rules, skills, BMad workflows, and project-owned specialists rather than
  replacing them.
- **Controlled model use:** Tito recommends the least expensive capable tier,
  using stronger reasoning models for architecture, ambiguity, migrations,
  security, and other high-consequence planning. If a requested model is
  unavailable, Tito asks instead of substituting one silently.

## Specialists

You call Tito. Tito selects only the specialists the task needs. A specialist's
mode decides whether it may change anything:

| Specialist | Read-only mode | Mutating mode |
| --- | --- | --- |
| Explorer | Scout the repository | — |
| Product analyst | Clarify requirements | — |
| Architect | Decide the technical approach | — |
| ERP specialist | Advise or review domain rules | — |
| QA reviewer | Review correctness | — |
| Security reviewer | Review security-sensitive changes | — |
| Frontend engineer | Design | Implement files |
| Backend engineer | — | Implement files |
| DevOps engineer | Plan | Change infrastructure, with approval |
| Tech docs writer | — | Update technical documentation |
| User docs writer | — | Update user documentation |

Several read-only specialists may work together. Only one mutating mode may be
active. Backend and frontend work is split into sequential slices. After a
module is finished, Tito schedules the tech docs writer and then the user docs
writer, one at a time, before calling that module done. Skip that handoff only
when you explicitly waive it for that module. Each specialist carries triggers,
knowledge references, handoffs, and a stop condition. The detailed prompt stays
lean and loads knowledge only when that mode needs it.

Cursor agent files such as `.cursor/agents/tito-frontend.md` are not generated
yet. The roster above is the contract those files will follow.

## Chat first, CLI when useful

Chat is the primary mental model. Every operation is implemented once in the
core and exposed through both chat and the CLI:

- `/tito` is the open-ended coordinator.
- `/tito-inspect` and `tito inspect` produce the same repository report.
- `/tito-apply` and `tito apply --dry-run` produce the same adoption plan.

Tito-coordinated chat responses begin with `Hola, Tito here!` so you can see
that the coordinator is active. The greeting is not added to CLI or
machine-readable output.

## Install in a project

```sh
npm install -D @anhvupt/tito
npx tito init --profile client-careful
npx tito init --profile client-careful --confirm
```

The first `init` prints the plan and writes nothing. `--confirm` creates the
missing Tito files and specialist agents. It keeps an existing `AGENTS.md` and
refuses to overwrite a file that is already there. Open a new Cursor chat, then
start with `/tito`.

## What works today

Tito 0.1 is under active development. The current implementation includes:

- strict `tito.yaml` parsing with `client-careful`, `solo-balanced`, and
  `solo-fast` risk profiles;
- mandatory escalation for authentication, payments, secrets, production data,
  destructive database work, privacy, public infrastructure, irreversible
  actions, and financial invariants;
- deterministic Ask, Plan, and Agent routing from explicit task facts;
- an enforced lifecycle from discovery through review and completion;
- validated dependency-aware work plans with concurrent read-only readiness and
  one active implementation writer;
- specialist manifests whose selected mode, not the role name, owns mutation
  authority;
- read-only repository inspection for `tito.yaml` and `AGENTS.md`;
- deterministic dry-run adoption planning that shows create, keep, and conflict
  decisions without writing files;
- matching Cursor chat skills for the implemented CLI operations.

`tito init --confirm` can write a new `tito.yaml`, a missing `AGENTS.md`, and
the specialist agent files. It does not overwrite existing files. A lock file,
upgrade command, BMad adoption, project-agent discovery, and model/cost
reporting remain on the roadmap.

## Current commands

```sh
node dist/cli.js --help
node dist/cli.js --version
node dist/cli.js inspect
node dist/cli.js inspect --root .
node dist/cli.js apply --dry-run --profile solo-balanced
node dist/cli.js init --profile solo-balanced
```

`inspect` reads `tito.yaml` when it exists and checks whether `AGENTS.md` is
present. It does not write to the directory.

`apply --dry-run` prints the proposed `tito.yaml` and `AGENTS.md` actions. It
does not write. `apply` without `--dry-run` is refused.

`init` prints the same kind of plan for `tito.yaml`, `AGENTS.md`, and the
specialist agent files. It writes those files only with `--confirm`, and it
refuses when an existing file would be overwritten. In chat, `/tito-init` runs
this same command.

## How work moves

The normal careful path is:

`DISCOVERY → PLANNED → APPROVED → IMPLEMENTING → READY_FOR_REVIEW → APPROVED_FOR_COMMIT → DONE`

A small, obvious change can move from discovery directly to an explicitly
approved slice. Review feedback can return an in-scope slice to implementation.
Other lifecycle skips are rejected.

## Development

Requirements:

- Node.js 20 or newer
- npm

```sh
npm install
npm run build
npm test
```

## Acknowledgement

Tito is respectfully inspired by Francesc “Tito” Vilanova: quiet leadership,
continuity, trust, and understanding of the complete system. Tito is not
affiliated with FC Barcelona.

## License

Apache-2.0
