#!/usr/bin/env node

/**
 * My Dashboards — Bootstrap 07: Build data utilities
 *
 * Adds deterministic CSV, JSON and NDJSON inspection, profiling and
 * transformation, plus repeatable recipes and provenance:
 *
 *   mydash data inspect
 *   mydash data profile
 *   mydash data convert
 *   mydash data select
 *   mydash data filter
 *   mydash data deduplicate
 *   mydash data create-recipe
 *   mydash data refresh
 *
 * This bootstrap adds no new runtime dependencies.
 *
 * Usage:
 *   node scripts/07-build-data-utilities.mjs
 *   node scripts/07-build-data-utilities.mjs --dry-run
 *   node scripts/07-build-data-utilities.mjs --no-commit
 *   node scripts/07-build-data-utilities.mjs --no-push
 *   node scripts/07-build-data-utilities.mjs --json
 *   node scripts/07-build-data-utilities.mjs --target /path/to/my-dashboards
 */

import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import process from "node:process";

const SCRIPT_NAME = "07-build-data-utilities";
const COMMIT_MESSAGE = "Add deterministic data utilities";
const MIN_NODE_MAJOR = 20;
const TYPE_SCRIPT_GUARDED_PATHS = [
  /^src\//,
  /^cli\//,
  /^server\//,
  /^tests\//,
  /^bin\//,
  /^dist\//,
];
function isTypeScriptGuardedPath(relativePath) {
  return TYPE_SCRIPT_GUARDED_PATHS.some((re) => re.test(relativePath));
}
const FILES = {"cli/registry.mjs": {"content": "import { helpCommand } from \"./commands/help.mjs\";\nimport { versionCommand } from \"./commands/version.mjs\";\nimport { doctorCommand } from \"./commands/doctor.mjs\";\nimport { inspectCommand } from \"./commands/inspect.mjs\";\nimport { fileCommand } from \"./commands/file.mjs\";\nimport { excelCommand } from \"./commands/excel.mjs\";\nimport { powerpointCommand } from \"./commands/powerpoint.mjs\";\nimport { dataCommand } from \"./commands/data.mjs\";\n\nconst commands = [\n  helpCommand,\n  versionCommand,\n  doctorCommand,\n  inspectCommand,\n  fileCommand,\n  excelCommand,\n  powerpointCommand,\n  dataCommand,\n];\n\nconst commandMap = new Map(\n  commands.map((command) => [command.name, command]),\n);\n\nexport const commandRegistry = {\n  get(name) {\n    return commandMap.get(name) ?? null;\n  },\n\n  list() {\n    return [...commands];\n  },\n\n  names() {\n    return commands.map((command) => command.name);\n  },\n};\n", "allowedPrevious": ["import { helpCommand } from \"./commands/help.mjs\";\nimport { versionCommand } from \"./commands/version.mjs\";\nimport { doctorCommand } from \"./commands/doctor.mjs\";\nimport { inspectCommand } from \"./commands/inspect.mjs\";\nimport { fileCommand } from \"./commands/file.mjs\";\nimport { excelCommand } from \"./commands/excel.mjs\";\nimport { powerpointCommand } from \"./commands/powerpoint.mjs\";\n\nconst commands = [\n  helpCommand,\n  versionCommand,\n  doctorCommand,\n  inspectCommand,\n  fileCommand,\n  excelCommand,\n  powerpointCommand,\n];\n\nconst commandMap = new Map(\n  commands.map((command) => [command.name, command]),\n);\n\nexport const commandRegistry = {\n  get(name) {\n    return commandMap.get(name) ?? null;\n  },\n\n  list() {\n    return [...commands];\n  },\n\n  names() {\n    return commands.map((command) => command.name);\n  },\n};\n"]}, "cli/commands/data.mjs": {"content": "import { resolve } from \"node:path\";\nimport {\n  parseCommandArguments,\n  parseIntegerOption,\n  requirePositionals,\n} from \"../command-options.mjs\";\nimport { CliError, EXIT_USAGE } from \"../errors.mjs\";\nimport { resolveCommandPath } from \"../../src/files/paths.mjs\";\nimport { findWorkspaceRoot } from \"../../src/workspace/find-root.mjs\";\nimport { inspectDataset } from \"../../src/data/inspect.mjs\";\nimport { profileDataset } from \"../../src/data/profile.mjs\";\nimport {\n  deduplicateRecords,\n  filterRecords,\n  parseColumnList,\n  selectColumns,\n} from \"../../src/data/transform.mjs\";\nimport { loadDataset } from \"../../src/data/load.mjs\";\nimport { writeDataset } from \"../../src/data/write.mjs\";\nimport {\n  createRecipe,\n  refreshRecipe,\n} from \"../../src/data/recipes.mjs\";\n\nconst SUBCOMMANDS = new Set([\n  \"inspect\",\n  \"profile\",\n  \"convert\",\n  \"select\",\n  \"filter\",\n  \"deduplicate\",\n  \"create-recipe\",\n  \"refresh\",\n]);\n\nexport const dataCommand = {\n  name: \"data\",\n  summary: \"Inspect, profile, transform and refresh tabular data.\",\n  usage: \"mydash data <subcommand> [arguments] [options]\",\n  options: [\n    \"inspect <file>                 Inspect CSV, JSON or NDJSON structure.\",\n    \"profile <file>                 Profile types, nulls, uniqueness and ranges.\",\n    \"convert <file>                 Convert to JSON, CSV or NDJSON.\",\n    \"select <file>                  Keep selected columns.\",\n    \"filter <file>                  Keep rows matching a safe expression.\",\n    \"deduplicate <file>             Remove duplicate rows by key.\",\n    \"create-recipe <source>         Create a repeatable extraction recipe.\",\n    \"refresh <recipe.json>          Execute a recipe and record provenance.\",\n    \"--allow-outside                Permit read-only source access outside the workspace.\",\n    \"--json                         Return structured JSON.\",\n  ],\n\n  async run(invocation, context) {\n    const [subcommand, ...rest] = invocation.args;\n\n    if (!SUBCOMMANDS.has(subcommand)) {\n      throw new CliError(\n        \"UNKNOWN_DATA_SUBCOMMAND\",\n        subcommand\n          ? `Unknown data subcommand: ${subcommand}`\n          : \"A data subcommand is required.\",\n        {\n          exitCode: EXIT_USAGE,\n          details: {\n            availableSubcommands: [...SUBCOMMANDS],\n          },\n          hint: \"Run mydash help data to see available data operations.\",\n        },\n      );\n    }\n\n    const workspaceRoot = await findWorkspaceRoot(\n      invocation.options.workspace ?? context.cwd,\n    );\n\n    switch (subcommand) {\n      case \"inspect\":\n        return runInspect(rest, context, workspaceRoot);\n      case \"profile\":\n        return runProfile(rest, context, workspaceRoot);\n      case \"convert\":\n        return runConvert(rest, context, workspaceRoot);\n      case \"select\":\n        return runSelect(rest, context, workspaceRoot);\n      case \"filter\":\n        return runFilter(rest, context, workspaceRoot);\n      case \"deduplicate\":\n        return runDeduplicate(rest, context, workspaceRoot);\n      case \"create-recipe\":\n        return runCreateRecipe(rest, context, workspaceRoot);\n      case \"refresh\":\n        return runRefresh(rest, context, workspaceRoot);\n      default:\n        throw new Error(\"Unreachable data subcommand.\");\n    }\n  },\n};\n\nasync function runInspect(args, context, workspaceRoot) {\n  const parsed = parseCommandArguments(args, {\n    booleans: [\"allow-outside\"],\n    values: [\"max-rows\"],\n  });\n  requirePositionals(parsed.positionals, 1, \"mydash data inspect <file>\");\n\n  const path = await resolveSource(\n    parsed.positionals[0],\n    parsed.options,\n    context,\n    workspaceRoot,\n  );\n  const maxRows = parseIntegerOption(parsed.options.maxRows, {\n    label: \"Maximum rows\",\n    minimum: 1,\n    maximum: 100000,\n    defaultValue: 1000,\n  });\n  const data = await inspectDataset(path, {\n    workspaceRoot,\n    maxRows,\n  });\n\n  return {\n    ok: true,\n    command: \"data inspect\",\n    data,\n    warnings: data.warnings,\n    text: renderInspection(data),\n  };\n}\n\nasync function runProfile(args, context, workspaceRoot) {\n  const parsed = parseCommandArguments(args, {\n    booleans: [\"allow-outside\"],\n    values: [\"max-rows\", \"top-values\"],\n  });\n  requirePositionals(parsed.positionals, 1, \"mydash data profile <file>\");\n\n  const path = await resolveSource(\n    parsed.positionals[0],\n    parsed.options,\n    context,\n    workspaceRoot,\n  );\n  const maxRows = parseIntegerOption(parsed.options.maxRows, {\n    label: \"Maximum rows\",\n    minimum: 1,\n    maximum: 1000000,\n    defaultValue: 10000,\n  });\n  const topValues = parseIntegerOption(parsed.options.topValues, {\n    label: \"Top values\",\n    minimum: 0,\n    maximum: 50,\n    defaultValue: 5,\n  });\n  const data = await profileDataset(path, {\n    workspaceRoot,\n    maxRows,\n    topValues,\n  });\n\n  return {\n    ok: true,\n    command: \"data profile\",\n    data,\n    warnings: data.warnings,\n    text: renderProfile(data),\n  };\n}\n\nasync function runConvert(args, context, workspaceRoot) {\n  const parsed = parseCommandArguments(args, {\n    booleans: [\"allow-outside\", \"overwrite\"],\n    values: [\"output\", \"format\"],\n  });\n  requirePositionals(parsed.positionals, 1, \"mydash data convert <file>\");\n\n  requireOutput(parsed.options.output, \"Data conversion\");\n\n  const path = await resolveSource(\n    parsed.positionals[0],\n    parsed.options,\n    context,\n    workspaceRoot,\n  );\n  const dataset = await loadDataset(path, { workspaceRoot });\n  const output = await writeDataset(dataset.records, {\n    outputPath: resolveOutput(parsed.options.output, workspaceRoot),\n    format: parsed.options.format,\n    overwrite: parsed.options.overwrite ?? false,\n    workspaceRoot,\n  });\n\n  return {\n    ok: true,\n    command: \"data convert\",\n    data: {\n      source: dataset.displayPath,\n      rowCount: dataset.records.length,\n      output,\n    },\n    text: `Converted ${dataset.records.length} rows to ${output.displayPath}.`,\n  };\n}\n\nasync function runSelect(args, context, workspaceRoot) {\n  const parsed = parseCommandArguments(args, {\n    booleans: [\"allow-outside\", \"overwrite\"],\n    values: [\"columns\", \"output\", \"format\"],\n  });\n  requirePositionals(parsed.positionals, 1, \"mydash data select <file>\");\n\n  if (!parsed.options.columns) {\n    throw new CliError(\n      \"MISSING_COLUMNS\",\n      \"Column selection requires --columns <name,name,...>.\",\n      { exitCode: EXIT_USAGE },\n    );\n  }\n  requireOutput(parsed.options.output, \"Column selection\");\n\n  const path = await resolveSource(\n    parsed.positionals[0],\n    parsed.options,\n    context,\n    workspaceRoot,\n  );\n  const dataset = await loadDataset(path, { workspaceRoot });\n  const columns = parseColumnList(parsed.options.columns);\n  const records = selectColumns(dataset.records, columns);\n  const output = await writeDataset(records, {\n    outputPath: resolveOutput(parsed.options.output, workspaceRoot),\n    format: parsed.options.format,\n    overwrite: parsed.options.overwrite ?? false,\n    workspaceRoot,\n  });\n\n  return {\n    ok: true,\n    command: \"data select\",\n    data: {\n      source: dataset.displayPath,\n      columns,\n      rowCount: records.length,\n      output,\n    },\n    text: `Selected ${columns.length} columns across ${records.length} rows.`,\n  };\n}\n\nasync function runFilter(args, context, workspaceRoot) {\n  const parsed = parseCommandArguments(args, {\n    booleans: [\"allow-outside\", \"overwrite\"],\n    values: [\"where\", \"output\", \"format\"],\n  });\n  requirePositionals(parsed.positionals, 1, \"mydash data filter <file>\");\n\n  if (!parsed.options.where) {\n    throw new CliError(\n      \"MISSING_FILTER\",\n      \"Filtering requires --where <expression>.\",\n      { exitCode: EXIT_USAGE },\n    );\n  }\n  requireOutput(parsed.options.output, \"Filtering\");\n\n  const path = await resolveSource(\n    parsed.positionals[0],\n    parsed.options,\n    context,\n    workspaceRoot,\n  );\n  const dataset = await loadDataset(path, { workspaceRoot });\n  const result = filterRecords(dataset.records, parsed.options.where);\n  const output = await writeDataset(result.records, {\n    outputPath: resolveOutput(parsed.options.output, workspaceRoot),\n    format: parsed.options.format,\n    overwrite: parsed.options.overwrite ?? false,\n    workspaceRoot,\n  });\n\n  return {\n    ok: true,\n    command: \"data filter\",\n    data: {\n      source: dataset.displayPath,\n      expression: result.expression,\n      inputRows: dataset.records.length,\n      outputRows: result.records.length,\n      output,\n    },\n    text: `Filtered ${dataset.records.length} rows to ${result.records.length}.`,\n  };\n}\n\nasync function runDeduplicate(args, context, workspaceRoot) {\n  const parsed = parseCommandArguments(args, {\n    booleans: [\"allow-outside\", \"overwrite\"],\n    values: [\"key\", \"output\", \"format\"],\n  });\n  requirePositionals(\n    parsed.positionals,\n    1,\n    \"mydash data deduplicate <file>\",\n  );\n\n  if (!parsed.options.key) {\n    throw new CliError(\n      \"MISSING_DEDUPLICATION_KEY\",\n      \"Deduplication requires --key <column[,column...]>.\",\n      { exitCode: EXIT_USAGE },\n    );\n  }\n  requireOutput(parsed.options.output, \"Deduplication\");\n\n  const path = await resolveSource(\n    parsed.positionals[0],\n    parsed.options,\n    context,\n    workspaceRoot,\n  );\n  const dataset = await loadDataset(path, { workspaceRoot });\n  const keys = parseColumnList(parsed.options.key);\n  const result = deduplicateRecords(dataset.records, keys);\n  const output = await writeDataset(result.records, {\n    outputPath: resolveOutput(parsed.options.output, workspaceRoot),\n    format: parsed.options.format,\n    overwrite: parsed.options.overwrite ?? false,\n    workspaceRoot,\n  });\n\n  return {\n    ok: true,\n    command: \"data deduplicate\",\n    data: {\n      source: dataset.displayPath,\n      keys,\n      inputRows: dataset.records.length,\n      outputRows: result.records.length,\n      removedRows: result.removedRows,\n      output,\n    },\n    text: `Removed ${result.removedRows} duplicate rows.`,\n  };\n}\n\nasync function runCreateRecipe(args, context, workspaceRoot) {\n  const parsed = parseCommandArguments(args, {\n    booleans: [\"allow-outside\", \"overwrite\", \"output-overwrite\"],\n    values: [\n      \"id\",\n      \"type\",\n      \"sheet\",\n      \"table\",\n      \"range\",\n      \"output\",\n      \"format\",\n      \"recipe\",\n    ],\n  });\n  requirePositionals(\n    parsed.positionals,\n    1,\n    \"mydash data create-recipe <source>\",\n  );\n\n  if (!workspaceRoot) {\n    throw new CliError(\n      \"WORKSPACE_REQUIRED_FOR_WRITE\",\n      \"Recipe creation requires a My Dashboards workspace.\",\n      { exitCode: 5 },\n    );\n  }\n\n  for (const required of [\"id\", \"output\", \"recipe\"]) {\n    if (!parsed.options[required]) {\n      throw new CliError(\n        \"MISSING_RECIPE_OPTION\",\n        `Recipe creation requires --${required.replace(/[A-Z]/g, (value) => `-${value.toLowerCase()}`)}.`,\n        { exitCode: EXIT_USAGE },\n      );\n    }\n  }\n\n  const source = await resolveSource(\n    parsed.positionals[0],\n    parsed.options,\n    context,\n    workspaceRoot,\n  );\n  const result = await createRecipe({\n    workspaceRoot,\n    sourcePath: source,\n    recipePath: resolve(workspaceRoot, parsed.options.recipe),\n    id: parsed.options.id,\n    sourceType: parsed.options.type,\n    sheet: parsed.options.sheet,\n    table: parsed.options.table,\n    range: parsed.options.range,\n    outputPath: parsed.options.output,\n    outputFormat: parsed.options.format,\n    outputOverwrite: parsed.options.outputOverwrite ?? false,\n    overwrite: parsed.options.overwrite ?? false,\n  });\n\n  return {\n    ok: true,\n    command: \"data create-recipe\",\n    data: result,\n    text: `Created recipe ${result.recipe.id} at ${result.displayPath}.`,\n  };\n}\n\nasync function runRefresh(args, context, workspaceRoot) {\n  const parsed = parseCommandArguments(args, {\n    booleans: [\"overwrite\", \"no-provenance\"],\n  });\n  requirePositionals(\n    parsed.positionals,\n    1,\n    \"mydash data refresh <recipe.json>\",\n  );\n\n  if (!workspaceRoot) {\n    throw new CliError(\n      \"WORKSPACE_REQUIRED_FOR_WRITE\",\n      \"Recipe refresh requires a My Dashboards workspace.\",\n      { exitCode: 5 },\n    );\n  }\n\n  const recipePath = await resolveCommandPath(parsed.positionals[0], {\n    cwd: context.cwd,\n    workspaceRoot,\n    allowOutside: false,\n    mustExist: true,\n    requireFile: true,\n  });\n\n  const data = await refreshRecipe(recipePath, {\n    workspaceRoot,\n    overwrite: parsed.options.overwrite,\n    provenance: !(parsed.options.noProvenance ?? false),\n  });\n\n  return {\n    ok: true,\n    command: \"data refresh\",\n    data,\n    warnings: data.warnings,\n    text: `Refreshed ${data.rowCount} rows to ${data.output.displayPath}.`,\n  };\n}\n\nasync function resolveSource(input, options, context, workspaceRoot) {\n  return resolveCommandPath(input, {\n    cwd: context.cwd,\n    workspaceRoot,\n    allowOutside: options.allowOutside ?? false,\n    mustExist: true,\n    requireFile: true,\n  });\n}\n\nfunction resolveOutput(input, workspaceRoot) {\n  if (!workspaceRoot) {\n    throw new CliError(\n      \"WORKSPACE_REQUIRED_FOR_WRITE\",\n      \"Data outputs require a My Dashboards workspace.\",\n      { exitCode: 5 },\n    );\n  }\n\n  return resolve(workspaceRoot, input);\n}\n\nfunction requireOutput(value, operation) {\n  if (!value) {\n    throw new CliError(\n      \"MISSING_OUTPUT\",\n      `${operation} requires --output <path>.`,\n      { exitCode: EXIT_USAGE },\n    );\n  }\n}\n\nfunction renderInspection(data) {\n  return [\n    `Data: ${data.displayPath}`,\n    `Format: ${data.format}`,\n    `Rows: ${data.rowCount}${data.sampled ? \" (sampled)\" : \"\"}`,\n    `Columns: ${data.columnCount}`,\n    `Shape: ${data.shape}`,\n    `Fields: ${data.columns.join(\", \") || \"(none)\"}`,\n  ].join(\"\\n\");\n}\n\nfunction renderProfile(data) {\n  const lines = [\n    `Data profile: ${data.displayPath}`,\n    `Rows analysed: ${data.analysedRows}${data.sampled ? ` of ${data.rowCount}` : \"\"}`,\n    `Columns: ${data.columnCount}`,\n    `Duplicate rows: ${data.duplicateRowCount}`,\n    \"\",\n  ];\n\n  for (const column of data.columns) {\n    lines.push(\n      `${column.name}: ${column.type}, ${column.nullCount} null, ${column.uniqueCount} unique`,\n    );\n  }\n\n  return lines.join(\"\\n\");\n}\n"}, "src/data/csv.mjs": {"content": "export function parseCsv(source, options = {}) {\n  if (typeof source !== \"string\") {\n    throw new TypeError(\"CSV source must be a string.\");\n  }\n\n  const delimiter = options.delimiter ?? \",\";\n  if (delimiter.length !== 1) {\n    throw new Error(\"CSV delimiter must be one character.\");\n  }\n\n  const rows = [];\n  let row = [];\n  let field = \"\";\n  let quoted = false;\n\n  for (let index = 0; index < source.length; index += 1) {\n    const character = source[index];\n\n    if (quoted) {\n      if (character === '\"') {\n        if (source[index + 1] === '\"') {\n          field += '\"';\n          index += 1;\n        } else {\n          quoted = false;\n        }\n      } else {\n        field += character;\n      }\n      continue;\n    }\n\n    if (character === '\"') {\n      if (field.length !== 0) {\n        throw new Error(\n          `Unexpected quote in CSV field at character ${index}.`,\n        );\n      }\n      quoted = true;\n      continue;\n    }\n\n    if (character === delimiter) {\n      row.push(field);\n      field = \"\";\n      continue;\n    }\n\n    if (character === \"\\n\" || character === \"\\r\") {\n      if (character === \"\\r\" && source[index + 1] === \"\\n\") {\n        index += 1;\n      }\n\n      row.push(field);\n      rows.push(row);\n      row = [];\n      field = \"\";\n      continue;\n    }\n\n    field += character;\n  }\n\n  if (quoted) {\n    throw new Error(\"CSV input ended inside a quoted field.\");\n  }\n\n  if (field.length > 0 || row.length > 0) {\n    row.push(field);\n    rows.push(row);\n  }\n\n  while (\n    rows.length > 0 &&\n    rows.at(-1).every((value) => value === \"\")\n  ) {\n    rows.pop();\n  }\n\n  return rows;\n}\n\nexport function csvToRecords(source, options = {}) {\n  const rows = parseCsv(source, options);\n\n  if (rows.length === 0) {\n    return {\n      records: [],\n      columns: [],\n      matrix: [],\n    };\n  }\n\n  const columns = uniqueHeaders(rows[0]);\n  const records = rows.slice(1).map((row) =>\n    Object.fromEntries(\n      columns.map((column, index) => [column, row[index] ?? \"\"]),\n    ),\n  );\n\n  return {\n    records,\n    columns,\n    matrix: rows,\n  };\n}\n\nexport function recordsToCsv(records) {\n  if (!Array.isArray(records) || records.length === 0) return \"\";\n\n  const columns = collectColumns(records);\n  const rows = [\n    columns,\n    ...records.map((record) =>\n      columns.map((column) => record[column] ?? null),\n    ),\n  ];\n\n  return rows.map((row) => row.map(csvCell).join(\",\")).join(\"\\n\");\n}\n\nfunction csvCell(value) {\n  if (value === null || value === undefined) return \"\";\n\n  const text =\n    typeof value === \"object\" ? JSON.stringify(value) : String(value);\n\n  return /[\",\\r\\n]/.test(text)\n    ? `\"${text.replaceAll('\"', '\"\"')}\"`\n    : text;\n}\n\nfunction uniqueHeaders(row) {\n  const counts = new Map();\n\n  return row.map((value, index) => {\n    const base = String(value ?? \"\").trim() || `column-${index + 1}`;\n    const count = (counts.get(base) ?? 0) + 1;\n    counts.set(base, count);\n    return count === 1 ? base : `${base}-${count}`;\n  });\n}\n\nfunction collectColumns(records) {\n  const columns = [];\n  const seen = new Set();\n\n  for (const record of records) {\n    for (const key of Object.keys(record)) {\n      if (!seen.has(key)) {\n        seen.add(key);\n        columns.push(key);\n      }\n    }\n  }\n\n  return columns;\n}\n"}, "src/data/load.mjs": {"content": "import { readFile, stat } from \"node:fs/promises\";\nimport { extname, relative } from \"node:path\";\nimport { csvToRecords } from \"./csv.mjs\";\n\nconst MAX_FILE_BYTES = 100 * 1024 * 1024;\nconst SUPPORTED_FORMATS = new Set([\"csv\", \"json\", \"ndjson\"]);\n\nexport async function loadDataset(path, options = {}) {\n  const metadata = await stat(path);\n\n  if (!metadata.isFile()) {\n    throw new Error(`Data source is not a file: ${path}`);\n  }\n\n  if (metadata.size > (options.maxBytes ?? MAX_FILE_BYTES)) {\n    throw new Error(\n      `Data source exceeds the ${options.maxBytes ?? MAX_FILE_BYTES} byte safety limit.`,\n    );\n  }\n\n  const format = options.format ?? detectFormat(path);\n  const source = await readFile(path, \"utf8\");\n  const parsed = parseByFormat(source, format);\n  const records = normaliseRecords(parsed.records);\n  const maxRows = options.maxRows ?? Number.MAX_SAFE_INTEGER;\n  const limited = records.slice(0, maxRows);\n\n  return {\n    source: path,\n    displayPath: displayPath(path, options.workspaceRoot),\n    format,\n    shape: parsed.shape,\n    records: limited,\n    rowCount: records.length,\n    sampled: limited.length < records.length,\n    columns: collectColumns(limited),\n    sizeBytes: metadata.size,\n    warnings: parsed.warnings,\n  };\n}\n\nexport function detectFormat(path) {\n  const extension = extname(path).toLowerCase();\n\n  if (extension === \".csv\") return \"csv\";\n  if (extension === \".json\") return \"json\";\n  if (extension === \".ndjson\" || extension === \".jsonl\") return \"ndjson\";\n\n  throw new Error(\n    `Unsupported data format ${extension || \"(none)\"}. Use CSV, JSON or NDJSON.`,\n  );\n}\n\nfunction parseByFormat(source, format) {\n  if (!SUPPORTED_FORMATS.has(format)) {\n    throw new Error(`Unsupported data format: ${format}`);\n  }\n\n  if (format === \"csv\") {\n    const parsed = csvToRecords(stripByteOrderMark(source));\n    return {\n      records: parsed.records,\n      shape: \"records\",\n      warnings: [],\n    };\n  }\n\n  if (format === \"ndjson\") {\n    const records = [];\n    const warnings = [];\n\n    for (const [index, line] of source.split(/\\r?\\n/).entries()) {\n      if (!line.trim()) continue;\n\n      try {\n        records.push(JSON.parse(line));\n      } catch (error) {\n        throw new Error(\n          `Invalid NDJSON on line ${index + 1}: ${error.message}`,\n        );\n      }\n    }\n\n    return {\n      records,\n      shape: \"records\",\n      warnings,\n    };\n  }\n\n  let value;\n  try {\n    value = JSON.parse(stripByteOrderMark(source));\n  } catch (error) {\n    throw new Error(`Invalid JSON: ${error.message}`);\n  }\n\n  if (Array.isArray(value)) {\n    if (value.every(isPlainObject)) {\n      return {\n        records: value,\n        shape: \"records\",\n        warnings: [],\n      };\n    }\n\n    if (value.every(Array.isArray)) {\n      return {\n        records: matrixToRecords(value),\n        shape: \"matrix\",\n        warnings: [\n          {\n            code: \"JSON_MATRIX_NORMALISED\",\n            message:\n              \"The JSON array-of-arrays was normalised using its first row as column names.\",\n          },\n        ],\n      };\n    }\n\n    return {\n      records: value.map((item, index) => ({\n        index,\n        value: item,\n      })),\n      shape: \"values\",\n      warnings: [\n        {\n          code: \"JSON_VALUES_NORMALISED\",\n          message:\n            \"The JSON array contained scalar or mixed values and was normalised into index/value records.\",\n        },\n      ],\n    };\n  }\n\n  if (isPlainObject(value)) {\n    return {\n      records: [value],\n      shape: \"object\",\n      warnings: [\n        {\n          code: \"JSON_OBJECT_NORMALISED\",\n          message:\n            \"A single JSON object was treated as one record.\",\n        },\n      ],\n    };\n  }\n\n  return {\n    records: [{ value }],\n    shape: \"scalar\",\n    warnings: [\n      {\n        code: \"JSON_SCALAR_NORMALISED\",\n        message: \"A scalar JSON value was treated as one record.\",\n      },\n    ],\n  };\n}\n\nfunction normaliseRecords(records) {\n  return records.map((record, index) => {\n    if (isPlainObject(record)) return record;\n\n    return {\n      index,\n      value: record,\n    };\n  });\n}\n\nfunction matrixToRecords(matrix) {\n  if (matrix.length === 0) return [];\n  const headers = uniqueHeaders(matrix[0]);\n\n  return matrix.slice(1).map((row) =>\n    Object.fromEntries(\n      headers.map((header, index) => [header, row[index] ?? null]),\n    ),\n  );\n}\n\nfunction uniqueHeaders(row) {\n  const counts = new Map();\n\n  return row.map((value, index) => {\n    const base = String(value ?? \"\").trim() || `column-${index + 1}`;\n    const count = (counts.get(base) ?? 0) + 1;\n    counts.set(base, count);\n    return count === 1 ? base : `${base}-${count}`;\n  });\n}\n\nfunction collectColumns(records) {\n  const columns = [];\n  const seen = new Set();\n\n  for (const record of records) {\n    for (const key of Object.keys(record)) {\n      if (!seen.has(key)) {\n        seen.add(key);\n        columns.push(key);\n      }\n    }\n  }\n\n  return columns;\n}\n\nfunction stripByteOrderMark(value) {\n  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;\n}\n\nfunction isPlainObject(value) {\n  return (\n    value !== null &&\n    typeof value === \"object\" &&\n    !Array.isArray(value)\n  );\n}\n\nfunction displayPath(path, workspaceRoot) {\n  if (!workspaceRoot) return path;\n\n  const value = relative(workspaceRoot, path).replaceAll(\"\\\\\", \"/\");\n  return value.startsWith(\"..\") ? path : value || \".\";\n}\n"}, "src/data/inspect.mjs": {"content": "import { loadDataset } from \"./load.mjs\";\n\nexport async function inspectDataset(path, options = {}) {\n  const dataset = await loadDataset(path, options);\n\n  return {\n    source: dataset.source,\n    displayPath: dataset.displayPath,\n    format: dataset.format,\n    shape: dataset.shape,\n    rowCount: dataset.rowCount,\n    sampled: dataset.sampled,\n    sampleRowCount: dataset.records.length,\n    columnCount: dataset.columns.length,\n    columns: dataset.columns,\n    sizeBytes: dataset.sizeBytes,\n    sample: dataset.records.slice(0, 10),\n    warnings: dataset.warnings,\n  };\n}\n"}, "src/data/profile.mjs": {"content": "import { loadDataset } from \"./load.mjs\";\n\nexport async function profileDataset(path, options = {}) {\n  const dataset = await loadDataset(path, {\n    ...options,\n    maxRows: options.maxRows ?? 10000,\n  });\n  const columns = dataset.columns.map((name) =>\n    profileColumn(name, dataset.records, options),\n  );\n  const warnings = [...dataset.warnings];\n\n  for (const column of columns) {\n    if (column.type === \"mixed\") {\n      warnings.push({\n        code: \"MIXED_COLUMN_TYPE\",\n        message: `Column ${column.name} contains mixed value types.`,\n      });\n    }\n  }\n\n  return {\n    source: dataset.source,\n    displayPath: dataset.displayPath,\n    format: dataset.format,\n    rowCount: dataset.rowCount,\n    analysedRows: dataset.records.length,\n    sampled: dataset.sampled,\n    columnCount: columns.length,\n    duplicateRowCount: countDuplicateRows(dataset.records),\n    columns,\n    warnings,\n  };\n}\n\nfunction profileColumn(name, records, options) {\n  const values = records.map((record) => record[name]);\n  const nonNull = values.filter((value) => !isNullLike(value));\n  const classifications = nonNull.map(classifyValue);\n  const distinctTypes = [...new Set(classifications)];\n  const type =\n    nonNull.length === 0\n      ? \"empty\"\n      : distinctTypes.length === 1\n        ? distinctTypes[0]\n        : mergeCompatibleTypes(distinctTypes);\n  const frequencies = new Map();\n\n  for (const value of nonNull) {\n    const key = stableValue(value);\n    frequencies.set(key, (frequencies.get(key) ?? 0) + 1);\n  }\n\n  const topValues = [...frequencies.entries()]\n    .sort(\n      (left, right) =>\n        right[1] - left[1] || left[0].localeCompare(right[0], \"en\"),\n    )\n    .slice(0, options.topValues ?? 5)\n    .map(([value, count]) => ({\n      value: parseStableValue(value),\n      count,\n    }));\n\n  const numeric = nonNull\n    .map(toFiniteNumber)\n    .filter((value) => value !== null);\n  const dates = nonNull\n    .map(toDateTimestamp)\n    .filter((value) => value !== null);\n\n  return {\n    name,\n    type,\n    nullCount: values.length - nonNull.length,\n    nonNullCount: nonNull.length,\n    uniqueCount: frequencies.size,\n    uniqueRatio:\n      nonNull.length === 0\n        ? 0\n        : Math.round((frequencies.size / nonNull.length) * 10000) / 10000,\n    possibleIdentifier:\n      nonNull.length > 0 &&\n      frequencies.size === nonNull.length &&\n      values.length === nonNull.length,\n    minimum:\n      numeric.length === nonNull.length && numeric.length > 0\n        ? Math.min(...numeric)\n        : null,\n    maximum:\n      numeric.length === nonNull.length && numeric.length > 0\n        ? Math.max(...numeric)\n        : null,\n    mean:\n      numeric.length === nonNull.length && numeric.length > 0\n        ? round(numeric.reduce((sum, value) => sum + value, 0) / numeric.length)\n        : null,\n    earliest:\n      dates.length === nonNull.length && dates.length > 0\n        ? new Date(Math.min(...dates)).toISOString()\n        : null,\n    latest:\n      dates.length === nonNull.length && dates.length > 0\n        ? new Date(Math.max(...dates)).toISOString()\n        : null,\n    topValues,\n  };\n}\n\nfunction classifyValue(value) {\n  if (typeof value === \"boolean\") return \"boolean\";\n  if (typeof value === \"number\") {\n    return Number.isInteger(value) ? \"integer\" : \"number\";\n  }\n  if (value instanceof Date) return \"date\";\n\n  if (typeof value === \"string\") {\n    const trimmed = value.trim();\n\n    if (/^(true|false)$/i.test(trimmed)) return \"boolean\";\n    if (/^[+-]?\\d+$/.test(trimmed)) return \"integer\";\n    if (\n      /^[+-]?(?:\\d+\\.\\d*|\\d*\\.\\d+)(?:e[+-]?\\d+)?$/i.test(trimmed)\n    ) {\n      return \"number\";\n    }\n    if (looksLikeDate(trimmed)) return \"date\";\n    return \"string\";\n  }\n\n  if (Array.isArray(value)) return \"array\";\n  if (value !== null && typeof value === \"object\") return \"object\";\n  return typeof value;\n}\n\nfunction mergeCompatibleTypes(types) {\n  const set = new Set(types);\n\n  if (\n    [...set].every((value) => value === \"integer\" || value === \"number\")\n  ) {\n    return \"number\";\n  }\n\n  return \"mixed\";\n}\n\nfunction looksLikeDate(value) {\n  if (\n    !/^\\d{4}-\\d{2}-\\d{2}(?:[T\\s].*)?$/.test(value) &&\n    !/^\\d{1,2}\\/\\d{1,2}\\/\\d{4}$/.test(value)\n  ) {\n    return false;\n  }\n\n  return !Number.isNaN(Date.parse(value));\n}\n\nfunction toFiniteNumber(value) {\n  if (typeof value === \"number\" && Number.isFinite(value)) return value;\n\n  if (\n    typeof value === \"string\" &&\n    /^[+-]?(?:\\d+|\\d+\\.\\d*|\\d*\\.\\d+)(?:e[+-]?\\d+)?$/i.test(\n      value.trim(),\n    )\n  ) {\n    const parsed = Number(value);\n    return Number.isFinite(parsed) ? parsed : null;\n  }\n\n  return null;\n}\n\nfunction toDateTimestamp(value) {\n  if (value instanceof Date && !Number.isNaN(value.getTime())) {\n    return value.getTime();\n  }\n\n  if (typeof value === \"string\" && looksLikeDate(value.trim())) {\n    const parsed = Date.parse(value);\n    return Number.isNaN(parsed) ? null : parsed;\n  }\n\n  return null;\n}\n\nfunction countDuplicateRows(records) {\n  const seen = new Set();\n  let duplicates = 0;\n\n  for (const record of records) {\n    const key = stableValue(record);\n    if (seen.has(key)) {\n      duplicates += 1;\n    } else {\n      seen.add(key);\n    }\n  }\n\n  return duplicates;\n}\n\nfunction isNullLike(value) {\n  return value === null || value === undefined || value === \"\";\n}\n\nfunction stableValue(value) {\n  return JSON.stringify(sortValue(value));\n}\n\nfunction parseStableValue(value) {\n  try {\n    return JSON.parse(value);\n  } catch {\n    return value;\n  }\n}\n\nfunction sortValue(value) {\n  if (Array.isArray(value)) return value.map(sortValue);\n\n  if (value !== null && typeof value === \"object\") {\n    return Object.fromEntries(\n      Object.keys(value)\n        .sort()\n        .map((key) => [key, sortValue(value[key])]),\n    );\n  }\n\n  return value;\n}\n\nfunction round(value) {\n  return Math.round(value * 10000) / 10000;\n}\n"}, "src/data/transform.mjs": {"content": "export function parseColumnList(value) {\n  if (typeof value !== \"string\") {\n    throw new Error(\"Column list must be a comma-separated string.\");\n  }\n\n  const columns = value\n    .split(\",\")\n    .map((column) => column.trim())\n    .filter(Boolean);\n\n  if (columns.length === 0) {\n    throw new Error(\"At least one column is required.\");\n  }\n\n  return [...new Set(columns)];\n}\n\nexport function selectColumns(records, columns) {\n  assertColumnsExist(records, columns);\n\n  return records.map((record) =>\n    Object.fromEntries(\n      columns.map((column) => [column, record[column] ?? null]),\n    ),\n  );\n}\n\nexport function filterRecords(records, expressionSource) {\n  const expression = parseFilterExpression(expressionSource);\n  assertColumnsExist(records, [expression.column]);\n\n  return {\n    expression,\n    records: records.filter((record) =>\n      matchesExpression(record[expression.column], expression),\n    ),\n  };\n}\n\nexport function deduplicateRecords(records, keys) {\n  assertColumnsExist(records, keys);\n\n  const seen = new Set();\n  const output = [];\n  let removedRows = 0;\n\n  for (const record of records) {\n    const identity = JSON.stringify(\n      keys.map((key) => normaliseComparable(record[key])),\n    );\n\n    if (seen.has(identity)) {\n      removedRows += 1;\n      continue;\n    }\n\n    seen.add(identity);\n    output.push(record);\n  }\n\n  return {\n    records: output,\n    removedRows,\n  };\n}\n\nexport function parseFilterExpression(source) {\n  if (typeof source !== \"string\" || !source.trim()) {\n    throw new Error(\"A non-empty filter expression is required.\");\n  }\n\n  const value = source.trim();\n  const unary = value.match(/^(.+?)\\s+(is-null|not-null)$/i);\n\n  if (unary) {\n    return {\n      column: unary[1].trim(),\n      operator: unary[2].toLowerCase(),\n      value: null,\n    };\n  }\n\n  const wordOperator = value.match(\n    /^(.+?)\\s+(contains|starts-with|ends-with)\\s+(.+)$/i,\n  );\n\n  if (wordOperator) {\n    return {\n      column: wordOperator[1].trim(),\n      operator: wordOperator[2].toLowerCase(),\n      value: unquote(wordOperator[3].trim()),\n    };\n  }\n\n  const symbolic = value.match(/^(.+?)\\s*(>=|<=|!=|=|>|<)\\s*(.+)$/);\n\n  if (!symbolic) {\n    throw new Error(\n      \"Invalid filter expression. Use column=value, column>=value, column contains value, column is-null or column not-null.\",\n    );\n  }\n\n  return {\n    column: symbolic[1].trim(),\n    operator: symbolic[2],\n    value: unquote(symbolic[3].trim()),\n  };\n}\n\nfunction matchesExpression(actual, expression) {\n  if (expression.operator === \"is-null\") return isNullLike(actual);\n  if (expression.operator === \"not-null\") return !isNullLike(actual);\n\n  if (\n    [\"contains\", \"starts-with\", \"ends-with\"].includes(\n      expression.operator,\n    )\n  ) {\n    const actualText = String(actual ?? \"\").toLowerCase();\n    const expectedText = String(expression.value ?? \"\").toLowerCase();\n\n    if (expression.operator === \"contains\") {\n      return actualText.includes(expectedText);\n    }\n    if (expression.operator === \"starts-with\") {\n      return actualText.startsWith(expectedText);\n    }\n    return actualText.endsWith(expectedText);\n  }\n\n  const comparison = compare(actual, expression.value);\n\n  switch (expression.operator) {\n    case \"=\":\n      return comparison === 0;\n    case \"!=\":\n      return comparison !== 0;\n    case \">\":\n      return comparison > 0;\n    case \">=\":\n      return comparison >= 0;\n    case \"<\":\n      return comparison < 0;\n    case \"<=\":\n      return comparison <= 0;\n    default:\n      return false;\n  }\n}\n\nfunction compare(left, right) {\n  const leftNumber = toNumber(left);\n  const rightNumber = toNumber(right);\n\n  if (leftNumber !== null && rightNumber !== null) {\n    return Math.sign(leftNumber - rightNumber);\n  }\n\n  const leftDate = toDate(left);\n  const rightDate = toDate(right);\n\n  if (leftDate !== null && rightDate !== null) {\n    return Math.sign(leftDate - rightDate);\n  }\n\n  return String(left ?? \"\")\n    .localeCompare(String(right ?? \"\"), \"en\", {\n      sensitivity: \"base\",\n      numeric: true,\n    });\n}\n\nfunction assertColumnsExist(records, columns) {\n  const available = new Set(\n    records.flatMap((record) => Object.keys(record)),\n  );\n  const missing = columns.filter((column) => !available.has(column));\n\n  if (missing.length > 0) {\n    throw new Error(\n      `Unknown columns: ${missing.join(\", \")}. Available columns: ${[...available].join(\", \")}`,\n    );\n  }\n}\n\nfunction toNumber(value) {\n  if (typeof value === \"number\" && Number.isFinite(value)) return value;\n  if (\n    typeof value === \"string\" &&\n    /^[+-]?(?:\\d+|\\d+\\.\\d*|\\d*\\.\\d+)(?:e[+-]?\\d+)?$/i.test(\n      value.trim(),\n    )\n  ) {\n    const parsed = Number(value);\n    return Number.isFinite(parsed) ? parsed : null;\n  }\n  return null;\n}\n\nfunction toDate(value) {\n  if (value instanceof Date && !Number.isNaN(value.getTime())) {\n    return value.getTime();\n  }\n\n  if (\n    typeof value === \"string\" &&\n    /^\\d{4}-\\d{2}-\\d{2}(?:[T\\s].*)?$/.test(value.trim())\n  ) {\n    const parsed = Date.parse(value);\n    return Number.isNaN(parsed) ? null : parsed;\n  }\n\n  return null;\n}\n\nfunction normaliseComparable(value) {\n  if (value === undefined) return null;\n  if (typeof value === \"string\") return value.trim().toLowerCase();\n  return value;\n}\n\nfunction unquote(value) {\n  if (\n    value.length >= 2 &&\n    ((value.startsWith('\"') && value.endsWith('\"')) ||\n      (value.startsWith(\"'\") && value.endsWith(\"'\")))\n  ) {\n    return value.slice(1, -1);\n  }\n\n  return value;\n}\n\nfunction isNullLike(value) {\n  return value === null || value === undefined || value === \"\";\n}\n"}, "src/data/write.mjs": {"content": "import { extname, relative } from \"node:path\";\nimport { writeFileAtomic } from \"../files/output.mjs\";\nimport { recordsToCsv } from \"./csv.mjs\";\n\nconst FORMATS = new Set([\"json\", \"csv\", \"ndjson\"]);\n\nexport async function writeDataset(records, options) {\n  const format = normaliseFormat(options.format, options.outputPath);\n  const content = serialise(records, format);\n  const path = await writeFileAtomic(options.outputPath, content, {\n    workspaceRoot: options.workspaceRoot,\n    overwrite: options.overwrite ?? false,\n    encoding: \"utf8\",\n  });\n\n  return {\n    path,\n    displayPath: displayPath(path, options.workspaceRoot),\n    format,\n    rowCount: records.length,\n    bytes: Buffer.byteLength(content),\n  };\n}\n\nfunction serialise(records, format) {\n  if (format === \"csv\") {\n    const csv = recordsToCsv(records);\n    return csv ? `${csv}\\n` : \"\";\n  }\n\n  if (format === \"ndjson\") {\n    const content = records.map((record) => JSON.stringify(record)).join(\"\\n\");\n    return content ? `${content}\\n` : \"\";\n  }\n\n  return `${JSON.stringify(records, null, 2)}\\n`;\n}\n\nfunction normaliseFormat(requested, outputPath) {\n  const inferred = extname(outputPath).toLowerCase().replace(/^\\./, \"\");\n  const format = (requested || inferred || \"json\").toLowerCase();\n\n  if (!FORMATS.has(format)) {\n    throw new Error(\n      `Unsupported output format ${format}. Use json, csv or ndjson.`,\n    );\n  }\n\n  return format;\n}\n\nfunction displayPath(path, workspaceRoot) {\n  if (!workspaceRoot) return path;\n\n  const value = relative(workspaceRoot, path).replaceAll(\"\\\\\", \"/\");\n  return value.startsWith(\"..\") ? path : value || \".\";\n}\n"}, "src/data/recipes.mjs": {"content": "import { extname, relative, resolve } from \"node:path\";\nimport { readFile } from \"node:fs/promises\";\nimport { validateDocument } from \"../validation/contracts.mjs\";\nimport { writeFileAtomic } from \"../files/output.mjs\";\nimport { hashFile } from \"../files/hash.mjs\";\nimport { loadPackageMetadata } from \"../workspace/package-metadata.mjs\";\nimport {\n  extractTable,\n  extractWorksheet,\n} from \"../office/excel.mjs\";\nimport { readPresentation } from \"../office/powerpoint.mjs\";\nimport { loadDataset } from \"./load.mjs\";\nimport { writeDataset } from \"./write.mjs\";\n\nexport async function createRecipe(options) {\n  const recipe = {\n    schemaVersion: 1,\n    id: options.id,\n    source: {\n      type:\n        options.sourceType ??\n        inferRecipeSourceType(options.sourcePath),\n      file: workspaceRelative(options.sourcePath, options.workspaceRoot),\n      ...(options.sheet ? { sheet: options.sheet } : {}),\n      ...(options.table ? { table: options.table } : {}),\n      ...(options.range ? { range: options.range } : {}),\n    },\n    output: {\n      file: normaliseWorkspaceRelative(options.outputPath),\n      format:\n        options.outputFormat ??\n        inferOutputFormat(options.outputPath),\n      overwrite: options.outputOverwrite ?? false,\n    },\n  };\n\n  const validation = validateDocument(\"dataRecipe\", recipe);\n\n  if (!validation.ok) {\n    throw new Error(\n      `Recipe is invalid: ${validation.errors\n        .map((error) => `${error.path}: ${error.message}`)\n        .join(\"; \")}`,\n    );\n  }\n\n  const path = await writeFileAtomic(\n    options.recipePath,\n    `${JSON.stringify(recipe, null, 2)}\\n`,\n    {\n      workspaceRoot: options.workspaceRoot,\n      overwrite: options.overwrite ?? false,\n      encoding: \"utf8\",\n    },\n  );\n\n  return {\n    path,\n    displayPath: workspaceRelative(path, options.workspaceRoot),\n    recipe,\n  };\n}\n\nexport async function refreshRecipe(recipePath, options) {\n  const source = await readFile(recipePath, \"utf8\");\n  let recipe;\n\n  try {\n    recipe = JSON.parse(source);\n  } catch (error) {\n    throw new Error(`Recipe JSON is invalid: ${error.message}`);\n  }\n\n  const validation = validateDocument(\"dataRecipe\", recipe);\n\n  if (!validation.ok) {\n    throw new Error(\n      `Recipe is invalid: ${validation.errors\n        .map((error) => `${error.path}: ${error.message}`)\n        .join(\"; \")}`,\n    );\n  }\n\n  const sourcePath = resolve(options.workspaceRoot, recipe.source.file);\n  const outputPath = resolve(options.workspaceRoot, recipe.output.file);\n  const extracted = await extractRecipeSource(sourcePath, recipe, options);\n  const overwrite =\n    options.overwrite ??\n    recipe.output.overwrite ??\n    false;\n  const output = await writeDataset(extracted.records, {\n    outputPath,\n    format: recipe.output.format,\n    overwrite,\n    workspaceRoot: options.workspaceRoot,\n  });\n  const warnings = [...(extracted.warnings ?? [])];\n  let provenance = null;\n\n  if (options.provenance !== false) {\n    provenance = await writeProvenance({\n      recipePath,\n      sourcePath,\n      outputPath,\n      workspaceRoot: options.workspaceRoot,\n      overwrite: true,\n    });\n  }\n\n  return {\n    recipe: recipe.id,\n    source: workspaceRelative(sourcePath, options.workspaceRoot),\n    rowCount: extracted.records.length,\n    output,\n    provenance,\n    warnings,\n  };\n}\n\nasync function extractRecipeSource(sourcePath, recipe, options) {\n  if (recipe.source.type === \"excel\") {\n    const result = recipe.source.table\n      ? await extractTable(sourcePath, recipe.source.table, {\n          workspaceRoot: options.workspaceRoot,\n          header: true,\n        })\n      : await extractWorksheet(sourcePath, {\n          workspaceRoot: options.workspaceRoot,\n          sheet: recipe.source.sheet,\n          range: recipe.source.range,\n          header: true,\n        });\n\n    return {\n      records: result.records,\n      warnings: [],\n    };\n  }\n\n  if (recipe.source.type === \"powerpoint\") {\n    const result = await readPresentation(sourcePath, {\n      workspaceRoot: options.workspaceRoot,\n    });\n\n    return {\n      records: result.slides.map((slide) => ({\n        number: slide.number,\n        title: slide.title,\n        text: slide.text.join(\"\\n\"),\n        notes: slide.notes.join(\"\\n\"),\n        hidden: slide.hidden,\n        imageCount: slide.images.length,\n        chartCount: slide.charts.length,\n        tableCount: slide.tableCount,\n      })),\n      warnings: [],\n    };\n  }\n\n  const dataset = await loadDataset(sourcePath, {\n    workspaceRoot: options.workspaceRoot,\n  });\n\n  return {\n    records: dataset.records,\n    warnings: dataset.warnings,\n  };\n}\n\nasync function writeProvenance(options) {\n  const sourceHash = await hashFile(options.sourcePath, {\n    algorithm: \"sha256\",\n    workspaceRoot: options.workspaceRoot,\n  });\n  const metadata = await loadPackageMetadata(options.workspaceRoot);\n  const provenance = {\n    schemaVersion: 1,\n    source: workspaceRelative(\n      options.sourcePath,\n      options.workspaceRoot,\n    ),\n    sourceHash: sourceHash.hash,\n    generatedAt: new Date().toISOString(),\n    command: `mydash data refresh ${workspaceRelative(\n      options.recipePath,\n      options.workspaceRoot,\n    )}`,\n    toolVersion: metadata.version,\n  };\n  const validation = validateDocument(\"provenance\", provenance);\n\n  if (!validation.ok) {\n    throw new Error(\n      `Generated provenance is invalid: ${validation.errors\n        .map((error) => `${error.path}: ${error.message}`)\n        .join(\"; \")}`,\n    );\n  }\n\n  const provenancePath = provenancePathFor(options.outputPath);\n  await writeFileAtomic(\n    provenancePath,\n    `${JSON.stringify(provenance, null, 2)}\\n`,\n    {\n      workspaceRoot: options.workspaceRoot,\n      overwrite: options.overwrite ?? true,\n      encoding: \"utf8\",\n    },\n  );\n\n  return {\n    path: provenancePath,\n    displayPath: workspaceRelative(\n      provenancePath,\n      options.workspaceRoot,\n    ),\n    value: provenance,\n  };\n}\n\nfunction inferRecipeSourceType(path) {\n  const extension = extname(path).toLowerCase();\n\n  if ([\".xlsx\", \".xlsm\"].includes(extension)) return \"excel\";\n  if ([\".pptx\", \".pptm\"].includes(extension)) return \"powerpoint\";\n  if (extension === \".csv\") return \"csv\";\n  if ([\".json\", \".ndjson\", \".jsonl\"].includes(extension)) return \"json\";\n\n  throw new Error(\n    `Cannot infer recipe source type from ${extension || \"(no extension)\"}.`,\n  );\n}\n\nfunction inferOutputFormat(path) {\n  const extension = extname(path).toLowerCase().replace(/^\\./, \"\");\n  return [\"csv\", \"json\", \"ndjson\"].includes(extension)\n    ? extension\n    : \"json\";\n}\n\nfunction provenancePathFor(outputPath) {\n  const extension = extname(outputPath);\n  return extension\n    ? `${outputPath.slice(0, -extension.length)}.provenance.json`\n    : `${outputPath}.provenance.json`;\n}\n\nfunction workspaceRelative(path, workspaceRoot) {\n  const value = relative(workspaceRoot, path).replaceAll(\"\\\\\", \"/\");\n\n  if (value.startsWith(\"..\")) {\n    throw new Error(`Path is outside the workspace: ${path}`);\n  }\n\n  return value || \".\";\n}\n\nfunction normaliseWorkspaceRelative(path) {\n  const value = String(path).replaceAll(\"\\\\\", \"/\").replace(/^\\/+/, \"\");\n\n  if (!value || value.split(\"/\").includes(\"..\") || /^[A-Za-z]:/.test(value)) {\n    throw new Error(`Output path must be workspace-relative: ${path}`);\n  }\n\n  return value;\n}\n"}, "src/data/README.md": {"content": "# Data utilities\n\nThe data layer provides deterministic operations for CSV, JSON and NDJSON:\n\n- structural inspection;\n- column profiling;\n- conversion;\n- column selection;\n- safe row filtering;\n- key-based deduplication;\n- repeatable extraction recipes;\n- source hashing and provenance.\n\n## Safety\n\n- No user expression is evaluated as JavaScript.\n- Filter expressions use a small explicit grammar.\n- Input files are limited to 100 MB by default.\n- Outputs remain inside the workspace.\n- Existing outputs require explicit overwrite.\n- Writes are atomic.\n- Recipe source files are hashed using SHA-256.\n- Formula execution, spreadsheet macros and document scripts are never run.\n\n## Filter grammar\n\nExamples:\n\n```text\nstatus=Approved\namount>=1000\nowner contains smith\ncreated>=2026-01-01\nnotes is-null\nowner not-null\n```\n\nString matching is case-insensitive. Numeric and ISO-style date comparisons are\nperformed when both values can be interpreted safely.\n"}, "tests/fixtures/data/sample.csv": {"content": "id,status,owner,amount,created\nUC-001,Approved,Alice,1200,2026-01-10\nUC-002,Review,Bob,750,2026-02-01\nUC-002,Review,Bob,750,2026-02-01\nUC-003,,Carla,100,2026-03-12\n"}, "tests/fixtures/data/sample.json": {"content": "[\n  {\n    \"id\": \"UC-001\",\n    \"status\": \"Approved\",\n    \"owner\": \"Alice\",\n    \"amount\": 1200\n  },\n  {\n    \"id\": \"UC-002\",\n    \"status\": \"Review\",\n    \"owner\": \"Bob\",\n    \"amount\": 750\n  }\n]\n"}, "tests/fixtures/data/sample.ndjson": {"content": "{\"id\":\"UC-001\",\"status\":\"Approved\",\"amount\":1200}\n{\"id\":\"UC-002\",\"status\":\"Review\",\"amount\":750}\n"}, "tests/unit/data-csv.test.mjs": {"content": "import assert from \"node:assert/strict\";\nimport test from \"node:test\";\nimport {\n  csvToRecords,\n  parseCsv,\n  recordsToCsv,\n} from \"../../src/data/csv.mjs\";\n\ntest(\"CSV parser supports quoted delimiters and newlines\", () => {\n  const rows = parseCsv(\n    'id,notes\\n1,\"hello, world\"\\n2,\"two\\nlines\"\\n',\n  );\n\n  assert.deepEqual(rows, [\n    [\"id\", \"notes\"],\n    [\"1\", \"hello, world\"],\n    [\"2\", \"two\\nlines\"],\n  ]);\n});\n\ntest(\"CSV records handle duplicate and missing headings\", () => {\n  const result = csvToRecords(\"id,id,\\n1,2,3\\n\");\n\n  assert.deepEqual(result.columns, [\"id\", \"id-2\", \"column-3\"]);\n  assert.deepEqual(result.records, [\n    {\n      id: \"1\",\n      \"id-2\": \"2\",\n      \"column-3\": \"3\",\n    },\n  ]);\n});\n\ntest(\"CSV writing escapes special values\", () => {\n  const output = recordsToCsv([\n    {\n      id: \"1\",\n      notes: 'hello, \"world\"',\n    },\n  ]);\n\n  assert.equal(\n    output,\n    'id,notes\\n1,\"hello, \"\"world\"\"\"',\n  );\n});\n"}, "tests/unit/data.test.mjs": {"content": "import assert from \"node:assert/strict\";\nimport { dirname, resolve } from \"node:path\";\nimport { fileURLToPath } from \"node:url\";\nimport test from \"node:test\";\nimport { loadDataset } from \"../../src/data/load.mjs\";\nimport { profileDataset } from \"../../src/data/profile.mjs\";\nimport {\n  deduplicateRecords,\n  filterRecords,\n  selectColumns,\n} from \"../../src/data/transform.mjs\";\n\nconst testDirectory = dirname(fileURLToPath(import.meta.url));\nconst csvFixture = resolve(\n  testDirectory,\n  \"../fixtures/data/sample.csv\",\n);\n\ntest(\"CSV loading produces records and columns\", async () => {\n  const result = await loadDataset(csvFixture);\n\n  assert.equal(result.rowCount, 4);\n  assert.deepEqual(result.columns, [\n    \"id\",\n    \"status\",\n    \"owner\",\n    \"amount\",\n    \"created\",\n  ]);\n});\n\ntest(\"Profiling finds duplicates, nulls and numeric ranges\", async () => {\n  const result = await profileDataset(csvFixture);\n  const amount = result.columns.find(\n    (column) => column.name === \"amount\",\n  );\n  const status = result.columns.find(\n    (column) => column.name === \"status\",\n  );\n\n  assert.equal(result.duplicateRowCount, 1);\n  assert.equal(amount.type, \"integer\");\n  assert.equal(amount.minimum, 100);\n  assert.equal(amount.maximum, 1200);\n  assert.equal(status.nullCount, 1);\n});\n\ntest(\"Selection, filtering and deduplication compose safely\", async () => {\n  const dataset = await loadDataset(csvFixture);\n  const filtered = filterRecords(\n    dataset.records,\n    \"amount>=700\",\n  ).records;\n  const deduplicated = deduplicateRecords(\n    filtered,\n    [\"id\"],\n  ).records;\n  const selected = selectColumns(\n    deduplicated,\n    [\"id\", \"amount\"],\n  );\n\n  assert.deepEqual(selected, [\n    { id: \"UC-001\", amount: \"1200\" },\n    { id: \"UC-002\", amount: \"750\" },\n  ]);\n});\n"}, "tests/integration/data-cli.test.mjs": {"content": "import assert from \"node:assert/strict\";\nimport {\n  readFile,\n  rm,\n} from \"node:fs/promises\";\nimport { dirname, resolve } from \"node:path\";\nimport { fileURLToPath } from \"node:url\";\nimport { spawnSync } from \"node:child_process\";\nimport test from \"node:test\";\n\nconst testDirectory = dirname(fileURLToPath(import.meta.url));\nconst projectRoot = resolve(testDirectory, \"../..\");\nconst cliPath = resolve(projectRoot, \"bin\", \"mydash.mjs\");\nconst tempRoot = resolve(\n  projectRoot,\n  \".my-dashboards\",\n  \"temp\",\n  \"data-cli-tests\",\n);\n\nfunction runCli(args) {\n  return spawnSync(process.execPath, [cliPath, ...args], {\n    cwd: projectRoot,\n    encoding: \"utf8\",\n    stdio: \"pipe\",\n    shell: false,\n  });\n}\n\ntest(\"Data inspection and profiling are available through the CLI\", () => {\n  const inspect = runCli([\n    \"data\",\n    \"inspect\",\n    \"tests/fixtures/data/sample.csv\",\n    \"--json\",\n  ]);\n  const profile = runCli([\n    \"data\",\n    \"profile\",\n    \"tests/fixtures/data/sample.csv\",\n    \"--json\",\n  ]);\n\n  assert.equal(inspect.status, 0, inspect.stderr);\n  assert.equal(profile.status, 0, profile.stderr);\n  assert.equal(JSON.parse(inspect.stdout).data.rowCount, 4);\n  assert.equal(JSON.parse(profile.stdout).data.duplicateRowCount, 1);\n});\n\ntest(\"Data filtering writes a protected workspace output\", async () => {\n  await rm(tempRoot, { recursive: true, force: true });\n\n  try {\n    const result = runCli([\n      \"data\",\n      \"filter\",\n      \"tests/fixtures/data/sample.csv\",\n      \"--where\",\n      \"status=Approved\",\n      \"--output\",\n      \".my-dashboards/temp/data-cli-tests/approved.json\",\n      \"--json\",\n    ]);\n\n    assert.equal(result.status, 0, result.stderr);\n    const value = JSON.parse(\n      await readFile(\n        resolve(tempRoot, \"approved.json\"),\n        \"utf8\",\n      ),\n    );\n    assert.deepEqual(value, [\n      {\n        id: \"UC-001\",\n        status: \"Approved\",\n        owner: \"Alice\",\n        amount: \"1200\",\n        created: \"2026-01-10\",\n      },\n    ]);\n  } finally {\n    await rm(tempRoot, { recursive: true, force: true });\n  }\n});\n\ntest(\"Recipe creation and refresh produce provenance\", async () => {\n  await rm(tempRoot, { recursive: true, force: true });\n\n  try {\n    const create = runCli([\n      \"data\",\n      \"create-recipe\",\n      \"tests/fixtures/data/sample.csv\",\n      \"--id\",\n      \"sample-refresh\",\n      \"--recipe\",\n      \".my-dashboards/temp/data-cli-tests/sample.recipe.json\",\n      \"--output\",\n      \".my-dashboards/temp/data-cli-tests/refreshed.json\",\n      \"--json\",\n    ]);\n\n    assert.equal(create.status, 0, create.stderr);\n\n    const refresh = runCli([\n      \"data\",\n      \"refresh\",\n      \".my-dashboards/temp/data-cli-tests/sample.recipe.json\",\n      \"--json\",\n    ]);\n\n    assert.equal(refresh.status, 0, refresh.stderr);\n    const body = JSON.parse(refresh.stdout);\n    assert.equal(body.data.rowCount, 4);\n\n    const provenance = JSON.parse(\n      await readFile(\n        resolve(tempRoot, \"refreshed.provenance.json\"),\n        \"utf8\",\n      ),\n    );\n    assert.equal(provenance.schemaVersion, 1);\n    assert.match(provenance.sourceHash, /^[a-f0-9]{64}$/);\n  } finally {\n    await rm(tempRoot, { recursive: true, force: true });\n  }\n});\n"}, "scripts/tasks/test-data.mjs": {"content": "#!/usr/bin/env node\n\nimport { spawnSync } from \"node:child_process\";\nimport { dirname, resolve } from \"node:path\";\nimport { fileURLToPath } from \"node:url\";\nimport process from \"node:process\";\n\nconst scriptDirectory = dirname(fileURLToPath(import.meta.url));\nconst projectRoot = resolve(scriptDirectory, \"../..\");\n\nconst tests = [\n  resolve(projectRoot, \"tests\", \"unit\", \"data-csv.test.mjs\"),\n  resolve(projectRoot, \"tests\", \"unit\", \"data.test.mjs\"),\n  resolve(projectRoot, \"tests\", \"integration\", \"data-cli.test.mjs\"),\n];\n\nconst result = spawnSync(\n  process.execPath,\n  [\"--test\", ...tests],\n  {\n    cwd: projectRoot,\n    stdio: \"inherit\",\n    shell: false,\n  },\n);\n\nif (result.error) throw result.error;\nprocess.exitCode = result.status ?? 1;\n"}};

const args = parseBootstrapArgs(process.argv.slice(2));
const targetRoot = resolve(args.target ?? process.cwd());
const selfPath = resolve(fileURLToPath(import.meta.url));

const report = {
  ok: false,
  script: SCRIPT_NAME,
  targetRoot,
  dryRun: args.dryRun,
  created: [],
  updated: [],
  removed: [],
  preserved: [],
  warnings: [],
  validation: [],
  git: {
    commit: null,
    pushed: false,
    pushTarget: null,
  },
};

main().catch((error) => {
  report.warnings.push({
    code: "UNEXPECTED_FAILURE",
    message: error instanceof Error ? error.message : String(error),
  });
  finish(1);
});

async function main() {
  assertNodeVersion();
  await assertBootstrapFoundation();

  const repoRoot = getRepositoryRoot(targetRoot);
  if (!repoRoot || resolve(repoRoot) !== targetRoot) {
    throw new Error(
      "Bootstrap 07 must run from the root of the My Dashboards Git repository.",
    );
  }

  const dirtyBefore = getDirtyPaths(repoRoot);
  const ownedAbsolutePaths = [];

  for (const [relativePath, descriptor] of Object.entries(FILES)) {
    const absolutePath = join(targetRoot, relativePath);
    const result = await writeManagedFile({
      absolutePath,
      content: descriptor.content,
      allowedPrevious: descriptor.allowedPrevious ?? [],
      dirtyBefore,
      repoRoot,
    });

    if (result === "created" || result === "updated") {
      ownedAbsolutePaths.push(absolutePath);
    }
  }

  const packageChanged = await updatePackageJson(dirtyBefore, repoRoot);
  if (packageChanged) {
    ownedAbsolutePaths.push(join(targetRoot, "package.json"));
  }

  const removed = await removeKnownPlaceholder({
    relativePath: "src/data/.gitkeep",
    expectedContent:
      "# Intentionally retained\n\n" +
      "Deterministic CSV and JSON profiling and transformation services will live here.\n\n" +
      "Implementation is added by a later bootstrap step.\n",
    dirtyBefore,
    repoRoot,
  });

  if (removed) {
    ownedAbsolutePaths.push(join(targetRoot, "src", "data", ".gitkeep"));
  }

  await validateGeneratedState();

  const expectedSelfPath = join(
    targetRoot,
    "scripts",
    "07-build-data-utilities.mjs",
  );

  if (selfPath === expectedSelfPath && (await pathExists(selfPath))) {
    ownedAbsolutePaths.push(selfPath);
  }

  if (!args.noCommit && !args.dryRun) {
    await checkpoint(repoRoot, uniquePaths(ownedAbsolutePaths));
  } else if (args.noCommit) {
    report.warnings.push({
      code: "COMMIT_DISABLED",
      message:
        "Data utilities were created and validated, but --no-commit disabled the Git checkpoint.",
    });
  }

  report.ok = true;
  finish(0);
}

function parseBootstrapArgs(argv) {
  const parsed = {
    target: null,
    dryRun: false,
    noCommit: false,
    noPush: false,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    switch (value) {
      case "--target":
        index += 1;
        if (!argv[index]) failArguments("--target requires a directory path.");
        parsed.target = argv[index];
        break;
      case "--dry-run":
        parsed.dryRun = true;
        parsed.noCommit = true;
        parsed.noPush = true;
        break;
      case "--no-commit":
        parsed.noCommit = true;
        parsed.noPush = true;
        break;
      case "--no-push":
        parsed.noPush = true;
        break;
      case "--json":
        parsed.json = true;
        break;
      case "--help":
      case "-h":
        parsed.help = true;
        break;
      default:
        failArguments(`Unknown argument: ${value}`);
    }
  }

  if (parsed.help) {
    printHelp();
    process.exit(0);
  }

  return parsed;
}

function failArguments(message) {
  console.error(message);
  console.error("Run with --help to see supported options.");
  process.exit(2);
}

function printHelp() {
  console.log(`
My Dashboards — Bootstrap 07

Usage:
  node scripts/07-build-data-utilities.mjs [options]

Options:
  --target <path>  Build data utilities in a specific repository root.
  --dry-run        Report intended changes without writing or committing.
  --no-commit      Write and validate without committing or pushing.
  --no-push        Commit locally but do not push.
  --json           Return a machine-readable report.
  --help, -h       Show this help.
`.trim());
}

function assertNodeVersion() {
  const major = Number.parseInt(process.versions.node.split(".")[0], 10);

  if (!Number.isInteger(major) || major < MIN_NODE_MAJOR) {
    throw new Error(
      `Node.js ${MIN_NODE_MAJOR} or later is required. Found ${process.versions.node}.`,
    );
  }
}

async function assertBootstrapFoundation() {
  if (!args.dryRun) {
    await access(targetRoot, fsConstants.W_OK);
  }

  const required = [
    "package.json",
    "bin/mydash.mjs",
    "cli/registry.mjs",
    "cli/command-options.mjs",
    "src/files/paths.mjs",
    "src/files/output.mjs",
    "src/files/hash.mjs",
    "src/workspace/find-root.mjs",
    "src/workspace/package-metadata.mjs",
    "src/validation/contracts.mjs",
    "src/office/excel.mjs",
    "src/office/powerpoint.mjs",
    "src/data",
    "scripts/tasks/test-office.mjs",
  ];

  const missing = [];

  for (const relativePath of required) {
    if (!(await pathExists(join(targetRoot, relativePath)))) {
      missing.push(relativePath);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      [
        "Bootstrap 06 has not been completed.",
        `Missing required paths: ${missing.join(", ")}`,
      ].join("\n"),
    );
  }
}

async function updatePackageJson(dirtyBefore, repoRoot) {
  const packagePath = join(targetRoot, "package.json");
  const gitPath = relativeGitPath(repoRoot, packagePath);

  if (dirtyBefore.has(gitPath)) {
    report.preserved.push(gitPath);
    report.warnings.push({
      code: "PREEXISTING_PACKAGE_CHANGES",
      message:
        "package.json had pre-existing changes, so the data test command was not added automatically.",
    });
    return false;
  }

  const source = await readFile(packagePath, "utf8");
  let value;

  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("package.json is not valid JSON and was not modified.");
  }

  value.scripts ??= {};
  value.scripts["test:data"] =
    value.scripts["test:data"] ??
    "node scripts/tasks/test-data.mjs";

  const next = `${JSON.stringify(value, null, 2)}\n`;

  if (source === next) {
    report.preserved.push(gitPath);
    return false;
  }

  if (args.dryRun) {
    report.updated.push(gitPath);
    return true;
  }

  await atomicWrite(packagePath, next);
  report.updated.push(gitPath);
  return true;
}

async function writeManagedFile({
  absolutePath,
  content,
  allowedPrevious,
  dirtyBefore,
  repoRoot,
}) {
  const gitPath = relativeGitPath(repoRoot, absolutePath);

  if (isTypeScriptGuardedPath(gitPath)) {
    report.warnings.push({
      severity: "warning",
      code: "BOOTSTRAP_TYPE_SCRIPT_GUARD",
      message: `Skipped writing ${gitPath} because TypeScript application directories are no longer bootstrap-managed.`,
    });
    return "preserved";
  }

  const exists = await pathExists(absolutePath);

  if (dirtyBefore.has(gitPath) && absolutePath !== selfPath) {
    report.preserved.push(gitPath);
    report.warnings.push({
      code: "PREEXISTING_FILE_CHANGES",
      message: `Preserved pre-existing changes in ${gitPath}.`,
    });
    return "preserved";
  }

  if (exists) {
    const current = await readFile(absolutePath, "utf8");

    if (current === content) {
      report.preserved.push(gitPath);
      return "preserved";
    }

    if (!allowedPrevious.includes(current)) {
      report.preserved.push(gitPath);
      report.warnings.push({
        code: "EXISTING_FILE_PRESERVED",
        message:
          `${gitPath} already exists with different content and was not overwritten.`,
      });
      return "preserved";
    }

    if (args.dryRun) {
      report.updated.push(gitPath);
      return "updated";
    }

    await atomicWrite(absolutePath, content);
    report.updated.push(gitPath);
    return "updated";
  }

  if (args.dryRun) {
    report.created.push(gitPath);
    return "created";
  }

  await atomicWrite(absolutePath, content);
  report.created.push(gitPath);
  return "created";
}

async function removeKnownPlaceholder({
  relativePath,
  expectedContent,
  dirtyBefore,
  repoRoot,
}) {
  const absolutePath = join(targetRoot, relativePath);
  const gitPath = relativeGitPath(repoRoot, absolutePath);

  if (!(await pathExists(absolutePath)) || dirtyBefore.has(gitPath)) {
    return false;
  }

  const current = await readFile(absolutePath, "utf8");
  if (current !== expectedContent) return false;

  if (args.dryRun) {
    report.removed.push(gitPath);
    return true;
  }

  await rm(absolutePath);
  report.removed.push(gitPath);
  return true;
}

async function validateGeneratedState() {
  if (args.dryRun) {
    report.validation.push({
      check: "dry-run",
      ok: true,
      message:
        "The data utility layer was calculated without writing it.",
    });
    return;
  }

  const modulePaths = [
    "cli/registry.mjs",
    "cli/commands/data.mjs",
    "src/data/csv.mjs",
    "src/data/load.mjs",
    "src/data/inspect.mjs",
    "src/data/profile.mjs",
    "src/data/transform.mjs",
    "src/data/write.mjs",
    "src/data/recipes.mjs",
    "tests/unit/data-csv.test.mjs",
    "tests/unit/data.test.mjs",
    "tests/integration/data-cli.test.mjs",
    "scripts/tasks/test-data.mjs",
  ];

  for (const relativePath of modulePaths) {
    const result = run(
      process.execPath,
      ["--check", join(targetRoot, relativePath)],
      { cwd: targetRoot, allowFailure: true },
    );

    if (result.status !== 0) {
      throw new Error(
        `Generated module failed syntax validation: ${relativePath}\n${result.stderr}`,
      );
    }
  }

  report.validation.push({
    check: "module-syntax",
    ok: true,
    message:
      `${modulePaths.length} data and CLI modules passed Node syntax checks.`,
  });

  const tests = run(
    process.execPath,
    [join(targetRoot, "scripts", "tasks", "test-data.mjs")],
    { cwd: targetRoot, allowFailure: true },
  );

  if (tests.status !== 0) {
    throw new Error(
      `Data tests failed:\n${tests.stderr || tests.stdout}`,
    );
  }

  report.validation.push({
    check: "data-tests",
    ok: true,
    message:
      "CSV, profiling, transforms, recipes and CLI integration tests passed.",
  });

  for (const task of [
    "scripts/tasks/test-office.mjs",
    "scripts/tasks/test-files.mjs",
    "scripts/tasks/test-cli.mjs",
    "scripts/tasks/validate.mjs",
  ]) {
    const result = run(
      process.execPath,
      [join(targetRoot, task)],
      { cwd: targetRoot, allowFailure: true },
    );

    if (result.status !== 0) {
      throw new Error(
        `Regression command failed (${task}):\n${
          result.stderr || result.stdout
        }`,
      );
    }
  }

  report.validation.push({
    check: "regression",
    ok: true,
    message:
      "Office, filesystem, CLI and contract validation still pass.",
  });
}

async function checkpoint(repoRoot, ownedAbsolutePaths) {
  const ownedPaths = uniquePaths(
    ownedAbsolutePaths
      .filter((path) => isInside(repoRoot, path))
      .map((path) => relativeGitPath(repoRoot, path)),
  );

  if (ownedPaths.length === 0) {
    report.warnings.push({
      code: "NO_CHECKPOINT_CHANGES",
      message:
        "Data utilities were already present; there were no task-owned changes to commit.",
    });
    return;
  }

  const userName = run("git", ["config", "user.name"], {
    cwd: repoRoot,
    allowFailure: true,
  }).stdout;
  const userEmail = run("git", ["config", "user.email"], {
    cwd: repoRoot,
    allowFailure: true,
  }).stdout;

  if (!userName || !userEmail) {
    report.warnings.push({
      code: "GIT_IDENTITY_MISSING",
      message:
        "Data utilities were created and validated, but no commit was made because Git user.name or user.email is missing.",
    });
    return;
  }

  run("git", ["add", "--", ...ownedPaths], { cwd: repoRoot });

  const stagedOwned = run(
    "git",
    ["diff", "--cached", "--name-only", "--", ...ownedPaths],
    { cwd: repoRoot },
  ).stdout
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);

  if (stagedOwned.length === 0) {
    report.warnings.push({
      code: "NO_COMMIT_NEEDED",
      message: "No task-owned changes remained to commit.",
    });
    return;
  }

  const commitResult = run(
    "git",
    ["commit", "--only", "-m", COMMIT_MESSAGE, "--", ...ownedPaths],
    { cwd: repoRoot, allowFailure: true },
  );

  if (commitResult.status !== 0) {
    throw new Error(
      `Focused Git commit failed:\n${commitResult.stderr || commitResult.stdout}`,
    );
  }

  const commitHash = run("git", ["rev-parse", "--short", "HEAD"], {
    cwd: repoRoot,
  }).stdout;
  report.git.commit = commitHash;

  if (args.noPush) {
    report.warnings.push({
      code: "PUSH_DISABLED",
      message: `Committed locally as ${commitHash}; --no-push prevented remote push.`,
    });
    return;
  }

  const branch = run("git", ["branch", "--show-current"], {
    cwd: repoRoot,
  }).stdout;
  const upstream = run(
    "git",
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    { cwd: repoRoot, allowFailure: true },
  );

  let pushResult;

  if (upstream.status === 0) {
    report.git.pushTarget = upstream.stdout;
    pushResult = run("git", ["push"], {
      cwd: repoRoot,
      allowFailure: true,
    });
  } else {
    const remotes = run("git", ["remote"], {
      cwd: repoRoot,
      allowFailure: true,
    }).stdout
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);

    if (!branch || !remotes.includes("origin")) {
      report.warnings.push({
        code: "NO_PUSH_TARGET",
        message:
          `Committed locally as ${commitHash}, but no upstream was configured and origin was unavailable.`,
      });
      return;
    }

    report.git.pushTarget = `origin/${branch}`;
    pushResult = run("git", ["push", "-u", "origin", branch], {
      cwd: repoRoot,
      allowFailure: true,
    });
  }

  if (pushResult.status === 0) {
    report.git.pushed = true;
  } else {
    report.warnings.push({
      code: "PUSH_FAILED",
      message:
        `Committed locally as ${commitHash}, but the push failed safely. ` +
        "No force-push was attempted. " +
        (pushResult.stderr || pushResult.stdout),
    });
  }
}

function getRepositoryRoot(cwd) {
  const result = run("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    allowFailure: true,
  });
  return result.status === 0 ? resolve(result.stdout) : null;
}

function getDirtyPaths(repoRoot) {
  const result = run(
    "git",
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    { cwd: repoRoot },
  );
  const entries = result.stdout ? result.stdout.split("\0").filter(Boolean) : [];
  const paths = new Set();

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry.length < 4) continue;
    const statusCode = entry.slice(0, 2);
    paths.add(normaliseGitPath(entry.slice(3)));

    if (statusCode.includes("R") || statusCode.includes("C")) {
      const secondPath = entries[index + 1];
      if (secondPath) {
        paths.add(normaliseGitPath(secondPath));
        index += 1;
      }
    }
  }

  return paths;
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ?? targetRoot,
    encoding: "utf8",
    stdio: "pipe",
    shell: false,
  });

  if (result.error) throw result.error;

  if (result.status !== 0 && !options.allowFailure) {
    const details = [result.stderr, result.stdout]
      .filter(Boolean)
      .map((value) => value.trim())
      .filter(Boolean)
      .join("\n");
    throw new Error(
      `${command} ${commandArgs.join(" ")} failed with exit code ${result.status}` +
        (details ? `:\n${details}` : "."),
    );
  }

  return {
    status: result.status ?? 1,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
  };
}

async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;

  try {
    await writeFile(temporaryPath, content, "utf8");
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function isInside(root, path) {
  const relationship = relative(root, path);
  return (
    relationship === "" ||
    (!relationship.startsWith("..") && !resolve(path).startsWith(`${resolve(root)}..`))
  );
}

function relativeGitPath(repoRoot, path) {
  return normaliseGitPath(relative(repoRoot, path));
}

function normaliseGitPath(path) {
  return path.replaceAll("\\", "/");
}

function uniquePaths(paths) {
  return [...new Set(paths)];
}

function finish(exitCode) {
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(exitCode);
  }

  console.log("\nMy Dashboards — data utilities\n");
  console.log(`Target: ${report.targetRoot}`);
  console.log(`Result: ${report.ok ? "PASS" : "FAIL"}`);
  console.log(`Mode: ${report.dryRun ? "dry-run" : "write"}`);

  printSection("Created", report.created);
  printSection("Updated", report.updated);
  printSection("Removed", report.removed);
  printSection("Preserved", report.preserved);

  if (report.validation.length > 0) {
    console.log("\nValidation:");
    for (const item of report.validation) {
      console.log(`  ${item.ok ? "✓" : "✗"} ${item.message}`);
    }
  }

  console.log("\nGit:");
  console.log(`  Commit: ${report.git.commit ?? "none"}`);
  console.log(`  Pushed: ${report.git.pushed ? "yes" : "no"}`);
  if (report.git.pushTarget) {
    console.log(`  Push target: ${report.git.pushTarget}`);
  }

  if (report.warnings.length > 0) {
    console.log("\nWarnings:");
    for (const warning of report.warnings) {
      console.log(`  ! ${warning.message}`);
    }
  }

  console.log("");
  process.exit(exitCode);
}

function printSection(title, items) {
  console.log(`\n${title}:`);

  if (items.length === 0) {
    console.log("  none");
    return;
  }

  for (const item of items) {
    console.log(`  ${item}`);
  }
}
