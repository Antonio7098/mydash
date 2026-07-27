import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testDirectory, "../..");
const cliPath = resolve(projectRoot, "bin", "mydash.mjs");

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: "pipe",
    shell: false,
  });
}

test("inspect returns structured metadata", () => {
  const result = runCli([
    "inspect",
    "tests/fixtures/files/sample.json",
    "--json",
  ]);

  assert.equal(result.status, 0);
  const body = JSON.parse(result.stdout);
  assert.equal(body.command, "inspect");
  assert.equal(body.data.type, "json");
  assert.equal(body.data.details.jsonShape, "object");
});

test("file safe-name is available through the CLI", () => {
  const result = runCli([
    "file",
    "safe-name",
    "Quarterly Review (Final).xlsx",
  ]);

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "quarterly-review-final.xlsx");
});

test("file find returns matching workspace files", () => {
  const result = runCli([
    "file",
    "find",
    "**/*.json",
    "--root",
    "tests/fixtures/files",
    "--json",
  ]);

  assert.equal(result.status, 0);
  const body = JSON.parse(result.stdout);
  assert.equal(body.command, "file find");
  assert.ok(
    body.data.matches.some((entry) => entry.path === "sample.json"),
  );
});

test("outside reads are refused without explicit permission", () => {
  const result = runCli([
    "inspect",
    "..",
    "--json",
  ]);

  assert.equal(result.status, 5);
  const body = JSON.parse(result.stderr);
  assert.equal(body.error.code, "PATH_OUTSIDE_WORKSPACE");
});
