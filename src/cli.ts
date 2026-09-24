#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  InspectionError,
  formatInspection,
  inspectRepository,
} from "./core/inspect.js";
import { PlanError, formatAdoptionPlan, planAdoption } from "./core/plan.js";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

const help = `Tito — quiet orchestration for solo builders

Usage:
  tito [options]
  tito inspect [--root <path>]
  tito apply --dry-run --profile <id> [--root <path>]

Options:
  -h, --help     Show help
  -v, --version  Show version

Commands:
  inspect        Report tito.yaml and AGENTS.md. Reads only.
  apply          Dry-run an adoption plan. Writes are not available.
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

function run(args: string[]): void {
  if (args[0] === "inspect") {
    runInspect(args.slice(1));
    return;
  }
  if (args[0] === "apply") {
    runApply(args.slice(1));
    return;
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
