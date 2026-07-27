#!/usr/bin/env node
import { startApplicationServer } from "../../server/start.mjs";
try {
  const started = await startApplicationServer();
  process.stdout.write(`\nMyDash is ready at ${started.url}\nPress Ctrl+C to stop.\n\n`);
} catch (error) {
  process.stderr.write(`\n${error.message}\n\n`);
  process.exitCode = 1;
}
