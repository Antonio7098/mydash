import assert from "node:assert/strict";
import {
  cp,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  scanWorkspaceLibrary,
} from "../../src/library/scan.js";
import type {
  RecipeValidationReport as DetailedRecipeReport,
} from "../../src/validation/recipe-validation.js";
import {
  validateWorkspace,
} from "../../src/validation/workspace-validation.js";
import {
  findImpactTarget,
  analyseLibraryImpact,
} from "../../src/validation/impact-analysis.js";

const fixtureRoot = resolve(process.cwd(), "tests/fixtures/export-workspace");

test("consolidated validation checks library, recipes and exports", async () => {
  const report = await validateWorkspace({
    workspaceRoot: fixtureRoot,
    validateExports: true,
    validateRecipes: true,
    maxBytes: 10 * 1024 * 1024,
    now: () => new Date("2026-07-26T12:00:00.000Z"),
  });

  assert.equal(report.summary.valid, true);
  assert.equal(report.summary.artifactCount, 1);
  assert.equal(report.summary.recipeCount, 1);
  assert.equal(report.summary.exportValidatedCount, 1);
  const exportsStage = report.stages.exports;
  if (!exportsStage) throw new Error("expected exports stage");
  assert.equal(exportsStage.status, "passed");
  const artifact = report.artifacts[0];
  if (!artifact) throw new Error("expected artifact");
  if (artifact.export.status !== "passed") {
    throw new Error(`unexpected export status: ${artifact.export.status}`);
  }
  assert.match(
    artifact.export.sha256,
    /^[a-f0-9]{64}$/,
  );
  const recipe = report.recipes[0] as unknown as DetailedRecipeReport | undefined;
  if (!recipe) throw new Error("expected recipe");
  if (!recipe.execution) throw new Error("expected recipe execution");
  assert.equal(recipe.execution.rowCount, 2);
});

test("invalid recipe sources are attributed to the recipes stage", async () => {
  const root = await mkdtemp(
    join(tmpdir(), "mydash-validation-test-"),
  );
  await cp(fixtureRoot, root, {
    recursive: true,
    filter(path) {
      return !path.includes(".tmp-validation-test");
    },
  });

  try {
    const recipePath = resolve(
      root,
      "recipes/use-cases.recipe.json",
    );
    const recipe = JSON.parse(
      await readFile(recipePath, "utf8"),
    );
    recipe.source.file = "missing.json";
    await writeFile(
      recipePath,
      `${JSON.stringify(recipe, null, 2)}\n`,
    );

    const report = await validateWorkspace({
      workspaceRoot: root,
      validateExports: false,
      validateRecipes: true,
      maxBytes: 10 * 1024 * 1024,
    });

    assert.equal(report.summary.valid, false);
    assert.equal(
      report.issues.some(
        (issue) =>
          issue.stage === "recipes" &&
          issue.code === "RECIPE_SOURCE_MISSING",
      ),
      true,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test("impact targets can distinguish Core from local resources", async () => {
  const scan = await scanWorkspaceLibrary(fixtureRoot);
  const core = findImpactTarget(
    scan.entries,
    "core/metric-card",
    "component",
  );
  const local = findImpactTarget(
    scan.entries,
    "local/use-case-pipeline/metric-card",
    "component",
  );

  assert.equal(core.level, "core");
  assert.equal(local.level, "local");
  assert.equal(local.ownerArtifact, "use-case-pipeline");
});

test("Core impact analysis walks through resources to artefacts", async () => {
  const scan = await scanWorkspaceLibrary(fixtureRoot);
  const target = findImpactTarget(
    scan.entries,
    "button",
    "primitive",
  );
  const impact = analyseLibraryImpact(scan, target, {
    changeType: "implementation",
  });

  assert.equal(impact.summary.scope, "core");
  assert.equal(impact.summary.risk, "high");
  assert.deepEqual(
    impact.affectedArtifacts.map((entry: { id: string }) => entry.id),
    ["use-case-pipeline"],
  );
  assert.equal(
    impact.recommendations.includes("mydash validate"),
    true,
  );
});

test("Local impact analysis stays scoped to its owner artefact", async () => {
  const scan = await scanWorkspaceLibrary(fixtureRoot);
  const target = scan.entries.find(
    (entry) =>
      entry.kind === "component" &&
      entry.id === "metric-card" &&
      entry.level === "local",
  );
  if (!target) throw new Error("expected local target");
  const impact = analyseLibraryImpact(scan, target, {
    changeType: "implementation",
  });

  assert.equal(impact.summary.scope, "local");
  assert.equal(impact.summary.risk, "low");
  assert.deepEqual(
    impact.affectedArtifacts.map((entry: { id: string }) => entry.id),
    ["use-case-pipeline"],
  );
});
