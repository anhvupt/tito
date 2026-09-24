import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  ConfigValidationError,
  parseConfig,
  type ConfigIssue,
  type TitoConfig,
} from "./config.js";

export type ConfigInspection =
  | { readonly status: "absent" }
  | { readonly status: "valid"; readonly config: TitoConfig }
  | { readonly status: "invalid"; readonly issues: readonly ConfigIssue[] };

export type InspectionReport = {
  readonly root: string;
  readonly titoYaml: ConfigInspection;
  readonly agentsMd: "present" | "absent";
};

export type InspectionErrorCode = "not-a-directory" | "inaccessible" | "filesystem";

export class InspectionError extends Error {
  readonly code: InspectionErrorCode;
  readonly path: string;

  constructor(code: InspectionErrorCode, path: string, message: string) {
    super(message);
    this.name = "InspectionError";
    this.code = code;
    this.path = path;
  }
}

function errno(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return null;
}

function fail(code: InspectionErrorCode, path: string, message: string): never {
  throw new InspectionError(code, path, message);
}

function fileKind(path: string): "file" | "absent" {
  try {
    if (statSync(path).isFile()) return "file";
    fail("filesystem", path, `${path} must be a file.`);
  } catch (error) {
    if (error instanceof InspectionError) throw error;
    const code = errno(error);
    if (code === "ENOENT") return "absent";
    if (code === "EACCES" || code === "EPERM") {
      fail("inaccessible", path, `Cannot read ${path}.`);
    }
    fail("filesystem", path, `Cannot inspect ${path}.`);
  }
}

function readConfig(path: string): ConfigInspection {
  if (fileKind(path) === "absent") return { status: "absent" };
  try {
    return { status: "valid", config: parseConfig(readFileSync(path, "utf8")) };
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      return { status: "invalid", issues: error.issues };
    }
    fail("filesystem", path, `Cannot read ${path}.`);
  }
}

export function inspectRepository(root: string): InspectionReport {
  const resolved = resolve(root);
  try {
    if (!statSync(resolved).isDirectory()) {
      fail("not-a-directory", resolved, `${resolved} is not a directory.`);
    }
  } catch (error) {
    if (error instanceof InspectionError) throw error;
    const code = errno(error);
    if (code === "EACCES" || code === "EPERM") {
      fail("inaccessible", resolved, `Cannot read ${resolved}.`);
    }
    if (code === "ENOENT" || code === "ENOTDIR") {
      fail("not-a-directory", resolved, `${resolved} is not a directory.`);
    }
    fail("filesystem", resolved, `Cannot inspect ${resolved}.`);
  }

  return {
    root: resolved,
    titoYaml: readConfig(join(resolved, "tito.yaml")),
    agentsMd: fileKind(join(resolved, "AGENTS.md")) === "file" ? "present" : "absent",
  };
}

export function formatInspection(report: InspectionReport): string {
  const config =
    report.titoYaml.status === "absent"
      ? "absent"
      : report.titoYaml.status === "valid"
        ? `valid profile=${report.titoYaml.config.profile}`
        : `invalid ${report.titoYaml.issues.map((item) => item.code).join(",")}`;
  return `root: ${report.root}\ntito.yaml: ${config}\nAGENTS.md: ${report.agentsMd}\n`;
}
