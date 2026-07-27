#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tests = [
  resolve(root, "tests", "unit", "readiness.test.mjs"),
  resolve(root, "tests", "unit", "server-start.test.mjs"),
  resolve(root, "tests", "integration", "release-readiness-server.test.mjs"),
];
const result = spawnSync(process.execPath, ["--test", ...tests], { cwd: root, stdio: "inherit", shell: false, maxBuffer: 64 * 1024 * 1024 });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
