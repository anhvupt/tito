#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

const help = `Tito — quiet orchestration for solo builders

Usage:
  tito [options]

Options:
  -h, --help     Show help
  -v, --version  Show version
`;

function run(args: string[]): void {
  const { values } = parseArgs({
    args,
    options: {
      help: {
        type: "boolean",
        short: "h",
      },
      version: {
        type: "boolean",
        short: "v",
      },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) {
    process.stdout.write(help);
    return;
  }

  if (values.version) {
    process.stdout.write(`${packageJson.version}\n`);
    return;
  }

  process.stdout.write(help);
}

run(process.argv.slice(2));
