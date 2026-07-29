import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(process.cwd());
const workspace = resolve(
  projectRoot,
  "tests",
  "fixtures",
  "library-workspace",
);
const cliPath = resolve(projectRoot, "bin", "mydash.mjs");

function runCli(args: string[]) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: "pipe",
    shell: false,
  });
}

test("library scan is available through the CLI", () => {
  const result = runCli([
    "library",
    "scan",
    "--workspace",
    workspace,
    "--json",
  ]);

  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.command, "library scan");
  assert.equal(body.data.summary.entryCount, 7);
});

test("library list supports kind filtering", () => {
  const result = runCli([
    "library",
    "list",
    "--kind",
    "component",
    "--workspace",
    workspace,
    "--json",
  ]);

  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.deepEqual(
    body.data.entries.map((entry: { id: string }) => entry.id),
    ["metric-card"],
  );
});

test("library consumers returns reverse references", () => {
  const result = runCli([
    "library",
    "consumers",
    "metric-card",
    "--kind",
    "component",
    "--workspace",
    workspace,
    "--json",
  ]);

  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.data.consumers.length, 2);
});
