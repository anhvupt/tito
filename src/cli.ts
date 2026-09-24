#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  InspectionError,
  formatInspection,
  inspectRepository,
} from "./core/inspect.js";
import { PlanError, formatAdoptionPlan, planAdoption } from "./core/plan.js";
import {
  InitError,
  applyInitialization,
  formatInitialization,
  planInitialization,
  promptForProfile,
} from "./core/init.js";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

const help = `Tito — quiet orchestration for solo builders

Usage:
  tito [options]
  tito inspect [--root <path>]
  tito apply --dry-run --profile <id> [--root <path>]
  tito init [--profile <id>] [--root <path>] [--confirm]

Options:
  -h, --help     Show help
  -v, --version  Show version

Commands:
  inspect        Report tito.yaml and AGENTS.md. Reads only.
  apply          Dry-run an adoption plan. Writes are not available.
  init           Install Tito files and specialist agents. Confirm before writing.
`;

function fail(message: string): void {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function runInspect(args: string[]): void {
  if (args.includes("-h") || args.includes("--help")) {
    process.stdout.write(help);
    return;
  }

  let root = process.cwd();
  try {
    const { values } = parseArgs({
      args,
      options: { root: { type: "string" } },
      strict: true,
      allowPositionals: false,
    });
    if (values.root !== undefined) root = values.root;
  } catch (error) {
    fail(error instanceof Error ? error.message : "Invalid inspect arguments.");
    return;
  }

  try {
    process.stdout.write(formatInspection(inspectRepository(root)));
  } catch (error) {
    if (error instanceof InspectionError) {
      fail(`${error.code}: ${error.message}`);
      return;
    }
    throw error;
  }
}

function runApply(args: string[]): void {
  if (args.includes("-h") || args.includes("--help")) {
    process.stdout.write(help);
    return;
  }

  let root = process.cwd();
  let profile: string | undefined;
  let dryRun = false;
  try {
    const { values } = parseArgs({
      args,
      options: {
        "dry-run": { type: "boolean" },
        profile: { type: "string" },
        root: { type: "string" },
      },
      strict: true,
      allowPositionals: false,
    });
    dryRun = values["dry-run"] === true;
    if (values.profile !== undefined) profile = values.profile;
    if (values.root !== undefined) root = values.root;
  } catch (error) {
    fail(error instanceof Error ? error.message : "Invalid apply arguments.");
    return;
  }

  if (!dryRun) {
    fail("apply writes are not available. Re-run with --dry-run.");
    return;
  }
  if (profile === undefined) {
    fail("Missing required option --profile.");
    return;
  }

  try {
    const plan = planAdoption(inspectRepository(root), profile);
    process.stdout.write(formatAdoptionPlan(plan));
  } catch (error) {
    if (error instanceof InspectionError || error instanceof PlanError) {
      fail(`${error.code}: ${error.message}`);
      return;
    }
    throw error;
  }
}

async function runInit(args: string[]): Promise<void> {
  if (args.includes("-h") || args.includes("--help")) {
    process.stdout.write(help);
    return;
  }

  let root = process.cwd();
  let profile: string | undefined;
  let confirm = false;
  try {
    const { values } = parseArgs({
      args,
      options: {
        confirm: { type: "boolean" },
        profile: { type: "string" },
        root: { type: "string" },
      },
      strict: true,
      allowPositionals: false,
    });
    confirm = values.confirm === true;
    if (values.profile !== undefined) profile = values.profile;
    if (values.root !== undefined) root = values.root;
  } catch (error) {
    fail(error instanceof Error ? error.message : "Invalid init arguments.");
    return;
  }
  if (profile === undefined) {
    if (!input.isTTY) {
      fail("Missing required option --profile.");
      return;
    }
    const prompts = createInterface({ input, output });
    try {
      profile = await promptForProfile((prompt) => prompts.question(prompt));
    } finally {
      prompts.close();
    }
  }

  try {
    const plan = planInitialization(inspectRepository(root), profile);
    if (!confirm) {
      process.stdout.write(formatInitialization(plan));
      return;
    }
    applyInitialization(plan);
    process.stdout.write(formatInitialization(plan));
  } catch (error) {
    if (error instanceof InspectionError || error instanceof PlanError || error instanceof InitError) {
      fail(`${error.code}: ${error.message}`);
      return;
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "EPERM"
    ) {
      fail("filesystem: Tito could not create .cursor/agents.");
      return;
    }
    throw error;
  }
}

async function run(args: string[]): Promise<void> {
  if (args[0] === "inspect") {
    runInspect(args.slice(1));
    return;
  }
  if (args[0] === "apply") {
    runApply(args.slice(1));
    return;
  }
  if (args[0] === "init") {
    return runInit(args.slice(1));
  }

  let helpRequested = false;
  let versionRequested = false;
  try {
    const { values } = parseArgs({
      args,
      options: {
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
      strict: true,
      allowPositionals: false,
    });
    helpRequested = values.help === true;
    versionRequested = values.version === true;
  } catch (error) {
    fail(error instanceof Error ? error.message : "Invalid arguments.");
    return;
  }

  if (helpRequested) {
    process.stdout.write(help);
    return;
  }
  if (versionRequested) {
    process.stdout.write(`${packageJson.version}\n`);
    return;
  }
  process.stdout.write(help);
}

run(process.argv.slice(2));
