import { resolve } from "node:path";
import {
  parseCommandArguments,
  parseIntegerOption,
  requirePositionals,
} from "../command-options.mjs";
import { CliError, EXIT_USAGE } from "../errors.mjs";
import { resolveCommandPath } from "../../src/files/paths.mjs";
import { findWorkspaceRoot } from "../../src/workspace/find-root.mjs";
import { inspectDataset } from "../../src/data/inspect.mjs";
import { profileDataset } from "../../src/data/profile.mjs";
import {
  deduplicateRecords,
  filterRecords,
  parseColumnList,
  selectColumns,
} from "../../src/data/transform.mjs";
import { loadDataset } from "../../src/data/load.mjs";
import { writeDataset } from "../../src/data/write.mjs";
import {
  createRecipe,
  refreshRecipe,
} from "../../src/data/recipes.mjs";
import {
  artifactDataStatus,
  refreshArtifactData,
  stageArtifactSource,
  syncArtifactSource,
} from "../../src/data/artifact-refresh.mjs";
import { loadPackageMetadata } from "../../src/workspace/package-metadata.mjs";

const SUBCOMMANDS = new Set([
  "inspect",
  "profile",
  "convert",
  "select",
  "filter",
  "deduplicate",
  "create-recipe",
  "refresh",
  "stage",
  "sync",
  "refresh-artifact",
  "status",
]);

export const dataCommand = {
  name: "data",
  summary: "Inspect, profile, transform and refresh tabular data.",
  usage: "mydash data <subcommand> [arguments] [options]",
  options: [
    "inspect <file>                 Inspect CSV, JSON or NDJSON structure.",
    "profile <file>                 Profile types, nulls, uniqueness and ranges.",
    "convert <file>                 Convert to JSON, CSV or NDJSON.",
    "select <file>                  Keep selected columns.",
    "filter <file>                  Keep rows matching a safe expression.",
    "deduplicate <file>             Remove duplicate rows by key.",
    "create-recipe <source>         Create a repeatable extraction recipe.",
    "refresh <recipe.json>          Execute a recipe and record provenance.",
    "stage <source>                 Stage a source snapshot for an artefact.",
    "sync <artifact>                Stage a configured live-local source.",
    "refresh-artifact <artifact>    Refresh all data recipes for an artefact.",
    "status <artifact>              Report artefact data freshness and state.",
    "--allow-outside                Permit read-only source access outside the workspace.",
    "--json                         Return structured JSON.",
  ],

  async run(invocation, context) {
    const [subcommand, ...rest] = invocation.args;

    if (!SUBCOMMANDS.has(subcommand)) {
      throw new CliError(
        "UNKNOWN_DATA_SUBCOMMAND",
        subcommand
          ? `Unknown data subcommand: ${subcommand}`
          : "A data subcommand is required.",
        {
          exitCode: EXIT_USAGE,
          details: {
            availableSubcommands: [...SUBCOMMANDS],
          },
          hint: "Run mydash help data to see available data operations.",
        },
      );
    }

    const workspaceRoot = await findWorkspaceRoot(
      invocation.options.workspace ?? context.cwd,
    );

    switch (subcommand) {
      case "inspect":
        return runInspect(rest, context, workspaceRoot);
      case "profile":
        return runProfile(rest, context, workspaceRoot);
      case "convert":
        return runConvert(rest, context, workspaceRoot);
      case "select":
        return runSelect(rest, context, workspaceRoot);
      case "filter":
        return runFilter(rest, context, workspaceRoot);
      case "deduplicate":
        return runDeduplicate(rest, context, workspaceRoot);
      case "create-recipe":
        return runCreateRecipe(rest, context, workspaceRoot);
      case "refresh":
        return runRefresh(rest, context, workspaceRoot);
      case "stage":
        return runStage(rest, context, workspaceRoot);
      case "sync":
        return runSync(rest, context, workspaceRoot);
      case "refresh-artifact":
        return runRefreshArtifact(rest, context, workspaceRoot);
      case "status":
        return runStatus(rest, context, workspaceRoot);
      default:
        throw new Error("Unreachable data subcommand.");
    }
  },
};

async function runInspect(args, context, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    booleans: ["allow-outside"],
    values: ["max-rows"],
  });
  requirePositionals(parsed.positionals, 1, "mydash data inspect <file>");

  const path = await resolveSource(
    parsed.positionals[0],
    parsed.options,
    context,
    workspaceRoot,
  );
  const maxRows = parseIntegerOption(parsed.options.maxRows, {
    label: "Maximum rows",
    minimum: 1,
    maximum: 100000,
    defaultValue: 1000,
  });
  const data = await inspectDataset(path, {
    workspaceRoot,
    maxRows,
  });

  return {
    ok: true,
    command: "data inspect",
    data,
    warnings: data.warnings,
    text: renderInspection(data),
  };
}

async function runProfile(args, context, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    booleans: ["allow-outside"],
    values: ["max-rows", "top-values"],
  });
  requirePositionals(parsed.positionals, 1, "mydash data profile <file>");

  const path = await resolveSource(
    parsed.positionals[0],
    parsed.options,
    context,
    workspaceRoot,
  );
  const maxRows = parseIntegerOption(parsed.options.maxRows, {
    label: "Maximum rows",
    minimum: 1,
    maximum: 1000000,
    defaultValue: 10000,
  });
  const topValues = parseIntegerOption(parsed.options.topValues, {
    label: "Top values",
    minimum: 0,
    maximum: 50,
    defaultValue: 5,
  });
  const data = await profileDataset(path, {
    workspaceRoot,
    maxRows,
    topValues,
  });

  return {
    ok: true,
    command: "data profile",
    data,
    warnings: data.warnings,
    text: renderProfile(data),
  };
}

async function runConvert(args, context, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    booleans: ["allow-outside", "overwrite"],
    values: ["output", "format"],
  });
  requirePositionals(parsed.positionals, 1, "mydash data convert <file>");

  requireOutput(parsed.options.output, "Data conversion");

  const path = await resolveSource(
    parsed.positionals[0],
    parsed.options,
    context,
    workspaceRoot,
  );
  const dataset = await loadDataset(path, { workspaceRoot });
  const output = await writeDataset(dataset.records, {
    outputPath: resolveOutput(parsed.options.output, workspaceRoot),
    format: parsed.options.format,
    overwrite: parsed.options.overwrite ?? false,
    workspaceRoot,
  });

  return {
    ok: true,
    command: "data convert",
    data: {
      source: dataset.displayPath,
      rowCount: dataset.records.length,
      output,
    },
    text: `Converted ${dataset.records.length} rows to ${output.displayPath}.`,
  };
}

async function runSelect(args, context, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    booleans: ["allow-outside", "overwrite"],
    values: ["columns", "output", "format"],
  });
  requirePositionals(parsed.positionals, 1, "mydash data select <file>");

  if (!parsed.options.columns) {
    throw new CliError(
      "MISSING_COLUMNS",
      "Column selection requires --columns <name,name,...>.",
      { exitCode: EXIT_USAGE },
    );
  }
  requireOutput(parsed.options.output, "Column selection");

  const path = await resolveSource(
    parsed.positionals[0],
    parsed.options,
    context,
    workspaceRoot,
  );
  const dataset = await loadDataset(path, { workspaceRoot });
  const columns = parseColumnList(parsed.options.columns);
  const records = selectColumns(dataset.records, columns);
  const output = await writeDataset(records, {
    outputPath: resolveOutput(parsed.options.output, workspaceRoot),
    format: parsed.options.format,
    overwrite: parsed.options.overwrite ?? false,
    workspaceRoot,
  });

  return {
    ok: true,
    command: "data select",
    data: {
      source: dataset.displayPath,
      columns,
      rowCount: records.length,
      output,
    },
    text: `Selected ${columns.length} columns across ${records.length} rows.`,
  };
}

async function runFilter(args, context, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    booleans: ["allow-outside", "overwrite"],
    values: ["where", "output", "format"],
  });
  requirePositionals(parsed.positionals, 1, "mydash data filter <file>");

  if (!parsed.options.where) {
    throw new CliError(
      "MISSING_FILTER",
      "Filtering requires --where <expression>.",
      { exitCode: EXIT_USAGE },
    );
  }
  requireOutput(parsed.options.output, "Filtering");

  const path = await resolveSource(
    parsed.positionals[0],
    parsed.options,
    context,
    workspaceRoot,
  );
  const dataset = await loadDataset(path, { workspaceRoot });
  const result = filterRecords(dataset.records, parsed.options.where);
  const output = await writeDataset(result.records, {
    outputPath: resolveOutput(parsed.options.output, workspaceRoot),
    format: parsed.options.format,
    overwrite: parsed.options.overwrite ?? false,
    workspaceRoot,
  });

  return {
    ok: true,
    command: "data filter",
    data: {
      source: dataset.displayPath,
      expression: result.expression,
      inputRows: dataset.records.length,
      outputRows: result.records.length,
      output,
    },
    text: `Filtered ${dataset.records.length} rows to ${result.records.length}.`,
  };
}

async function runDeduplicate(args, context, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    booleans: ["allow-outside", "overwrite"],
    values: ["key", "output", "format"],
  });
  requirePositionals(
    parsed.positionals,
    1,
    "mydash data deduplicate <file>",
  );

  if (!parsed.options.key) {
    throw new CliError(
      "MISSING_DEDUPLICATION_KEY",
      "Deduplication requires --key <column[,column...]>.",
      { exitCode: EXIT_USAGE },
    );
  }
  requireOutput(parsed.options.output, "Deduplication");

  const path = await resolveSource(
    parsed.positionals[0],
    parsed.options,
    context,
    workspaceRoot,
  );
  const dataset = await loadDataset(path, { workspaceRoot });
  const keys = parseColumnList(parsed.options.key);
  const result = deduplicateRecords(dataset.records, keys);
  const output = await writeDataset(result.records, {
    outputPath: resolveOutput(parsed.options.output, workspaceRoot),
    format: parsed.options.format,
    overwrite: parsed.options.overwrite ?? false,
    workspaceRoot,
  });

  return {
    ok: true,
    command: "data deduplicate",
    data: {
      source: dataset.displayPath,
      keys,
      inputRows: dataset.records.length,
      outputRows: result.records.length,
      removedRows: result.removedRows,
      output,
    },
    text: `Removed ${result.removedRows} duplicate rows.`,
  };
}

async function runCreateRecipe(args, context, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    booleans: ["allow-outside", "overwrite", "output-overwrite"],
    values: [
      "id",
      "type",
      "sheet",
      "table",
      "range",
      "output",
      "format",
      "recipe",
    ],
  });
  requirePositionals(
    parsed.positionals,
    1,
    "mydash data create-recipe <source>",
  );

  if (!workspaceRoot) {
    throw new CliError(
      "WORKSPACE_REQUIRED_FOR_WRITE",
      "Recipe creation requires a My Dashboards workspace.",
      { exitCode: 5 },
    );
  }

  for (const required of ["id", "output", "recipe"]) {
    if (!parsed.options[required]) {
      throw new CliError(
        "MISSING_RECIPE_OPTION",
        `Recipe creation requires --${required.replace(/[A-Z]/g, (value) => `-${value.toLowerCase()}`)}.`,
        { exitCode: EXIT_USAGE },
      );
    }
  }

  const source = await resolveSource(
    parsed.positionals[0],
    parsed.options,
    context,
    workspaceRoot,
  );
  const result = await createRecipe({
    workspaceRoot,
    sourcePath: source,
    recipePath: resolve(workspaceRoot, parsed.options.recipe),
    id: parsed.options.id,
    sourceType: parsed.options.type,
    sheet: parsed.options.sheet,
    table: parsed.options.table,
    range: parsed.options.range,
    outputPath: parsed.options.output,
    outputFormat: parsed.options.format,
    outputOverwrite: parsed.options.outputOverwrite ?? false,
    overwrite: parsed.options.overwrite ?? false,
  });

  return {
    ok: true,
    command: "data create-recipe",
    data: result,
    text: `Created recipe ${result.recipe.id} at ${result.displayPath}.`,
  };
}

async function runRefresh(args, context, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    booleans: ["overwrite", "no-provenance"],
  });
  requirePositionals(
    parsed.positionals,
    1,
    "mydash data refresh <recipe.json>",
  );

  if (!workspaceRoot) {
    throw new CliError(
      "WORKSPACE_REQUIRED_FOR_WRITE",
      "Recipe refresh requires a My Dashboards workspace.",
      { exitCode: 5 },
    );
  }

  const recipePath = await resolveCommandPath(parsed.positionals[0], {
    cwd: context.cwd,
    workspaceRoot,
    allowOutside: false,
    mustExist: true,
    requireFile: true,
  });

  const data = await refreshRecipe(recipePath, {
    workspaceRoot,
    overwrite: parsed.options.overwrite,
    provenance: !(parsed.options.noProvenance ?? false),
  });

  return {
    ok: true,
    command: "data refresh",
    data,
    warnings: data.warnings,
    text: `Refreshed ${data.rowCount} rows to ${data.output.displayPath}.`,
  };
}

async function runStage(args, context, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    booleans: ["force", "no-history"],
    values: ["artifact", "kind", "source"],
  });
  requirePositionals(parsed.positionals, 1, "mydash data stage <source-file> --artifact <id> --kind <kind> --source <id>");
  requireWorkspace(workspaceRoot, "Source staging");
  requireNamed(parsed.options, ["artifact", "kind", "source"], "Source staging");
  const sourcePath = await resolveCommandPath(parsed.positionals[0], {
    cwd: context.cwd,
    workspaceRoot,
    allowOutside: true,
    mustExist: true,
    requireFile: true,
  });
  const data = await stageArtifactSource({
    workspaceRoot,
    sourcePath,
    artifactId: parsed.options.artifact,
    kind: parsed.options.kind,
    sourceId: parsed.options.source,
    force: parsed.options.force ?? false,
    history: !(parsed.options.noHistory ?? false),
  });
  return {
    ok: true,
    command: "data stage",
    data,
    text: data.changed
      ? `Staged ${data.originalFilename} at ${data.stagedPath}.`
      : `Source is unchanged at ${data.stagedPath}.`,
  };
}

async function runSync(args, context, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    booleans: ["force", "no-history"],
    values: ["kind", "source"],
  });
  requirePositionals(parsed.positionals, 1, "mydash data sync <artifact> --kind <kind> --source <id>");
  requireWorkspace(workspaceRoot, "Live source synchronisation");
  requireNamed(parsed.options, ["kind", "source"], "Live source synchronisation");
  const data = await syncArtifactSource({
    workspaceRoot,
    artifactId: parsed.positionals[0],
    kind: parsed.options.kind,
    sourceId: parsed.options.source,
    force: parsed.options.force ?? false,
    history: !(parsed.options.noHistory ?? false),
  });
  const metadata = await loadPackageMetadata(workspaceRoot);
  const refresh = await refreshArtifactData({
    workspaceRoot,
    artifactId: parsed.positionals[0],
    kind: parsed.options.kind,
    toolVersion: metadata.version,
  });
  return {
    ok: true,
    command: "data sync",
    data: { ...data, refresh },
    warnings: refresh.datasets.flatMap((dataset) => dataset.warnings ?? []),
    text: `${data.changed ? "Synchronised" : "Confirmed unchanged"} ${data.sourceId} at ${data.stagedPath} and refreshed ${refresh.datasets.length} dataset${refresh.datasets.length === 1 ? "" : "s"}.`,
  };
}

async function runRefreshArtifact(args, context, workspaceRoot) {
  const parsed = parseCommandArguments(args, { values: ["kind"] });
  requirePositionals(parsed.positionals, 1, "mydash data refresh-artifact <artifact> --kind <kind>");
  requireWorkspace(workspaceRoot, "Artefact data refresh");
  requireNamed(parsed.options, ["kind"], "Artefact data refresh");
  const metadata = await loadPackageMetadata(workspaceRoot);
  const data = await refreshArtifactData({
    workspaceRoot,
    artifactId: parsed.positionals[0],
    kind: parsed.options.kind,
    toolVersion: metadata.version,
  });
  return {
    ok: true,
    command: "data refresh-artifact",
    data,
    warnings: data.datasets.flatMap((dataset) => dataset.warnings ?? []),
    text: `Refreshed ${data.datasets.length} dataset${data.datasets.length === 1 ? "" : "s"} for ${data.artifact.kind}:${data.artifact.id}.`,
  };
}

async function runStatus(args, context, workspaceRoot) {
  const parsed = parseCommandArguments(args, { values: ["kind"] });
  requirePositionals(parsed.positionals, 1, "mydash data status <artifact> --kind <kind>");
  requireWorkspace(workspaceRoot, "Artefact data status");
  requireNamed(parsed.options, ["kind"], "Artefact data status");
  const data = await artifactDataStatus({
    workspaceRoot,
    artifactId: parsed.positionals[0],
    kind: parsed.options.kind,
  });
  return {
    ok: true,
    command: "data status",
    data,
    text: `Data status for ${data.artifact.kind}:${data.artifact.id}: ${data.state}.`,
  };
}

async function resolveSource(input, options, context, workspaceRoot) {
  return resolveCommandPath(input, {
    cwd: context.cwd,
    workspaceRoot,
    allowOutside: options.allowOutside ?? false,
    mustExist: true,
    requireFile: true,
  });
}

function resolveOutput(input, workspaceRoot) {
  if (!workspaceRoot) {
    throw new CliError(
      "WORKSPACE_REQUIRED_FOR_WRITE",
      "Data outputs require a My Dashboards workspace.",
      { exitCode: 5 },
    );
  }

  return resolve(workspaceRoot, input);
}

function requireOutput(value, operation) {
  if (!value) {
    throw new CliError(
      "MISSING_OUTPUT",
      `${operation} requires --output <path>.`,
      { exitCode: EXIT_USAGE },
    );
  }
}

function requireWorkspace(workspaceRoot, operation) {
  if (!workspaceRoot) {
    throw new CliError("WORKSPACE_REQUIRED_FOR_WRITE", `${operation} requires a My Dashboards workspace.`, {
      exitCode: 5,
    });
  }
}

function requireNamed(options, names, operation) {
  for (const name of names) {
    if (!options[name]) {
      throw new CliError("MISSING_DATA_OPTION", `${operation} requires --${name}.`, {
        exitCode: EXIT_USAGE,
      });
    }
  }
}

function renderInspection(data) {
  return [
    `Data: ${data.displayPath}`,
    `Format: ${data.format}`,
    `Rows: ${data.rowCount}${data.sampled ? " (sampled)" : ""}`,
    `Columns: ${data.columnCount}`,
    `Shape: ${data.shape}`,
    `Fields: ${data.columns.join(", ") || "(none)"}`,
  ].join("\n");
}

function renderProfile(data) {
  const lines = [
    `Data profile: ${data.displayPath}`,
    `Rows analysed: ${data.analysedRows}${data.sampled ? ` of ${data.rowCount}` : ""}`,
    `Columns: ${data.columnCount}`,
    `Duplicate rows: ${data.duplicateRowCount}`,
    "",
  ];

  for (const column of data.columns) {
    lines.push(
      `${column.name}: ${column.type}, ${column.nullCount} null, ${column.uniqueCount} unique`,
    );
  }

  return lines.join("\n");
}
