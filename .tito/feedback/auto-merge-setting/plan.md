# auto-merge-setting plan

Optional `tito.yaml` field `git.autoMerge` is a boolean. It is the user's standing merge call. Missing it is valid and means off. A non-boolean value is rejected.

Init asks in a terminal after the auto-create pull request question. The auto-merge question defaults to no. Enter, `n`, or `no` stores false. `y` or `yes` stores true. A non-interactive init with `--profile` stores `autoMerge: false` and does not prompt. Upgrade asks only when the field is missing and keeps every other setting.

Tito never approves a pull request. Tito merges a slice pull request into a base branch only via `gh pr merge --squash`, on the user's merge call or `git.autoMerge: true`, after the finisher re-runs the test-first guard, tests, build, and docs gate. An approval is not required. When autoMerge is on, still wait for the user when the profile is `client-careful` or the slice touches mandatory escalation (authentication, payments, secrets, migrations, production data, infrastructure). Tito never pushes directly to a base branch unless the user clearly instructs that push.

Approved tests:

- M1 [unit] `git.autoMerge: true` parses valid, value true.
- M2 [unit] `git.autoMerge: "yes"` is a validation error naming `git.autoMerge`.
- M3 [unit] no git block is valid, `autoMerge` undefined.
- M4 [integration] interactive init answering no stores `autoMerge: false`.
- M5 [integration] non-interactive init with `--profile` stores `autoMerge: false` and does not prompt.
- M6 [integration] upgrade on a project missing `autoMerge` asks only that and keeps other settings.
- M7 [integration] fresh init `AGENTS.md` contains the new merge line, does not contain "already has an approval", and stays within 1,500 tokens.
- M8 [integration] repo `AGENTS.md` and both tito `SKILL.md` copies do not contain "already has an approval".
- M9 [unit] user merge call without an approval is allowed.
- M10 [unit] no merge call and `autoMerge` false is not allowed.
- M11 [unit] `autoMerge` true with `solo-balanced` is allowed.
- M12 [unit] `autoMerge` true with `client-careful` is not allowed.
- M13 [unit] `autoMerge` true with `touchesEscalation` true is not allowed.
