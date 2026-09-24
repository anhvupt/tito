---
name: tito-apply
description: Dry-run Tito's adoption plan. Invoke explicitly with /tito-apply. Uses the same output as tito apply --dry-run.
disable-model-invocation: true
---

# Tito apply

Chat adapter for `npx tito apply --dry-run`. Show the command stdout unchanged.
Start the chat response exactly with `Hola, Tito here!`

The user must name `client-careful`, `solo-balanced`, or `solo-fast`. If they do not, ask which profile to use and stop. Do not omit `--dry-run`. Do not write project files.
