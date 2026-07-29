import assert from "node:assert/strict";
import {
  readFile,
  rm,
} from "node:fs/promises";
import {
  spawnSync,
} from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(process.cwd());
const cliPath = resolve(
  projectRoot,
  "bin",
  "mydash.mjs",
);
const outputPath = resolve(
  projectRoot,
  ".my-dashboards",
  "temp",
  "ai-use-case-governance-test.html",
);

function runCli(args: string[]) {
  return spawnSync(
    process.execPath,
    [cliPath, ...args],
    {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: "pipe",
      shell: false,
      maxBuffer:
        64 * 1024 * 1024,
    },
  );
}

test("reference dashboard resolves Core plus its local pipeline", () => {
  const result = runCli([
    "artifact",
    "inspect",
    "ai-use-case-governance",
    "--kind",
    "dashboard",
    "--json",
  ]);

  assert.equal(
    result.status,
    0,
    result.stderr || result.stdout,
  );
  const body = JSON.parse(
    result.stdout,
  );

  assert.equal(
    body.data.appearance.summary.valid,
    true,
  );
  assert.equal(
    body.data.appearance.summary.dependencyCount,
    9,
  );
  assert.equal(
    body.data.appearance.selections.components[
      "governance-pipeline"
    ].entry.level,
    "local",
  );
  assert.equal(
    body.data.appearance.selections.assets[
      "brand-logo"
    ].entry.id,
    "mydash-brand-mark",
  );
});

test("reference dashboard builds a valid standalone document", () => {
  const result = runCli([
    "artifact",
    "validate",
    "ai-use-case-governance",
    "--kind",
    "dashboard",
    "--json",
  ]);

  assert.equal(
    result.status,
    0,
    result.stderr || result.stdout,
  );
  const body = JSON.parse(
    result.stdout,
  );

  assert.equal(
    body.data.validation.valid,
    true,
  );
  assert.equal(
    body.data.resources.uiResources,
    6,
  );
  assert.equal(
    body.data.resources.dataFiles,
    1,
  );
  assert.equal(
    body.data.sizeBytes > 20_000,
    true,
  );
  assert.match(
    body.data.sha256,
    /^[a-f0-9]{64}$/,
  );
});

test("reference dashboard exports as one file-compatible HTML document", async () => {
  await rm(
    outputPath,
    { force: true },
  );

  try {
    const result = runCli([
      "artifact",
      "export",
      "ai-use-case-governance",
      "--kind",
      "dashboard",
      "--output",
      ".my-dashboards/temp/ai-use-case-governance-test.html",
      "--overwrite",
      "--json",
    ]);

    assert.equal(
      result.status,
      0,
      result.stderr || result.stdout,
    );

    const html = await readFile(
      outputPath,
      "utf8",
    );

    assert.match(
      html,
      /data-mydash-standalone/,
    );
    assert.match(
      html,
      /AI Use Case Governance/,
    );
    assert.match(
      html,
      /governance-pipeline/,
    );
    assert.match(
      html,
      /data-mydash-asset-id="mydash-brand-mark"/,
    );
    assert.match(
      html,
      /Content-Security-Policy/,
    );
    assert.doesNotMatch(
      html,
      /<script[^>]+src=/i,
    );
    assert.doesNotMatch(
      html,
      /<link[^>]+rel="stylesheet"/i,
    );
  } finally {
    await rm(
      outputPath,
      { force: true },
    );
  }
});
