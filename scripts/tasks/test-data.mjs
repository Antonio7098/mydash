#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "../..");

const tests = [
  resolve(projectRoot, "tests", "unit", "data-csv.test.mjs"),
  resolve(projectRoot, "tests", "unit", "data.test.mjs"),
  resolve(projectRoot, "tests", "integration", "data-cli.test.mjs"),
  resolve(projectRoot, "tests", "integration", "artifact-data-refresh-cli.test.mjs"),
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
