# admin-retro-local plan

`tito admin retro` builds one week's counts from local git across registered repos, saves them, and prints them. It reads no GitHub data and raises no alerts. Those come in a later slice.

## Decisions

- Weeks are ISO weeks in the user's timezone, using `--timezone <IANA>` or the machine timezone. Week boundaries are computed and stored in UTC.
- Counts: commit types from the `<type>:` prefix, prefix misses only after the prefix rule landed in that repo's `AGENTS.md` (merge commits never count), commits over the profile's file limit, merged pull requests, and review outcomes from `review.md` front matter.
- Review fixes, empty Docs checks, and merge duration stay `unavailable`.
- Counts only, saved as `~/.config/tito/admin/retros/<week>.json` and `<week>.md`, written atomically. No review text and no diffs. Secret filenames such as `.env` are skipped.
- `tito admin retro` and `/tito-admin-retro` share one implementation.
- A registered repo that is no longer a directory is listed as missing and does not stop the others.
- The report keeps an empty `alerts` array. There is no `--alerts` flag.

## Review fixes in this slice

1. Remove the `--alerts` flag, including help text, the skill sentence that passes it, and the text line it printed.
2. Tag the two untagged tests: `[integration]` on the invalid-week exit, and `[unit]` on admin help listing retro.

## Tests

- `[unit]` A rule counts only after it landed.
- `[unit]` Merge commits are not prefix misses.
- `[unit]` Sunday 2026-10-04 at 23:30 in `Asia/Ho_Chi_Minh` is week `2026-W40`.
- `[unit]` Review texts count accepted, expanded, and unknown.
- `[unit]` A missing repo does not stop the others.
- `[integration]` An invalid week exits with a non-zero status.
- `[unit]` Admin help lists `retro`.
- `[integration]` A quiet week stays quiet.
- `[integration]` JSON output is machine-readable and saved by week.

## Docs impact

`README.md`, `AGENTS.md`, `TITO-INITIAL-BRIEF.md`, and the skill in `.cursor/skills/` and `templates/` already describe the command. Drop only the `--alerts` instruction from both skill copies.

Commit subject, when the user asks to commit: `feat: add a weekly admin retro that counts Tito activity from local git across registered repos.`
