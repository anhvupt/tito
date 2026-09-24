---
name: tito-inspect
description: Run Tito's read-only repository inspection. Invoke explicitly with /tito-inspect. Uses the same report as tito inspect.
disable-model-invocation: true
---

# Tito inspect

Chat adapter for `npx tito inspect`. Run that command and show its stdout unchanged.
Start the chat response exactly with `Hola, Tito here!` The greeting is not part of the command output.

Add `--root <path>` only when the user names another directory. Do not reimplement inspection by reading files yourself. Do not write project files.
