import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(process.cwd());
const workspace = resolve(
  projectRoot,
  "tests",
  "fixtures",
  "resolution-workspace",
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

test("appearance resolve returns explicit effective selections", () => {
  const result = runCli([
    "appearance",
    "resolve",
    "use-case-pipeline",
    "--kind",
    "dashboard",
    "--workspace",
    workspace,
    "--json",
  ]);

  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.command, "appearance resolve");
  assert.equal(
    body.data.selections.components["metric-summary"].entry.level,
    "local",
  );
});

test("appearance validate resolves every artefact", () => {
  const result = runCli([
    "appearance",
    "validate",
    "--workspace",
    workspace,
    "--json",
  ]);

  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.data.summary.artifactCount, 1);
  assert.equal(body.data.summary.invalidArtifactCount, 0);
});
