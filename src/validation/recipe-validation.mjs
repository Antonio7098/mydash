import {
  lstat,
  readFile,
  readdir,
  realpath,
  stat,
} from "node:fs/promises";
import {
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import {
  validateDocument,
} from "./contracts.mjs";
import {
  assertPathInsideWorkspace,
  isPathInside,
} from "../files/paths.mjs";
import {
  extractTable,
  extractWorksheet,
} from "../office/excel.mjs";
import {
  readPresentation,
} from "../office/powerpoint.mjs";
import {
  loadDataset,
} from "../data/load.mjs";

const SOURCE_EXTENSIONS = {
  excel: new Set([".xlsx", ".xlsm"]),
  powerpoint: new Set([".pptx", ".pptm"]),
  csv: new Set([".csv"]),
  json: new Set([".json", ".ndjson", ".jsonl"]),
};

export async function discoverRecipeFiles(
  workspaceRoot,
  artifacts = [],
) {
  const roots = [
    resolve(workspaceRoot, "recipes"),
    ...artifacts.map((artifact) =>
      resolve(artifact.directory, "recipes"),
    ),
  ];
  const files = [];
  const seen = new Set();

  for (const root of roots) {
    const metadata = await safeLstat(root);
    if (!metadata?.isDirectory()) continue;

    await walk(root);
  }

  return files.sort((left, right) =>
    left.localeCompare(right, "en"),
  );

  async function walk(directory) {
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

export async function validateRecipeFile(
  recipePath,
  options,
) {
  const issues = [];
  let recipe = null;

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
        )}: ${error.message}`,
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
    recipe,
    options.workspaceRoot,
    issues,
  );
  const output = await validateOutput(
    recipe,
    options.workspaceRoot,
    source?.path,
    issues,
  );

  validateSelectors(recipe, issues);

  let execution = null;

  if (
    contract.ok &&
    source?.valid &&
    output?.valid &&
    !issues.some((issue) => issue.severity === "error") &&
    options.execute !== false
  ) {
    execution = await probeRecipe(
      recipe,
      source.path,
      options,
      issues,
    );
  }

  return result();

  function result() {
    const errorCount = issues.filter(
      (issue) => issue.severity === "error",
    ).length;
    const warningCount = issues.filter(
      (issue) => issue.severity === "warning",
    ).length;

    return {
      path: recipePath,
      displayPath: displayPath(
        recipePath,
        options.workspaceRoot,
      ),
      id: recipe?.id ?? null,
      recipe,
      source,
      output,
      execution,
      issues,
      valid: errorCount === 0,
      errorCount,
      warningCount,
    };
  }
}

async function validateSource(
  recipe,
  workspaceRoot,
  issues,
) {
  const value = recipe?.source?.file;

  if (typeof value !== "string" || !value) {
    return {
      path: null,
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
      valid: false,
    };
  }

  const candidate = resolve(workspaceRoot, value);
  const canonicalWorkspace = await realpath(workspaceRoot);
  let canonicalSource;

  try {
    canonicalSource = await realpath(candidate);
  } catch (error) {
    if (error?.code === "ENOENT") {
      issues.push(
        createIssue(
          "error",
          "RECIPE_SOURCE_MISSING",
          `Recipe source does not exist: ${value}`,
        ),
      );
      return {
        path: candidate,
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
      valid: false,
    };
  }

  const sourceType = recipe?.source?.type;
  const extension = extname(canonicalSource).toLowerCase();
  const supported = SOURCE_EXTENSIONS[sourceType];

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
    displayPath: displayPath(
      canonicalSource,
      workspaceRoot,
    ),
    type: sourceType,
    valid: !issues.some(
      (issue) =>
        issue.code.startsWith("RECIPE_SOURCE_") &&
        issue.severity === "error",
    ),
  };
}

async function validateOutput(
  recipe,
  workspaceRoot,
  sourcePath,
  issues,
) {
  const value = recipe?.output?.file;

  if (typeof value !== "string" || !value) {
    return {
      path: null,
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
        error.message,
      ),
    );
    return {
      path: outputPath,
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

  const format = recipe?.output?.format;
  const extension = extname(outputPath)
    .toLowerCase()
    .replace(/^\./, "");

  if (
    !["json", "csv", "ndjson"].includes(format) ||
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
    format,
    valid: !issues.some(
      (issue) =>
        issue.code.startsWith("RECIPE_OUTPUT_") &&
        issue.severity === "error",
    ),
  };
}

function validateSelectors(recipe, issues) {
  if (recipe?.source?.type !== "excel") return;

  const source = recipe.source;
  const hasTable =
    typeof source.table === "string" && source.table;
  const hasRange =
    typeof source.range === "string" && source.range;

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
  recipe,
  sourcePath,
  options,
  issues,
) {
  try {
    if (recipe.source.type === "excel") {
      const result = recipe.source.table
        ? await extractTable(
            sourcePath,
            recipe.source.table,
            {
              workspaceRoot: options.workspaceRoot,
              header: true,
            },
          )
        : await extractWorksheet(sourcePath, {
            workspaceRoot: options.workspaceRoot,
            sheet: recipe.source.sheet,
            range: recipe.source.range,
            header: true,
          });

      return {
        rowCount: result.records.length,
        sourceType: "excel",
      };
    }

    if (recipe.source.type === "powerpoint") {
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
      sourceType: recipe.source.type,
      warnings: result.warnings,
    };
  } catch (error) {
    issues.push(
      createIssue(
        "error",
        "RECIPE_EXECUTION_INVALID",
        `Recipe source could not be read: ${error.message}`,
        {
          causeCode: error.code ?? null,
        },
      ),
    );
    return null;
  }
}

function createIssue(
  severity,
  code,
  message,
  details = {},
) {
  return {
    severity,
    code,
    message,
    ...details,
  };
}

function displayPath(path, workspaceRoot) {
  const value = relative(workspaceRoot, path).replaceAll("\\", "/");
  return value.startsWith("..") ? path : value || ".";
}

async function safeLstat(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}
