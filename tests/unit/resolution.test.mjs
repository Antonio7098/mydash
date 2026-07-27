import assert from "node:assert/strict";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { scanWorkspaceLibrary } from "../../src/library/scan.mjs";
import { findArtifact } from "../../src/resolution/find-artifact.mjs";
import {
  resolveArtifactAppearance,
} from "../../src/resolution/resolve.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(
  testDirectory,
  "../fixtures/resolution-workspace",
);

test("scanner discovers artefact-local resources without shared duplicate errors", async () => {
  const scan = await scanWorkspaceLibrary(fixtureRoot);
  const local = scan.entries.find(
    (entry) =>
      entry.kind === "component" &&
      entry.level === "local",
  );

  assert.equal(scan.summary.errorCount, 0);
  assert.equal(scan.summary.entryCount, 8);
  assert.equal(local.id, "metric-card");
  assert.equal(local.ownerArtifact, "use-case-pipeline");
});

test("appearance resolution applies local, Core and preset precedence", async () => {
  const scan = await scanWorkspaceLibrary(fixtureRoot);
  const artifact = findArtifact(
    scan,
    "use-case-pipeline",
    "dashboard",
  );
  const result = resolveArtifactAppearance(scan, artifact);

  assert.equal(result.summary.valid, true);
  assert.equal(result.selections.theme.entry.id, "hsbc-light");
  assert.equal(result.selections.theme.source, "artifact");
  assert.equal(result.selections.preset.entry.id, "default");
  assert.equal(result.selections.layout.entry.id, "dashboard-grid");
  assert.equal(
    result.selections.components["metric-summary"].entry.level,
    "local",
  );
  assert.equal(
    result.selections.components["metric-summary"].entry.ownerArtifact,
    "use-case-pipeline",
  );
  assert.equal(
    result.selections.primitives.button.entry.level,
    "core",
  );
  assert.equal(
    result.selections.assets["brand-logo"].entry.id,
    "hsbc-red",
  );
});

test("dependency closure includes transitive Core dependencies", async () => {
  const scan = await scanWorkspaceLibrary(fixtureRoot);
  const artifact = findArtifact(scan, "use-case-pipeline");
  const result = resolveArtifactAppearance(scan, artifact);

  assert.equal(
    result.dependencyClosure.some(
      (entry) =>
        entry.kind === "primitive" &&
        entry.id === "button",
    ),
    true,
  );
  assert.equal(
    result.edges.some(
      (edge) =>
        edge.source.kind === "component" &&
        edge.target.kind === "primitive",
    ),
    true,
  );
});

test("preset and theme incompatibility is reported", async () => {
  const root = await mkdtemp(
    join(tmpdir(), "mydash-resolution-theme-"),
  );
  await cp(fixtureRoot, root, {
    recursive: true,
    force: true,
  });

  try {
    const darkDirectory = resolve(
      root,
      "library/themes/core/hsbc-dark",
    );
    await mkdir(darkDirectory, { recursive: true });
    await writeFile(
      resolve(darkDirectory, "theme.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          kind: "theme",
          id: "hsbc-dark",
          name: "HSBC Dark",
          level: "core",
          tokens: {
            "colour-background": "#111111",
          },
        },
        null,
        2,
      )}\n`,
    );

    const artifactPath = resolve(
      root,
      "library/dashboards/use-case-pipeline/artifact.json",
    );
    const artifact = JSON.parse(
      await readFile(artifactPath, "utf8"),
    );
    artifact.appearance.theme = "hsbc-dark";
    await writeFile(
      artifactPath,
      `${JSON.stringify(artifact, null, 2)}\n`,
    );

    const scan = await scanWorkspaceLibrary(root);
    const target = findArtifact(scan, "use-case-pipeline");
    const result = resolveArtifactAppearance(scan, target);
    const codes = new Set(
      result.issues.map((issue) => issue.code),
    );

    assert.equal(result.summary.valid, false);
    assert.equal(codes.has("PRESET_THEME_INCOMPATIBLE"), true);
    assert.equal(codes.has("UI_THEME_INCOMPATIBLE"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
