#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "../..");

const fixtureResult = spawnSync(
  process.execPath,
  [resolve(scriptDirectory, "create-office-fixtures.mjs")],
  {
    cwd: projectRoot,
    stdio: "inherit",
    shell: false,
  },
);

if (fixtureResult.error) throw fixtureResult.error;
if (fixtureResult.status !== 0) {
  process.exit(fixtureResult.status ?? 1);
}

const tests = [
  resolve(projectRoot, "tests", "unit", "office-excel.test.mjs"),
  resolve(projectRoot, "tests", "unit", "office-powerpoint.test.mjs"),
  resolve(projectRoot, "tests", "integration", "office-cli.test.mjs"),
];

const result = spawnSync(
  process.execPath,
  ["--test", ...tests],
  {
    cwd: projectRoot,
    stdio: "inherit",
    shell: false,
  },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
