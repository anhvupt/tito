import assert from "node:assert/strict";
import test from "node:test";
import { formatInitError } from "../dist/core/terminal.js";

const RED = "\u001b[31m";
const RESET = "\u001b[0m";

test("[unit] a terminal gets a red error", () => {
  // Arrange
  const message = "conflict: AGENTS.md";

  // Act
  const formatted = formatInitError(message, { tty: true });

  // Assert
  assert.equal(formatted.startsWith(RED), true);
  assert.equal(formatted.includes(message), true);
  assert.equal(formatted.endsWith(RESET), true);
  const body = formatted.slice(RED.length, formatted.length - RESET.length);
  assert.equal(body.includes("\u001b"), false);
  assert.equal(body, `${message}\n`);
});

test("[unit] a pipe stays plain", () => {
  // Arrange
  const message = "conflict: AGENTS.md";

  // Act
  const formatted = formatInitError(message, { tty: false });

  // Assert
  assert.equal(formatted, "conflict: AGENTS.md\n");
  assert.equal(formatted.includes("\u001b"), false);
});

test("[unit] NO_COLOR turns the color off", () => {
  // Arrange
  const message = "Missing required option --profile.";

  // Act
  const formatted = formatInitError(message, { tty: true, noColor: true });

  // Assert
  assert.equal(formatted, `${message}\n`);
  assert.equal(formatted.includes("\u001b"), false);
});

test("[unit] an empty terminal error is still one red line", () => {
  // Arrange
  const message = "";

  // Act
  const formatted = formatInitError(message, { tty: true });

  // Assert
  assert.equal(formatted, `${RED}\n${RESET}`);
});
