---
name: tito-worktree-tidy
description: Report stale git worktrees and remove merged clean ones when confirmed. Invoke explicitly with /tito-worktree-tidy. Uses the same report as tito worktree tidy.
disable-model-invocation: true
---

# Tito worktree tidy

Chat adapter for `npx tito worktree tidy`. Run that command and show its stdout unchanged.
Start the chat response exactly with `Hola, Tito here!` The greeting is not part of the command output.

Add `--root <path>` only when the user names another directory. Add `--confirm` only when the user asks to remove merged clean worktrees. Do not reimplement tidy by running git yourself. Do not delete remote branches. Do not rebase. Do not remove the main checkout, a base branch, or a worktree with uncommitted or unpushed work.

After a pull request is merged, Tito first runs `tito worktree tidy` report-only, then asks before the next slice.
