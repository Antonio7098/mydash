import { extname, relative, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { validateDocument } from "../validation/contracts.js";
import { writeFileAtomic } from "../files/output.js";
import { hashFile } from "../files/hash.js";
import { loadPackageMetadata } from "../workspace/package-metadata.js";
import {
  extractTable,
  extractWorksheet,
} from "../office/excel.js";
import { readPresentation } from "../office/powerpoint.js";
import { loadDataset } from "./load.js";
import { writeDataset } from "./write.js";

export interface CreateRecipeOptions {
  id: string;
  workspaceRoot: string;
  sourcePath: string;
  sourceType?: string;
  sheet?: string;
  table?: string;
  range?: string;
  outputPath: string;
  outputFormat?: string;
  outputOverwrite?: boolean;
  recipePath: string;
  overwrite?: boolean;
}

export interface CreateRecipeResult {
  path: string;
  displayPath: string;
  recipe: Record<string, unknown>;
}

export async function createRecipe(
  options: CreateRecipeOptions,
): Promise<CreateRecipeResult> {
  const recipe = {
    schemaVersion: 1,
    id: options.id,
    source: {
      type:
        options.sourceType ?? inferRecipeSourceType(options.sourcePath),
      file: workspaceRelative(options.sourcePath, options.workspaceRoot),
      ...(options.sheet ? { sheet: options.sheet } : {}),
      ...(options.table ? { table: options.table } : {}),
      ...(options.range ? { range: options.range } : {}),
    },
    output: {
      file: normaliseWorkspaceRelative(options.outputPath),
      format:
        options.outputFormat ?? inferOutputFormat(options.outputPath),
      overwrite: options.outputOverwrite ?? false,
    },
  };

  const validation = validateDocument("dataRecipe", recipe);

  if (!validation.ok) {
    throw new Error(
      `Recipe is invalid: ${validation.errors
        .map((error) => `${error.path}: ${error.message}`)
        .join("; ")}`,
    );
  }

  const path = await writeFileAtomic(
    options.recipePath,
    `${JSON.stringify(recipe, null, 2)}\n`,
    {
      workspaceRoot: options.workspaceRoot,
      overwrite: options.overwrite ?? false,
      encoding: "utf8",
    },
  );

  return {
    path,
    displayPath: workspaceRelative(path, options.workspaceRoot),
    recipe,
  };
}

export interface RefreshRecipeOptions {
  workspaceRoot: string;
  overwrite?: boolean;
  provenance?: boolean;
}

export interface RefreshRecipeResult {
  recipe: string | null;
  source: string;
  rowCount: number;
  output: { path: string; displayPath: string };
  provenance: { path: string; displayPath: string; value: Record<string, unknown> } | null;
  warnings: { code: string; message: string }[];
}

export async function refreshRecipe(
  recipePath: string,
  options: RefreshRecipeOptions,
): Promise<RefreshRecipeResult> {
  const source = await readFile(recipePath, "utf8");
  let recipe: Record<string, unknown>;
  try {
    recipe = JSON.parse(source);
  } catch (error) {
    throw new Error(`Recipe JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }

  const validation = validateDocument("dataRecipe", recipe);

  if (!validation.ok) {
    throw new Error(
      `Recipe is invalid: ${validation.errors
        .map((error) => `${error.path}: ${error.message}`)
        .join("; ")}`,
    );
  }

  const sourcePath = resolve(options.workspaceRoot, (recipe.source as Record<string, unknown>).file as string);
  const outputPath = resolve(options.workspaceRoot, (recipe.output as Record<string, unknown>).file as string);
  const extracted = await extractRecipeSource(sourcePath, recipe, options);
  const overwrite = options.overwrite ?? ((recipe.output as Record<string, unknown>).overwrite as boolean | undefined) ?? false;
  const output = await writeDataset(extracted.records, {
    outputPath,
    format: (recipe.output as Record<string, unknown>).format as string,
    overwrite,
    workspaceRoot: options.workspaceRoot,
  });
  const warnings = [...(extracted.warnings ?? [])];
  let provenance: RefreshRecipeResult["provenance"] = null;

  if (options.provenance !== false) {
    provenance = await writeProvenance({
      recipePath,
      sourcePath,
      outputPath,
      workspaceRoot: options.workspaceRoot,
      overwrite: true,
    });
  }

  return {
    recipe: (recipe.id as string) ?? null,
    source: workspaceRelative(sourcePath, options.workspaceRoot),
    rowCount: extracted.records.length,
    output: {
      path: output.path,
      displayPath: output.displayPath,
    },
    provenance,
    warnings,
  };
}

export interface ExtractRecipeSourceResult {
  records: Record<string, unknown>[];
  warnings: { code: string; message: string }[];
}

export async function extractRecipeSource(
  sourcePath: string,
  recipe: Record<string, unknown>,
  options: { workspaceRoot: string },
): Promise<ExtractRecipeSourceResult> {
  const source = recipe.source as Record<string, unknown>;

  if (source.type === "excel") {
    const result = source.table
      ? await extractTable(sourcePath, source.table as string, {
          workspaceRoot: options.workspaceRoot,
          header: true,
        })
      : await extractWorksheet(sourcePath, {
          workspaceRoot: options.workspaceRoot,
          sheet: source.sheet as string | undefined,
          range: source.range as string | undefined,
          header: true,
        });

    return {
      records: result.records,
      warnings: [],
    };
  }

  if (source.type === "powerpoint") {
    const result = await readPresentation(sourcePath, {
      workspaceRoot: options.workspaceRoot,
    });

    return {
      records: result.slides.map((slide) => ({
        number: slide.number,
        title: slide.title,
        text: slide.text.join("\n"),
        notes: slide.notes.join("\n"),
        hidden: slide.hidden,
        imageCount: slide.images.length,
        chartCount: slide.charts.length,
        tableCount: slide.tableCount,
      })),
      warnings: [],
    };
  }

  const dataset = await loadDataset(sourcePath, {
    workspaceRoot: options.workspaceRoot,
  });

  return {
    records: dataset.records,
    warnings: dataset.warnings,
  };
}

async function writeProvenance(options: {
  recipePath: string;
  sourcePath: string;
  outputPath: string;
  workspaceRoot: string;
  overwrite?: boolean;
}): Promise<RefreshRecipeResult["provenance"]> {
  const sourceHash = await hashFile(options.sourcePath, {
    algorithm: "sha256",
    workspaceRoot: options.workspaceRoot,
  });
  const metadata = await loadPackageMetadata(options.workspaceRoot);
  const provenance = {
    schemaVersion: 1,
    source: workspaceRelative(options.sourcePath, options.workspaceRoot),
    sourceHash: sourceHash.hash,
    generatedAt: new Date().toISOString(),
    command: `mydash data refresh ${workspaceRelative(options.recipePath, options.workspaceRoot)}`,
    toolVersion: metadata.version,
  };
  const validation = validateDocument("provenance", provenance);

  if (!validation.ok) {
    throw new Error(
      `Generated provenance is invalid: ${validation.errors
        .map((error) => `${error.path}: ${error.message}`)
        .join("; ")}`,
    );
  }

  const provenancePath = provenancePathFor(options.outputPath);
  await writeFileAtomic(
    provenancePath,
    `${JSON.stringify(provenance, null, 2)}\n`,
    {
      workspaceRoot: options.workspaceRoot,
      overwrite: options.overwrite ?? true,
      encoding: "utf8",
    },
  );

  return {
    path: provenancePath,
    displayPath: workspaceRelative(provenancePath, options.workspaceRoot),
    value: provenance,
  };
}

function inferRecipeSourceType(path: string): string {
  const extension = extname(path).toLowerCase();

  if ([".xlsx", ".xlsm"].includes(extension)) return "excel";
  if ([".pptx", ".pptm"].includes(extension)) return "powerpoint";
  if (extension === ".csv") return "csv";
  if ([".json", ".ndjson", ".jsonl"].includes(extension)) return "json";

  throw new Error(
    `Cannot infer recipe source type from ${extension || "(no extension)"}.`,
  );
}

function inferOutputFormat(path: string): string {
  const extension = extname(path).toLowerCase().replace(/^\./, "");
  return ["csv", "json", "ndjson"].includes(extension)
    ? extension
    : "json";
}

function provenancePathFor(outputPath: string): string {
  const extension = extname(outputPath);
  return extension
    ? `${outputPath.slice(0, -extension.length)}.provenance.json`
    : `${outputPath}.provenance.json`;
}

function workspaceRelative(path: string, workspaceRoot: string): string {
  const value = relative(workspaceRoot, path).replaceAll("\\", "/");

  if (value.startsWith("..")) {
    throw new Error(`Path is outside the workspace: ${path}`);
  }

  return value || ".";
}

function normaliseWorkspaceRelative(path: string): string {
  const value = String(path).replaceAll("\\", "/").replace(/^\/+/, "");

  if (!value || value.split("/").includes("..") || /^[A-Za-z]:/.test(value)) {
    throw new Error(`Output path must be workspace-relative: ${path}`);
  }

  return value;
}