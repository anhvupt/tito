---
name: tito-inspect
description: Run Tito's read-only repository inspection. Invoke explicitly with /tito-inspect. Uses the same report as tito inspect.
disable-model-invocation: true
---

# Tito inspect

Chat adapter for `tito inspect`. Run the existing inspector and show its output. Do not reimplement inspection by reading files yourself.

## Run

From the project root:

```sh
node dist/cli.js inspect
```

If `dist/cli.js` is missing, run `npm run build`, then run the inspect command again. Add `--root <path>` only when the user names another directory.

## Report

Show the command's stdout unchanged. The CLI report is the result:

- `root`
- `tito.yaml` as `absent`, `valid profile=<id>`, or `invalid` with issue codes
- `AGENTS.md` as `present` or `absent`

If the command exits nonzero, show stderr as the inspection error. Do not create, edit, or delete project files. Do not commit.
