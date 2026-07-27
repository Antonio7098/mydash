import assert from "node:assert/strict";
import {
  readFile,
  rm,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { scanWorkspaceLibrary } from "../../src/library/scan.mjs";
import { findArtifact } from "../../src/resolution/find-artifact.mjs";
import { resolveArtifactAppearance } from "../../src/resolution/resolve.mjs";
import {
  buildStandaloneArtifact,
  exportStandaloneArtifact,
} from "../../src/export/export-artifact.mjs";
import { validateStandaloneHtml } from "../../src/export/validate-html.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(
  testDirectory,
  "../fixtures/export-workspace",
);

async function fixtureContext() {
  const scan = await scanWorkspaceLibrary(fixtureRoot);
  const artifact = findArtifact(
    scan,
    "use-case-pipeline",
    "dashboard",
  );
  const resolution = resolveArtifactAppearance(scan, artifact);

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
  assert.equal(result.resources.stylesheets, 1);
  assert.equal(result.resources.scripts, 1);
  assert.equal(result.resources.dataFiles, 1);
  assert.equal(result.resources.uiResources, 3);
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
      (error) => error.code === "OUTPUT_EXISTS",
    );
  } finally {
    await rm(output, { force: true });
  }
});
