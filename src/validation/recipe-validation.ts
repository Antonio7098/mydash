import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { validateDocument } from "./contracts.js";
import { assertPathInsideWorkspace, isPathInside } from "../files/paths.js";
import {
  extractTable,
  extractWorksheet,
} from "../office/excel.js";
import {
  readPresentation,
} from "../office/powerpoint.js";
import {
  loadDataset,
} from "../data/load.js";
import type { LibraryEntry } from "../library/types.js";

const SOURCE_EXTENSIONS: Record<string, Set<string>> = {
  excel: new Set([".xlsx", ".xlsm"]),
  powerpoint: new Set([".pptx", ".pptm"]),
  csv: new Set([".csv"]),
  json: new Set([".json", ".ndjson", ".jsonl"]),
};

export interface RecipeValidationReport {
  path: string;
  displayPath: string;
  id: string | null;
  recipe: unknown;
  source: {
    path: string | null;
    displayPath: string;
    type: string | null;
    valid: boolean;
  };
  output: {
    path: string | null;
    displayPath: string;
    format: string | null;
    valid: boolean;
  };
  execution: {
    rowCount: number;
    sourceType: string;
    warnings?: unknown[];
  } | null;
  issues: { severity: "error" | "warning"; code: string; message: string; [extension: string]: unknown }[];
  valid: boolean;
  errorCount: number;
  warningCount: number;
}

export async function discoverRecipeFiles(
  workspaceRoot: string,
  artifacts: readonly LibraryEntry[] = [],
): Promise<string[]> {
  const roots = [
    resolve(workspaceRoot, "recipes"),
    ...artifacts.map((artifact) =>
      resolve(artifact.directory, "recipes"),
    ),
  ];
  const files: string[] = [];
  const seen = new Set<string>();

  for (const root of roots) {
    const metadata = await safeLstat(root);
    if (!metadata?.isDirectory()) continue;

    await walk(root);
  }

  return files.sort((left, right) =>
    left.localeCompare(right, "en"),
  );

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, {
      withFileTypes: true,
    });
    entries.sort((left, right) =>
      left.name.localeCompare(right.name, "en"),
    );

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;

      const path = join(directory, entry.name);
      const metadata = await lstat(path);

      if (metadata.isSymbolicLink()) continue;

      if (metadata.isDirectory()) {
        await walk(path);
        continue;
      }

      if (
        metadata.isFile() &&
        entry.name.toLowerCase().endsWith(".json")
      ) {
        const canonical = await realpath(path);
        if (!seen.has(canonical)) {
          seen.add(canonical);
          files.push(canonical);
        }
      }
    }
  }
}

export interface ValidateRecipeFileOptions {
  workspaceRoot: string;
  execute?: boolean;
}

export async function validateRecipeFile(
  recipePath: string,
  options: ValidateRecipeFileOptions,
): Promise<RecipeValidationReport> {
  const issues: RecipeValidationReport["issues"] = [];
  let recipe: unknown = null;

  try {
    recipe = JSON.parse(
      await readFile(recipePath, "utf8"),
    );
  } catch (error) {
    issues.push(
      createIssue(
        "error",
        "RECIPE_INVALID_JSON",
        `Recipe is not valid JSON: ${displayPath(
          recipePath,
          options.workspaceRoot,
        )}: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );

    return result();
  }

  const contract = validateDocument("dataRecipe", recipe);

  for (const validationError of contract.errors) {
    issues.push(
      createIssue(
        "error",
        "RECIPE_CONTRACT_INVALID",
        `${displayPath(
          recipePath,
          options.workspaceRoot,
        )} ${validationError.path}: ${validationError.message}`,
        {
          validationPath: validationError.path,
        },
      ),
    );
  }

  const source = await validateSource(
    recipe as Record<string, unknown>,
    options.workspaceRoot,
    issues,
  );
  const output = await validateOutput(
    recipe as Record<string, unknown>,
    options.workspaceRoot,
    source?.path ?? null,
    issues,
  );

  validateSelectors(recipe as Record<string, unknown>, issues);

  let execution: RecipeValidationReport["execution"] = null;

  if (
    contract.ok &&
    source?.valid &&
    output?.valid &&
    !issues.some((issue) => issue.severity === "error") &&
    options.execute !== false
  ) {
    execution = await probeRecipe(
      recipe as Record<string, unknown>,
      source.path ?? "",
      options,
      issues,
    );
  }

  return result();

  function result(): RecipeValidationReport {
    const errorCount = issues.filter(
      (issue) => issue.severity === "error",
    ).length;
    const warningCount = issues.filter(
      (issue) => issue.severity === "warning",
    ).length;

  return {
    path: recipePath,
    displayPath: displayPath(recipePath, options.workspaceRoot),
    id: (recipe as { id?: string } | null)?.id ?? null,
    recipe,
    source: source ?? {
      path: null,
      displayPath: "",
      type: null,
      valid: false,
    },
    output: output ?? {
      path: null,
      displayPath: "",
      format: null,
      valid: false,
    },
    execution,
    issues,
    valid: errorCount === 0,
    errorCount,
    warningCount,
  } as unknown as RecipeValidationReport;
}

}

interface SourceValidation {
  path: string | null;
  displayPath: string;
  type: string | null;
  valid: boolean;
}

async function validateSource(
  recipe: Record<string, unknown>,
  workspaceRoot: string,
  issues: RecipeValidationReport["issues"],
): Promise<SourceValidation | null> {
  const source = recipe.source as Record<string, unknown> | undefined;
  const value = source?.file as string | undefined;

  if (typeof value !== "string" || !value) {
    return {
      path: null,
      displayPath: "",
      type: null,
      valid: false,
    };
  }

  if (isAbsolute(value)) {
    issues.push(
      createIssue(
        "error",
        "RECIPE_SOURCE_ABSOLUTE",
        `Recipe source must be workspace-relative: ${value}`,
      ),
    );
    return {
      path: null,
      displayPath: "",
      type: null,
      valid: false,
    };
  }

  const candidate = resolve(workspaceRoot, value);
  const canonicalWorkspace = await realpath(workspaceRoot);
  let canonicalSource: string;

  try {
    canonicalSource = await realpath(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      const stagedSnapshot = value.replaceAll("\\", "/").includes("/data/source/");
      issues.push(
        createIssue(
          stagedSnapshot ? "warning" : "error",
          stagedSnapshot
            ? "RECIPE_SOURCE_SNAPSHOT_MISSING"
            : "RECIPE_SOURCE_MISSING",
          stagedSnapshot
            ? `Workstation-local recipe source snapshot is not present: ${value}`
            : `Recipe source does not exist: ${value}`,
        ),
      );
      return {
        path: candidate,
        displayPath: "",
        type: source?.type as string | null,
        valid: false,
      };
    }

    throw error;
  }

  if (!isPathInside(canonicalWorkspace, canonicalSource)) {
    issues.push(
      createIssue(
        "error",
        "RECIPE_SOURCE_OUTSIDE_WORKSPACE",
        `Recipe source escapes the workspace: ${value}`,
      ),
    );
    return {
      path: canonicalSource,
      displayPath: displayPath(canonicalSource, workspaceRoot),
      type: source?.type as string | null,
      valid: false,
    };
  }

  const metadata = await stat(canonicalSource);

  if (!metadata.isFile()) {
    issues.push(
      createIssue(
        "error",
        "RECIPE_SOURCE_NOT_FILE",
        `Recipe source is not a file: ${value}`,
      ),
    );
    return {
      path: canonicalSource,
      displayPath: displayPath(canonicalSource, workspaceRoot),
      type: source?.type as string | null,
      valid: false,
    };
  }

  const sourceType = source?.type as string | undefined;
  const extension = extname(canonicalSource).toLowerCase();
  const supported = SOURCE_EXTENSIONS[sourceType ?? ""];

  if (!supported || !supported.has(extension)) {
    issues.push(
      createIssue(
        "error",
        "RECIPE_SOURCE_TYPE_MISMATCH",
        `Recipe source type ${sourceType ?? "(missing)"} does not match ${extension || "(no extension)"}.`,
      ),
    );
  }

  return {
    path: canonicalSource,
    displayPath: displayPath(canonicalSource, workspaceRoot),
    type: sourceType ?? null,
    valid: !issues.some(
      (issue) =>
        issue.code.startsWith("RECIPE_SOURCE_") &&
        issue.severity === "error",
    ),
  };
}

interface OutputValidation {
  path: string | null;
  displayPath: string;
  format: string | null;
  valid: boolean;
}

async function validateOutput(
  recipe: Record<string, unknown>,
  workspaceRoot: string,
  sourcePath: string | null,
  issues: RecipeValidationReport["issues"],
): Promise<OutputValidation | null> {
  const output = recipe.output as Record<string, unknown> | undefined;
  const value = output?.file as string | undefined;

  if (typeof value !== "string" || !value) {
    return {
      path: null,
      displayPath: "",
      format: null,
      valid: false,
    };
  }

  if (isAbsolute(value)) {
    issues.push(
      createIssue(
        "error",
        "RECIPE_OUTPUT_ABSOLUTE",
        `Recipe output must be workspace-relative: ${value}`,
      ),
    );
    return {
      path: null,
      displayPath: "",
      format: null,
      valid: false,
    };
  }

  const outputPath = resolve(workspaceRoot, value);

  try {
    await assertPathInsideWorkspace(
      outputPath,
      workspaceRoot,
      { mustExist: false },
    );
  } catch (error) {
    issues.push(
      createIssue(
        "error",
        "RECIPE_OUTPUT_OUTSIDE_WORKSPACE",
        error instanceof Error ? error.message : String(error),
      ),
    );
    return {
      path: outputPath,
      displayPath: displayPath(outputPath, workspaceRoot),
      format: null,
      valid: false,
    };
  }

  if (
    sourcePath &&
    resolve(sourcePath) === resolve(outputPath)
  ) {
    issues.push(
      createIssue(
        "error",
        "RECIPE_OUTPUT_OVERWRITES_SOURCE",
        "Recipe output cannot replace its source file.",
      ),
    );
  }

  const format = output?.format as string | undefined;
  const extension = extname(outputPath)
    .toLowerCase()
    .replace(/^\./, "");

  if (
    !["json", "csv", "ndjson"].includes(format ?? "") ||
    (extension && extension !== format)
  ) {
    issues.push(
      createIssue(
        "error",
        "RECIPE_OUTPUT_FORMAT_MISMATCH",
        `Recipe output format ${format ?? "(missing)"} does not match ${extension || "(no extension)"}.`,
      ),
    );
  }

  return {
    path: outputPath,
    displayPath: displayPath(outputPath, workspaceRoot),
    format: format ?? null,
    valid: !issues.some(
      (issue) =>
        issue.code.startsWith("RECIPE_OUTPUT_") &&
        issue.severity === "error",
    ),
  };
}

function validateSelectors(
  recipe: Record<string, unknown>,
  issues: RecipeValidationReport["issues"],
): void {
  const source = recipe.source as Record<string, unknown> | undefined;
  if (source?.type !== "excel") return;

  const hasTable =
    typeof source.table === "string" && Boolean(source.table);
  const hasRange =
    typeof source.range === "string" && Boolean(source.range);

  if (hasTable && (hasRange || source.sheet)) {
    issues.push(
      createIssue(
        "error",
        "RECIPE_EXCEL_SELECTOR_CONFLICT",
        "An Excel recipe cannot combine a named table with sheet or range selectors.",
      ),
    );
  }
}

async function probeRecipe(
  recipe: Record<string, unknown>,
  sourcePath: string,
  options: ValidateRecipeFileOptions,
  issues: RecipeValidationReport["issues"],
): Promise<RecipeValidationReport["execution"]> {
  const source = recipe.source as Record<string, unknown>;
  try {
    if (source.type === "excel") {
      const result = source.table
        ? await extractTable(
            sourcePath,
            source.table as string,
            {
              workspaceRoot: options.workspaceRoot,
              header: true,
            },
          )
        : await extractWorksheet(sourcePath, {
            workspaceRoot: options.workspaceRoot,
            sheet: source.sheet as string | undefined,
            range: source.range as string | undefined,
            header: true,
          });

      return {
        rowCount: result.records.length,
        sourceType: "excel",
      };
    }

    if (source.type === "powerpoint") {
      const result = await readPresentation(sourcePath, {
        workspaceRoot: options.workspaceRoot,
      });

      return {
        rowCount: result.slides.length,
        sourceType: "powerpoint",
      };
    }

    const result = await loadDataset(sourcePath, {
      workspaceRoot: options.workspaceRoot,
    });

    return {
      rowCount: result.records.length,
      sourceType: source.type as string,
      warnings: result.warnings,
    };
  } catch (error) {
    issues.push(
      createIssue(
        "error",
        "RECIPE_EXECUTION_INVALID",
        `Recipe source could not be read: ${error instanceof Error ? error.message : String(error)}`,
        {
          causeCode: (error as { code?: string }).code ?? null,
        },
      ),
    );
    return null;
  }
}

function createIssue(
  severity: "error" | "warning",
  code: string,
  message: string,
  details: Record<string, unknown> = {},
): { severity: "error" | "warning"; code: string; message: string; [extension: string]: unknown } {
  return {
    severity,
    code,
    message,
    ...details,
  };
}

function displayPath(path: string, workspaceRoot: string): string {
  const value = relative(workspaceRoot, path).replaceAll("\\", "/");
  return value.startsWith("..") ? path : value || ".";
}

async function safeLstat(path: string): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") return null;
    throw error;
  }
}