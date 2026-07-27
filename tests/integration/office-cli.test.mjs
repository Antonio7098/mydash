import assert from "node:assert/strict";
import { rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
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

test("Excel inspect is exposed through the CLI", () => {
  const result = runCli([
    "excel",
    "inspect",
    "tests/fixtures/office/sample.xlsx",
    "--json",
  ]);

  assert.equal(result.status, 0);
  const body = JSON.parse(result.stdout);
  assert.equal(body.command, "excel inspect");
  assert.equal(body.data.sheetCount, 2);
});

test("Excel preview is exposed through the CLI", () => {
  const result = runCli([
    "excel",
    "preview",
    "tests/fixtures/office/sample.xlsx",
    "--sheet",
    "Summary",
    "--range",
    "A1:B2",
    "--json",
  ]);

  assert.equal(result.status, 0);
  const body = JSON.parse(result.stdout);
  assert.deepEqual(body.data.matrix, [
    ["Status", "Count"],
    ["Approved", 12],
  ]);
});

test("PowerPoint outline is exposed through the CLI", () => {
  const result = runCli([
    "powerpoint",
    "outline",
    "tests/fixtures/office/sample.pptx",
    "--json",
  ]);

  assert.equal(result.status, 0);
  const body = JSON.parse(result.stdout);
  assert.equal(body.data.slides[0].title, "Agent Hub Overview");
});

test("PowerPoint extraction creates structured output", async () => {
  const output = resolve(
    projectRoot,
    ".my-dashboards",
    "temp",
    "office-cli-test",
  );
  await rm(output, { recursive: true, force: true });

  try {
    const result = runCli([
      "powerpoint",
      "extract",
      "tests/fixtures/office/sample.pptx",
      "--output",
      ".my-dashboards/temp/office-cli-test",
      "--include-images",
      "--json",
    ]);

    assert.equal(result.status, 0, result.stderr);
    const metadata = await stat(resolve(output, "presentation.json"));
    assert.equal(metadata.isFile(), true);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
