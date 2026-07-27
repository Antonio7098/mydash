import assert from "node:assert/strict";
import {
  dirname,
  resolve,
} from "node:path";
import {
  fileURLToPath,
} from "node:url";
import test from "node:test";
import {
  scanWorkspaceLibrary,
} from "../../src/library/scan.mjs";
import {
  validateMinimalCore,
} from "../../src/library/core.mjs";
import {
  resolveArtifactAppearance,
} from "../../src/resolution/resolve.mjs";

const testDirectory = dirname(
  fileURLToPath(import.meta.url),
);
const projectRoot = resolve(
  testDirectory,
  "../..",
);

test("minimal Core contains exactly the intended seed resources", async () => {
  const scan =
    await scanWorkspaceLibrary(
      projectRoot,
    );
  const result =
    await validateMinimalCore(scan);

  assert.equal(
    result.summary.valid,
    true,
    JSON.stringify(result.issues, null, 2),
  );
  assert.equal(
    result.summary.expectedResourceCount,
    8,
  );
  assert.equal(
    result.summary.discoveredResourceCount,
    8,
  );
});

test("the default Core preset resolves a complete dashboard appearance", async () => {
  const scan =
    await scanWorkspaceLibrary(
      projectRoot,
    );
  const artifact = {
    id: "core-probe",
    kind: "dashboard",
    category: "artifact",
    title: "Core Probe",
    level: null,
    collection: null,
    ownerArtifact: null,
    directory: resolve(
      projectRoot,
      "tests",
      "fixtures",
      "core-probe",
    ),
    manifestPath: resolve(
      projectRoot,
      "tests",
      "fixtures",
      "core-probe",
      "artifact.json",
    ),
    displayPath:
      "tests/fixtures/core-probe/artifact.json",
    manifest: {
      schemaVersion: 1,
      kind: "dashboard",
      id: "core-probe",
      title: "Core Probe",
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
    },
  };
  const result =
    resolveArtifactAppearance(
      scan,
      artifact,
    );

  assert.equal(
    result.summary.valid,
    true,
    JSON.stringify(result.issues, null, 2),
  );
  assert.equal(
    result.selections.theme.entry.id,
    "hsbc-light",
  );
  assert.equal(
    result.selections.preset.entry.id,
    "default",
  );
  assert.equal(
    result.selections.layout.entry.id,
    "dashboard-shell",
  );
  assert.equal(
    result.selections.components[
      "metric-summary"
    ].entry.id,
    "metric-card",
  );
  assert.equal(
    result.selections.components[
      "section-heading"
    ].entry.id,
    "section-heading",
  );
  assert.equal(
    result.selections.primitives.button
      .entry.id,
    "button",
  );
  assert.equal(
    result.selections.primitives.status
      .entry.id,
    "status-badge",
  );
  assert.equal(
    result.selections.assets[
      "brand-logo"
    ].entry.id,
    "mydash-brand-mark",
  );
  assert.equal(
    result.summary.dependencyCount,
    8,
  );
});

test("the fallback brand asset is not represented as an HSBC logo", async () => {
  const scan =
    await scanWorkspaceLibrary(
      projectRoot,
    );
  const asset = scan.entries.find(
    (entry) =>
      entry.kind === "asset" &&
      entry.id ===
        "mydash-brand-mark",
  );

  assert.equal(
    asset.manifest.approved,
    true,
  );
  assert.match(
    asset.manifest.usage,
    /not an HSBC logo/,
  );
});
