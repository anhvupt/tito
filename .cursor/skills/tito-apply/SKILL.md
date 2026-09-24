---
name: tito-apply
description: Dry-run Tito's adoption plan. Invoke explicitly with /tito-apply. Uses the same output as tito apply --dry-run.
disable-model-invocation: true
---

# Tito apply

Chat adapter for `tito apply --dry-run`. Show the existing planner's stdout. Do not write a plan by hand and do not create or edit project files.

## Run

The user must name `client-careful`, `solo-balanced`, or `solo-fast`. If they do not, ask which profile to use and stop. Do not choose one.

From the project root:

```sh
node dist/cli.js apply --dry-run --profile <id>
```

If `dist/cli.js` is missing, run `npm run build`, then run the apply command again. Add `--root <path>` only when the user names another directory. Do not omit `--dry-run`.

## Report

Show stdout unchanged. A nonzero exit and stderr are the result. Do not commit.
