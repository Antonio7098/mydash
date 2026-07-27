#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tests = [
  resolve(projectRoot, "tests", "unit", "library-browser.test.mjs"),
  resolve(projectRoot, "tests", "integration", "library-browser-server.test.mjs"),
];
const result = spawnSync(process.execPath, ["--test", ...tests], { cwd: projectRoot, stdio: "inherit", shell: false, maxBuffer: 64 * 1024 * 1024 });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
