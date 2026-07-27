#!/usr/bin/env node

import {
  spawnSync,
} from "node:child_process";
import {
  dirname,
  resolve,
} from "node:path";
import {
  fileURLToPath,
} from "node:url";
import process from "node:process";

const scriptDirectory = dirname(
  fileURLToPath(import.meta.url),
);
const projectRoot = resolve(
  scriptDirectory,
  "../..",
);

const tests = [
  resolve(
    projectRoot,
    "tests",
    "unit",
    "server-cache.test.mjs",
  ),
  resolve(
    projectRoot,
    "tests",
    "integration",
    "server.test.mjs",
  ),
  resolve(
    projectRoot,
    "tests",
    "integration",
    "user-scope-server.test.mjs",
  ),
];

const result = spawnSync(
  process.execPath,
  ["--test", ...tests],
  {
    cwd: projectRoot,
    stdio: "inherit",
    shell: false,
    maxBuffer:
      64 * 1024 * 1024,
  },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
