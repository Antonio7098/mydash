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
import { runCli } from "../../cli/index.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testDirectory, "../..");
const fixtureRoot = resolve(projectRoot, "tests", "fixtures", "export-workspace");

test("manual stage, refresh and status preserve a deterministic source snapshot", async () => {
  const root = await workspace();
  const external = join(root, "..", `manual-source-${process.pid}.csv`);

  try {
    await writeFile(external, "id,status\n1,Ready\n2,Review\n", "utf8");
    const staged = await run(root, [
      "data", "stage", external,
      "--artifact", "use-case-pipeline",
      "--kind", "dashboard",
      "--source", "portfolio-workbook",
      "--json",
    ]);
    assert.equal(staged.status, 0, staged.stderr);
    assert.ok(staged.stdout, JSON.stringify(staged));
    const stagedBody = JSON.parse(staged.stdout);
    assert.equal(stagedBody.data.changed, true);
    assert.equal(
      stagedBody.data.stagedPath,
      "library/dashboards/use-case-pipeline/data/source/portfolio-workbook/current.csv",
    );

    await configureRecipe(root);
    const refreshed = await run(root, [
      "data", "refresh-artifact", "use-case-pipeline",
      "--kind", "dashboard",
      "--json",
    ]);
    assert.equal(refreshed.status, 0, refreshed.stderr);
    assert.equal(JSON.parse(refreshed.stdout).data.datasets[0].rowCount, 2);

    const output = JSON.parse(await readFile(
      join(root, "library/dashboards/use-case-pipeline/data/generated/dashboard-data.json"),
      "utf8",
    ));
    assert.deepEqual(output.map((row) => row.id), ["1", "2"]);

    const provenance = JSON.parse(await readFile(
      join(root, "library/dashboards/use-case-pipeline/data/generated/dashboard-data.provenance.json"),
      "utf8",
    ));
    assert.equal(provenance.schemaVersion, 2);
    assert.match(provenance.sourceHash, /^[a-f0-9]{64}$/);
    assert.match(provenance.outputHash, /^[a-f0-9]{64}$/);

    const status = await run(root, [
      "data", "status", "use-case-pipeline",
      "--kind", "dashboard",
      "--json",
    ]);
    assert.equal(status.status, 0, status.stderr);
    assert.equal(JSON.parse(status.stdout).data.state, "current");

    const validation = await run(root, [
      "validate",
      "--artifact", "use-case-pipeline",
      "--kind", "dashboard",
      "--skip-exports",
      "--json",
    ]);
    assert.equal(validation.status, 0, validation.stderr);
    assert.equal(JSON.parse(validation.stdout).data.stages.sources.status, "passed");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(external, { force: true });
  }
});

test("live-local sync uses ignored machine configuration and detects unchanged files", async () => {
  const root = await workspace();
  const external = join(root, "..", `live-source-${process.pid}.csv`);

  try {
    await writeFile(external, "id,status\n1,Ready\n", "utf8");
    await mkdir(join(root, "library/dashboards/use-case-pipeline/data/source/live-workbook"), { recursive: true });
    await writeFile(
      join(root, "library/dashboards/use-case-pipeline/data/source/live-workbook/source.json"),
      `${JSON.stringify(sourcePolicy("live-workbook", "live-local"), null, 2)}\n`,
      "utf8",
    );
    await mkdir(join(root, ".mydash-local"), { recursive: true });
    await writeFile(
      join(root, ".mydash-local/sources.json"),
      `${JSON.stringify({ "live-workbook": { path: external } }, null, 2)}\n`,
      "utf8",
    );
    await configureRecipe(root, "live-workbook");

    const first = await run(root, [
      "data", "sync", "use-case-pipeline",
      "--kind", "dashboard",
      "--source", "live-workbook",
      "--json",
    ]);
    const second = await run(root, [
      "data", "sync", "use-case-pipeline",
      "--kind", "dashboard",
      "--source", "live-workbook",
      "--json",
    ]);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    assert.ok(first.stdout, JSON.stringify(first));
    assert.ok(second.stdout, JSON.stringify(second));
    assert.equal(JSON.parse(first.stdout).data.changed, true);
    assert.equal(JSON.parse(second.stdout).data.changed, false);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(external, { force: true });
  }
});

test("failed quality gates retain the last-known-good dataset", async () => {
  const root = await workspace();
  const external = join(root, "..", `quality-source-${process.pid}.csv`);

  try {
    await writeFile(external, "id,status\n1,Ready\n", "utf8");
    assert.equal((await run(root, [
      "data", "stage", external,
      "--artifact", "use-case-pipeline",
      "--kind", "dashboard",
      "--source", "portfolio-workbook",
    ])).status, 0);
    await configureRecipe(root);
    assert.equal((await run(root, [
      "data", "refresh-artifact", "use-case-pipeline", "--kind", "dashboard",
    ])).status, 0);
    const outputPath = join(root, "library/dashboards/use-case-pipeline/data/generated/dashboard-data.json");
    const before = await readFile(outputPath, "utf8");

    const policyPath = join(root, "library/dashboards/use-case-pipeline/data/source/portfolio-workbook/source.json");
    const policy = JSON.parse(await readFile(policyPath, "utf8"));
    policy.quality.requiredColumns = ["missing-column"];
    await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`, "utf8");

    const failed = await run(root, [
      "data", "refresh-artifact", "use-case-pipeline", "--kind", "dashboard", "--json",
    ]);
    assert.equal(failed.status, 3, failed.stderr);
    assert.equal(await readFile(outputPath, "utf8"), before);
    const status = JSON.parse(await readFile(
      join(root, "library/dashboards/use-case-pipeline/data/refresh-status.json"),
      "utf8",
    ));
    assert.equal(status.state, "failed");
    assert.ok(status.lastSuccessAt);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(external, { force: true });
  }
});

async function workspace() {
  const root = await mkdtemp(join(tmpdir(), "mydash-data-refresh-"));
  await cp(fixtureRoot, root, { recursive: true });
  return root;
}

async function configureRecipe(root, sourceId = "portfolio-workbook") {
  const artifact = join(root, "library/dashboards/use-case-pipeline");
  await mkdir(join(artifact, "recipes"), { recursive: true });
  await writeFile(
    join(artifact, `recipes/${sourceId}.recipe.json`),
    `${JSON.stringify({
      schemaVersion: 1,
      id: sourceId,
      source: {
        type: "csv",
        file: `library/dashboards/use-case-pipeline/data/source/${sourceId}/current.csv`,
      },
      output: {
        file: "library/dashboards/use-case-pipeline/data/generated/dashboard-data.json",
        format: "json",
        overwrite: true,
      },
    }, null, 2)}\n`,
    "utf8",
  );
}

function sourcePolicy(id, mode) {
  return {
    schemaVersion: 1,
    id,
    mode,
    filename: "current.csv",
    refresh: {
      expectedFrequency: "on-demand",
      maximumAgeHours: 168,
      retainSnapshots: 3,
    },
    quality: {
      minimumRows: 1,
      requiredColumns: ["id"],
      uniqueKey: ["id"],
      failOnFormulaErrors: true,
    },
  };
}

async function run(workspaceRoot, args) {
  let stdout = "";
  let stderr = "";
  const status = await runCli([
    "--workspace", workspaceRoot,
    ...args,
  ], {
    cwd: workspaceRoot,
    stdout: { write(value) { stdout += String(value); } },
    stderr: { write(value) { stderr += String(value); } },
  });
  return { status, stdout, stderr };
}
