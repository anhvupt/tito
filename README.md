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
- **Plans that make decisions:** Tito confirms the goal and what is out of
  scope, then asks one batch of clarifying questions, lighter on `solo-fast`.
  One obvious reading continues after a one-line confirmation. Tito still asks
  before locking a technical decision or a product-vision change. The plan
  records that decision and includes signatures, schemas, pseudocode, or
  guidance code when that makes implementation clearer. Decisions name the
  convention they follow. Test cases carry a layer tag: `[unit]`,
  `[integration]`, or `[e2e]`. The plan also lists its docs impact.
- **A light joke, sometimes:** after `Hola, Tito here!`, Tito may add one short
  joke. It does not replace the answer, and it stays out of the CLI.
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

Several read-only specialists may work together. Coding sub-agents follow the
profile cap: `client-careful` 3, `solo-balanced` 6, and `solo-fast` 12. Each
has its own plan and branch. Tito does not code in the chat. Every change,
including a small one, goes to a sub-agent, and Tito returns to the user.
Backend and frontend work can run together inside that cap. Docs named in
the plan are updated, or you waive them, before Tito offers a pull request.
After a module is finished, Tito still schedules the tech docs writer and then
the user docs writer, one at a time, before calling that module done. Skip
that handoff only when you explicitly waive it for that module. Each specialist carries triggers,
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

The first `init` prints the plan and writes nothing. In a terminal, omitting
`--profile` asks you to choose `client-careful`, `solo-balanced`, or
`solo-fast`. A script or piped command must still pass `--profile`.
`--confirm` creates the missing `tito.yaml`, specialist agents, and `/tito`
skills. If `AGENTS.md` already exists, Tito appends its bootstrap and leaves
the existing guidance in place. It refuses to overwrite a Tito file that is
already there. Open a new Cursor chat, then start with `/tito`.

Upgrade an existing project after installing a newer Tito:

```sh
npx tito upgrade
npx tito upgrade --confirm
```

`--confirm` installs the latest `@anhvupt/tito` and replaces Tito-owned
agents, skills, and the Tito section of `AGENTS.md`. Consumer rules, consumer
agents, and other project skills stay untouched.

Tito is installed in each project. It is not a required global command.
An opt-in local admin index (`tito admin add|list|remove|refresh`) can register
repos under `~/.config/tito/admin/` and store recent commit subjects, dates, and
touched paths — never diffs. A project `tito.yaml` still overrides any personal
default. The safety floor cannot be weakened.

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
node dist/cli.js admin add
node dist/cli.js admin list
node dist/cli.js admin refresh
node dist/cli.js admin remove --root /path/to/repo
```

`inspect` reads `tito.yaml` when it exists and checks whether `AGENTS.md` is
present. It does not write to the directory.

`apply --dry-run` prints the proposed `tito.yaml` and `AGENTS.md` actions. It
does not write. `apply` without `--dry-run` is refused.

`init` prints the same kind of plan for `tito.yaml`, `AGENTS.md`, and the
specialist agent files. It writes those files only with `--confirm`, and it
refuses when an existing file would be overwritten. In chat, `/tito-init` runs
this same command.

`admin` is opt-in. `add` registers the current repo (or `--root`), `list` prints
registered paths, `remove` drops one path, and `refresh` writes local branch plus
the last 50 commit subjects, dates, and file paths (secrets like `.env` skipped;
no diffs) for chat and CLI to share.

## How work moves

The normal careful path is:

`DISCOVERY → PLANNED → APPROVED → IMPLEMENTING → READY_FOR_REVIEW → APPROVED_FOR_COMMIT → DONE`

A small, obvious change can move from discovery directly to an explicitly
approved slice. Review feedback can return an in-scope slice to implementation.
Other lifecycle skips are rejected.

## Git flow

Tito suggests the branch before checkout, for example `Suggested branch: feat/short-slug from develop`. You accept it or name another base or type. The base is `dev`, `develop`, `main`, or `master`. `dev` and `develop` are interchangeable. `main` and `master` are interchangeable. The type is `feat`, `fix`, `hot-fix`, `chores`, `refactor`, or `debug`.

`tito.yaml` may set the default base:

```yaml
schemaVersion: 1
profile: client-careful
git:
  defaultBase: develop
```

`product.screenLanguage` is optional and accepts only `vi` or `en`. A missing product block is valid. A missing `screenLanguage` is valid. Unknown product fields are rejected. `product.tenancy` is optional (`single` or `multi`). `product.surfaces` is an optional list of `{ id }` entries. Missing `tenancy` and missing `surfaces` stay valid.

```yaml
product:
  screenLanguage: vi
  tenancy: single
  surfaces:
    - id: admin
```

- Code stays English.
- In a Vietnamese app (`screenLanguage: vi`), routes and slugs are Vietnamese first. The public path is native Vietnamese, for example `/tien-ich/ca-phe`. Do not invent that Vietnamese by translating an English slug word for word. If the product is bilingual, the English route comes second.
- An English app (`screenLanguage: en`) keeps English routes and slugs.
- In a Vietnamese app (`screenLanguage: vi`), every string a person reads is Vietnamese: tables, labels, buttons, headings, and messages. Write native Vietnamese first. Do not invent it by translating English word for word. English may exist as a second field only when the product is bilingual, and it comes after the Vietnamese.
- An English app (`screenLanguage: en`) stays English on screen.
- When `screenLanguage` is missing and the screen language is unclear, Tito asks once. One obvious reading continues without a question.
- Globalized apps store timestamps in UTC and show them in the user's timezone. There is no switch to turn that off.

A commit subject is one finished sentence of at most 70 words. The body is a separate description. When you review a plan, Tito saves that plan and your edit as separate files under `.tito/feedback/<slug>/`. Tito indexes only the plan name. The plan body stays in Cursor's plan file. After an approved slice is coded, every review fix goes into one plan named `review/<slug>` on the same branch. Tito asks before opening a pull request only after that plan is coded, or when you accept the code with no changes. The pull request description has four parts within 2 to 50 lines: a one-line problem, what changed, review fixes, and checks for lint, code quality, conventions, tests, build, and docs. Init creates `.github/pull_request_template.md` from Tito's template when it is missing. Upgrade replaces that file with Tito's template. Tito does not approve a pull request. Tito merges only when you call for the merge and the pull request already has an approval. After a pull request is merged, Tito asks before the next slice. Tito switches back to the base branch only when you say so clearly. Tito pushes directly to the base branch only when you clearly instruct that push.

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
