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
import { join, resolve } from "node:path";
import test from "node:test";
import { scanWorkspaceLibrary } from "../../src/library/scan.js";
import { findArtifact } from "../../src/resolution/find-artifact.js";
import {
  resolveArtifactAppearance,
} from "../../src/resolution/resolve.js";
import type { LibraryEntry } from "../../src/library/types.js";

const fixtureRoot = resolve(process.cwd(), "tests/fixtures/resolution-workspace");

test("scanner discovers artefact-local resources without shared duplicate errors", async () => {
  const scan = await scanWorkspaceLibrary(fixtureRoot);
  const local = scan.entries.find(
    (entry) =>
      entry.kind === "component" &&
      entry.level === "local",
  );
  if (!local) throw new Error("local component entry not found");

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
  ) as unknown as LibraryEntry;
  const result = resolveArtifactAppearance(scan, artifact);

  assert.equal(result.summary.valid, true);
  if (!result.selections.theme || !result.selections.theme.entry) {
    throw new Error("theme entry missing");
  }
  assert.equal(result.selections.theme.entry.id, "hsbc-light");
  assert.equal(result.selections.theme.source, "artifact");
  if (!result.selections.preset || !result.selections.preset.entry) {
    throw new Error("preset entry missing");
  }
  assert.equal(result.selections.preset.entry.id, "default");
  if (!result.selections.layout || !result.selections.layout.entry) {
    throw new Error("layout entry missing");
  }
  assert.equal(result.selections.layout.entry.id, "dashboard-grid");
  const metricSummary = result.selections.components["metric-summary"];
  if (!metricSummary || !metricSummary.entry) {
    throw new Error("metric-summary selection missing");
  }
  assert.equal(metricSummary.entry.level, "local");
  assert.equal(metricSummary.entry.ownerArtifact, "use-case-pipeline");
  const button = result.selections.primitives.button;
  if (!button || !button.entry) {
    throw new Error("button primitive selection missing");
  }
  assert.equal(button.entry.level, "core");
  const brandLogo = result.selections.assets["brand-logo"];
  if (!brandLogo || !brandLogo.entry) {
    throw new Error("brand-logo asset selection missing");
  }
  assert.equal(brandLogo.entry.id, "hsbc-red");
});

test("dependency closure includes transitive Core dependencies", async () => {
  const scan = await scanWorkspaceLibrary(fixtureRoot);
  const artifact = findArtifact(
    scan,
    "use-case-pipeline",
  ) as unknown as LibraryEntry;
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
    const target = findArtifact(
      scan,
      "use-case-pipeline",
    ) as unknown as LibraryEntry;
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
