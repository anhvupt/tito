---
name: tito-local-startup
description: Bring this repo's local stack up. Invoke with /tito-local-startup.
disable-model-invocation: true
---

# Tito local startup

Start the chat response exactly with `Hola, Tito here!`
Send this work to the startup sub-agent. Do not start processes from this chat.

Discover THIS repo's start story from README, compose.y*ml, package.json scripts, and migrate folders (prisma, drizzle, supabase/migrations, db/migrate). Start only what is missing. If pending migrations exist, name them and ask before applying them.

Never invent a stack. Never production. Local only. Do not migrate remote or production databases. Do not docker compose down -v. Do not drop data.
