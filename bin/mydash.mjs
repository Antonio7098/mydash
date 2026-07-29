#!/usr/bin/env node
// Thin launcher for the compiled TypeScript CLI. Resolves the package
// root and imports the compiled entry point. The shell wrapper keeps the
// package `bin` field stable while the implementation lives in dist/.

import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const distEntry = resolve(here, "..", "dist", "cli", "index.js");
const require = createRequire(import.meta.url);

const { runCli } = await import(pathToFileURL(distEntry));

try {
  const exitCode = await runCli(process.argv.slice(2), {
    cwd: process.cwd(),
    stdout: process.stdout,
    stderr: process.stderr,
    env: process.env,
  });
  process.exitCode = exitCode ?? 0;
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

void require;
