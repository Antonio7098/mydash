import assert from "node:assert/strict";
import {
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
import {
  scanWorkspaceLibrary,
} from "../../src/library/scan.mjs";
import {
  buildConsumerGraph,
  consumersForEntry,
} from "../../src/library/consumers.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(
  testDirectory,
  "../fixtures/library-workspace",
);

test("library scanner discovers valid artefacts and resources", async () => {
  const scan = await scanWorkspaceLibrary(fixtureRoot);

  assert.equal(scan.summary.errorCount, 0);
  assert.equal(scan.summary.entryCount, 7);
  assert.equal(scan.summary.artifactCount, 1);
  assert.equal(scan.summary.byKind.component, 1);
  assert.equal(scan.summary.byKind.theme, 1);
});

test("reverse consumers include artefacts and presets", async () => {
  const scan = await scanWorkspaceLibrary(fixtureRoot);
  const graph = buildConsumerGraph(scan);
  const component = scan.entries.find(
    (entry) => entry.kind === "component",
  );
  const consumers = consumersForEntry(component, graph);

  assert.deepEqual(
    consumers.map(
      (consumer) =>
        `${consumer.source.kind}:${consumer.source.id}:${consumer.field}`,
    ),
    [
      "dashboard:use-case-pipeline:appearance.overrides.components.metric-summary",
      "preset:default:mappings.components.metric-summary",
    ],
  );
});

test("scanner reports duplicate ids and unresolved references", async () => {
  const root = await mkdtemp(
    join(tmpdir(), "mydash-library-diagnostics-"),
  );
  await copyFixtureWorkspace(fixtureRoot, root);

  try {
    const duplicateDirectory = resolve(
      root,
      "library/themes/collections/alternate/hsbc-light",
    );
    await mkdir(duplicateDirectory, { recursive: true });
    const theme = JSON.parse(
      await readFile(
        resolve(
          root,
          "library/themes/core/hsbc-light/theme.json",
        ),
        "utf8",
      ),
    );
    theme.level = "collection";
    theme.collection = "alternate";
    await writeFile(
      resolve(duplicateDirectory, "theme.json"),
      `${JSON.stringify(theme, null, 2)}\n`,
    );

    const artifactPath = resolve(
      root,
      "library/dashboards/use-case-pipeline/artifact.json",
    );
    const artifact = JSON.parse(
      await readFile(artifactPath, "utf8"),
    );
    artifact.appearance.preset = "missing-preset";
    await writeFile(
      artifactPath,
      `${JSON.stringify(artifact, null, 2)}\n`,
    );

    const scan = await scanWorkspaceLibrary(root);
    const codes = new Set(scan.issues.map((issue) => issue.code));

    assert.equal(codes.has("DUPLICATE_LIBRARY_ID"), true);
    assert.equal(codes.has("UNRESOLVED_LIBRARY_REFERENCE"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function copyFixtureWorkspace(source, target) {
  const { cp } = await import("node:fs/promises");
  await cp(source, target, {
    recursive: true,
    force: true,
  });
}
