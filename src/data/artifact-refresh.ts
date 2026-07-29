import { copyFile, lstat, mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { CliError, EXIT_UNSAFE_OPERATION, EXIT_VALIDATION } from "../../cli/errors.js";
import { hashFile } from "../files/hash.js";
import { assertPathInsideWorkspace } from "../files/paths.js";
import { writeFileAtomic } from "../files/output.js";
import { scanWorkspaceLibrary } from "../library/scan.js";
import { findArtifact } from "../resolution/find-artifact.js";
import { loadDataset } from "./load.js";
import { extractRecipeSource } from "./recipes.js";
import { writeDataset } from "./write.js";
import { validateDocument } from "../validation/contracts.js";
import type { LibraryEntry, LibraryScan } from "../library/types.js";

const SOURCE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KINDS = new Set(["dashboard", "presentation", "concept"]);
const SOURCE_EXTENSIONS = new Set([".xlsx", ".xlsm", ".csv", ".json", ".ndjson", ".jsonl"]);
const MAX_SOURCE_BYTES = 100 * 1024 * 1024;
const FORMULA_ERRORS = new Set([
  "#CALC!",
  "#DIV/0!",
  "#N/A",
  "#NAME?",
  "#NULL!",
  "#NUM!",
  "#REF!",
  "#SPILL!",
  "#VALUE!",
]);

export type AcquisitionMode = "manual" | "live-local";

export interface StageArtifactSourceOptions {
  artifactId: string;
  kind: string;
  sourceId: string;
  workspaceRoot: string;
  sourcePath: string;
  mode?: AcquisitionMode;
  force?: boolean;
  history?: boolean;
  maxBytes?: number;
  stabilityDelayMs?: number;
}

export interface StageArtifactSourceResult {
  artifact: { id: string; kind: string };
  sourceId: string;
  mode: string;
  originalPath: string;
  originalFilename: string;
  stagedPath: string;
  sizeBytes: number;
  sourceModifiedAt: string;
  hash: string;
  changed: boolean;
}

export interface SourcePolicy {
  schemaVersion: number;
  id: string;
  mode: string;
  filename: string;
  refresh?: {
    expectedFrequency?: string;
    maximumAgeHours?: number;
    retainSnapshots?: number;
  };
  quality?: QualityPolicy;
}

export interface QualityPolicy {
  minimumRows?: number;
  requiredColumns?: string[];
  uniqueKey?: string[];
  failOnFormulaErrors?: boolean;
  maximumRowDecreasePercent?: number;
}

export function validateSourcePolicy(policy: unknown, expectedId: string): asserts policy is SourcePolicy {
  if (!policy || typeof policy !== "object") {
    throw new Error("Source policy must be an object.");
  }
  const typed = policy as SourcePolicy;
  if (typed.id !== expectedId) {
    throw new Error("Source policy id does not match: " + (typed.id ?? "(missing)") + " vs " + expectedId + ".");
  }
}

export async function stageArtifactSource(options: StageArtifactSourceOptions): Promise<StageArtifactSourceResult> {
  validateIdentity(options);
  const artifact = await resolveArtifact(options);
  const sourcePath = resolve(options.sourcePath);
  const sourceMetadata = await stableSource(sourcePath, options);
  const extension = extname(sourcePath).toLowerCase();

  if (!SOURCE_EXTENSIONS.has(extension)) {
    throw new CliError(
      "UNSUPPORTED_STAGED_SOURCE",
      "Unsupported source format " + (extension || "(none)") + ".",
      { exitCode: EXIT_VALIDATION },
    );
  }
  if (sourceMetadata.size > (options.maxBytes ?? MAX_SOURCE_BYTES)) {
    throw new CliError(
      "SOURCE_TOO_LARGE",
      "Source exceeds the " + (options.maxBytes ?? MAX_SOURCE_BYTES) + " byte limit.",
      { exitCode: EXIT_VALIDATION },
    );
  }

  const sourceDirectory = join(artifact.directory, "data", "source", options.sourceId);
  const policyPath = join(sourceDirectory, "source.json");
  const existingPolicy = (await readJsonIfPresent(policyPath)) as Partial<SourcePolicy> | null;
  if (existingPolicy) validateSourcePolicy(existingPolicy, options.sourceId);
  const filename = existingPolicy?.filename ?? "current" + extension;
  if (extname(filename).toLowerCase() !== extension) {
    throw new CliError(
      "SOURCE_FORMAT_CHANGED",
      "Source " + options.sourceId + " expects " + extname(filename) + " but received " + extension + ".",
      { exitCode: EXIT_VALIDATION },
    );
  }

  const currentPath = join(sourceDirectory, filename);
  await assertPathInsideWorkspace(currentPath, options.workspaceRoot, { mustExist: false });
  await mkdir(sourceDirectory, { recursive: true });
  const temporaryPath = join(sourceDirectory, ".incoming-" + process.pid + "-" + Date.now() + extension);

  try {
    await copyFile(sourcePath, temporaryPath);
    const copiedMetadata = await stat(temporaryPath);
    if (copiedMetadata.size !== sourceMetadata.size) {
      throw new CliError(
        "SOURCE_CHANGED_DURING_COPY",
        "The source changed while it was being copied; retry when the file is idle.",
        { exitCode: EXIT_VALIDATION },
      );
    }

    const incomingHash = (await hashFile(temporaryPath, { workspaceRoot: options.workspaceRoot })).hash;
    const currentHash = await hashIfPresent(currentPath, options.workspaceRoot);
    if (currentHash === incomingHash && !options.force) {
      return stageResult({ artifact, options, currentPath, sourcePath, sourceMetadata, incomingHash, changed: false });
    }

    if (currentHash && options.history !== false) {
      const historyDirectory = join(sourceDirectory, "history");
      await mkdir(historyDirectory, { recursive: true });
      const historyPath = join(
        historyDirectory,
        timestampForPath() + "-" + currentHash.slice(0, 12) + extension,
      );
      await rename(currentPath, historyPath);
      await pruneHistory(historyDirectory, existingPolicy?.refresh?.retainSnapshots ?? 3);
    } else {
      await rm(currentPath, { force: true });
    }

    await rename(temporaryPath, currentPath);
    const policy = (existingPolicy as SourcePolicy | null) ?? defaultSourcePolicy(options.sourceId, filename, options.mode ?? "manual");
    if (!existingPolicy) {
      await writeFileAtomic(policyPath, JSON.stringify(policy, null, 2) + "\n", {
        workspaceRoot: options.workspaceRoot,
        overwrite: false,
        encoding: "utf8",
      });
    }
    const snapshot = {
      schemaVersion: 1,
      sourceId: options.sourceId,
      acquisitionMode: options.mode ?? policy.mode,
      originalFilename: basename(sourcePath),
      sourceModifiedAt: sourceMetadata.mtime.toISOString(),
      stagedAt: new Date().toISOString(),
      sizeBytes: Number(sourceMetadata.size),
      sourceHash: incomingHash,
    };
    await writeFileAtomic(join(sourceDirectory, "snapshot.json"), JSON.stringify(snapshot, null, 2) + "\n", {
      workspaceRoot: options.workspaceRoot,
      overwrite: true,
      encoding: "utf8",
    });

    return stageResult({ artifact, options, currentPath, sourcePath, sourceMetadata, incomingHash, changed: true });
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

export async function syncArtifactSource(options: StageArtifactSourceOptions): Promise<StageArtifactSourceResult> {
  validateIdentity(options);
  const artifact = await resolveArtifact(options);
  const localConfigPath = resolve(options.workspaceRoot, ".mydash-local", "sources.json");
  const localConfig = (await readRequiredJson(localConfigPath, "LOCAL_SOURCE_CONFIG_MISSING")) as Record<string, { path?: string }>;
  const configured = localConfig[options.sourceId];
  if (!configured?.path || typeof configured.path !== "string") {
    throw new CliError(
      "LIVE_SOURCE_NOT_CONFIGURED",
      "No local path is configured for source " + options.sourceId + " in .mydash-local/sources.json.",
      { exitCode: EXIT_VALIDATION },
    );
  }
  if (!isAbsolute(configured.path)) {
    throw new CliError(
      "LIVE_SOURCE_PATH_NOT_ABSOLUTE",
      "Live source " + options.sourceId + " must use an absolute path in .mydash-local/sources.json.",
      { exitCode: EXIT_VALIDATION },
    );
  }
  const policy = (await readRequiredJson(
    join(artifact.directory, "data", "source", options.sourceId, "source.json"),
    "SOURCE_POLICY_MISSING",
  )) as SourcePolicy;
  validateSourcePolicy(policy, options.sourceId);
  if (policy.mode !== "live-local") {
    throw new CliError(
      "SOURCE_MODE_MISMATCH",
      "Source " + options.sourceId + " is " + policy.mode + ", not live-local.",
      { exitCode: EXIT_VALIDATION },
    );
  }
  return stageArtifactSource({ ...options, sourcePath: configured.path, mode: "live-local" });
}

export interface RefreshArtifactDataOptions {
  artifactId: string;
  kind: string;
  workspaceRoot: string;
  toolVersion: string;
  maxBytes?: number;
  failOnWarning?: boolean;
}

export interface RefreshArtifactDataResult {
  schemaVersion: 1;
  artifact: { kind: string; id: string };
  state: "current" | "failed";
  lastAttemptAt: string;
  lastSuccessAt: string | null;
  datasets: {
    recipe: string;
    source: string;
    output: string;
    provenance: string;
    rowCount: number;
    warnings: { code: string; message: string }[];
    quality: QualityEvaluation;
  }[];
  error?: { code: string; message: string };
}

export interface QualityCheck {
  id: string;
  passed: boolean;
  [extension: string]: unknown;
}

export interface QualityEvaluation {
  valid: boolean;
  checks: QualityCheck[];
}

export interface ArtifactDataStatusOptions {
  artifactId: string;
  kind: string;
  workspaceRoot: string;
}

export interface ArtifactSourceStatus {
  id: string;
  mode: string;
  path: string;
  present: boolean;
  modifiedAt: string | null;
  hash: string | null;
  originalFilename: string | null;
  stagedAt: string | null;
  ageHours: number | null;
  freshness: "missing" | "stale" | "current";
}

export interface ArtifactDataStatusResult {
  schemaVersion: 1;
  artifact: { kind: string; id: string };
  state: string;
  lastAttemptAt?: string;
  lastSuccessAt?: string | null;
  datasets?: unknown[];
  statusPath: string;
  sources?: ArtifactSourceStatus[];
  error?: { code: string; message: string };
}

export async function refreshArtifactData(options: RefreshArtifactDataOptions): Promise<RefreshArtifactDataResult> {
  validateArtifactOptions(options);
  return withArtifactLock(options, async () => {
    const artifact = await resolveArtifact(options);
    const recipeDirectory = join(artifact.directory, "recipes");
    const recipeFiles = await jsonFiles(recipeDirectory);
    if (recipeFiles.length === 0) {
      throw new CliError(
        "ARTIFACT_RECIPES_MISSING",
        "No recipes were found for " + options.kind + ":" + options.artifactId + ".",
        { exitCode: EXIT_VALIDATION },
      );
    }

    type Attempt = {
      recipe: Record<string, unknown>;
      recipePath: string;
      sourcePath: string;
      outputPath: string;
      temporaryOutput: string;
      output: { path: string; displayPath: string; format: string; rowCount: number; bytes: number };
      quality: QualityEvaluation;
      warnings: { code: string; message: string }[];
      provenancePath?: string;
      temporaryProvenance?: string;
      provenance?: Record<string, unknown>;
    };

    const attempts: Attempt[] = [];
    const attemptedAt = new Date().toISOString();
    try {
      for (const recipePath of recipeFiles) {
        const recipe = (await readRequiredJson(recipePath, "RECIPE_INVALID_JSON")) as Record<string, unknown>;
        const recipeValidation = validateDocument("dataRecipe", recipe);
        if (!recipeValidation.ok) {
          throw new CliError(
            "RECIPE_CONTRACT_INVALID",
            "Recipe " + relativePath(options.workspaceRoot, recipePath) + " is invalid.",
            { exitCode: EXIT_VALIDATION, details: recipeValidation.errors },
          );
        }
        const sourceRecord = recipe.source as Record<string, unknown>;
        const outputRecord = recipe.output as Record<string, unknown>;
        const sourcePath = resolve(options.workspaceRoot, (sourceRecord.file as string) ?? "");
        const outputPath = resolve(options.workspaceRoot, (outputRecord.file as string) ?? "");
        await assertPathInsideWorkspace(sourcePath, options.workspaceRoot, { mustExist: true });
        await assertPathInsideWorkspace(outputPath, options.workspaceRoot, { mustExist: false });
        if (!isInside(artifact.directory, sourcePath) || !isInside(artifact.directory, outputPath)) {
          throw new CliError(
            "RECIPE_NOT_ARTIFACT_LOCAL",
            "Recipe " + relative(options.workspaceRoot, recipePath) + " must use source and output paths inside its artefact.",
            { exitCode: EXIT_VALIDATION },
          );
        }

        const extracted = await extractRecipeSource(sourcePath, recipe, { workspaceRoot: options.workspaceRoot });
        const sourcePolicy = await policyForRecipeSource(sourcePath);
        const quality = evaluateQuality(
          extracted.records,
          sourcePolicy.quality ?? {},
          await previousRecords(outputPath, options.workspaceRoot),
        );
        if (!quality.valid) {
          throw new CliError(
            "DATA_QUALITY_FAILED",
            "Quality checks failed for recipe " + (recipe.id as string) + ".",
            { exitCode: EXIT_VALIDATION, details: quality },
          );
        }

        const temporaryOutput = outputPath + ".refresh-" + process.pid + "-" + Date.now();
        const output = await writeDataset(extracted.records, {
          outputPath: temporaryOutput,
          format: outputRecord.format as string,
          overwrite: false,
          workspaceRoot: options.workspaceRoot,
        });
        attempts.push({
          recipe,
          recipePath,
          sourcePath,
          outputPath,
          temporaryOutput,
          output,
          quality,
          warnings: extracted.warnings ?? [],
        });
      }

      const published: RefreshArtifactDataResult["datasets"] = [];
      for (const attempt of attempts) {
        const sourceHash = (await hashFile(attempt.sourcePath, { workspaceRoot: options.workspaceRoot })).hash;
        const recipeHash = (await hashFile(attempt.recipePath, { workspaceRoot: options.workspaceRoot })).hash;
        const outputHash = (await hashFile(attempt.temporaryOutput, { workspaceRoot: options.workspaceRoot })).hash;
        const provenancePath = provenancePathFor(attempt.outputPath);
        const snapshot = (await readJsonIfPresent(join(dirname(attempt.sourcePath), "snapshot.json"))) as Record<string, unknown> | null;
        const provenance = {
          schemaVersion: 2,
          source: relativePath(options.workspaceRoot, attempt.sourcePath),
          sourceId: sourceIdFromPath(attempt.sourcePath),
          sourceHash,
          acquisitionMode: (snapshot?.acquisitionMode as string) ?? "workspace",
          originalFilename: (snapshot?.originalFilename as string) ?? basename(attempt.sourcePath),
          sourceModifiedAt: (snapshot?.sourceModifiedAt as string) ?? (await stat(attempt.sourcePath)).mtime.toISOString(),
          sourceSizeBytes: Number((snapshot?.sizeBytes as number | undefined) ?? (await stat(attempt.sourcePath)).size),
          recipe: relativePath(options.workspaceRoot, attempt.recipePath),
          recipeHash,
          output: relativePath(options.workspaceRoot, attempt.outputPath),
          outputHash,
          rowCount: attempt.output.rowCount,
          generatedAt: new Date().toISOString(),
          command: "mydash data refresh-artifact " + options.artifactId + " --kind " + options.kind,
          toolVersion: options.toolVersion,
          quality: attempt.quality,
        };
        const provenanceValidation = validateDocument("provenance", provenance);
        if (!provenanceValidation.ok) {
          throw new CliError(
            "PROVENANCE_CONTRACT_INVALID",
            "Generated provenance for recipe " + ((attempt.recipe.id as string) ?? "(unknown)") + " is invalid.",
            { exitCode: EXIT_VALIDATION, details: provenanceValidation.errors },
          );
        }
        const temporaryProvenance = provenancePath + ".refresh-" + process.pid + "-" + Date.now();
        await writeFileAtomic(temporaryProvenance, JSON.stringify(provenance, null, 2) + "\n", {
          workspaceRoot: options.workspaceRoot,
          overwrite: false,
          encoding: "utf8",
        });
        attempt.provenancePath = provenancePath;
        attempt.temporaryProvenance = temporaryProvenance;
        attempt.provenance = provenance;
        published.push({
          recipe: attempt.recipe.id as string,
          source: relativePath(options.workspaceRoot, attempt.sourcePath),
          output: relativePath(options.workspaceRoot, attempt.outputPath),
          provenance: relativePath(options.workspaceRoot, provenancePath),
          rowCount: attempt.output.rowCount,
          warnings: attempt.warnings,
          quality: attempt.quality,
        });
      }

      await publishTransaction(attempts);

      const status: RefreshArtifactDataResult = {
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
        await rm(attempt.temporaryOutput, { force: true }).catch(() => undefined);
        if (attempt.temporaryProvenance) {
          await rm(attempt.temporaryProvenance, { force: true }).catch(() => undefined);
        }
      }
      const previous = (await readJsonIfPresent(join(artifact.directory, "data", "refresh-status.json"))) as Record<string, unknown> | null;
      const failureStatus: RefreshArtifactDataResult = {
        schemaVersion: 1,
        artifact: { kind: options.kind, id: options.artifactId },
        state: "failed",
        lastAttemptAt: attemptedAt,
        lastSuccessAt: (previous?.lastSuccessAt as string) ?? null,
        datasets: (previous?.datasets as RefreshArtifactDataResult["datasets"]) ?? [],
        error: {
          code: (error as { code?: string }).code ?? "REFRESH_FAILED",
          message: error instanceof Error ? error.message : String(error),
        },
      };
      await writeRefreshStatus(artifact, failureStatus, options.workspaceRoot);
      throw error;
    }
  });
}

export async function artifactDataStatus(options: ArtifactDataStatusOptions): Promise<ArtifactDataStatusResult> {
  validateArtifactOptions(options);
  const artifact = await resolveArtifact(options);
  const statusPath = join(artifact.directory, "data", "refresh-status.json");
  const value = (await readJsonIfPresent(statusPath)) as Record<string, unknown> | null;
  if (!value) {
    return {
      schemaVersion: 1,
      artifact: { kind: options.kind, id: options.artifactId },
      state: "never-refreshed",
      statusPath: relativePath(options.workspaceRoot, statusPath),
    };
  }

  const sources: ArtifactSourceStatus[] = [];
  for (const directory of await directories(join(artifact.directory, "data", "source"))) {
    const policy = (await readJsonIfPresent(join(directory, "source.json"))) as SourcePolicy | null;
    if (!policy) continue;
    const currentPath = join(directory, policy.filename);
    const metadata = await statOrNull(currentPath);
    const snapshot = (await readJsonIfPresent(join(directory, "snapshot.json"))) as Record<string, unknown> | null;
    const ageHours = metadata ? (Date.now() - Number(metadata.mtimeMs)) / 3_600_000 : null;
    const maximumAgeHours = policy.refresh?.maximumAgeHours ?? null;
    sources.push({
      id: policy.id,
      mode: policy.mode,
      path: relativePath(options.workspaceRoot, currentPath),
      present: Boolean(metadata),
      modifiedAt: metadata?.mtime.toISOString() ?? null,
      hash: metadata ? (await hashFile(currentPath, { workspaceRoot: options.workspaceRoot })).hash : null,
      originalFilename: (snapshot?.originalFilename as string) ?? null,
      stagedAt: (snapshot?.stagedAt as string) ?? null,
      ageHours,
      freshness: ageHours === null ? "missing" : maximumAgeHours !== null && ageHours > maximumAgeHours ? "stale" : "current",
    });
  }
  return {
    schemaVersion: 1,
    artifact: { kind: options.kind, id: options.artifactId },
    state: (value.state as string) ?? "unknown",
    lastAttemptAt: value.lastAttemptAt as string | undefined,
    lastSuccessAt: (value.lastSuccessAt as string | null | undefined) ?? null,
    datasets: (value.datasets as unknown[]) ?? [],
    error: value.error as { code: string; message: string } | undefined,
    statusPath: relativePath(options.workspaceRoot, statusPath),
    sources,
  } as ArtifactDataStatusResult;
}

function evaluateQuality(
  records: readonly Record<string, unknown>[],
  policy: QualityPolicy,
  previous: readonly Record<string, unknown>[] | null,
): QualityEvaluation {
  const columns = new Set(records.flatMap((record) => Object.keys(record)));
  const checks: QualityCheck[] = [];
  const minimumRowsPassed = records.length >= (policy.minimumRows ?? 0);
  checks.push({
    id: "minimum-rows",
    passed: minimumRowsPassed,
    expected: policy.minimumRows ?? 0,
    actual: records.length,
  });
  const missingColumns = (policy.requiredColumns ?? []).filter((column) => !columns.has(column));
  checks.push({
    id: "required-columns",
    passed: missingColumns.length === 0,
    missingColumns,
  });
  const keys = policy.uniqueKey ?? [];
  let duplicateKeys = 0;
  if (keys.length) {
    const seen = new Set<string>();
    for (const record of records) {
      const value = JSON.stringify(keys.map((key) => record[key] ?? null));
      if (seen.has(value)) duplicateKeys += 1;
      seen.add(value);
    }
  }
  checks.push({
    id: "unique-key",
    passed: duplicateKeys === 0,
    keys,
    duplicateKeys,
  });
  const formulaErrors = policy.failOnFormulaErrors === false
    ? []
    : records.flatMap((record, row) =>
        Object.entries(record)
          .filter(([, value]) => FORMULA_ERRORS.has(formulaErrorText(value)))
          .map(([column, value]) => ({ row: row + 1, column, value })),
      );
  checks.push({
    id: "formula-errors",
    passed: formulaErrors.length === 0,
    count: formulaErrors.length,
    samples: formulaErrors.slice(0, 10),
  });
  if (previous && policy.maximumRowDecreasePercent !== undefined && previous.length > 0) {
    const decrease = Math.max(0, ((previous.length - records.length) / previous.length) * 100);
    checks.push({
      id: "row-decrease",
      passed: decrease <= policy.maximumRowDecreasePercent,
      maximumPercent: policy.maximumRowDecreasePercent,
      actualPercent: decrease,
    });
  }
  return { valid: checks.every((item) => item.passed), checks };
}

function formulaErrorText(value: unknown): string {
  if (value && typeof value === "object" && typeof (value as { error?: unknown }).error === "string") {
    return ((value as { error: string }).error).toUpperCase();
  }
  return String(value).toUpperCase();
}

async function stableSource(path: string, options: StageArtifactSourceOptions): Promise<Awaited<ReturnType<typeof stat>>> {
  const firstLink = await lstat(path);
  if (firstLink.isSymbolicLink() || !firstLink.isFile()) {
    throw new CliError(
      "INVALID_SOURCE_FILE",
      "Source must be a regular, non-symbolic-link file: " + path,
      { exitCode: EXIT_UNSAFE_OPERATION },
    );
  }
  const delay = options.stabilityDelayMs ?? 250;
  if (delay > 0) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, delay));
  }
  const second = await stat(path);
  if (firstLink.size !== second.size || firstLink.mtimeMs !== second.mtimeMs) {
    throw new CliError(
      "SOURCE_NOT_STABLE",
      "The source is still changing; retry after it has finished saving.",
      { exitCode: EXIT_VALIDATION },
    );
  }
  return second;
}

async function withArtifactLock<T>(options: RefreshArtifactDataOptions, callback: () => Promise<T>): Promise<T> {
  const lock = join(options.workspaceRoot, ".my-dashboards", "locks", "data-" + options.kind + "-" + options.artifactId + ".lock");
  await mkdir(dirname(lock), { recursive: true });
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(lock, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new CliError(
        "DATA_REFRESH_LOCKED",
        "A refresh is already running for " + options.kind + ":" + options.artifactId + ".",
        { exitCode: EXIT_UNSAFE_OPERATION },
      );
    }
    throw error;
  }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + "\n");
    return await callback();
  } finally {
    await handle.close().catch(() => undefined);
    await rm(lock, { force: true }).catch(() => undefined);
  }
}

async function resolveArtifact(options: { workspaceRoot: string; artifactId: string; kind: string }): Promise<LibraryEntry> {
  const scan: LibraryScan = await scanWorkspaceLibrary(options.workspaceRoot);
  return findArtifact(scan, options.artifactId, options.kind) as unknown as LibraryEntry;
}

function validateIdentity(options: { artifactId?: string; kind?: string; sourceId?: string }): void {
  validateArtifactOptions(options);
  if (!SOURCE_ID.test(options.sourceId ?? "")) {
    throw new CliError("INVALID_SOURCE_ID", "Source ID must be kebab-case.", { exitCode: 2 });
  }
}

function validateArtifactOptions(options: { artifactId?: string; kind?: string }): void {
  if (!KINDS.has(options.kind ?? "")) {
    throw new CliError("INVALID_ARTIFACT_KIND", "Kind must be dashboard, presentation or concept.", { exitCode: 2 });
  }
  if (!SOURCE_ID.test(options.artifactId ?? "")) {
    throw new CliError("INVALID_ARTIFACT_ID", "Artefact ID must be kebab-case.", { exitCode: 2 });
  }
}

function defaultSourcePolicy(id: string, filename: string, mode: string): SourcePolicy {
  return {
    schemaVersion: 1,
    id,
    mode,
    filename,
    refresh: { expectedFrequency: "on-demand", maximumAgeHours: 168, retainSnapshots: 3 },
    quality: { minimumRows: 1, requiredColumns: [], uniqueKey: [], failOnFormulaErrors: true },
  };
}

async function policyForRecipeSource(sourcePath: string): Promise<SourcePolicy & { quality: QualityPolicy }> {
  const policy = (await readJsonIfPresent(join(dirname(sourcePath), "source.json"))) as SourcePolicy | null;
  if (policy) validateSourcePolicy(policy, sourceIdFromPath(sourcePath));
  return policy ? { ...policy, quality: policy.quality ?? {} } : { schemaVersion: 1, id: sourceIdFromPath(sourcePath), mode: "manual", filename: "", quality: {} };
}

async function previousRecords(path: string, workspaceRoot: string): Promise<Record<string, unknown>[] | null> {
  if (!(await statOrNull(path))) return null;
  return (await loadDataset(path, { workspaceRoot })).records;
}

async function writeRefreshStatus(artifact: LibraryEntry, value: RefreshArtifactDataResult | RefreshArtifactDataResult & { error: { code: string; message: string } }, workspaceRoot: string): Promise<void> {
  await writeFileAtomic(join(artifact.directory, "data", "refresh-status.json"), JSON.stringify(value, null, 2) + "\n", {
    workspaceRoot,
    overwrite: true,
    encoding: "utf8",
  });
}

function stageResult({ artifact, options, currentPath, sourcePath, sourceMetadata, incomingHash, changed }: {
  artifact: LibraryEntry;
  options: StageArtifactSourceOptions;
  currentPath: string;
  sourcePath: string;
  sourceMetadata: Awaited<ReturnType<typeof stat>>;
  incomingHash: string;
  changed: boolean;
}): StageArtifactSourceResult {
  const sizeValue = typeof sourceMetadata.size === "bigint" ? Number(sourceMetadata.size) : sourceMetadata.size;
  return {
    artifact: { kind: artifact.kind, id: artifact.id },
    sourceId: options.sourceId,
    mode: options.mode ?? "manual",
    originalPath: sourcePath,
    originalFilename: basename(sourcePath),
    stagedPath: relativePath(options.workspaceRoot, currentPath),
    sizeBytes: sizeValue,
    sourceModifiedAt: sourceMetadata.mtime.toISOString(),
    hash: incomingHash,
    changed,
  };
}

async function readRequiredJson(path: string, code: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new CliError(
      code,
      "Could not read JSON file " + path + ": " + (error instanceof Error ? error.message : String(error)),
      { exitCode: EXIT_VALIDATION },
    );
  }
}

async function readJsonIfPresent(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function hashIfPresent(path: string, workspaceRoot: string): Promise<string | null> {
  return (await statOrNull(path)) ? (await hashFile(path, { workspaceRoot })).hash : null;
}

async function statOrNull(path: string): Promise<Awaited<ReturnType<typeof stat>> | null> {
  try {
    return await stat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function jsonFiles(path: string): Promise<string[]> {
  try {
    return (await readdir(path, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => join(path, entry.name))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function directories(path: string): Promise<string[]> {
  try {
    return (await readdir(path, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(path, entry.name))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function pruneHistory(directory: string, retain: number): Promise<void> {
  const files = (await readdir(directory)).sort().reverse();
  for (const file of files.slice(Math.max(0, retain))) {
    await rm(join(directory, file), { force: true });
  }
}

type AttemptMeta = {
  temporaryOutput: string;
  outputPath: string;
  temporaryProvenance?: string;
  provenancePath?: string;
};

async function publishTransaction(attempts: AttemptMeta[]): Promise<void> {
  const moved: Array<{ target: string; backup: string; existed: boolean }> = [];
  try {
    for (const attempt of attempts) {
      for (const [temporary, target] of [
        [attempt.temporaryOutput, attempt.outputPath],
        [attempt.temporaryProvenance, attempt.provenancePath],
      ] as const) {
        if (!temporary || !target) continue;
        const backup = target + ".previous-" + process.pid + "-" + Date.now();
        const existed = Boolean(await statOrNull(target));
        if (existed) await rename(target, backup);
        try {
          await rename(temporary, target);
        } catch (error) {
          if (existed) await rename(backup, target).catch(() => undefined);
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
      await rm(item.target, { force: true }).catch(() => undefined);
      if (item.existed) await rename(item.backup, item.target).catch(() => undefined);
    }
    throw error;
  }
}

function sourceIdFromPath(path: string): string {
  return basename(dirname(path));
}

function provenancePathFor(outputPath: string): string {
  const extension = extname(outputPath);
  return extension
    ? outputPath.slice(0, -extension.length) + ".provenance.json"
    : outputPath + ".provenance.json";
}

function timestampForPath(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function relativePath(root: string, path: string): string {
  return relative(root, path).replaceAll("\\", "/");
}

function isInside(root: string, path: string): boolean {
  const value = relative(resolve(root), resolve(path));
  return value === "" || (!value.startsWith("..") && !value.startsWith("/"));
}
