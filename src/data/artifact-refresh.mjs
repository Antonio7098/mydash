import {
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { CliError, EXIT_UNSAFE_OPERATION, EXIT_VALIDATION } from "../../cli/errors.mjs";
import { hashFile } from "../files/hash.mjs";
import { assertPathInsideWorkspace } from "../files/paths.mjs";
import { writeFileAtomic } from "../files/output.mjs";
import { scanWorkspaceLibrary } from "../library/scan.mjs";
import { findArtifact } from "../resolution/find-artifact.mjs";
import { loadDataset } from "./load.mjs";
import { extractRecipeSource } from "./recipes.mjs";
import { writeDataset } from "./write.mjs";
import { validateDocument } from "../validation/contracts.mjs";

const SOURCE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KINDS = new Set(["dashboard", "presentation", "concept"]);
const SOURCE_EXTENSIONS = new Set([".xlsx", ".xlsm", ".csv", ".json", ".ndjson", ".jsonl"]);
const MAX_SOURCE_BYTES = 100 * 1024 * 1024;
const FORMULA_ERRORS = new Set(["#CALC!", "#DIV/0!", "#N/A", "#NAME?", "#NULL!", "#NUM!", "#REF!", "#SPILL!", "#VALUE!"]);

export async function stageArtifactSource(options) {
  validateIdentity(options);
  const artifact = await resolveArtifact(options);
  const sourcePath = resolve(options.sourcePath);
  const sourceMetadata = await stableSource(sourcePath, options);
  const extension = extname(sourcePath).toLowerCase();

  if (!SOURCE_EXTENSIONS.has(extension)) {
    throw new CliError("UNSUPPORTED_STAGED_SOURCE", `Unsupported source format ${extension || "(none)"}.`, {
      exitCode: EXIT_VALIDATION,
    });
  }
  if (sourceMetadata.size > (options.maxBytes ?? MAX_SOURCE_BYTES)) {
    throw new CliError("SOURCE_TOO_LARGE", `Source exceeds the ${options.maxBytes ?? MAX_SOURCE_BYTES} byte limit.`, {
      exitCode: EXIT_VALIDATION,
    });
  }

  const sourceDirectory = join(artifact.directory, "data", "source", options.sourceId);
  const policyPath = join(sourceDirectory, "source.json");
  const existingPolicy = await readJsonIfPresent(policyPath);
  if (existingPolicy) validateSourcePolicy(existingPolicy, options.sourceId);
  const filename = existingPolicy?.filename ?? `current${extension}`;
  if (extname(filename).toLowerCase() !== extension) {
    throw new CliError(
      "SOURCE_FORMAT_CHANGED",
      `Source ${options.sourceId} expects ${extname(filename)} but received ${extension}.`,
      { exitCode: EXIT_VALIDATION },
    );
  }

  const currentPath = join(sourceDirectory, filename);
  await assertPathInsideWorkspace(currentPath, options.workspaceRoot, { mustExist: false });
  await mkdir(sourceDirectory, { recursive: true });
  const temporaryPath = join(sourceDirectory, `.incoming-${process.pid}-${Date.now()}${extension}`);

  try {
    await copyFile(sourcePath, temporaryPath);
    const copiedMetadata = await stat(temporaryPath);
    if (copiedMetadata.size !== sourceMetadata.size) {
      throw new CliError("SOURCE_CHANGED_DURING_COPY", "The source changed while it was being copied; retry when the file is idle.", {
        exitCode: EXIT_VALIDATION,
      });
    }

    const incomingHash = (await hashFile(temporaryPath, { workspaceRoot: options.workspaceRoot })).hash;
    const currentHash = await hashIfPresent(currentPath, options.workspaceRoot);
    if (currentHash === incomingHash && !options.force) {
      return stageResult({ artifact, options, currentPath, sourcePath, sourceMetadata, incomingHash, changed: false });
    }

    if (currentHash && options.history !== false) {
      const historyDirectory = join(sourceDirectory, "history");
      await mkdir(historyDirectory, { recursive: true });
      const historyPath = join(historyDirectory, `${timestampForPath()}-${currentHash.slice(0, 12)}${extension}`);
      await rename(currentPath, historyPath);
      await pruneHistory(historyDirectory, existingPolicy?.refresh?.retainSnapshots ?? 3);
    } else {
      await rm(currentPath, { force: true });
    }

    await rename(temporaryPath, currentPath);
    const policy = existingPolicy ?? defaultSourcePolicy(options.sourceId, filename, options.mode ?? "manual");
    if (!existingPolicy) {
      await writeFileAtomic(policyPath, `${JSON.stringify(policy, null, 2)}\n`, {
        workspaceRoot: options.workspaceRoot,
        overwrite: false,
        encoding: "utf8",
      });
    }
    await writeFileAtomic(join(sourceDirectory, "snapshot.json"), `${JSON.stringify({
      schemaVersion: 1,
      sourceId: options.sourceId,
      acquisitionMode: options.mode ?? policy.mode,
      originalFilename: basename(sourcePath),
      sourceModifiedAt: sourceMetadata.mtime.toISOString(),
      stagedAt: new Date().toISOString(),
      sizeBytes: sourceMetadata.size,
      sourceHash: incomingHash,
    }, null, 2)}\n`, {
      workspaceRoot: options.workspaceRoot,
      overwrite: true,
      encoding: "utf8",
    });

    return stageResult({ artifact, options, currentPath, sourcePath, sourceMetadata, incomingHash, changed: true });
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
}

export async function syncArtifactSource(options) {
  validateIdentity(options);
  const artifact = await resolveArtifact(options);
  const localConfigPath = resolve(options.workspaceRoot, ".mydash-local", "sources.json");
  const localConfig = await readRequiredJson(localConfigPath, "LOCAL_SOURCE_CONFIG_MISSING");
  const configured = localConfig[options.sourceId];
  if (!configured?.path || typeof configured.path !== "string") {
    throw new CliError(
      "LIVE_SOURCE_NOT_CONFIGURED",
      `No local path is configured for source ${options.sourceId} in .mydash-local/sources.json.`,
      { exitCode: EXIT_VALIDATION },
    );
  }
  if (!isAbsolute(configured.path)) {
    throw new CliError(
      "LIVE_SOURCE_PATH_NOT_ABSOLUTE",
      `Live source ${options.sourceId} must use an absolute path in .mydash-local/sources.json.`,
      { exitCode: EXIT_VALIDATION },
    );
  }
  const policy = await readRequiredJson(
    join(artifact.directory, "data", "source", options.sourceId, "source.json"),
    "SOURCE_POLICY_MISSING",
  );
  validateSourcePolicy(policy, options.sourceId);
  if (policy.mode !== "live-local") {
    throw new CliError("SOURCE_MODE_MISMATCH", `Source ${options.sourceId} is ${policy.mode}, not live-local.`, {
      exitCode: EXIT_VALIDATION,
    });
  }
  return stageArtifactSource({ ...options, sourcePath: configured.path, mode: "live-local" });
}

export async function refreshArtifactData(options) {
  validateArtifactOptions(options);
  return withArtifactLock(options, async () => {
    const artifact = await resolveArtifact(options);
    const recipeDirectory = join(artifact.directory, "recipes");
    const recipeFiles = await jsonFiles(recipeDirectory);
    if (recipeFiles.length === 0) {
      throw new CliError("ARTIFACT_RECIPES_MISSING", `No recipes were found for ${options.kind}:${options.artifactId}.`, {
        exitCode: EXIT_VALIDATION,
      });
    }

    const attempts = [];
    const attemptedAt = new Date().toISOString();
    try {
      for (const recipePath of recipeFiles) {
        const recipe = await readRequiredJson(recipePath, "RECIPE_INVALID_JSON");
        const recipeValidation = validateDocument("dataRecipe", recipe);
        if (!recipeValidation.ok) {
          throw new CliError("RECIPE_CONTRACT_INVALID", `Recipe ${relativePath(options.workspaceRoot, recipePath)} is invalid.`, {
            exitCode: EXIT_VALIDATION,
            details: recipeValidation.errors,
          });
        }
        const sourcePath = resolve(options.workspaceRoot, recipe.source?.file ?? "");
        const outputPath = resolve(options.workspaceRoot, recipe.output?.file ?? "");
        await assertPathInsideWorkspace(sourcePath, options.workspaceRoot, { mustExist: true });
        await assertPathInsideWorkspace(outputPath, options.workspaceRoot, { mustExist: false });
        if (!isInside(artifact.directory, sourcePath) || !isInside(artifact.directory, outputPath)) {
          throw new CliError("RECIPE_NOT_ARTIFACT_LOCAL", `Recipe ${relative(options.workspaceRoot, recipePath)} must use source and output paths inside its artefact.`, {
            exitCode: EXIT_VALIDATION,
          });
        }

        const extracted = await extractRecipeSource(sourcePath, recipe, options);
        const sourcePolicy = await policyForRecipeSource(sourcePath);
        const quality = evaluateQuality(extracted.records, sourcePolicy.quality ?? {}, await previousRecords(outputPath, options.workspaceRoot));
        if (!quality.valid) {
          throw new CliError("DATA_QUALITY_FAILED", `Quality checks failed for recipe ${recipe.id}.`, {
            exitCode: EXIT_VALIDATION,
            details: quality,
          });
        }

        const temporaryOutput = `${outputPath}.refresh-${process.pid}-${Date.now()}`;
        const output = await writeDataset(extracted.records, {
          outputPath: temporaryOutput,
          format: recipe.output.format,
          overwrite: false,
          workspaceRoot: options.workspaceRoot,
        });
        attempts.push({ recipe, recipePath, sourcePath, outputPath, temporaryOutput, output, quality, warnings: extracted.warnings ?? [] });
      }

      const published = [];
      for (const attempt of attempts) {
        const sourceHash = (await hashFile(attempt.sourcePath, { workspaceRoot: options.workspaceRoot })).hash;
        const recipeHash = (await hashFile(attempt.recipePath, { workspaceRoot: options.workspaceRoot })).hash;
        const outputHash = (await hashFile(attempt.temporaryOutput, { workspaceRoot: options.workspaceRoot })).hash;
        const provenancePath = provenancePathFor(attempt.outputPath);
        const snapshot = await readJsonIfPresent(join(dirname(attempt.sourcePath), "snapshot.json"));
        const provenance = {
          schemaVersion: 2,
          source: relativePath(options.workspaceRoot, attempt.sourcePath),
          sourceId: sourceIdFromPath(attempt.sourcePath),
          sourceHash,
          acquisitionMode: snapshot?.acquisitionMode ?? "workspace",
          originalFilename: snapshot?.originalFilename ?? basename(attempt.sourcePath),
          sourceModifiedAt: snapshot?.sourceModifiedAt ?? (await stat(attempt.sourcePath)).mtime.toISOString(),
          sourceSizeBytes: snapshot?.sizeBytes ?? (await stat(attempt.sourcePath)).size,
          recipe: relativePath(options.workspaceRoot, attempt.recipePath),
          recipeHash,
          output: relativePath(options.workspaceRoot, attempt.outputPath),
          outputHash,
          rowCount: attempt.output.rowCount,
          generatedAt: new Date().toISOString(),
          command: `mydash data refresh-artifact ${options.artifactId} --kind ${options.kind}`,
          toolVersion: options.toolVersion,
          quality: attempt.quality,
        };
        const provenanceValidation = validateDocument("provenance", provenance);
        if (!provenanceValidation.ok) {
          throw new CliError("PROVENANCE_CONTRACT_INVALID", `Generated provenance for recipe ${attempt.recipe.id} is invalid.`, {
            exitCode: EXIT_VALIDATION,
            details: provenanceValidation.errors,
          });
        }
        const temporaryProvenance = `${provenancePath}.refresh-${process.pid}-${Date.now()}`;
        await writeFileAtomic(temporaryProvenance, `${JSON.stringify(provenance, null, 2)}\n`, {
          workspaceRoot: options.workspaceRoot,
          overwrite: false,
          encoding: "utf8",
        });
        attempt.provenancePath = provenancePath;
        attempt.temporaryProvenance = temporaryProvenance;
        attempt.provenance = provenance;
        published.push({
          recipe: attempt.recipe.id,
          source: relativePath(options.workspaceRoot, attempt.sourcePath),
          output: relativePath(options.workspaceRoot, attempt.outputPath),
          provenance: relativePath(options.workspaceRoot, provenancePath),
          rowCount: attempt.output.rowCount,
          warnings: attempt.warnings,
          quality: attempt.quality,
        });
      }

      await publishTransaction(attempts);

      const status = {
        schemaVersion: 1,
        artifact: { kind: options.kind, id: options.artifactId },
        state: "current",
        lastAttemptAt: attemptedAt,
        lastSuccessAt: new Date().toISOString(),
        datasets: published,
      };
      await writeRefreshStatus(artifact, status, options.workspaceRoot);
      return status;
    } catch (error) {
      for (const attempt of attempts) {
        await rm(attempt.temporaryOutput, { force: true }).catch(() => {});
        if (attempt.temporaryProvenance) await rm(attempt.temporaryProvenance, { force: true }).catch(() => {});
      }
      const previous = await readJsonIfPresent(join(artifact.directory, "data", "refresh-status.json"));
      await writeRefreshStatus(artifact, {
        schemaVersion: 1,
        artifact: { kind: options.kind, id: options.artifactId },
        state: "failed",
        lastAttemptAt: attemptedAt,
        lastSuccessAt: previous?.lastSuccessAt ?? null,
        datasets: previous?.datasets ?? [],
        error: { code: error.code ?? "REFRESH_FAILED", message: error.message },
      }, options.workspaceRoot);
      throw error;
    }
  });
}

export async function artifactDataStatus(options) {
  validateArtifactOptions(options);
  const artifact = await resolveArtifact(options);
  const statusPath = join(artifact.directory, "data", "refresh-status.json");
  const value = await readJsonIfPresent(statusPath);
  if (!value) {
    return {
      schemaVersion: 1,
      artifact: { kind: options.kind, id: options.artifactId },
      state: "never-refreshed",
      statusPath: relativePath(options.workspaceRoot, statusPath),
    };
  }

  const sources = [];
  for (const directory of await directories(join(artifact.directory, "data", "source"))) {
    const policy = await readJsonIfPresent(join(directory, "source.json"));
    if (!policy) continue;
    const currentPath = join(directory, policy.filename);
    const metadata = await statOrNull(currentPath);
    const snapshot = await readJsonIfPresent(join(directory, "snapshot.json"));
    const ageHours = metadata ? (Date.now() - metadata.mtimeMs) / 3_600_000 : null;
    const maximumAgeHours = policy.refresh?.maximumAgeHours ?? null;
    sources.push({
      id: policy.id,
      mode: policy.mode,
      path: relativePath(options.workspaceRoot, currentPath),
      present: Boolean(metadata),
      modifiedAt: metadata?.mtime.toISOString() ?? null,
      hash: metadata ? (await hashFile(currentPath, { workspaceRoot: options.workspaceRoot })).hash : null,
      originalFilename: snapshot?.originalFilename ?? null,
      stagedAt: snapshot?.stagedAt ?? null,
      ageHours,
      freshness: ageHours === null ? "missing" : maximumAgeHours !== null && ageHours > maximumAgeHours ? "stale" : "current",
    });
  }
  return { ...value, statusPath: relativePath(options.workspaceRoot, statusPath), sources };
}

function evaluateQuality(records, policy, previous) {
  const columns = new Set(records.flatMap((record) => Object.keys(record)));
  const checks = [];
  check("minimum-rows", records.length >= (policy.minimumRows ?? 0), {
    expected: policy.minimumRows ?? 0,
    actual: records.length,
  });
  const missingColumns = (policy.requiredColumns ?? []).filter((column) => !columns.has(column));
  check("required-columns", missingColumns.length === 0, { missingColumns });
  const keys = policy.uniqueKey ?? [];
  let duplicateKeys = 0;
  if (keys.length) {
    const seen = new Set();
    for (const record of records) {
      const value = JSON.stringify(keys.map((key) => record[key] ?? null));
      if (seen.has(value)) duplicateKeys += 1;
      seen.add(value);
    }
  }
  check("unique-key", duplicateKeys === 0, { keys, duplicateKeys });
  const formulaErrors = policy.failOnFormulaErrors === false
    ? []
    : records.flatMap((record, row) => Object.entries(record)
      .filter(([, value]) => FORMULA_ERRORS.has(formulaErrorText(value)))
      .map(([column, value]) => ({ row: row + 1, column, value })));
  check("formula-errors", formulaErrors.length === 0, { count: formulaErrors.length, samples: formulaErrors.slice(0, 10) });
  if (previous && policy.maximumRowDecreasePercent !== undefined && previous.length > 0) {
    const decrease = Math.max(0, ((previous.length - records.length) / previous.length) * 100);
    check("row-decrease", decrease <= policy.maximumRowDecreasePercent, {
      maximumPercent: policy.maximumRowDecreasePercent,
      actualPercent: decrease,
    });
  }
  return { valid: checks.every((item) => item.passed), checks };

  function check(id, passed, details) {
    checks.push({ id, passed, ...details });
  }
}

function formulaErrorText(value) {
  if (value && typeof value === "object" && typeof value.error === "string") {
    return value.error.toUpperCase();
  }
  return String(value).toUpperCase();
}

async function stableSource(path, options) {
  const firstLink = await lstat(path);
  if (firstLink.isSymbolicLink() || !firstLink.isFile()) {
    throw new CliError("INVALID_SOURCE_FILE", `Source must be a regular, non-symbolic-link file: ${path}`, {
      exitCode: EXIT_UNSAFE_OPERATION,
    });
  }
  const delay = options.stabilityDelayMs ?? 250;
  if (delay > 0) await new Promise((resolvePromise) => setTimeout(resolvePromise, delay));
  const second = await stat(path);
  if (firstLink.size !== second.size || firstLink.mtimeMs !== second.mtimeMs) {
    throw new CliError("SOURCE_NOT_STABLE", "The source is still changing; retry after it has finished saving.", {
      exitCode: EXIT_VALIDATION,
    });
  }
  return second;
}

async function withArtifactLock(options, callback) {
  const lock = join(options.workspaceRoot, ".my-dashboards", "locks", `data-${options.kind}-${options.artifactId}.lock`);
  await mkdir(dirname(lock), { recursive: true });
  let handle;
  try {
    handle = await open(lock, "wx");
  } catch (error) {
    if (error.code === "EEXIST") {
      throw new CliError("DATA_REFRESH_LOCKED", `A refresh is already running for ${options.kind}:${options.artifactId}.`, {
        exitCode: EXIT_UNSAFE_OPERATION,
      });
    }
    throw error;
  }
  try {
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`);
    return await callback();
  } finally {
    await handle.close().catch(() => {});
    await rm(lock, { force: true }).catch(() => {});
  }
}

async function resolveArtifact(options) {
  const scan = await scanWorkspaceLibrary(options.workspaceRoot);
  return findArtifact(scan, options.artifactId, options.kind);
}

function validateIdentity(options) {
  validateArtifactOptions(options);
  if (!SOURCE_ID.test(options.sourceId ?? "")) {
    throw new CliError("INVALID_SOURCE_ID", "Source ID must be kebab-case.", { exitCode: 2 });
  }
}

function validateArtifactOptions(options) {
  if (!KINDS.has(options.kind)) throw new CliError("INVALID_ARTIFACT_KIND", "Kind must be dashboard, presentation or concept.", { exitCode: 2 });
  if (!SOURCE_ID.test(options.artifactId ?? "")) throw new CliError("INVALID_ARTIFACT_ID", "Artefact ID must be kebab-case.", { exitCode: 2 });
}

function defaultSourcePolicy(id, filename, mode) {
  return {
    schemaVersion: 1,
    id,
    mode,
    filename,
    refresh: { expectedFrequency: "on-demand", maximumAgeHours: 168, retainSnapshots: 3 },
    quality: { minimumRows: 1, requiredColumns: [], uniqueKey: [], failOnFormulaErrors: true },
  };
}

async function policyForRecipeSource(sourcePath) {
  const policy = await readJsonIfPresent(join(dirname(sourcePath), "source.json"));
  if (policy) validateSourcePolicy(policy, sourceIdFromPath(sourcePath));
  return policy ?? { quality: {} };
}

async function previousRecords(path, workspaceRoot) {
  if (!(await statOrNull(path))) return null;
  return (await loadDataset(path, { workspaceRoot })).records;
}

async function writeRefreshStatus(artifact, value, workspaceRoot) {
  await writeFileAtomic(join(artifact.directory, "data", "refresh-status.json"), `${JSON.stringify(value, null, 2)}\n`, {
    workspaceRoot,
    overwrite: true,
    encoding: "utf8",
  });
}

function stageResult({ artifact, options, currentPath, sourcePath, sourceMetadata, incomingHash, changed }) {
  return {
    artifact: { kind: artifact.kind, id: artifact.id },
    sourceId: options.sourceId,
    mode: options.mode ?? "manual",
    originalPath: sourcePath,
    originalFilename: basename(sourcePath),
    stagedPath: relativePath(options.workspaceRoot, currentPath),
    sizeBytes: sourceMetadata.size,
    sourceModifiedAt: sourceMetadata.mtime.toISOString(),
    hash: incomingHash,
    changed,
  };
}

async function readRequiredJson(path, code) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new CliError(code, `Could not read JSON file ${path}: ${error.message}`, { exitCode: EXIT_VALIDATION });
  }
}

async function readJsonIfPresent(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function hashIfPresent(path, workspaceRoot) {
  return (await statOrNull(path)) ? (await hashFile(path, { workspaceRoot })).hash : null;
}

async function statOrNull(path) {
  try {
    return await stat(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function jsonFiles(path) {
  try {
    const { readdir } = await import("node:fs/promises");
    return (await readdir(path, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => join(path, entry.name))
      .sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function directories(path) {
  try {
    const { readdir } = await import("node:fs/promises");
    return (await readdir(path, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(path, entry.name))
      .sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function pruneHistory(directory, retain) {
  const { readdir } = await import("node:fs/promises");
  const files = (await readdir(directory)).sort().reverse();
  for (const file of files.slice(Math.max(0, retain))) {
    await rm(join(directory, file), { force: true });
  }
}

async function publishTransaction(attempts) {
  const moved = [];
  try {
    for (const attempt of attempts) {
      for (const [temporary, target] of [
        [attempt.temporaryOutput, attempt.outputPath],
        [attempt.temporaryProvenance, attempt.provenancePath],
      ]) {
        const backup = `${target}.previous-${process.pid}-${Date.now()}`;
        const existed = Boolean(await statOrNull(target));
        if (existed) await rename(target, backup);
        try {
          await rename(temporary, target);
        } catch (error) {
          if (existed) await rename(backup, target).catch(() => {});
          throw error;
        }
        moved.push({ target, backup, existed });
      }
    }
    for (const item of moved) {
      if (item.existed) await rm(item.backup, { force: true });
    }
  } catch (error) {
    for (const item of moved.reverse()) {
      await rm(item.target, { force: true }).catch(() => {});
      if (item.existed) await rename(item.backup, item.target).catch(() => {});
    }
    throw error;
  }
}

function sourceIdFromPath(path) {
  return basename(dirname(path));
}

function provenancePathFor(outputPath) {
  const extension = extname(outputPath);
  return extension ? `${outputPath.slice(0, -extension.length)}.provenance.json` : `${outputPath}.provenance.json`;
}

function timestampForPath() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function relativePath(root, path) {
  return relative(root, path).replaceAll("\\", "/");
}

function isInside(root, path) {
  const value = relative(resolve(root), resolve(path));
  return value === "" || (!value.startsWith("..") && !value.startsWith("/"));
}

export function validateSourcePolicy(policy, expectedId) {
  const errors = [];
  if (policy?.schemaVersion !== 1) errors.push("schemaVersion must equal 1");
  if (policy?.id !== expectedId || !SOURCE_ID.test(policy?.id ?? "")) errors.push(`id must equal ${expectedId}`);
  if (!["manual", "live-local"].includes(policy?.mode)) errors.push("mode must be manual or live-local");
  if (
    typeof policy?.filename !== "string" ||
    basename(policy.filename) !== policy.filename ||
    !SOURCE_EXTENSIONS.has(extname(policy.filename).toLowerCase())
  ) {
    errors.push("filename must be a supported filename without directories");
  }
  const refresh = policy?.refresh;
  if (!refresh || !Number.isInteger(refresh.retainSnapshots) || refresh.retainSnapshots < 0) {
    errors.push("refresh.retainSnapshots must be a non-negative integer");
  }
  if (
    refresh?.maximumAgeHours !== undefined &&
    (typeof refresh.maximumAgeHours !== "number" || refresh.maximumAgeHours < 0)
  ) {
    errors.push("refresh.maximumAgeHours must be a non-negative number");
  }
  const quality = policy?.quality;
  if (!quality || !Number.isInteger(quality.minimumRows) || quality.minimumRows < 0) {
    errors.push("quality.minimumRows must be a non-negative integer");
  }
  for (const field of ["requiredColumns", "uniqueKey"]) {
    if (!Array.isArray(quality?.[field]) || quality[field].some((value) => typeof value !== "string" || !value)) {
      errors.push(`quality.${field} must be an array of non-empty strings`);
    }
  }
  if (quality?.failOnFormulaErrors !== undefined && typeof quality.failOnFormulaErrors !== "boolean") {
    errors.push("quality.failOnFormulaErrors must be boolean");
  }
  if (
    quality?.maximumRowDecreasePercent !== undefined &&
    (typeof quality.maximumRowDecreasePercent !== "number" ||
      quality.maximumRowDecreasePercent < 0 ||
      quality.maximumRowDecreasePercent > 100)
  ) {
    errors.push("quality.maximumRowDecreasePercent must be between 0 and 100");
  }
  if (errors.length) {
    throw new CliError("SOURCE_POLICY_INVALID", `Source policy for ${expectedId} is invalid: ${errors.join("; ")}.`, {
      exitCode: EXIT_VALIDATION,
      details: { errors },
    });
  }
}
