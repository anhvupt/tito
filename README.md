# Tito

Quiet orchestration. Trusted continuity.

Tito is a local-first, cost-aware AI development harness for solo builders. It
coordinates one root agent with narrowly selected, project-owned specialists
while preserving human approval gates.

Tito is respectfully inspired by Francesc “Tito” Vilanova: quiet leadership, continuity, trust, and understanding of the complete system.

## Requirements

- Node.js 20 or newer
- npm

## Development

```sh
npm install
npm run build
npm test
```

Run the compiled CLI:

```sh
node dist/cli.js --help
node dist/cli.js --version
```

Tito is under initial development. Configuration, inspection, and planning
commands will be introduced in reviewable increments.

## Workflow contract

Tito recommends one mode from explicit task facts:

1. An approved implementation slice routes to Agent.
2. Ambiguity, multiple modules, architecture, migrations, security, accounting, required slicing, or a mandatory escalation topic routes to Plan.
3. Otherwise Tito uses Ask for read-only discovery or to frame a small change before approval.

Lifecycle order is DISCOVERY, PLANNED, APPROVED, IMPLEMENTING, READY_FOR_REVIEW, APPROVED_FOR_COMMIT, DONE. An explicitly approved small slice may move from DISCOVERY to APPROVED. An in-scope review revision may return from READY_FOR_REVIEW to IMPLEMENTING. Other skips are rejected.

## License

Apache-2.0
