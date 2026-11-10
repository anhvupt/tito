---
name: tito-local-startup
description: Bring this repo's local stack up. Invoke with /tito-local-startup.
disable-model-invocation: true
---

# Tito local startup

Start the chat response exactly with `Hola, Tito here!`
Send this work to the startup sub-agent. Do not start processes from this chat.

Before any process starts:
1. Check git status and the current branch.
2. The base branch is the first that exists among dev, develop, main, master.
3. If the current branch is not the base, ask in chat whether to stay on the current branch or switch to the base. If the tree is dirty, say so in that same question. Do not checkout, stash, commit, reset, or discard until the user answers.
4. If already on the base and the tree is clean, do not ask about the branch.
5. On the chosen branch run git pull --ff-only.
6. A dirty tree is solved only after the user says yes: stash, pull, stash pop, then stop before any commit and show the result.
7. A pull that cannot fast-forward is solved only after the user says yes: merge, keep both sides, stop before any commit, and show the result. No rebase, no reset, no discard.
8. The coordinator asks in this chat and puts the branch and the answers in the task packet. The sub-agent does not checkout, pull, stash, or resolve a conflict unless that packet records the user's yes.
9. Only then discover the start story and start what is missing. Migrations still need a separate yes.

Discover THIS repo's start story from README, compose.y*ml, package.json scripts, and migrate folders (prisma, drizzle, supabase/migrations, db/migrate). Start only what is missing. If pending migrations exist, name them and ask before applying them.

Never invent a stack. Never production. Local only. Do not migrate remote or production databases. Do not docker compose down -v. Do not drop data.
