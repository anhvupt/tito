---
name: tito-init
description: Preview or confirm Tito initialization. Invoke explicitly with /tito-init. Uses the same plan as tito init.
disable-model-invocation: true
---

# Tito init

Chat adapter for `npx tito init`. Show the command stdout unchanged.
Start the chat response exactly with `Hola, Tito here!`

Preview first without `--confirm`. Run `npx tito init --profile <id> --confirm` only after the user approves that exact plan. In a terminal, omitting `--profile` asks for one. Do not overwrite existing project guidance.
