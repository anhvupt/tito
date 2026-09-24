import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { InspectionError, inspectRepository } from "../dist/core/inspect.js";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "tito-inspect-"));
  return {
    root,
    entries() {
      return readdirSync(root).sort();
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test("inspectRepository reports root files without writing", () => {
  const empty = fixture();
  const before = empty.entries();
  assert.deepEqual(inspectRepository(empty.root), {
    root: empty.root,
    titoYaml: { status: "absent" },
    agentsMd: "absent",
  });
  assert.deepEqual(empty.entries(), before);

  const ready = fixture();
  writeFileSync(join(ready.root, "tito.yaml"), "schemaVersion: 1\nprofile: solo-balanced\n");
  writeFileSync(join(ready.root, "AGENTS.md"), "secret bootstrap text\n");
  const readyBefore = ready.entries();
  const report = inspectRepository(ready.root);
  assert.deepEqual(report.titoYaml, {
    status: "valid",
    config: { schemaVersion: 1, profile: "solo-balanced" },
  });
  assert.equal(report.agentsMd, "present");
  assert.equal(JSON.stringify(report).includes("secret bootstrap text"), false);
  assert.deepEqual(ready.entries(), readyBefore);

  const invalid = fixture();
  writeFileSync(join(invalid.root, "tito.yaml"), "schemaVersion: 1\nprofile: nope\n");
  const invalidBefore = invalid.entries();
  const invalidReport = inspectRepository(invalid.root);
  assert.equal(invalidReport.titoYaml.status, "invalid");
  assert.deepEqual(
    invalidReport.titoYaml.status === "invalid"
      ? invalidReport.titoYaml.issues.map((item) => item.code)
      : [],
    ["unknown-profile"],
  );
  assert.deepEqual(invalid.entries(), invalidBefore);

  empty.cleanup();
  ready.cleanup();
  invalid.cleanup();
});

test("inspectRepository rejects roots that cannot be inspected", () => {
  const dir = fixture();
  const filePath = join(dir.root, "notes.txt");
  writeFileSync(filePath, "notes\n");
  assert.throws(
    () => inspectRepository(filePath),
    (error) => error instanceof InspectionError && error.code === "not-a-directory",
  );
  assert.throws(
    () => inspectRepository(join(dir.root, "missing")),
    (error) => error instanceof InspectionError && error.code === "not-a-directory",
  );
  mkdirSync(join(dir.root, "tito.yaml"));
  assert.throws(
    () => inspectRepository(dir.root),
    (error) => error instanceof InspectionError && error.code === "filesystem",
  );
  dir.cleanup();
});
