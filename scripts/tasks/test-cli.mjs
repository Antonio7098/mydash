#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "../..");
const testFile = resolve(projectRoot, "tests", "unit", "cli.test.mjs");

const result = spawnSync(
  process.execPath,
  ["--test", testFile],
  {
    cwd: projectRoot,
    stdio: "inherit",
    shell: false,
  },
);

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
