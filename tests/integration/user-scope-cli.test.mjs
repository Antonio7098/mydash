import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  dirname,
  join,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testDirectory, "../..");
const fixtureRoot = resolve(
  projectRoot,
  "tests/fixtures/export-workspace",
);
const cliPath = resolve(projectRoot, "bin/mydash.mjs");

test("CLI defaults to config user and supports --all-users", async () => {
  const root = await mkdtemp(
    join(tmpdir(), "mydash-user-cli-"),
  );
  await cp(fixtureRoot, root, { recursive: true });
  await addOtherUserArtifact(root);

  try {
    const hidden = run([
      "artifact",
      "inspect",
      "other-dashboard",
      "--workspace",
      root,
      "--json",
    ]);
    assert.equal(hidden.status, 2);
    assert.equal(
      JSON.parse(hidden.stderr).error.code,
      "ARTIFACT_NOT_FOUND",
    );

    const globalArtifact = run([
      "artifact",
      "inspect",
      "other-dashboard",
      "--all-users",
      "--workspace",
      root,
      "--json",
    ]);
    assert.equal(globalArtifact.status, 0, globalArtifact.stderr);
    assert.equal(
      JSON.parse(globalArtifact.stdout).data.artifact.userId,
      "other-user",
    );

    const scopedScan = run([
      "library",
      "scan",
      "--workspace",
      root,
      "--json",
    ]);
    const globalScan = run([
      "library",
      "scan",
      "--all-users",
      "--workspace",
      root,
      "--json",
    ]);
    assert.equal(
      JSON.parse(scopedScan.stdout).data.summary.artifactCount,
      1,
    );
    assert.equal(
      JSON.parse(globalScan.stdout).data.summary.artifactCount,
      2,
    );
  } finally {
    await rm(root, {
      recursive: true,
      force: true,
    });
  }
});

function run(args) {
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

async function addOtherUserArtifact(root) {
  const directory = resolve(
    root,
    "library/dashboards/other-dashboard",
  );
  await mkdir(resolve(directory, "src"), {
    recursive: true,
  });
  await writeFile(
    resolve(directory, "artifact.json"),
    `${JSON.stringify({
      schemaVersion: 2,
      kind: "dashboard",
      id: "other-dashboard",
      title: "Other Dashboard",
      userId: "other-user",
      entry: "src/index.html",
      appearance: {
        theme: "hsbc-light",
        preset: "default",
        overrides: {
          layout: null,
          components: {},
          primitives: {},
          assets: {},
        },
      },
    }, null, 2)}\n`,
  );
  await writeFile(
    resolve(directory, "src/index.html"),
    "<!doctype html><html><body>Other</body></html>\n",
  );
}
