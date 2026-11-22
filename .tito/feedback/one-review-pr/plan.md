# One review pull request

Approved. Branch `feat/one-review-pr` from `origin/main`. Type `feat`.

## Domain

The user reviews one finished pull request per approved plan. The description's happy-path steps are how they judge the work and how they write the end-to-end test.

## Decisions

One approved plan uses one branch and one pull request. Later slices commit onto that branch. The pull request opens after slice 1. The user is told it is ready after the last slice, when the description matches the finished behavior.

`pullRequestDescription` in `src/core/git-flow.ts` gains `happyPath: readonly string[]`. Each item is one non-empty line. Length is at least 2. Steps render as `1. ...`, `2. ...`. Problem, What changed, Review fixes, and Checks stay within 2 to 50 lines. The returned body appends a blank line, `## Reproduce the happy path`, and the steps. Missing steps, one step, an empty step, or a step that contains a newline returns null. Those steps do not count toward the 50-line cap. Forty-one "what changed" bullets still return null.

`pullRequestTemplate()` includes `## Reproduce the happy path` and a `1.` placeholder. `.github/pull_request_template.md` stays equal to that function.

Wait between slices only for profile `client-careful` or mandatory escalation (authentication, payments, secrets, migrations, production data, infrastructure). Merge into the base branch only on the user's merge call or when `git.autoMerge` already allows it.

## Bootstrap text

In `AGENTS.md` and `templates/cursor/AGENTS.md`, replace the bullet `Stop for human approval between reviewable slices.` with:

`One approved plan uses one branch and one pull request. Later slices land on that open pull request. Wait between slices only for `client-careful` or mandatory escalation. The pull request description includes numbered steps to reproduce the happy path.`

Replace the independent-slice bullet so slices of one approved plan run in order on that plan's branch, one writer at a time. Keep `check out only after the user accepts`. Keep the bootstrap HTML comments only in the repo `AGENTS.md`. Both files stay at or under 1,500 tokens (`Math.ceil(length / 4)`). The repo `AGENTS.md` must not contain the sentence `A pull request description has four parts`.

In `.cursor/skills/tito/references/execute.md` and `templates/cursor/skills/tito/references/execute.md`, replace `Stop for human approval between reviewable slices.` with the same one-branch, one-pull-request rule, including the `client-careful` and mandatory-escalation wait. The two execute files stay identical. Each stays at or under 6,000 characters.

## Pull-request rule

In `.cursor/rules/pull-request.mdc` and `templates/cursor/rules/pull-request.mdc`, replace the four-part description bullet. The description has Problem, What changed, Review fixes, and Checks within 2 to 50 lines, plus a required `## Reproduce the happy path` of numbered steps. Later slices of one approved plan land on that open pull request. A pull-request comment still rewrites the description in the same turn and keeps the happy path. The two rule files stay identical.

## Docs

Update the pull-request paragraph in `README.md` and `TITO-INITIAL-BRIEF.md` so it matches the fifth section and the one-pull-request flow. Leave unrelated paragraphs as they are.

## Test cases

PR-1 [unit] A valid description includes a happy path, and that section does not consume the 50-line cap. A compact four-section body plus three steps is accepted, and the lines before `## Reproduce the happy path` are within 2 to 50.
Arrange: problem, one change, no review fixes, one check, three happy-path steps.
Act: `pullRequestDescription`.
Assert: string contains `## Reproduce the happy path` and `1.`.

PR-2 [unit] An unusable happy path is rejected.
Arrange: zero steps, one step, an empty step, and a step with a newline.
Act: `pullRequestDescription`.
Assert: each result is null.

PR-3 [unit] The template and the installed rule tell the finisher to stack slices and to write the steps.
Arrange: `pullRequestTemplate()`, both pull-request rules, both `AGENTS.md` files.
Act: read them and estimate tokens.
Assert: template contains `## Reproduce the happy path` and `1.`; the rule says later slices land on the open pull request; both `AGENTS.md` files contain the new bootstrap line and stay at or under 1,500 tokens.

Edge: forty-one "what changed" bullets still return null. Update `test/git-flow.test.mjs` expected description strings so existing valid calls include the happy path. Update `test/upgrade.test.mjs` so it no longer requires the phrase `A pull request description has four parts` and instead requires the happy-path heading and the later-slices sentence.

## Stop

`npm test` and `npm run build` pass. Do not commit, push, or open a pull request.
