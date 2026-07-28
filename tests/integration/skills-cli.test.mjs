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
    },
  );
}

test("skills list exposes the active project commands", () => {
  const result = runCli([
    "skills",
    "list",
    "--json",
  ]);

  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.command, "skills list");
  assert.equal(body.data.count, 10);
  assert.equal(
    body.data.entries.some(
      (entry) =>
        entry.command === "mydash",
    ),
    true,
  );
});

test("skills inspect returns component decision rules", () => {
  const result = runCli([
    "skills",
    "inspect",
    "component",
    "--json",
  ]);

  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);

  assert.match(
    body.data.body,
    /Local → Collection → Core/,
  );
  assert.match(
    body.data.body,
    /mydash impact/,
  );
});

test("skills validate succeeds through the CLI", () => {
  const result = runCli([
    "skills",
    "validate",
    "--json",
  ]);

  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(
    body.data.summary.valid,
    true,
  );
  assert.equal(
    body.data.summary.logicalSkillCount,
    9,
  );
});
