# admin-retro plan

`tito admin retro` produces weekly signals and alerts across registered repos. The Grok bot schedules the run and pings the user.

GitHub data comes through `gh`, with a local git fallback when `gh` is missing or offline. Read more, store less: counts only, no pull request or feedback text, no diffs.

`review.md` starts with front matter `outcome: accepted | edited | expanded`. A rule counts only from the day it landed in that repo.

Weeks are ISO weeks in the user's timezone. Timestamps are stored in UTC. Each retro is saved under `~/.config/tito/admin/retros/<week>.json` and `<week>.md`.

Alerts:

- Review-fix streak: three review-fix plans in a row.
- Rework: a fix or hot-fix on a file that a feat touched in the last 7 days.
- Docs blank: a pull request merged with the Docs check left empty. Needs GitHub data.

Four slices. Slice 1 is the `review.md` outcome marker, its reader, tests, and policy text.
