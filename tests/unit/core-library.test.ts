import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import {
  scanWorkspaceLibrary,
} from "../../src/library/scan.js";
import {
  validateMinimalCore,
} from "../../src/library/core.js";
import {
  resolveArtifactAppearance,
} from "../../src/resolution/resolve.js";
import type { LibraryEntry } from "../../src/library/types.js";

const projectRoot = resolve(process.cwd());

function makeEntry(
  partial: Partial<LibraryEntry> & Pick<LibraryEntry, "id" | "kind">,
): LibraryEntry {
  return {
    title: null,
    category: "artifact",
    lifecycle: "Core",
    scope: "core",
    placement: "core",
    path: partial.manifestPath ?? "/x",
    manifestPath: partial.manifestPath ?? "/x",
    manifest: {},
    level: null,
    collection: null,
    ownerArtifact: null,
    user: null,
    rootKey: "core",
    rootPath: "/",
    contractValid: true,
    directory: partial.directory ?? "/",
    relativeDirectory: "",
    displayPath: "",
    ...partial,
  };
}

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
  const artifact = makeEntry({
    id: "core-probe",
    kind: "dashboard",
    category: "artifact",
    title: "Core Probe",
    user: null,
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
  });
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
  if (!result.selections.theme || !result.selections.theme.entry) {
    throw new Error("theme entry missing");
  }
  assert.equal(
    result.selections.theme.entry.id,
    "hsbc-light",
  );
  if (!result.selections.preset || !result.selections.preset.entry) {
    throw new Error("preset entry missing");
  }
  assert.equal(
    result.selections.preset.entry.id,
    "default",
  );
  if (!result.selections.layout || !result.selections.layout.entry) {
    throw new Error("layout entry missing");
  }
  assert.equal(
    result.selections.layout.entry.id,
    "dashboard-shell",
  );
  const metricSummary =
    result.selections.components["metric-summary"];
  if (!metricSummary || !metricSummary.entry) {
    throw new Error("metric-summary selection missing");
  }
  assert.equal(
    metricSummary.entry.id,
    "metric-card",
  );
  const sectionHeading =
    result.selections.components["section-heading"];
  if (!sectionHeading || !sectionHeading.entry) {
    throw new Error("section-heading selection missing");
  }
  assert.equal(
    sectionHeading.entry.id,
    "section-heading",
  );
  const button = result.selections.primitives.button;
  if (!button || !button.entry) {
    throw new Error("button primitive selection missing");
  }
  assert.equal(
    button.entry.id,
    "button",
  );
  const status = result.selections.primitives.status;
  if (!status || !status.entry) {
    throw new Error("status primitive selection missing");
  }
  assert.equal(
    status.entry.id,
    "status-badge",
  );
  const brandLogo =
    result.selections.assets["brand-logo"];
  if (!brandLogo || !brandLogo.entry) {
    throw new Error("brand-logo asset selection missing");
  }
  assert.equal(
    brandLogo.entry.id,
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
  if (!asset) throw new Error("brand asset not found");

  assert.equal(
    asset.manifest.approved,
    true,
  );
  const usage = asset.manifest.usage;
  if (typeof usage !== "string") {
    throw new Error("asset.manifest.usage is not a string");
  }
  assert.match(
    usage,
    /not an HSBC logo/,
  );
});
