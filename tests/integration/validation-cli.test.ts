import assert from "node:assert/strict";
import {
  readFile,
  rm,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(process.cwd());
const workspace = resolve(
  projectRoot,
  "tests",
  "fixtures",
  "export-workspace",
);
const cliPath = resolve(projectRoot, "bin", "mydash.mjs");
const reportPath = resolve(
  workspace,
  ".my-dashboards",
  "validation-report.json",
);

function runCli(args: string[]) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: "pipe",
    shell: false,
  });
}

test("validate command returns the consolidated report", () => {
  const result = runCli([
    "validate",
    "--workspace",
    workspace,
    "--json",
  ]);

  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.command, "validate");
  assert.equal(body.data.summary.valid, true);
  assert.equal(body.data.summary.exportValidatedCount, 1);
});

test("validate command can write a JSON report", async () => {
  await rm(reportPath, { force: true });

  try {
    const result = runCli([
      "validate",
      "--workspace",
      workspace,
      "--skip-exports",
      "--report",
      ".my-dashboards/validation-report.json",
      "--json",
    ]);

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(
      await readFile(reportPath, "utf8"),
    );
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.stages.exports.status, "skipped");
  } finally {
    await rm(reportPath, { force: true });
  }
});

test("impact command returns affected artefacts and risk", () => {
  const result = runCli([
    "impact",
    "button",
    "--kind",
    "primitive",
    "--workspace",
    workspace,
    "--json",
  ]);

  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.command, "impact");
  assert.equal(body.data.summary.risk, "high");
  assert.deepEqual(
    body.data.affectedArtifacts.map((entry: { id: string }) => entry.id),
    ["use-case-pipeline"],
  );
});

test("impact can fail a guard when the target is consumed", () => {
  const result = runCli([
    "impact",
    "button",
    "--kind",
    "primitive",
    "--fail-if-consumed",
    "--workspace",
    workspace,
    "--json",
  ]);

  assert.equal(result.status, 3);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, false);
  assert.equal(
    body.data.summary.transitiveConsumerCount > 0,
    true,
  );
});
