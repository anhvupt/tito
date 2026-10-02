---
name: tito-admin-retro
description: Build Tito's weekly local git retro. Invoke explicitly with /tito-admin-retro. Uses the same report as tito admin retro.
disable-model-invocation: true
---

# Tito admin retro

Chat adapter for `npx tito admin retro`. Run that command and show its stdout unchanged.
Start the chat response exactly with `Hola, Tito here!` The greeting is not part of the command output.

`--json` stays machine-readable with no greeting inside the command output. Add `--week <YYYY-Www>` when the user names a week. Do not reimplement the retro by reading git yourself. Do not write project files.
