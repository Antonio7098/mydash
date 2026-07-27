#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "../..");

const tasks = [
  {
    name: "contracts",
    file: resolve(scriptDirectory, "validate-contracts.mjs")
  }
];

let failed = false;

for (const task of tasks) {
  console.log(`\n=== Validating ${task.name} ===\n`);

  const result = spawnSync(process.execPath, [task.file], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: false
  });

  if (result.error) {
    console.error(result.error);
    failed = true;
    break;
  }

  if (result.status !== 0) {
    failed = true;
    break;
  }
}

if (failed) {
  process.exit(1);
}

console.log("\nWorkspace validation passed.");
