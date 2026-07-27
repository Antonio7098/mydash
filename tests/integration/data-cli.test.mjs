import assert from "node:assert/strict";
import {
  readFile,
  rm,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testDirectory, "../..");
const cliPath = resolve(projectRoot, "bin", "mydash.mjs");
const tempRoot = resolve(
  projectRoot,
  ".my-dashboards",
  "temp",
  "data-cli-tests",
);

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: "pipe",
    shell: false,
  });
}

test("Data inspection and profiling are available through the CLI", () => {
  const inspect = runCli([
    "data",
    "inspect",
    "tests/fixtures/data/sample.csv",
    "--json",
  ]);
  const profile = runCli([
    "data",
    "profile",
    "tests/fixtures/data/sample.csv",
    "--json",
  ]);

  assert.equal(inspect.status, 0, inspect.stderr);
  assert.equal(profile.status, 0, profile.stderr);
  assert.equal(JSON.parse(inspect.stdout).data.rowCount, 4);
  assert.equal(JSON.parse(profile.stdout).data.duplicateRowCount, 1);
});

test("Data filtering writes a protected workspace output", async () => {
  await rm(tempRoot, { recursive: true, force: true });

  try {
    const result = runCli([
      "data",
      "filter",
      "tests/fixtures/data/sample.csv",
      "--where",
      "status=Approved",
      "--output",
      ".my-dashboards/temp/data-cli-tests/approved.json",
      "--json",
    ]);

    assert.equal(result.status, 0, result.stderr);
    const value = JSON.parse(
      await readFile(
        resolve(tempRoot, "approved.json"),
        "utf8",
      ),
    );
    assert.deepEqual(value, [
      {
        id: "UC-001",
        status: "Approved",
        owner: "Alice",
        amount: "1200",
        created: "2026-01-10",
      },
    ]);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("Recipe creation and refresh produce provenance", async () => {
  await rm(tempRoot, { recursive: true, force: true });

  try {
    const create = runCli([
      "data",
      "create-recipe",
      "tests/fixtures/data/sample.csv",
      "--id",
      "sample-refresh",
      "--recipe",
      ".my-dashboards/temp/data-cli-tests/sample.recipe.json",
      "--output",
      ".my-dashboards/temp/data-cli-tests/refreshed.json",
      "--json",
    ]);

    assert.equal(create.status, 0, create.stderr);

    const refresh = runCli([
      "data",
      "refresh",
      ".my-dashboards/temp/data-cli-tests/sample.recipe.json",
      "--json",
    ]);

    assert.equal(refresh.status, 0, refresh.stderr);
    const body = JSON.parse(refresh.stdout);
    assert.equal(body.data.rowCount, 4);

    const provenance = JSON.parse(
      await readFile(
        resolve(tempRoot, "refreshed.provenance.json"),
        "utf8",
      ),
    );
    assert.equal(provenance.schemaVersion, 1);
    assert.match(provenance.sourceHash, /^[a-f0-9]{64}$/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
