import { resolve } from "node:path";
import {
  parseCommandArguments,
  parseIntegerOption,
  requirePositionals,
} from "../command-options.js";
import { CliError, EXIT_UNSAFE_OPERATION, EXIT_USAGE } from "../errors.js";
import { findWorkspaceRoot } from "../../src/workspace/find-root.js";
import { resolveCommandPath } from "../../src/files/paths.js";
import {
  extractTable,
  extractWorksheet,
  inspectWorkbook,
  listFormulas,
  listSheets,
  previewWorksheet,
  type WorkbookInspection,
} from "../../src/office/excel.js";
import { writeTabularOutput } from "../../src/office/tabular-output.js";
import type { CommandContext, CommandDefinition } from "../types.js";

const SUBCOMMANDS = new Set([
  "inspect",
  "sheets",
  "preview",
  "extract",
  "extract-table",
  "formulas",
]);

export const excelCommand: CommandDefinition = {
  name: "excel",
  summary: "Inspect and safely extract modern Excel workbooks.",
  usage: "mydash excel <subcommand> <workbook.xlsx> [options]",
  options: [
    "inspect <file>                 Inspect workbook structure and features.",
    "sheets <file>                  List worksheets.",
    "preview <file>                 Preview a sheet or range.",
    "extract <file>                 Extract a sheet or range to JSON, CSV or NDJSON.",
    "extract-table <file>           Extract a named Excel table.",
    "formulas <file>                List formula cells without recalculating them.",
    "--allow-outside                Permit read-only source access outside the workspace.",
    "--json                         Return structured JSON.",
  ],

  async run(invocation, context) {
    const [subcommand, ...rest] = invocation.args;

    if (subcommand === undefined || !SUBCOMMANDS.has(subcommand)) {
      throw new CliError(
        "UNKNOWN_EXCEL_SUBCOMMAND",
        subcommand
          ? `Unknown Excel subcommand: ${subcommand}`
          : "An Excel subcommand is required.",
        {
          exitCode: EXIT_USAGE,
          details: {
            availableSubcommands: [...SUBCOMMANDS],
          },
          hint: "Run mydash help excel to see available Excel operations.",
        },
      );
    }

    const workspaceRoot = (await findWorkspaceRoot(
      typeof invocation.options.workspace === "string"
        ? invocation.options.workspace
        : context.cwd,
    )) ?? undefined;

    switch (subcommand) {
      case "inspect":
        return runInspect(rest, context, workspaceRoot);
      case "sheets":
        return runSheets(rest, context, workspaceRoot);
      case "preview":
        return runPreview(rest, context, workspaceRoot);
      case "extract":
        return runExtract(rest, context, workspaceRoot);
      case "extract-table":
        return runExtractTable(rest, context, workspaceRoot);
      case "formulas":
        return runFormulas(rest, context, workspaceRoot);
      default:
        throw new Error("Unreachable Excel subcommand.");
    }
  },
};

async function runInspect(
  args: readonly string[],
  context: CommandContext,
  workspaceRoot: string | undefined,
) {
  const parsed = parseCommandArguments(args, {
    booleans: ["allow-outside"],
  });
  requirePositionals(parsed.positionals, 1, "mydash excel inspect <file>");

  const path = await resolveWorkbook(
    parsed.positionals[0],
    parsed.options,
    context,
    workspaceRoot,
  );
  const data = await inspectWorkbook(path, { workspaceRoot });

  return {
    ok: true,
    command: "excel inspect",
    data,
    warnings: data.warnings,
    text: renderInspection(data),
  };
}

async function runSheets(
  args: readonly string[],
  context: CommandContext,
  workspaceRoot: string | undefined,
) {
  const parsed = parseCommandArguments(args, {
    booleans: ["allow-outside"],
  });
  requirePositionals(parsed.positionals, 1, "mydash excel sheets <file>");

  const path = await resolveWorkbook(
    parsed.positionals[0],
    parsed.options,
    context,
    workspaceRoot,
  );
  const data = await listSheets(path, { workspaceRoot });

  return {
    ok: true,
    command: "excel sheets",
    data,
    text: data.sheets
      .map(
        (sheet, index) =>
          `${index + 1}. ${sheet.name} (${sheet.state}, ${sheet.actualRowCount} rows × ${sheet.actualColumnCount} columns)`,
      )
      .join("\n"),
  };
}

async function runPreview(
  args: readonly string[],
  context: CommandContext,
  workspaceRoot: string | undefined,
) {
  const parsed = parseCommandArguments(args, {
    booleans: ["allow-outside", "formulas"],
    values: ["sheet", "range", "rows", "columns"],
  });
  requirePositionals(parsed.positionals, 1, "mydash excel preview <file>");

  const path = await resolveWorkbook(
    parsed.positionals[0],
    parsed.options,
    context,
    workspaceRoot,
  );
  const rows = parseIntegerOption(parsed.options.rows, {
    label: "Rows",
    minimum: 1,
    maximum: 500,
    defaultValue: 20,
  });
  const columns = parseIntegerOption(parsed.options.columns, {
    label: "Columns",
    minimum: 1,
    maximum: 200,
    defaultValue: 20,
  });

  const data = await previewWorksheet(path, {
    workspaceRoot,
    sheet: parsed.options.sheet,
    range: parsed.options.range,
    rows,
    columns,
    includeFormulas: parsed.options.formulas ?? false,
  });

  return {
    ok: true,
    command: "excel preview",
    data,
    text: renderMatrix(data.matrix),
  };
}

async function runExtract(
  args: readonly string[],
  context: CommandContext,
  workspaceRoot: string | undefined,
) {
  const parsed = parseCommandArguments(args, {
    booleans: ["allow-outside", "overwrite", "formulas", "no-header"],
    values: ["sheet", "range", "output", "format"],
  });
  requirePositionals(parsed.positionals, 1, "mydash excel extract <file>");

  if (!parsed.options.output) {
    throw new CliError(
      "MISSING_OUTPUT",
      "Excel extraction requires --output <path>.",
      { exitCode: EXIT_USAGE },
    );
  }

  const path = await resolveWorkbook(
    parsed.positionals[0],
    parsed.options,
    context,
    workspaceRoot,
  );
  const data = await extractWorksheet(path, {
    workspaceRoot,
    sheet: parsed.options.sheet,
    range: parsed.options.range,
    includeFormulas: parsed.options.formulas ?? false,
    header: !(parsed.options.noHeader ?? false),
  });

  const output = await writeTabularOutput(data, {
    outputPath: resolveOutput(parsed.options.output, workspaceRoot),
    format: parsed.options.format,
    overwrite: parsed.options.overwrite ?? false,
    workspaceRoot,
  });

  return {
    ok: true,
    command: "excel extract",
    data: {
      source: data.source,
      sheet: data.sheet,
      range: data.range,
      rowCount: data.matrix.length,
      columnCount: data.matrix[0]?.length ?? 0,
      output,
    },
    text: `Extracted ${data.matrix.length} rows from ${data.sheet} to ${output.displayPath}.`,
  };
}

async function runExtractTable(
  args: readonly string[],
  context: CommandContext,
  workspaceRoot: string | undefined,
) {
  const parsed = parseCommandArguments(args, {
    booleans: ["allow-outside", "overwrite", "formulas", "no-header"],
    values: ["table", "output", "format"],
  });
  requirePositionals(
    parsed.positionals,
    1,
    "mydash excel extract-table <file> --table <name> --output <path>",
  );

  if (!parsed.options.table) {
    throw new CliError(
      "MISSING_TABLE",
      "Table extraction requires --table <name>.",
      { exitCode: EXIT_USAGE },
    );
  }

  if (!parsed.options.output) {
    throw new CliError(
      "MISSING_OUTPUT",
      "Table extraction requires --output <path>.",
      { exitCode: EXIT_USAGE },
    );
  }

  const path = await resolveWorkbook(
    parsed.positionals[0],
    parsed.options,
    context,
    workspaceRoot,
  );
  const data = await extractTable(path, parsed.options.table, {
    workspaceRoot,
    includeFormulas: parsed.options.formulas ?? false,
    header: !(parsed.options.noHeader ?? false),
  });

  const output = await writeTabularOutput(data, {
    outputPath: resolveOutput(parsed.options.output, workspaceRoot),
    format: parsed.options.format,
    overwrite: parsed.options.overwrite ?? false,
    workspaceRoot,
  });

  return {
    ok: true,
    command: "excel extract-table",
    data: {
      source: data.source,
      sheet: data.sheet,
      table: data.table,
      range: data.range,
      rowCount: data.matrix.length,
      output,
    },
    text: `Extracted table ${data.table} to ${output.displayPath}.`,
  };
}

async function runFormulas(
  args: readonly string[],
  context: CommandContext,
  workspaceRoot: string | undefined,
) {
  const parsed = parseCommandArguments(args, {
    booleans: ["allow-outside"],
    values: ["sheet", "max-results"],
  });
  requirePositionals(parsed.positionals, 1, "mydash excel formulas <file>");

  const path = await resolveWorkbook(
    parsed.positionals[0],
    parsed.options,
    context,
    workspaceRoot,
  );
  const maxResults = parseIntegerOption(parsed.options.maxResults, {
    label: "Maximum results",
    minimum: 1,
    maximum: 10000,
    defaultValue: 500,
  });
  const data = await listFormulas(path, {
    workspaceRoot,
    sheet: parsed.options.sheet,
    maxResults,
  });

  return {
    ok: true,
    command: "excel formulas",
    data,
    warnings: data.truncated
      ? [
          {
            code: "RESULTS_TRUNCATED",
            message: `Formula results were limited to ${maxResults}.`,
          },
        ]
      : [],
    text:
      data.formulas.length > 0
        ? data.formulas
            .map(
              (formula) =>
                `${formula.sheet}!${formula.address}: ${formula.formula}`,
            )
            .join("\n")
        : "No formulas found.",
  };
}

async function resolveWorkbook(
  input: string,
  options: { allowOutside?: boolean },
  context: CommandContext,
  workspaceRoot: string | undefined,
) {
  return resolveCommandPath(input, {
    cwd: context.cwd,
    workspaceRoot,
    allowOutside: options.allowOutside ?? false,
    mustExist: true,
    requireFile: true,
  });
}

function resolveOutput(input: string, workspaceRoot: string | undefined): string {
  if (!workspaceRoot) {
    throw new CliError(
      "WORKSPACE_REQUIRED_FOR_WRITE",
      "Excel extraction outputs require a My Dashboards workspace.",
      { exitCode: EXIT_UNSAFE_OPERATION },
    );
  }

  return resolve(workspaceRoot, input);
}

function renderInspection(data: WorkbookInspection): string {
  const lines = [
    `Workbook: ${data.displayPath}`,
    `Sheets: ${data.sheetCount}`,
    `Tables: ${data.features.tableCount}`,
    `Formula cells: ${data.formulaCellCount}`,
    `Charts: ${data.features.chartCount}`,
    `Images: ${data.features.imageCount}`,
    `Macros detected: ${data.features.hasMacros ? "yes" : "no"}`,
    `External links: ${data.features.externalLinkCount}`,
  ];

  lines.push("");
  lines.push("Worksheets:");

  for (const sheet of data.sheets) {
    lines.push(
      `  ${sheet.name}: ${sheet.actualRowCount} rows × ${sheet.actualColumnCount} columns`,
    );
  }

  return lines.join("\n");
}

function renderMatrix(matrix: unknown[][]): string {
  if (matrix.length === 0) return "The selected range is empty.";

  const widths: number[] = [];
  const rendered = matrix.map((row) =>
    row.map((value, index) => {
      const text =
        value === null || value === undefined
          ? ""
          : typeof value === "object"
            ? JSON.stringify(value)
            : String(value);
      widths[index] = Math.min(
        40,
        Math.max(widths[index] ?? 0, text.length),
      );
      return text;
    }),
  );

  return rendered
    .map((row) =>
      row
        .map((value, index) => {
          const width = widths[index] ?? 0;
          return value.length > width
            ? `${value.slice(0, Math.max(0, width - 1))}…`
            : value.padEnd(width);
        })
        .join(" | "),
    )
    .join("\n");
}
