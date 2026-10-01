# commit-message-prefix plan

A commit subject is `<type>: <sentence>`.

The type is the same token as the branch type: `feat`, `fix`, `hot-fix`, `chores`, `refactor`, or `debug`.

Examples:

- feat: add commit message rule
- fix: reject a duplicate surface id
- chores: record the commit prefix rule
- hot-fix: stop a bad release build

The words after the colon are one finished sentence of at most 70 words. The type is not counted in those 70 words. The body is a separate description.
