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
const workspace = resolve(
  projectRoot,
  "tests",
  "fixtures",
  "export-workspace",
);
const output = resolve(
  workspace,
  ".my-dashboards",
  "temp",
  "cli-export.html",
);
const cliPath = resolve(projectRoot, "bin", "mydash.mjs");

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: "pipe",
    shell: false,
  });
}

test("artifact validate builds the standalone export in memory", () => {
  const result = runCli([
    "artifact",
    "validate",
    "use-case-pipeline",
    "--kind",
    "dashboard",
    "--workspace",
    workspace,
    "--json",
  ]);

  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.command, "artifact validate");
  assert.equal(body.data.validation.valid, true);
});

test("artifact export creates one self-contained HTML file", async () => {
  await rm(output, { force: true });

  try {
    const result = runCli([
      "artifact",
      "export",
      "use-case-pipeline",
      "--kind",
      "dashboard",
      "--workspace",
      workspace,
      "--output",
      ".my-dashboards/temp/cli-export.html",
      "--json",
    ]);

    assert.equal(result.status, 0, result.stderr);
    const body = JSON.parse(result.stdout);
    assert.equal(body.command, "artifact export");
    assert.equal(body.data.validation.valid, true);

    const html = await readFile(output, "utf8");
    assert.match(html, /mydash-export/);
    assert.doesNotMatch(html, /src="\.\/main\.js"/);
  } finally {
    await rm(output, { force: true });
  }
});
