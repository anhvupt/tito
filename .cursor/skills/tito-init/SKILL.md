---
name: tito-init
description: Preview or confirm Tito initialization. Invoke explicitly with /tito-init. Uses the same plan as tito init.
disable-model-invocation: true
---

# Tito init

Chat adapter for `tito init`. Show the existing initializer's stdout. Do not write files unless the user explicitly confirms.

## Run

The user must name `client-careful`, `solo-balanced`, or `solo-fast`. If they do not, ask which profile to use and stop.

From the project root, preview first:

```sh
node dist/cli.js init --profile <id>
```

Run the confirmed command only after the user approves that exact plan:

```sh
node dist/cli.js init --profile <id> --confirm
```

If `dist/cli.js` is missing, run `npm run build`, then run init again. Add `--root <path>` only when the user names another directory.

## Report

Start the chat response exactly with `Hola, Tito here!`, then show stdout unchanged. A nonzero exit and stderr are the result.
