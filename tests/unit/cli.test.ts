import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(process.cwd());
const cliPath = resolve(projectRoot, "bin", "mydash.mjs");

function runCli(args: string[]) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: "pipe",
    shell: false,
  });
}

test("help lists the foundation commands", () => {
  const result = runCli(["help"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /doctor/);
  assert.match(result.stdout, /version/);
  assert.equal(result.stderr, "");
});

test("--version returns package metadata", () => {
  const result = runCli(["--version"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /0\.1\.0/);
});

test("help supports structured JSON", () => {
  const result = runCli(["help", "--json"]);

  assert.equal(result.status, 0);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.command, "help");
  assert.ok(
    body.data.commands.some((command: { name: string }) => command.name === "doctor"),
  );
});

test("unknown commands use the stable usage exit code", () => {
  const result = runCli(["does-not-exist", "--json"]);

  assert.equal(result.status, 2);
  const body = JSON.parse(result.stderr);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "UNKNOWN_COMMAND");
});

test("doctor recognises the repository workspace", () => {
  const result = runCli(["doctor", "--json"]);

  assert.equal(result.status, 0);
  const body = JSON.parse(result.stdout);
  assert.equal(body.command, "doctor");
  assert.equal(body.data.healthy, true);
  assert.equal(body.data.workspaceRoot, projectRoot);
  assert.equal(body.data.user, "antonio");
});
