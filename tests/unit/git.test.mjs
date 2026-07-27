import assert from "node:assert/strict";
import test from "node:test";
import {
  parsePorcelainV1Z,
  summariseChanges,
} from "../../src/git/status.mjs";
import {
  scanWorkspaceLibrary,
} from "../../src/library/scan.mjs";
import {
  analyseCheckpointImpact,
} from "../../src/git/impact.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(
  fileURLToPath(import.meta.url),
);
const fixtureRoot = resolve(
  testDirectory,
  "../fixtures/export-workspace",
);

test("porcelain status parsing preserves rename and staging state", () => {
  const changes = parsePorcelainV1Z(
    "M  staged.txt\0 M unstaged.txt\0?? new.txt\0R  renamed.txt\0old.txt\0",
  );

  assert.deepEqual(changes, [
    {
      status: "M ",
      path: "staged.txt",
      originalPath: null,
      staged: true,
      unstaged: false,
      untracked: false,
      conflicted: false,
    },
    {
      status: " M",
      path: "unstaged.txt",
      originalPath: null,
      staged: false,
      unstaged: true,
      untracked: false,
      conflicted: false,
    },
    {
      status: "??",
      path: "new.txt",
      originalPath: null,
      staged: false,
      unstaged: false,
      untracked: true,
      conflicted: false,
    },
    {
      status: "R ",
      path: "renamed.txt",
      originalPath: "old.txt",
      staged: true,
      unstaged: false,
      untracked: false,
      conflicted: false,
    },
  ]);

  assert.deepEqual(
    summariseChanges(changes),
    {
      total: 4,
      staged: 2,
      unstaged: 1,
      untracked: 1,
      conflicted: 0,
    },
  );
});

test("checkpoint impact identifies consumed Core resources", async () => {
  const scan = await scanWorkspaceLibrary(
    fixtureRoot,
  );
  const impact = analyseCheckpointImpact(
    scan,
    [
      "library/ui/primitives/core/button/primitive.js",
    ],
  );

  assert.equal(
    impact.summary.sharedResourceCount,
    1,
  );
  assert.equal(
    impact.summary.requiresAcknowledgement,
    true,
  );
  assert.deepEqual(
    impact.affectedArtifacts.map(
      (entry) => entry.id,
    ),
    ["use-case-pipeline"],
  );
});

test("local artefact resources do not require shared acknowledgement", async () => {
  const scan = await scanWorkspaceLibrary(
    fixtureRoot,
  );
  const impact = analyseCheckpointImpact(
    scan,
    [
      "library/dashboards/use-case-pipeline/ui/components/metric-card/component.js",
    ],
  );

  assert.equal(
    impact.summary.localResourceCount,
    1,
  );
  assert.equal(
    impact.summary.requiresAcknowledgement,
    false,
  );
});
