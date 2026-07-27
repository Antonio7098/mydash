#!/usr/bin/env node

import { runCli } from "../cli/index.mjs";

const exitCode = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: process.stdout,
  stderr: process.stderr,
  env: process.env,
});

process.exitCode = exitCode;
