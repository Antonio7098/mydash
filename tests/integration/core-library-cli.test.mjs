import assert from "node:assert/strict";
import {
  dirname,
  resolve,
} from "node:path";
import {
  fileURLToPath,
} from "node:url";
import {
  spawnSync,
} from "node:child_process";
import test from "node:test";

const testDirectory = dirname(
  fileURLToPath(import.meta.url),
);
const projectRoot = resolve(
  testDirectory,
  "../..",
);
const cliPath = resolve(
  projectRoot,
  "bin",
  "mydash.mjs",
);

function runCli(args) {
  return spawnSync(
    process.execPath,
    [cliPath, ...args],
    {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: "pipe",
      shell: false,
      maxBuffer:
        64 * 1024 * 1024,
    },
  );
}

test("library scan accepts the seeded Core", () => {
  const result = runCli([
    "library",
    "scan",
    "--json",
  ]);

  assert.equal(
    result.status,
    0,
    result.stderr || result.stdout,
  );
  const body = JSON.parse(
    result.stdout,
  );
  assert.equal(
    body.data.summary.errorCount,
    0,
  );
  assert.equal(
    body.data.summary.resourceCount >= 8,
    true,
  );
});

test("Core listing contains the eight seed resources", () => {
  const result = runCli([
    "library",
    "list",
    "--level",
    "core",
    "--json",
  ]);

  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(
    result.stdout,
  );
  const ids = new Set(
    body.data.entries.map(
      (entry) =>
        `${entry.kind}:${entry.id}`,
    ),
  );
  const expected = [
    "theme:hsbc-light",
    "preset:default",
    "layout:dashboard-shell",
    "component:metric-card",
    "component:section-heading",
    "primitive:button",
    "primitive:status-badge",
    "asset:mydash-brand-mark",
  ];

  for (const value of expected) {
    assert.equal(
      ids.has(value),
      true,
      `Missing ${value}`,
    );
  }
});

test("workspace validation succeeds with the seeded defaults", () => {
  const result = runCli([
    "validate",
    "--json",
  ]);

  assert.equal(
    result.status,
    0,
    result.stderr || result.stdout,
  );
  const body = JSON.parse(
    result.stdout,
  );
  assert.equal(
    body.data.summary.valid,
    true,
  );
});
