import assert from "node:assert/strict";
import {
  readFile,
  rm,
} from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { scanWorkspaceLibrary } from "../../src/library/scan.js";
import { findArtifact } from "../../src/resolution/find-artifact.js";
import { resolveArtifactAppearance } from "../../src/resolution/resolve.js";
import {
  buildStandaloneArtifact,
  exportStandaloneArtifact,
} from "../../src/export/export-artifact.js";
import { validateStandaloneHtml } from "../../src/export/validate-html.js";
import type { ArtifactEntry } from "../../src/export/types.js";
import type { LibraryEntry } from "../../src/library/types.js";

const fixtureRoot = resolve(process.cwd(), "tests/fixtures/export-workspace");

interface StandaloneResources {
  stylesheets: number;
  scripts: number;
  dataFiles: number;
  assets: number;
  uiResources: number;
}

async function fixtureContext() {
  const scan = await scanWorkspaceLibrary(fixtureRoot);
  const libraryArtifact = findArtifact(
    scan,
    "use-case-pipeline",
    "dashboard",
  ) as unknown as LibraryEntry;
  const resolution = resolveArtifactAppearance(scan, libraryArtifact);
  const artifact = libraryArtifact as unknown as ArtifactEntry;

  return { scan, artifact, resolution };
}

test("standalone build inlines CSS, scripts, data and assets", async () => {
  const context = await fixtureContext();
  const result = await buildStandaloneArtifact({
    workspaceRoot: fixtureRoot,
    ...context,
    maxBytes: 10 * 1024 * 1024,
  });

  assert.equal(result.validation.valid, true);
  const resources = result.resources as StandaloneResources;
  assert.equal(resources.stylesheets, 1);
  assert.equal(resources.scripts, 1);
  assert.equal(resources.dataFiles, 1);
  assert.equal(resources.uiResources, 3);
  assert.match(result.html, /data-mydash-runtime/);
  assert.match(result.html, /data:image\/svg\+xml;base64/);
  assert.match(result.html, /use-cases\.json/);
  assert.doesNotMatch(result.html, /<script[^>]+src=/i);
  assert.doesNotMatch(
    result.html,
    /<link[^>]+rel="stylesheet"/i,
  );
});

test("standalone validator detects remaining dependencies", () => {
  const result = validateStandaloneHtml(
    `<!doctype html><html><head></head><body><script src="app.js"></script></body></html>`,
  );

  assert.equal(result.valid, false);
  assert.equal(
    result.issues.some(
      (issue) => issue.code === "SCRIPT_SOURCE_REMAINS",
    ),
    true,
  );
});

test("export writes one atomically protected HTML file", async () => {
  const context = await fixtureContext();
  const output = resolve(
    fixtureRoot,
    ".my-dashboards",
    "temp",
    "export-test.html",
  );
  await rm(output, { force: true });

  try {
    const result = await exportStandaloneArtifact({
      workspaceRoot: fixtureRoot,
      ...context,
      outputPath: output,
      maxBytes: 10 * 1024 * 1024,
    });

    const html = await readFile(output, "utf8");
    assert.equal(result.output.path, output);
    assert.equal(result.sha256.length, 64);
    assert.match(html, /Content-Security-Policy/);

    await assert.rejects(
      () =>
        exportStandaloneArtifact({
          workspaceRoot: fixtureRoot,
          ...context,
          outputPath: output,
          maxBytes: 10 * 1024 * 1024,
        }),
      (error) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "OUTPUT_EXISTS",
    );
  } finally {
    await rm(output, { force: true });
  }
});
