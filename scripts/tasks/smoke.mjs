#!/usr/bin/env node
import { startApplicationServer } from "../../server/start.mjs";
let started;
try {
  started = await startApplicationServer({ port: 0, host: "127.0.0.1", installSignalHandlers: false, logger() {} });
  const checks = [
    ["health", "/api/health", "application/json"],
    ["readiness", "/api/readiness", "application/json"],
    ["navigator", "/", "text/html"],
    ["reference viewer", "/view/dashboard/ai-use-case-governance", "text/html"],
    ["reference preview", "/api/artifacts/dashboard/ai-use-case-governance/preview", "text/html"],
  ];
  for (const [name, path, type] of checks) {
    const response = await fetch(`${started.url}${path}`);
    if (!response.ok) throw new Error(`${name} returned ${response.status}`);
    if (!response.headers.get("content-type")?.includes(type)) throw new Error(`${name} returned unexpected content type`);
    await response.arrayBuffer();
    process.stdout.write(`✓ ${name}\n`);
  }
  process.stdout.write("Release smoke test passed.\n");
} catch (error) {
  process.stderr.write(`Release smoke test failed: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  await started?.close("smoke-test");
}
