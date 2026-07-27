#!/usr/bin/env node

/**
 * My Dashboards — Bootstrap 06: Build Office utilities
 *
 * Adds real, agent-facing Excel and PowerPoint inspection and extraction.
 *
 * Excel:
 *   mydash excel inspect
 *   mydash excel sheets
 *   mydash excel preview
 *   mydash excel extract
 *   mydash excel extract-table
 *   mydash excel formulas
 *
 * PowerPoint:
 *   mydash powerpoint inspect
 *   mydash powerpoint outline
 *   mydash powerpoint extract
 *   mydash powerpoint images
 *   mydash powerpoint notes
 *
 * This bootstrap installs three pinned runtime dependencies, creates binary
 * test fixtures locally, runs unit and integration tests, then creates a
 * focused Git checkpoint.
 *
 * Usage:
 *   node scripts/06-build-office-utilities.mjs
 *   node scripts/06-build-office-utilities.mjs --dry-run
 *   node scripts/06-build-office-utilities.mjs --no-commit
 *   node scripts/06-build-office-utilities.mjs --no-push
 *   node scripts/06-build-office-utilities.mjs --json
 *   node scripts/06-build-office-utilities.mjs --target /path/to/my-dashboards
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

const SCRIPT_NAME = "06-build-office-utilities";
const COMMIT_MESSAGE = "Add Excel and PowerPoint utilities";
const MIN_NODE_MAJOR = 20;
const FILES = {"cli/registry.mjs": {"content": "import { helpCommand } from \"./commands/help.mjs\";\nimport { versionCommand } from \"./commands/version.mjs\";\nimport { doctorCommand } from \"./commands/doctor.mjs\";\nimport { inspectCommand } from \"./commands/inspect.mjs\";\nimport { fileCommand } from \"./commands/file.mjs\";\nimport { excelCommand } from \"./commands/excel.mjs\";\nimport { powerpointCommand } from \"./commands/powerpoint.mjs\";\n\nconst commands = [\n  helpCommand,\n  versionCommand,\n  doctorCommand,\n  inspectCommand,\n  fileCommand,\n  excelCommand,\n  powerpointCommand,\n];\n\nconst commandMap = new Map(\n  commands.map((command) => [command.name, command]),\n);\n\nexport const commandRegistry = {\n  get(name) {\n    return commandMap.get(name) ?? null;\n  },\n\n  list() {\n    return [...commands];\n  },\n\n  names() {\n    return commands.map((command) => command.name);\n  },\n};\n", "allowedPrevious": ["import { helpCommand } from \"./commands/help.mjs\";\nimport { versionCommand } from \"./commands/version.mjs\";\nimport { doctorCommand } from \"./commands/doctor.mjs\";\nimport { inspectCommand } from \"./commands/inspect.mjs\";\nimport { fileCommand } from \"./commands/file.mjs\";\n\nconst commands = [\n  helpCommand,\n  versionCommand,\n  doctorCommand,\n  inspectCommand,\n  fileCommand,\n];\n\nconst commandMap = new Map(\n  commands.map((command) => [command.name, command]),\n);\n\nexport const commandRegistry = {\n  get(name) {\n    return commandMap.get(name) ?? null;\n  },\n\n  list() {\n    return [...commands];\n  },\n\n  names() {\n    return commands.map((command) => command.name);\n  },\n};\n"]}, "cli/commands/excel.mjs": {"content": "import { resolve } from \"node:path\";\nimport {\n  parseCommandArguments,\n  parseIntegerOption,\n  requirePositionals,\n} from \"../command-options.mjs\";\nimport { CliError, EXIT_USAGE } from \"../errors.mjs\";\nimport { findWorkspaceRoot } from \"../../src/workspace/find-root.mjs\";\nimport { resolveCommandPath } from \"../../src/files/paths.mjs\";\nimport {\n  extractTable,\n  extractWorksheet,\n  inspectWorkbook,\n  listFormulas,\n  listSheets,\n  previewWorksheet,\n} from \"../../src/office/excel.mjs\";\nimport { writeTabularOutput } from \"../../src/office/tabular-output.mjs\";\n\nconst SUBCOMMANDS = new Set([\n  \"inspect\",\n  \"sheets\",\n  \"preview\",\n  \"extract\",\n  \"extract-table\",\n  \"formulas\",\n]);\n\nexport const excelCommand = {\n  name: \"excel\",\n  summary: \"Inspect and safely extract modern Excel workbooks.\",\n  usage: \"mydash excel <subcommand> <workbook.xlsx> [options]\",\n  options: [\n    \"inspect <file>                 Inspect workbook structure and features.\",\n    \"sheets <file>                  List worksheets.\",\n    \"preview <file>                 Preview a sheet or range.\",\n    \"extract <file>                 Extract a sheet or range to JSON, CSV or NDJSON.\",\n    \"extract-table <file>           Extract a named Excel table.\",\n    \"formulas <file>                List formula cells without recalculating them.\",\n    \"--allow-outside                Permit read-only source access outside the workspace.\",\n    \"--json                         Return structured JSON.\",\n  ],\n\n  async run(invocation, context) {\n    const [subcommand, ...rest] = invocation.args;\n\n    if (!SUBCOMMANDS.has(subcommand)) {\n      throw new CliError(\n        \"UNKNOWN_EXCEL_SUBCOMMAND\",\n        subcommand\n          ? `Unknown Excel subcommand: ${subcommand}`\n          : \"An Excel subcommand is required.\",\n        {\n          exitCode: EXIT_USAGE,\n          details: {\n            availableSubcommands: [...SUBCOMMANDS],\n          },\n          hint: \"Run mydash help excel to see available Excel operations.\",\n        },\n      );\n    }\n\n    const workspaceRoot = await findWorkspaceRoot(\n      invocation.options.workspace ?? context.cwd,\n    );\n\n    switch (subcommand) {\n      case \"inspect\":\n        return runInspect(rest, context, workspaceRoot);\n      case \"sheets\":\n        return runSheets(rest, context, workspaceRoot);\n      case \"preview\":\n        return runPreview(rest, context, workspaceRoot);\n      case \"extract\":\n        return runExtract(rest, context, workspaceRoot);\n      case \"extract-table\":\n        return runExtractTable(rest, context, workspaceRoot);\n      case \"formulas\":\n        return runFormulas(rest, context, workspaceRoot);\n      default:\n        throw new Error(\"Unreachable Excel subcommand.\");\n    }\n  },\n};\n\nasync function runInspect(args, context, workspaceRoot) {\n  const parsed = parseCommandArguments(args, {\n    booleans: [\"allow-outside\"],\n  });\n  requirePositionals(parsed.positionals, 1, \"mydash excel inspect <file>\");\n\n  const path = await resolveWorkbook(\n    parsed.positionals[0],\n    parsed.options,\n    context,\n    workspaceRoot,\n  );\n  const data = await inspectWorkbook(path, { workspaceRoot });\n\n  return {\n    ok: true,\n    command: \"excel inspect\",\n    data,\n    warnings: data.warnings,\n    text: renderInspection(data),\n  };\n}\n\nasync function runSheets(args, context, workspaceRoot) {\n  const parsed = parseCommandArguments(args, {\n    booleans: [\"allow-outside\"],\n  });\n  requirePositionals(parsed.positionals, 1, \"mydash excel sheets <file>\");\n\n  const path = await resolveWorkbook(\n    parsed.positionals[0],\n    parsed.options,\n    context,\n    workspaceRoot,\n  );\n  const data = await listSheets(path, { workspaceRoot });\n\n  return {\n    ok: true,\n    command: \"excel sheets\",\n    data,\n    text: data.sheets\n      .map(\n        (sheet, index) =>\n          `${index + 1}. ${sheet.name} (${sheet.state}, ${sheet.actualRowCount} rows × ${sheet.actualColumnCount} columns)`,\n      )\n      .join(\"\\n\"),\n  };\n}\n\nasync function runPreview(args, context, workspaceRoot) {\n  const parsed = parseCommandArguments(args, {\n    booleans: [\"allow-outside\", \"formulas\"],\n    values: [\"sheet\", \"range\", \"rows\", \"columns\"],\n  });\n  requirePositionals(parsed.positionals, 1, \"mydash excel preview <file>\");\n\n  const path = await resolveWorkbook(\n    parsed.positionals[0],\n    parsed.options,\n    context,\n    workspaceRoot,\n  );\n  const rows = parseIntegerOption(parsed.options.rows, {\n    label: \"Rows\",\n    minimum: 1,\n    maximum: 500,\n    defaultValue: 20,\n  });\n  const columns = parseIntegerOption(parsed.options.columns, {\n    label: \"Columns\",\n    minimum: 1,\n    maximum: 200,\n    defaultValue: 20,\n  });\n\n  const data = await previewWorksheet(path, {\n    workspaceRoot,\n    sheet: parsed.options.sheet,\n    range: parsed.options.range,\n    rows,\n    columns,\n    includeFormulas: parsed.options.formulas ?? false,\n  });\n\n  return {\n    ok: true,\n    command: \"excel preview\",\n    data,\n    text: renderMatrix(data.matrix),\n  };\n}\n\nasync function runExtract(args, context, workspaceRoot) {\n  const parsed = parseCommandArguments(args, {\n    booleans: [\"allow-outside\", \"overwrite\", \"formulas\", \"no-header\"],\n    values: [\"sheet\", \"range\", \"output\", \"format\"],\n  });\n  requirePositionals(parsed.positionals, 1, \"mydash excel extract <file>\");\n\n  if (!parsed.options.output) {\n    throw new CliError(\n      \"MISSING_OUTPUT\",\n      \"Excel extraction requires --output <path>.\",\n      { exitCode: EXIT_USAGE },\n    );\n  }\n\n  const path = await resolveWorkbook(\n    parsed.positionals[0],\n    parsed.options,\n    context,\n    workspaceRoot,\n  );\n  const data = await extractWorksheet(path, {\n    workspaceRoot,\n    sheet: parsed.options.sheet,\n    range: parsed.options.range,\n    includeFormulas: parsed.options.formulas ?? false,\n    header: !(parsed.options.noHeader ?? false),\n  });\n\n  const output = await writeTabularOutput(data, {\n    outputPath: resolveOutput(parsed.options.output, workspaceRoot),\n    format: parsed.options.format,\n    overwrite: parsed.options.overwrite ?? false,\n    workspaceRoot,\n  });\n\n  return {\n    ok: true,\n    command: \"excel extract\",\n    data: {\n      source: data.source,\n      sheet: data.sheet,\n      range: data.range,\n      rowCount: data.matrix.length,\n      columnCount: data.matrix[0]?.length ?? 0,\n      output,\n    },\n    text: `Extracted ${data.matrix.length} rows from ${data.sheet} to ${output.displayPath}.`,\n  };\n}\n\nasync function runExtractTable(args, context, workspaceRoot) {\n  const parsed = parseCommandArguments(args, {\n    booleans: [\"allow-outside\", \"overwrite\", \"formulas\", \"no-header\"],\n    values: [\"table\", \"output\", \"format\"],\n  });\n  requirePositionals(\n    parsed.positionals,\n    1,\n    \"mydash excel extract-table <file> --table <name> --output <path>\",\n  );\n\n  if (!parsed.options.table) {\n    throw new CliError(\n      \"MISSING_TABLE\",\n      \"Table extraction requires --table <name>.\",\n      { exitCode: EXIT_USAGE },\n    );\n  }\n\n  if (!parsed.options.output) {\n    throw new CliError(\n      \"MISSING_OUTPUT\",\n      \"Table extraction requires --output <path>.\",\n      { exitCode: EXIT_USAGE },\n    );\n  }\n\n  const path = await resolveWorkbook(\n    parsed.positionals[0],\n    parsed.options,\n    context,\n    workspaceRoot,\n  );\n  const data = await extractTable(path, parsed.options.table, {\n    workspaceRoot,\n    includeFormulas: parsed.options.formulas ?? false,\n    header: !(parsed.options.noHeader ?? false),\n  });\n\n  const output = await writeTabularOutput(data, {\n    outputPath: resolveOutput(parsed.options.output, workspaceRoot),\n    format: parsed.options.format,\n    overwrite: parsed.options.overwrite ?? false,\n    workspaceRoot,\n  });\n\n  return {\n    ok: true,\n    command: \"excel extract-table\",\n    data: {\n      source: data.source,\n      sheet: data.sheet,\n      table: data.table,\n      range: data.range,\n      rowCount: data.matrix.length,\n      output,\n    },\n    text: `Extracted table ${data.table} to ${output.displayPath}.`,\n  };\n}\n\nasync function runFormulas(args, context, workspaceRoot) {\n  const parsed = parseCommandArguments(args, {\n    booleans: [\"allow-outside\"],\n    values: [\"sheet\", \"max-results\"],\n  });\n  requirePositionals(parsed.positionals, 1, \"mydash excel formulas <file>\");\n\n  const path = await resolveWorkbook(\n    parsed.positionals[0],\n    parsed.options,\n    context,\n    workspaceRoot,\n  );\n  const maxResults = parseIntegerOption(parsed.options.maxResults, {\n    label: \"Maximum results\",\n    minimum: 1,\n    maximum: 10000,\n    defaultValue: 500,\n  });\n  const data = await listFormulas(path, {\n    workspaceRoot,\n    sheet: parsed.options.sheet,\n    maxResults,\n  });\n\n  return {\n    ok: true,\n    command: \"excel formulas\",\n    data,\n    warnings: data.truncated\n      ? [\n          {\n            code: \"RESULTS_TRUNCATED\",\n            message: `Formula results were limited to ${maxResults}.`,\n          },\n        ]\n      : [],\n    text:\n      data.formulas.length > 0\n        ? data.formulas\n            .map(\n              (formula) =>\n                `${formula.sheet}!${formula.address}: ${formula.formula}`,\n            )\n            .join(\"\\n\")\n        : \"No formulas found.\",\n  };\n}\n\nasync function resolveWorkbook(input, options, context, workspaceRoot) {\n  return resolveCommandPath(input, {\n    cwd: context.cwd,\n    workspaceRoot,\n    allowOutside: options.allowOutside ?? false,\n    mustExist: true,\n    requireFile: true,\n  });\n}\n\nfunction resolveOutput(input, workspaceRoot) {\n  if (!workspaceRoot) {\n    throw new CliError(\n      \"WORKSPACE_REQUIRED_FOR_WRITE\",\n      \"Excel extraction outputs require a My Dashboards workspace.\",\n      { exitCode: 5 },\n    );\n  }\n\n  return resolve(workspaceRoot, input);\n}\n\nfunction renderInspection(data) {\n  const lines = [\n    `Workbook: ${data.displayPath}`,\n    `Sheets: ${data.sheetCount}`,\n    `Tables: ${data.features.tableCount}`,\n    `Formula cells: ${data.formulaCellCount}`,\n    `Charts: ${data.features.chartCount}`,\n    `Images: ${data.features.imageCount}`,\n    `Macros detected: ${data.features.hasMacros ? \"yes\" : \"no\"}`,\n    `External links: ${data.features.externalLinkCount}`,\n  ];\n\n  lines.push(\"\");\n  lines.push(\"Worksheets:\");\n\n  for (const sheet of data.sheets) {\n    lines.push(\n      `  ${sheet.name}: ${sheet.actualRowCount} rows × ${sheet.actualColumnCount} columns`,\n    );\n  }\n\n  return lines.join(\"\\n\");\n}\n\nfunction renderMatrix(matrix) {\n  if (matrix.length === 0) return \"The selected range is empty.\";\n\n  const widths = [];\n  const rendered = matrix.map((row) =>\n    row.map((value, index) => {\n      const text =\n        value === null || value === undefined\n          ? \"\"\n          : typeof value === \"object\"\n            ? JSON.stringify(value)\n            : String(value);\n      widths[index] = Math.min(\n        40,\n        Math.max(widths[index] ?? 0, text.length),\n      );\n      return text;\n    }),\n  );\n\n  return rendered\n    .map((row) =>\n      row\n        .map((value, index) =>\n          value.length > widths[index]\n            ? `${value.slice(0, Math.max(0, widths[index] - 1))}…`\n            : value.padEnd(widths[index]),\n        )\n        .join(\" | \"),\n    )\n    .join(\"\\n\");\n}\n"}, "cli/commands/powerpoint.mjs": {"content": "import { resolve } from \"node:path\";\nimport {\n  parseCommandArguments,\n  requirePositionals,\n} from \"../command-options.mjs\";\nimport { CliError, EXIT_USAGE } from \"../errors.mjs\";\nimport { findWorkspaceRoot } from \"../../src/workspace/find-root.mjs\";\nimport { resolveCommandPath } from \"../../src/files/paths.mjs\";\nimport { prepareOutputDirectory } from \"../../src/files/directory-output.mjs\";\nimport { writeFileAtomic } from \"../../src/files/output.mjs\";\nimport {\n  extractPresentationImages,\n  inspectPresentation,\n  outlinePresentation,\n  readPresentation,\n} from \"../../src/office/powerpoint.mjs\";\n\nconst SUBCOMMANDS = new Set([\n  \"inspect\",\n  \"outline\",\n  \"extract\",\n  \"images\",\n  \"notes\",\n]);\n\nexport const powerpointCommand = {\n  name: \"powerpoint\",\n  summary: \"Inspect and safely extract modern PowerPoint presentations.\",\n  usage: \"mydash powerpoint <subcommand> <presentation.pptx> [options]\",\n  options: [\n    \"inspect <file>                 Inspect slides, notes, charts, tables and media.\",\n    \"outline <file>                 Return the slide-title outline.\",\n    \"extract <file>                 Extract structured slide JSON and notes.\",\n    \"images <file>                  Extract embedded presentation images.\",\n    \"notes <file>                   List speaker notes.\",\n    \"--allow-outside                Permit read-only source access outside the workspace.\",\n    \"--json                         Return structured JSON.\",\n  ],\n\n  async run(invocation, context) {\n    const [subcommand, ...rest] = invocation.args;\n\n    if (!SUBCOMMANDS.has(subcommand)) {\n      throw new CliError(\n        \"UNKNOWN_POWERPOINT_SUBCOMMAND\",\n        subcommand\n          ? `Unknown PowerPoint subcommand: ${subcommand}`\n          : \"A PowerPoint subcommand is required.\",\n        {\n          exitCode: EXIT_USAGE,\n          details: {\n            availableSubcommands: [...SUBCOMMANDS],\n          },\n          hint:\n            \"Run mydash help powerpoint to see available PowerPoint operations.\",\n        },\n      );\n    }\n\n    const workspaceRoot = await findWorkspaceRoot(\n      invocation.options.workspace ?? context.cwd,\n    );\n\n    switch (subcommand) {\n      case \"inspect\":\n        return runInspect(rest, context, workspaceRoot);\n      case \"outline\":\n        return runOutline(rest, context, workspaceRoot);\n      case \"extract\":\n        return runExtract(rest, context, workspaceRoot);\n      case \"images\":\n        return runImages(rest, context, workspaceRoot);\n      case \"notes\":\n        return runNotes(rest, context, workspaceRoot);\n      default:\n        throw new Error(\"Unreachable PowerPoint subcommand.\");\n    }\n  },\n};\n\nasync function runInspect(args, context, workspaceRoot) {\n  const parsed = parseCommandArguments(args, {\n    booleans: [\"allow-outside\"],\n  });\n  requirePositionals(\n    parsed.positionals,\n    1,\n    \"mydash powerpoint inspect <file>\",\n  );\n  const path = await resolvePresentation(\n    parsed.positionals[0],\n    parsed.options,\n    context,\n    workspaceRoot,\n  );\n  const data = await inspectPresentation(path, { workspaceRoot });\n\n  return {\n    ok: true,\n    command: \"powerpoint inspect\",\n    data,\n    warnings: data.warnings,\n    text: renderInspection(data),\n  };\n}\n\nasync function runOutline(args, context, workspaceRoot) {\n  const parsed = parseCommandArguments(args, {\n    booleans: [\"allow-outside\"],\n  });\n  requirePositionals(\n    parsed.positionals,\n    1,\n    \"mydash powerpoint outline <file>\",\n  );\n  const path = await resolvePresentation(\n    parsed.positionals[0],\n    parsed.options,\n    context,\n    workspaceRoot,\n  );\n  const data = await outlinePresentation(path, { workspaceRoot });\n\n  return {\n    ok: true,\n    command: \"powerpoint outline\",\n    data,\n    text: data.slides\n      .map(\n        (slide) =>\n          `${slide.number}. ${slide.title || \"(untitled slide)\"}`,\n      )\n      .join(\"\\n\"),\n  };\n}\n\nasync function runExtract(args, context, workspaceRoot) {\n  const parsed = parseCommandArguments(args, {\n    booleans: [\"allow-outside\", \"overwrite\", \"include-images\"],\n    values: [\"output\"],\n  });\n  requirePositionals(\n    parsed.positionals,\n    1,\n    \"mydash powerpoint extract <file> --output <directory>\",\n  );\n\n  if (!parsed.options.output) {\n    throw new CliError(\n      \"MISSING_OUTPUT\",\n      \"PowerPoint extraction requires --output <directory>.\",\n      { exitCode: EXIT_USAGE },\n    );\n  }\n\n  const path = await resolvePresentation(\n    parsed.positionals[0],\n    parsed.options,\n    context,\n    workspaceRoot,\n  );\n  const presentation = await readPresentation(path, { workspaceRoot });\n  const outputDirectory = await prepareOutputDirectory(\n    resolveWorkspaceOutput(parsed.options.output, workspaceRoot),\n    {\n      workspaceRoot,\n      overwrite: parsed.options.overwrite ?? false,\n    },\n  );\n\n  await writeFileAtomic(\n    resolve(outputDirectory, \"presentation.json\"),\n    `${JSON.stringify(presentation.summary, null, 2)}\\n`,\n    {\n      workspaceRoot,\n      overwrite: true,\n      encoding: \"utf8\",\n    },\n  );\n\n  const slidesDirectory = await prepareOutputDirectory(\n    resolve(outputDirectory, \"slides\"),\n    { workspaceRoot, overwrite: true },\n  );\n\n  for (const slide of presentation.slides) {\n    const fileName = `${String(slide.number).padStart(3, \"0\")}.json`;\n    await writeFileAtomic(\n      resolve(slidesDirectory, fileName),\n      `${JSON.stringify(slide, null, 2)}\\n`,\n      {\n        workspaceRoot,\n        overwrite: true,\n        encoding: \"utf8\",\n      },\n    );\n  }\n\n  const notesWithContent = presentation.slides.filter(\n    (slide) => slide.notes.length > 0,\n  );\n\n  if (notesWithContent.length > 0) {\n    const notesDirectory = await prepareOutputDirectory(\n      resolve(outputDirectory, \"notes\"),\n      { workspaceRoot, overwrite: true },\n    );\n\n    for (const slide of notesWithContent) {\n      const fileName = `${String(slide.number).padStart(3, \"0\")}.txt`;\n      await writeFileAtomic(\n        resolve(notesDirectory, fileName),\n        `${slide.notes.join(\"\\n\")}\\n`,\n        {\n          workspaceRoot,\n          overwrite: true,\n          encoding: \"utf8\",\n        },\n      );\n    }\n  }\n\n  let images = null;\n  if (parsed.options.includeImages) {\n    images = await extractPresentationImages(path, {\n      workspaceRoot,\n      outputDirectory: resolve(outputDirectory, \"images\"),\n      overwrite: true,\n    });\n  }\n\n  return {\n    ok: true,\n    command: \"powerpoint extract\",\n    data: {\n      outputDirectory,\n      slideCount: presentation.slides.length,\n      noteFileCount: notesWithContent.length,\n      imageCount: images?.files.length ?? 0,\n    },\n    text: `Extracted ${presentation.slides.length} slides to ${displayPath(outputDirectory, workspaceRoot)}.`,\n  };\n}\n\nasync function runImages(args, context, workspaceRoot) {\n  const parsed = parseCommandArguments(args, {\n    booleans: [\"allow-outside\", \"overwrite\"],\n    values: [\"output\"],\n  });\n  requirePositionals(\n    parsed.positionals,\n    1,\n    \"mydash powerpoint images <file> --output <directory>\",\n  );\n\n  if (!parsed.options.output) {\n    throw new CliError(\n      \"MISSING_OUTPUT\",\n      \"Image extraction requires --output <directory>.\",\n      { exitCode: EXIT_USAGE },\n    );\n  }\n\n  const path = await resolvePresentation(\n    parsed.positionals[0],\n    parsed.options,\n    context,\n    workspaceRoot,\n  );\n  const data = await extractPresentationImages(path, {\n    workspaceRoot,\n    outputDirectory: resolveWorkspaceOutput(\n      parsed.options.output,\n      workspaceRoot,\n    ),\n    overwrite: parsed.options.overwrite ?? false,\n  });\n\n  return {\n    ok: true,\n    command: \"powerpoint images\",\n    data,\n    text:\n      data.files.length > 0\n        ? `Extracted ${data.files.length} images to ${displayPath(data.outputDirectory, workspaceRoot)}.`\n        : \"The presentation contains no embedded images.\",\n  };\n}\n\nasync function runNotes(args, context, workspaceRoot) {\n  const parsed = parseCommandArguments(args, {\n    booleans: [\"allow-outside\"],\n  });\n  requirePositionals(\n    parsed.positionals,\n    1,\n    \"mydash powerpoint notes <file>\",\n  );\n  const path = await resolvePresentation(\n    parsed.positionals[0],\n    parsed.options,\n    context,\n    workspaceRoot,\n  );\n  const presentation = await readPresentation(path, { workspaceRoot });\n  const slides = presentation.slides\n    .filter((slide) => slide.notes.length > 0)\n    .map((slide) => ({\n      number: slide.number,\n      title: slide.title,\n      notes: slide.notes,\n    }));\n\n  return {\n    ok: true,\n    command: \"powerpoint notes\",\n    data: {\n      source: presentation.summary.source,\n      slides,\n    },\n    text:\n      slides.length > 0\n        ? slides\n            .map(\n              (slide) =>\n                `Slide ${slide.number} — ${slide.title || \"Untitled\"}\\n${slide.notes.join(\"\\n\")}`,\n            )\n            .join(\"\\n\\n\")\n        : \"No speaker notes found.\",\n  };\n}\n\nasync function resolvePresentation(input, options, context, workspaceRoot) {\n  return resolveCommandPath(input, {\n    cwd: context.cwd,\n    workspaceRoot,\n    allowOutside: options.allowOutside ?? false,\n    mustExist: true,\n    requireFile: true,\n  });\n}\n\nfunction resolveWorkspaceOutput(input, workspaceRoot) {\n  if (!workspaceRoot) {\n    throw new CliError(\n      \"WORKSPACE_REQUIRED_FOR_WRITE\",\n      \"PowerPoint extraction outputs require a My Dashboards workspace.\",\n      { exitCode: 5 },\n    );\n  }\n\n  return resolve(workspaceRoot, input);\n}\n\nfunction renderInspection(data) {\n  return [\n    `Presentation: ${data.displayPath}`,\n    `Slides: ${data.slideCount}`,\n    `Dimensions: ${data.dimensions.widthInches} × ${data.dimensions.heightInches} inches`,\n    `Slides with notes: ${data.slidesWithNotes}`,\n    `Images: ${data.imageCount}`,\n    `Charts: ${data.chartCount}`,\n    `Tables: ${data.tableCount}`,\n    `Macros detected: ${data.hasMacros ? \"yes\" : \"no\"}`,\n  ].join(\"\\n\");\n}\n\nfunction displayPath(path, workspaceRoot) {\n  if (!workspaceRoot) return path;\n  return path.startsWith(workspaceRoot)\n    ? path.slice(workspaceRoot.length + 1).replaceAll(\"\\\\\", \"/\")\n    : path;\n}\n"}, "src/office/ooxml.mjs": {"content": "import { readFile } from \"node:fs/promises\";\nimport { posix } from \"node:path\";\nimport { unzipSync } from \"fflate\";\nimport { XMLParser } from \"fast-xml-parser\";\n\nconst parser = new XMLParser({\n  ignoreAttributes: false,\n  attributeNamePrefix: \"@\",\n  parseTagValue: false,\n  trimValues: false,\n  processEntities: false,\n});\n\nexport async function readOoxmlPackage(path) {\n  const source = await readFile(path);\n  let archive;\n\n  try {\n    archive = unzipSync(new Uint8Array(source));\n  } catch (error) {\n    throw new Error(\n      `The Office file is not a readable OOXML package: ${error.message}`,\n    );\n  }\n\n  const entries = new Map(\n    Object.entries(archive).map(([name, value]) => [\n      normalisePackagePath(name),\n      Buffer.from(value),\n    ]),\n  );\n\n  return {\n    path,\n    entries,\n\n    has(name) {\n      return entries.has(normalisePackagePath(name));\n    },\n\n    names(prefix = \"\") {\n      const normalisedPrefix = normalisePackagePath(prefix);\n      return [...entries.keys()]\n        .filter((name) => name.startsWith(normalisedPrefix))\n        .sort();\n    },\n\n    binary(name) {\n      const key = normalisePackagePath(name);\n      const value = entries.get(key);\n      if (!value) {\n        throw new Error(`OOXML package entry not found: ${key}`);\n      }\n      return value;\n    },\n\n    text(name) {\n      return this.binary(name).toString(\"utf8\");\n    },\n\n    xml(name) {\n      return parser.parse(this.text(name));\n    },\n  };\n}\n\nexport function asArray(value) {\n  if (value === undefined || value === null) return [];\n  return Array.isArray(value) ? value : [value];\n}\n\nexport function childByLocalName(node, localName) {\n  if (!isObject(node)) return undefined;\n\n  const entry = Object.entries(node).find(\n    ([key]) => !key.startsWith(\"@\") && localPart(key) === localName,\n  );\n\n  return entry?.[1];\n}\n\nexport function attributeByLocalName(node, localName) {\n  if (!isObject(node)) return undefined;\n\n  const entry = Object.entries(node).find(\n    ([key]) => key.startsWith(\"@\") && localPart(key.slice(1)) === localName,\n  );\n\n  return entry?.[1];\n}\n\nexport function descendantsByLocalName(node, localName) {\n  const matches = [];\n  visit(node);\n  return matches;\n\n  function visit(value) {\n    if (Array.isArray(value)) {\n      for (const item of value) visit(item);\n      return;\n    }\n\n    if (!isObject(value)) return;\n\n    for (const [key, child] of Object.entries(value)) {\n      if (!key.startsWith(\"@\") && localPart(key) === localName) {\n        for (const item of asArray(child)) matches.push(item);\n      }\n      visit(child);\n    }\n  }\n}\n\nexport function textValues(node) {\n  const values = [];\n\n  for (const item of descendantsByLocalName(node, \"t\")) {\n    if (typeof item === \"string\") {\n      const value = item.trim();\n      if (value) values.push(value);\n    } else if (\n      isObject(item) &&\n      typeof item[\"#text\"] === \"string\" &&\n      item[\"#text\"].trim()\n    ) {\n      values.push(item[\"#text\"].trim());\n    }\n  }\n\n  return values;\n}\n\nexport function relationships(packageFile, sourcePart) {\n  const relsPath = relationshipPartPath(sourcePart);\n  if (!packageFile.has(relsPath)) return [];\n\n  const document = packageFile.xml(relsPath);\n  const root = childByLocalName(document, \"Relationships\");\n  const entries = asArray(childByLocalName(root, \"Relationship\"));\n\n  return entries.map((entry) => ({\n    id: attributeByLocalName(entry, \"Id\"),\n    type: attributeByLocalName(entry, \"Type\"),\n    target: attributeByLocalName(entry, \"Target\"),\n    targetMode: attributeByLocalName(entry, \"TargetMode\") ?? null,\n    resolvedTarget:\n      attributeByLocalName(entry, \"TargetMode\") === \"External\"\n        ? attributeByLocalName(entry, \"Target\")\n        : resolveRelationshipTarget(\n            sourcePart,\n            attributeByLocalName(entry, \"Target\"),\n          ),\n  }));\n}\n\nexport function relationshipPartPath(sourcePart) {\n  const normalised = normalisePackagePath(sourcePart);\n  return posix.join(\n    posix.dirname(normalised),\n    \"_rels\",\n    `${posix.basename(normalised)}.rels`,\n  );\n}\n\nexport function resolveRelationshipTarget(sourcePart, target) {\n  if (!target) return null;\n  if (target.startsWith(\"/\")) {\n    return normalisePackagePath(target.slice(1));\n  }\n\n  return normalisePackagePath(\n    posix.normalize(posix.join(posix.dirname(sourcePart), target)),\n  );\n}\n\nexport function normalisePackagePath(value) {\n  return String(value).replaceAll(\"\\\\\", \"/\").replace(/^\\/+/, \"\");\n}\n\nfunction localPart(value) {\n  return value.split(\":\").at(-1);\n}\n\nfunction isObject(value) {\n  return value !== null && typeof value === \"object\";\n}\n"}, "src/office/excel.mjs": {"content": "import ExcelJS from \"exceljs\";\nimport { extname, relative } from \"node:path\";\nimport { readOoxmlPackage } from \"./ooxml.mjs\";\n\nconst MODERN_EXCEL_EXTENSIONS = new Set([\".xlsx\", \".xlsm\"]);\n\nexport async function inspectWorkbook(path, options = {}) {\n  assertSupportedWorkbook(path);\n  const [workbook, features] = await Promise.all([\n    loadWorkbook(path),\n    inspectWorkbookPackage(path),\n  ]);\n\n  const sheets = workbook.worksheets.map(summariseWorksheet);\n  const formulaCellCount = sheets.reduce(\n    (total, sheet) => total + sheet.formulaCellCount,\n    0,\n  );\n  const warnings = [];\n\n  if (features.hasMacros) {\n    warnings.push({\n      code: \"MACROS_PRESENT\",\n      message:\n        \"The workbook contains a VBA project. My Dashboards will never execute workbook macros.\",\n    });\n  }\n\n  if (features.externalLinkCount > 0) {\n    warnings.push({\n      code: \"EXTERNAL_LINKS_PRESENT\",\n      message:\n        \"The workbook contains external links. Extracted cached values may differ from values after Excel refreshes the links.\",\n    });\n  }\n\n  return {\n    source: path,\n    displayPath: displayPath(path, options.workspaceRoot),\n    sheetCount: sheets.length,\n    sheets,\n    formulaCellCount,\n    calculationMode: workbook.calcProperties?.calcMode ?? null,\n    creator: workbook.creator || null,\n    modified: workbook.modified\n      ? new Date(workbook.modified).toISOString()\n      : null,\n    features,\n    warnings,\n  };\n}\n\nexport async function listSheets(path, options = {}) {\n  assertSupportedWorkbook(path);\n  const workbook = await loadWorkbook(path);\n\n  return {\n    source: path,\n    displayPath: displayPath(path, options.workspaceRoot),\n    sheets: workbook.worksheets.map(summariseWorksheet),\n  };\n}\n\nexport async function previewWorksheet(path, options = {}) {\n  assertSupportedWorkbook(path);\n  const workbook = await loadWorkbook(path);\n  const worksheet = selectWorksheet(workbook, options.sheet);\n  const bounds = resolveBounds(worksheet, {\n    range: options.range,\n    maxRows: options.rows ?? 20,\n    maxColumns: options.columns ?? 20,\n  });\n  const matrix = readMatrix(worksheet, bounds, {\n    includeFormulas: options.includeFormulas ?? false,\n  });\n\n  return {\n    source: path,\n    displayPath: displayPath(path, options.workspaceRoot),\n    sheet: worksheet.name,\n    range: formatRange(bounds),\n    matrix,\n  };\n}\n\nexport async function extractWorksheet(path, options = {}) {\n  assertSupportedWorkbook(path);\n  const workbook = await loadWorkbook(path);\n  const worksheet = selectWorksheet(workbook, options.sheet);\n  const bounds = resolveBounds(worksheet, {\n    range: options.range,\n    maxRows: Number.MAX_SAFE_INTEGER,\n    maxColumns: Number.MAX_SAFE_INTEGER,\n  });\n  const matrix = readMatrix(worksheet, bounds, {\n    includeFormulas: options.includeFormulas ?? false,\n  });\n\n  return tabularResult({\n    path,\n    workspaceRoot: options.workspaceRoot,\n    worksheet,\n    bounds,\n    matrix,\n    header: options.header ?? true,\n  });\n}\n\nexport async function extractTable(path, tableName, options = {}) {\n  assertSupportedWorkbook(path);\n  const workbook = await loadWorkbook(path);\n  const located = findTable(workbook, tableName);\n\n  if (!located) {\n    const available = workbook.worksheets.flatMap((worksheet) =>\n      listWorksheetTables(worksheet).map((table) => table.name),\n    );\n\n    const error = new Error(`Excel table not found: ${tableName}`);\n    error.code = \"TABLE_NOT_FOUND\";\n    error.availableTables = available;\n    throw error;\n  }\n\n  const bounds = parseRange(located.table.ref);\n  const matrix = readMatrix(located.worksheet, bounds, {\n    includeFormulas: options.includeFormulas ?? false,\n  });\n\n  return {\n    ...tabularResult({\n      path,\n      workspaceRoot: options.workspaceRoot,\n      worksheet: located.worksheet,\n      bounds,\n      matrix,\n      header: options.header ?? true,\n    }),\n    table: located.table.name,\n  };\n}\n\nexport async function listFormulas(path, options = {}) {\n  assertSupportedWorkbook(path);\n  const workbook = await loadWorkbook(path);\n  const worksheets = options.sheet\n    ? [selectWorksheet(workbook, options.sheet)]\n    : workbook.worksheets;\n  const maxResults = options.maxResults ?? 500;\n  const formulas = [];\n  let truncated = false;\n\n  for (const worksheet of worksheets) {\n    worksheet.eachRow({ includeEmpty: false }, (row) => {\n      row.eachCell({ includeEmpty: false }, (cell) => {\n        const formula = formulaFromValue(cell.value);\n        if (!formula || truncated) return;\n\n        formulas.push({\n          sheet: worksheet.name,\n          address: cell.address,\n          formula: formula.formula,\n          result: normaliseCellValue(formula.result, {\n            includeFormulas: false,\n          }),\n        });\n\n        if (formulas.length >= maxResults) {\n          truncated = true;\n        }\n      });\n    });\n\n    if (truncated) break;\n  }\n\n  return {\n    source: path,\n    displayPath: displayPath(path, options.workspaceRoot),\n    formulas,\n    truncated,\n  };\n}\n\nexport async function loadWorkbook(path) {\n  assertSupportedWorkbook(path);\n  const workbook = new ExcelJS.Workbook();\n\n  try {\n    await workbook.xlsx.readFile(path);\n  } catch (error) {\n    throw new Error(`Unable to read Excel workbook: ${error.message}`);\n  }\n\n  return workbook;\n}\n\nfunction summariseWorksheet(worksheet) {\n  const tables = listWorksheetTables(worksheet);\n  let formulaCellCount = 0;\n  let hiddenRowCount = 0;\n  let hiddenColumnCount = 0;\n\n  worksheet.eachRow({ includeEmpty: false }, (row) => {\n    if (row.hidden) hiddenRowCount += 1;\n    row.eachCell({ includeEmpty: false }, (cell) => {\n      if (formulaFromValue(cell.value)) formulaCellCount += 1;\n    });\n  });\n\n  for (let index = 1; index <= worksheet.columnCount; index += 1) {\n    if (worksheet.getColumn(index).hidden) hiddenColumnCount += 1;\n  }\n\n  return {\n    id: worksheet.id,\n    name: worksheet.name,\n    state: worksheet.state ?? \"visible\",\n    rowCount: worksheet.rowCount,\n    actualRowCount: worksheet.actualRowCount ?? worksheet.rowCount,\n    columnCount: worksheet.columnCount,\n    actualColumnCount:\n      worksheet.actualColumnCount ?? worksheet.columnCount,\n    mergedCellCount: Object.keys(worksheet._merges ?? {}).length,\n    hiddenRowCount,\n    hiddenColumnCount,\n    formulaCellCount,\n    tables,\n  };\n}\n\nfunction listWorksheetTables(worksheet) {\n  let values = [];\n\n  if (typeof worksheet.getTables === \"function\") {\n    try {\n      values = worksheet.getTables();\n    } catch {\n      values = [];\n    }\n  }\n\n  if (!Array.isArray(values) || values.length === 0) {\n    const modelTables = worksheet.model?.tables ?? worksheet._tables ?? [];\n    values = Array.isArray(modelTables)\n      ? modelTables\n      : Object.values(modelTables);\n  }\n\n  return values\n    .map((value) => {\n      const model = value?.table ?? value?.model ?? value;\n      const name =\n        value?.name ??\n        model?.name ??\n        model?.displayName ??\n        null;\n      const ref = value?.ref ?? model?.ref ?? null;\n\n      return name && ref\n        ? {\n            name,\n            ref,\n            displayName: model?.displayName ?? name,\n            headerRow: model?.headerRow !== false,\n            totalsRow: model?.totalsRow === true,\n          }\n        : null;\n    })\n    .filter(Boolean)\n    .sort((left, right) => left.name.localeCompare(right.name, \"en\"));\n}\n\nfunction findTable(workbook, tableName) {\n  const expected = tableName.toLowerCase();\n\n  for (const worksheet of workbook.worksheets) {\n    const table = listWorksheetTables(worksheet).find(\n      (candidate) =>\n        candidate.name.toLowerCase() === expected ||\n        candidate.displayName.toLowerCase() === expected,\n    );\n\n    if (table) return { worksheet, table };\n  }\n\n  return null;\n}\n\nasync function inspectWorkbookPackage(path) {\n  const packageFile = await readOoxmlPackage(path);\n  const names = packageFile.names();\n\n  return {\n    tableCount: names.filter(\n      (name) => /^xl\\/tables\\/table\\d+\\.xml$/i.test(name),\n    ).length,\n    chartCount: names.filter(\n      (name) => /^xl\\/charts\\/chart\\d+\\.xml$/i.test(name),\n    ).length,\n    imageCount: names.filter((name) => name.startsWith(\"xl/media/\")).length,\n    externalLinkCount: names.filter(\n      (name) => /^xl\\/externalLinks\\/externalLink\\d+\\.xml$/i.test(name),\n    ).length,\n    hasMacros: names.some(\n      (name) => name.toLowerCase() === \"xl/vbaproject.bin\",\n    ),\n    hasConnections: names.some(\n      (name) => name.toLowerCase() === \"xl/connections.xml\",\n    ),\n  };\n}\n\nfunction selectWorksheet(workbook, selector) {\n  if (selector === undefined || selector === null || selector === \"\") {\n    const first = workbook.worksheets[0];\n    if (!first) throw new Error(\"The workbook contains no worksheets.\");\n    return first;\n  }\n\n  const numeric = Number.parseInt(String(selector), 10);\n  const worksheet = Number.isInteger(numeric) && String(numeric) === String(selector)\n    ? workbook.getWorksheet(numeric)\n    : workbook.getWorksheet(String(selector));\n\n  if (!worksheet) {\n    throw new Error(`Worksheet not found: ${selector}`);\n  }\n\n  return worksheet;\n}\n\nfunction resolveBounds(worksheet, options) {\n  if (options.range) return parseRange(options.range);\n\n  const lastRow = Math.max(1, worksheet.actualRowCount ?? worksheet.rowCount);\n  const lastColumn = Math.max(\n    1,\n    worksheet.actualColumnCount ?? worksheet.columnCount,\n  );\n\n  return {\n    startRow: 1,\n    startColumn: 1,\n    endRow: Math.min(lastRow, options.maxRows),\n    endColumn: Math.min(lastColumn, options.maxColumns),\n  };\n}\n\nfunction readMatrix(worksheet, bounds, options) {\n  const matrix = [];\n\n  for (let rowNumber = bounds.startRow; rowNumber <= bounds.endRow; rowNumber += 1) {\n    const row = [];\n\n    for (\n      let columnNumber = bounds.startColumn;\n      columnNumber <= bounds.endColumn;\n      columnNumber += 1\n    ) {\n      row.push(\n        normaliseCellValue(\n          worksheet.getCell(rowNumber, columnNumber).value,\n          options,\n        ),\n      );\n    }\n\n    matrix.push(row);\n  }\n\n  return trimEmptyEdges(matrix);\n}\n\nfunction normaliseCellValue(value, options = {}) {\n  if (value === undefined || value === null) return null;\n  if (value instanceof Date) return value.toISOString();\n  if (Buffer.isBuffer(value)) return value.toString(\"base64\");\n\n  if (typeof value !== \"object\") return value;\n\n  const formula = formulaFromValue(value);\n  if (formula) {\n    return options.includeFormulas\n      ? {\n          formula: formula.formula,\n          result: normaliseCellValue(formula.result, {\n            includeFormulas: false,\n          }),\n        }\n      : normaliseCellValue(formula.result, {\n          includeFormulas: false,\n        });\n  }\n\n  if (Array.isArray(value.richText)) {\n    return value.richText.map((item) => item.text ?? \"\").join(\"\");\n  }\n\n  if (value.hyperlink) {\n    return value.text ?? value.hyperlink;\n  }\n\n  if (value.error) {\n    return { error: value.error };\n  }\n\n  if (value.text !== undefined) return value.text;\n\n  return JSON.parse(JSON.stringify(value));\n}\n\nfunction formulaFromValue(value) {\n  if (\n    value &&\n    typeof value === \"object\" &&\n    (typeof value.formula === \"string\" ||\n      typeof value.sharedFormula === \"string\")\n  ) {\n    return {\n      formula: value.formula ?? value.sharedFormula,\n      result: value.result ?? null,\n    };\n  }\n\n  return null;\n}\n\nfunction tabularResult({\n  path,\n  workspaceRoot,\n  worksheet,\n  bounds,\n  matrix,\n  header,\n}) {\n  return {\n    source: path,\n    displayPath: displayPath(path, workspaceRoot),\n    sheet: worksheet.name,\n    range: formatRange(bounds),\n    matrix,\n    records: header ? matrixToRecords(matrix) : matrix,\n    header,\n  };\n}\n\nfunction matrixToRecords(matrix) {\n  if (matrix.length === 0) return [];\n\n  const headers = uniqueHeaders(matrix[0]);\n  return matrix.slice(1).map((row) =>\n    Object.fromEntries(\n      headers.map((header, index) => [header, row[index] ?? null]),\n    ),\n  );\n}\n\nfunction uniqueHeaders(row) {\n  const counts = new Map();\n\n  return row.map((value, index) => {\n    const base = String(value ?? \"\").trim() || `column-${index + 1}`;\n    const safe = base.replace(/\\s+/g, \" \");\n    const count = (counts.get(safe) ?? 0) + 1;\n    counts.set(safe, count);\n    return count === 1 ? safe : `${safe}-${count}`;\n  });\n}\n\nfunction trimEmptyEdges(matrix) {\n  const copy = matrix.map((row) => [...row]);\n\n  while (\n    copy.length > 0 &&\n    copy.at(-1).every((value) => value === null || value === \"\")\n  ) {\n    copy.pop();\n  }\n\n  let lastUsedColumn = -1;\n  for (const row of copy) {\n    for (let index = row.length - 1; index >= 0; index -= 1) {\n      if (row[index] !== null && row[index] !== \"\") {\n        lastUsedColumn = Math.max(lastUsedColumn, index);\n        break;\n      }\n    }\n  }\n\n  return lastUsedColumn < 0\n    ? []\n    : copy.map((row) => row.slice(0, lastUsedColumn + 1));\n}\n\nexport function parseRange(value) {\n  const match = String(value)\n    .trim()\n    .match(/^([A-Za-z]+)(\\d+)(?::([A-Za-z]+)(\\d+))?$/);\n\n  if (!match) {\n    throw new Error(`Invalid Excel range: ${value}`);\n  }\n\n  const startColumn = columnLettersToNumber(match[1]);\n  const startRow = Number.parseInt(match[2], 10);\n  const endColumn = match[3]\n    ? columnLettersToNumber(match[3])\n    : startColumn;\n  const endRow = match[4]\n    ? Number.parseInt(match[4], 10)\n    : startRow;\n\n  if (endRow < startRow || endColumn < startColumn) {\n    throw new Error(`Excel range is reversed: ${value}`);\n  }\n\n  return {\n    startRow,\n    startColumn,\n    endRow,\n    endColumn,\n  };\n}\n\nfunction formatRange(bounds) {\n  return `${columnNumberToLetters(bounds.startColumn)}${bounds.startRow}:${columnNumberToLetters(bounds.endColumn)}${bounds.endRow}`;\n}\n\nfunction columnLettersToNumber(value) {\n  let result = 0;\n\n  for (const character of value.toUpperCase()) {\n    result = result * 26 + character.charCodeAt(0) - 64;\n  }\n\n  return result;\n}\n\nfunction columnNumberToLetters(value) {\n  let number = value;\n  let result = \"\";\n\n  while (number > 0) {\n    number -= 1;\n    result = String.fromCharCode(65 + (number % 26)) + result;\n    number = Math.floor(number / 26);\n  }\n\n  return result;\n}\n\nfunction assertSupportedWorkbook(path) {\n  const extension = extname(path).toLowerCase();\n\n  if (!MODERN_EXCEL_EXTENSIONS.has(extension)) {\n    throw new Error(\n      `Unsupported Excel format ${extension || \"(none)\"}. Convert legacy .xls files to .xlsx before analysis.`,\n    );\n  }\n}\n\nfunction displayPath(path, workspaceRoot) {\n  if (!workspaceRoot) return path;\n\n  const value = relative(workspaceRoot, path).replaceAll(\"\\\\\", \"/\");\n  return value.startsWith(\"..\") ? path : value || \".\";\n}\n"}, "src/office/tabular-output.mjs": {"content": "import { extname, relative } from \"node:path\";\nimport { writeFileAtomic } from \"../files/output.mjs\";\n\nconst FORMATS = new Set([\"json\", \"csv\", \"ndjson\"]);\n\nexport async function writeTabularOutput(data, options) {\n  const format = normaliseFormat(options.format, options.outputPath);\n  let content;\n\n  if (format === \"csv\") {\n    content = `${toCsv(data.matrix)}\\n`;\n  } else if (format === \"ndjson\") {\n    const rows = data.header ? data.records : data.matrix;\n    content = rows.map((row) => JSON.stringify(row)).join(\"\\n\");\n    if (content) content += \"\\n\";\n  } else {\n    const rows = data.header ? data.records : data.matrix;\n    content = `${JSON.stringify(rows, null, 2)}\\n`;\n  }\n\n  const path = await writeFileAtomic(options.outputPath, content, {\n    workspaceRoot: options.workspaceRoot,\n    overwrite: options.overwrite ?? false,\n    encoding: \"utf8\",\n  });\n\n  return {\n    path,\n    displayPath: displayPath(path, options.workspaceRoot),\n    format,\n    bytes: Buffer.byteLength(content),\n  };\n}\n\nexport function toCsv(matrix) {\n  return matrix\n    .map((row) => row.map(csvValue).join(\",\"))\n    .join(\"\\n\");\n}\n\nfunction csvValue(value) {\n  if (value === null || value === undefined) return \"\";\n\n  const text =\n    typeof value === \"object\" ? JSON.stringify(value) : String(value);\n\n  return /[\",\\r\\n]/.test(text)\n    ? `\"${text.replaceAll('\"', '\"\"')}\"`\n    : text;\n}\n\nfunction normaliseFormat(requested, outputPath) {\n  const extension = extname(outputPath).toLowerCase().replace(/^\\./, \"\");\n  const format = requested?.toLowerCase() || extension || \"json\";\n\n  if (!FORMATS.has(format)) {\n    throw new Error(\n      `Unsupported extraction format: ${format}. Use json, csv or ndjson.`,\n    );\n  }\n\n  return format;\n}\n\nfunction displayPath(path, workspaceRoot) {\n  if (!workspaceRoot) return path;\n\n  const value = relative(workspaceRoot, path).replaceAll(\"\\\\\", \"/\");\n  return value.startsWith(\"..\") ? path : value || \".\";\n}\n"}, "src/office/powerpoint.mjs": {"content": "import { extname, posix, relative, resolve } from \"node:path\";\nimport { writeFileAtomic } from \"../files/output.mjs\";\nimport { prepareOutputDirectory } from \"../files/directory-output.mjs\";\nimport {\n  asArray,\n  attributeByLocalName,\n  childByLocalName,\n  descendantsByLocalName,\n  readOoxmlPackage,\n  relationships,\n  textValues,\n} from \"./ooxml.mjs\";\n\nconst MODERN_POWERPOINT_EXTENSIONS = new Set([\".pptx\", \".pptm\"]);\nconst EMU_PER_INCH = 914400;\n\nexport async function inspectPresentation(path, options = {}) {\n  const presentation = await readPresentation(path, options);\n  const warnings = [];\n\n  if (presentation.summary.hasMacros) {\n    warnings.push({\n      code: \"MACROS_PRESENT\",\n      message:\n        \"The presentation contains a VBA project. My Dashboards will never execute presentation macros.\",\n    });\n  }\n\n  return {\n    ...presentation.summary,\n    warnings,\n  };\n}\n\nexport async function outlinePresentation(path, options = {}) {\n  const presentation = await readPresentation(path, options);\n\n  return {\n    source: presentation.summary.source,\n    displayPath: presentation.summary.displayPath,\n    slides: presentation.slides.map((slide) => ({\n      number: slide.number,\n      title: slide.title,\n      hidden: slide.hidden,\n    })),\n  };\n}\n\nexport async function readPresentation(path, options = {}) {\n  assertSupportedPresentation(path);\n  const packageFile = await readOoxmlPackage(path);\n  const presentationPart = \"ppt/presentation.xml\";\n\n  if (!packageFile.has(presentationPart)) {\n    throw new Error(\n      \"The OOXML package does not contain ppt/presentation.xml.\",\n    );\n  }\n\n  const presentationDocument = packageFile.xml(presentationPart);\n  const presentationRoot = childByLocalName(\n    presentationDocument,\n    \"presentation\",\n  );\n  const slideIdList = childByLocalName(presentationRoot, \"sldIdLst\");\n  const slideIds = asArray(childByLocalName(slideIdList, \"sldId\"));\n  const presentationRelationships = relationships(\n    packageFile,\n    presentationPart,\n  );\n  const relationshipById = new Map(\n    presentationRelationships.map((relationship) => [\n      relationship.id,\n      relationship,\n    ]),\n  );\n\n  const slides = [];\n\n  for (let index = 0; index < slideIds.length; index += 1) {\n    const slideId = slideIds[index];\n    const relationshipId = attributeByLocalName(slideId, \"id\");\n    const relationship = relationshipById.get(relationshipId);\n\n    if (!relationship?.resolvedTarget) continue;\n\n    slides.push(\n      readSlide(\n        packageFile,\n        relationship.resolvedTarget,\n        index + 1,\n        slideId,\n      ),\n    );\n  }\n\n  const dimensions = readDimensions(presentationRoot);\n  const names = packageFile.names();\n  const summary = {\n    source: path,\n    displayPath: displayPath(path, options.workspaceRoot),\n    slideCount: slides.length,\n    dimensions,\n    slidesWithNotes: slides.filter((slide) => slide.notes.length > 0).length,\n    imageCount: names.filter((name) => name.startsWith(\"ppt/media/\")).length,\n    chartCount: names.filter(\n      (name) => /^ppt\\/charts\\/chart\\d+\\.xml$/i.test(name),\n    ).length,\n    tableCount: slides.reduce(\n      (total, slide) => total + slide.tableCount,\n      0,\n    ),\n    slideMasterCount: names.filter(\n      (name) => /^ppt\\/slideMasters\\/slideMaster\\d+\\.xml$/i.test(name),\n    ).length,\n    hasMacros: names.some(\n      (name) => name.toLowerCase() === \"ppt/vbaproject.bin\",\n    ),\n  };\n\n  return {\n    summary,\n    slides,\n  };\n}\n\nexport async function extractPresentationImages(path, options = {}) {\n  assertSupportedPresentation(path);\n  const packageFile = await readOoxmlPackage(path);\n  const outputDirectory = await prepareOutputDirectory(\n    options.outputDirectory,\n    {\n      workspaceRoot: options.workspaceRoot,\n      overwrite: options.overwrite ?? false,\n    },\n  );\n  const imageEntries = packageFile\n    .names(\"ppt/media/\")\n    .filter((name) => !name.endsWith(\"/\"));\n  const files = [];\n\n  for (const entry of imageEntries) {\n    const fileName = posix.basename(entry);\n    const outputPath = resolve(outputDirectory, fileName);\n    await writeFileAtomic(outputPath, packageFile.binary(entry), {\n      workspaceRoot: options.workspaceRoot,\n      overwrite: true,\n    });\n    files.push({\n      entry,\n      fileName,\n      path: outputPath,\n    });\n  }\n\n  return {\n    source: path,\n    outputDirectory,\n    files,\n  };\n}\n\nfunction readSlide(packageFile, slidePart, number, slideId) {\n  const slideDocument = packageFile.xml(slidePart);\n  const slideRoot = childByLocalName(slideDocument, \"sld\");\n  const slideRelationships = relationships(packageFile, slidePart);\n  const text = textValues(slideRoot);\n  const title = extractTitle(slideRoot) ?? text[0] ?? null;\n  const notesRelationship = slideRelationships.find((relationship) =>\n    relationship.type?.endsWith(\"/notesSlide\"),\n  );\n  const notes =\n    notesRelationship?.resolvedTarget &&\n    packageFile.has(notesRelationship.resolvedTarget)\n      ? textValues(packageFile.xml(notesRelationship.resolvedTarget))\n      : [];\n  const images = slideRelationships\n    .filter((relationship) => relationship.type?.endsWith(\"/image\"))\n    .map((relationship) => ({\n      relationshipId: relationship.id,\n      packagePath: relationship.resolvedTarget,\n      fileName: relationship.resolvedTarget\n        ? posix.basename(relationship.resolvedTarget)\n        : null,\n    }));\n  const charts = slideRelationships\n    .filter((relationship) => relationship.type?.endsWith(\"/chart\"))\n    .map((relationship) => ({\n      relationshipId: relationship.id,\n      packagePath: relationship.resolvedTarget,\n    }));\n\n  return {\n    number,\n    slideId: attributeByLocalName(slideId, \"id\") ?? null,\n    part: slidePart,\n    title,\n    text,\n    notes,\n    hidden:\n      attributeByLocalName(slideId, \"show\") === \"0\" ||\n      attributeByLocalName(slideRoot, \"show\") === \"0\",\n    images,\n    charts,\n    tableCount: descendantsByLocalName(slideRoot, \"tbl\").length,\n    shapeCount: descendantsByLocalName(slideRoot, \"sp\").length,\n  };\n}\n\nfunction extractTitle(slideRoot) {\n  for (const shape of descendantsByLocalName(slideRoot, \"sp\")) {\n    const nonVisual = childByLocalName(shape, \"nvSpPr\");\n    const nonVisualProperties = childByLocalName(nonVisual, \"nvPr\");\n    const placeholder = childByLocalName(nonVisualProperties, \"ph\");\n    const type = attributeByLocalName(placeholder, \"type\");\n\n    if (type === \"title\" || type === \"ctrTitle\") {\n      const values = textValues(shape);\n      if (values.length > 0) return values.join(\" \");\n    }\n  }\n\n  return null;\n}\n\nfunction readDimensions(presentationRoot) {\n  const slideSize = childByLocalName(presentationRoot, \"sldSz\");\n  const widthEmu = Number(attributeByLocalName(slideSize, \"cx\") ?? 0);\n  const heightEmu = Number(attributeByLocalName(slideSize, \"cy\") ?? 0);\n\n  return {\n    widthEmu,\n    heightEmu,\n    widthInches: round(widthEmu / EMU_PER_INCH),\n    heightInches: round(heightEmu / EMU_PER_INCH),\n  };\n}\n\nfunction round(value) {\n  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;\n}\n\nfunction assertSupportedPresentation(path) {\n  const extension = extname(path).toLowerCase();\n\n  if (!MODERN_POWERPOINT_EXTENSIONS.has(extension)) {\n    throw new Error(\n      `Unsupported PowerPoint format ${extension || \"(none)\"}. Convert legacy .ppt files to .pptx before analysis.`,\n    );\n  }\n}\n\nfunction displayPath(path, workspaceRoot) {\n  if (!workspaceRoot) return path;\n\n  const value = relative(workspaceRoot, path).replaceAll(\"\\\\\", \"/\");\n  return value.startsWith(\"..\") ? path : value || \".\";\n}\n"}, "src/files/directory-output.mjs": {"content": "import { mkdir, readdir, rm, stat } from \"node:fs/promises\";\nimport { resolve } from \"node:path\";\nimport { CliError, EXIT_UNSAFE_OPERATION } from \"../../cli/errors.mjs\";\nimport { assertPathInsideWorkspace } from \"./paths.mjs\";\n\nexport async function prepareOutputDirectory(path, options = {}) {\n  const outputPath = resolve(path);\n\n  if (!options.workspaceRoot) {\n    throw new CliError(\n      \"WORKSPACE_REQUIRED_FOR_WRITE\",\n      \"Directory outputs require a My Dashboards workspace.\",\n      { exitCode: EXIT_UNSAFE_OPERATION },\n    );\n  }\n\n  await assertPathInsideWorkspace(outputPath, options.workspaceRoot, {\n    mustExist: false,\n  });\n\n  const exists = await pathExists(outputPath);\n\n  if (exists) {\n    const metadata = await stat(outputPath);\n\n    if (!metadata.isDirectory()) {\n      throw new CliError(\n        \"OUTPUT_NOT_DIRECTORY\",\n        `Output path is not a directory: ${outputPath}`,\n        { exitCode: EXIT_UNSAFE_OPERATION },\n      );\n    }\n\n    const entries = await readdir(outputPath);\n\n    if (entries.length > 0 && !options.overwrite) {\n      throw new CliError(\n        \"OUTPUT_DIRECTORY_NOT_EMPTY\",\n        `Output directory is not empty: ${outputPath}`,\n        {\n          exitCode: EXIT_UNSAFE_OPERATION,\n          hint:\n            \"Choose an empty directory or explicitly request overwrite.\",\n        },\n      );\n    }\n\n    if (entries.length > 0 && options.overwrite) {\n      await rm(outputPath, { recursive: true, force: true });\n    }\n  }\n\n  await mkdir(outputPath, { recursive: true });\n  return outputPath;\n}\n\nasync function pathExists(path) {\n  try {\n    await stat(path);\n    return true;\n  } catch (error) {\n    if (error?.code === \"ENOENT\") return false;\n    throw error;\n  }\n}\n"}, "src/office/README.md": {"content": "# Office document services\n\nThe Office layer provides read-only analysis of modern OOXML files:\n\n- `.xlsx` and `.xlsm`;\n- `.pptx` and `.pptm`.\n\nLegacy `.xls` and `.ppt` files must be converted before analysis.\n\n## Safety\n\n- VBA projects are detected but never executed.\n- External workbook links are reported but never refreshed.\n- Formula text and cached results may be inspected, but formulas are not\n  recalculated by the parser.\n- Office documents are treated as untrusted input.\n- Extracted outputs use workspace-bound atomic writes and refuse accidental\n  overwrite.\n- Optional slide rendering and Office recalculation remain capability-gated\n  behind LibreOffice and are not part of this bootstrap.\n\n## Dependencies\n\n- `exceljs` reads modern Excel workbooks;\n- `fflate` reads OOXML ZIP packages;\n- `fast-xml-parser` parses the XML parts inside PowerPoint and workbook\n  packages.\n"}, "scripts/tasks/create-office-fixtures.mjs": {"content": "#!/usr/bin/env node\n\nimport ExcelJS from \"exceljs\";\nimport { mkdir, writeFile } from \"node:fs/promises\";\nimport { dirname, resolve } from \"node:path\";\nimport { fileURLToPath } from \"node:url\";\nimport { strToU8, zipSync } from \"fflate\";\n\nconst scriptDirectory = dirname(fileURLToPath(import.meta.url));\nconst projectRoot = resolve(scriptDirectory, \"../..\");\nconst fixtureDirectory = resolve(\n  projectRoot,\n  \"tests\",\n  \"fixtures\",\n  \"office\",\n);\n\nawait mkdir(fixtureDirectory, { recursive: true });\nawait createWorkbook(resolve(fixtureDirectory, \"sample.xlsx\"));\nawait createPresentation(resolve(fixtureDirectory, \"sample.pptx\"));\n\nconsole.log(\"Office fixtures created.\");\n\nasync function createWorkbook(path) {\n  const workbook = new ExcelJS.Workbook();\n  workbook.creator = \"My Dashboards\";\n  const summary = workbook.addWorksheet(\"Summary\");\n  summary.addRows([\n    [\"Status\", \"Count\"],\n    [\"Approved\", 12],\n    [\"Review\", 3],\n    [\"Total\", { formula: \"SUM(B2:B3)\", result: 15 }],\n  ]);\n  summary.addTable({\n    name: \"StatusTable\",\n    ref: \"A1\",\n    headerRow: true,\n    totalsRow: false,\n    style: {\n      theme: \"TableStyleMedium2\",\n      showRowStripes: true,\n    },\n    columns: [{ name: \"Status\" }, { name: \"Count\" }],\n    rows: [\n      [\"Approved\", 12],\n      [\"Review\", 3],\n    ],\n  });\n  summary.mergeCells(\"D1:E1\");\n  summary.getCell(\"D1\").value = \"Governance summary\";\n\n  const hidden = workbook.addWorksheet(\"Hidden Data\", {\n    state: \"hidden\",\n  });\n  hidden.addRows([\n    [\"ID\", \"Owner\"],\n    [\"UC-001\", \"Alice\"],\n  ]);\n\n  await workbook.xlsx.writeFile(path);\n}\n\nasync function createPresentation(path) {\n  const entries = {\n    \"[Content_Types].xml\": xml(`<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">\n  <Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>\n  <Default Extension=\"xml\" ContentType=\"application/xml\"/>\n  <Default Extension=\"png\" ContentType=\"image/png\"/>\n  <Override PartName=\"/ppt/presentation.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml\"/>\n  <Override PartName=\"/ppt/slides/slide1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.slide+xml\"/>\n  <Override PartName=\"/ppt/notesSlides/notesSlide1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml\"/>\n</Types>`),\n    \"_rels/.rels\": xml(`<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\n  <Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"ppt/presentation.xml\"/>\n</Relationships>`),\n    \"ppt/presentation.xml\": xml(`<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<p:presentation xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\">\n  <p:sldIdLst>\n    <p:sldId id=\"256\" r:id=\"rId1\"/>\n  </p:sldIdLst>\n  <p:sldSz cx=\"12192000\" cy=\"6858000\" type=\"screen16x9\"/>\n</p:presentation>`),\n    \"ppt/_rels/presentation.xml.rels\": xml(`<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\n  <Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide\" Target=\"slides/slide1.xml\"/>\n</Relationships>`),\n    \"ppt/slides/slide1.xml\": xml(`<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<p:sld xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\">\n  <p:cSld>\n    <p:spTree>\n      <p:nvGrpSpPr/><p:grpSpPr/>\n      <p:sp>\n        <p:nvSpPr>\n          <p:cNvPr id=\"2\" name=\"Title 1\"/>\n          <p:cNvSpPr/>\n          <p:nvPr><p:ph type=\"title\"/></p:nvPr>\n        </p:nvSpPr>\n        <p:spPr/>\n        <p:txBody>\n          <a:bodyPr/><a:lstStyle/>\n          <a:p><a:r><a:t>Agent Hub Overview</a:t></a:r></a:p>\n        </p:txBody>\n      </p:sp>\n      <p:sp>\n        <p:nvSpPr>\n          <p:cNvPr id=\"3\" name=\"Content\"/>\n          <p:cNvSpPr/><p:nvPr/>\n        </p:nvSpPr>\n        <p:spPr/>\n        <p:txBody>\n          <a:bodyPr/><a:lstStyle/>\n          <a:p><a:r><a:t>Use cases in governance review</a:t></a:r></a:p>\n        </p:txBody>\n      </p:sp>\n      <p:pic>\n        <p:nvPicPr><p:cNvPr id=\"4\" name=\"Picture 1\"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>\n        <p:blipFill><a:blip r:embed=\"rId2\"/></p:blipFill>\n        <p:spPr/>\n      </p:pic>\n    </p:spTree>\n  </p:cSld>\n</p:sld>`),\n    \"ppt/slides/_rels/slide1.xml.rels\": xml(`<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\n  <Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide\" Target=\"../notesSlides/notesSlide1.xml\"/>\n  <Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\" Target=\"../media/image1.png\"/>\n</Relationships>`),\n    \"ppt/notesSlides/notesSlide1.xml\": xml(`<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<p:notes xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\">\n  <p:cSld>\n    <p:spTree>\n      <p:sp>\n        <p:nvSpPr><p:cNvPr id=\"2\" name=\"Notes\"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>\n        <p:spPr/>\n        <p:txBody>\n          <a:bodyPr/><a:lstStyle/>\n          <a:p><a:r><a:t>Explain the governance journey.</a:t></a:r></a:p>\n        </p:txBody>\n      </p:sp>\n    </p:spTree>\n  </p:cSld>\n</p:notes>`),\n    \"ppt/media/image1.png\": Buffer.from(\n      \"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=\",\n      \"base64\",\n    ),\n  };\n\n  const zipped = zipSync(entries, { level: 6 });\n  await writeFile(path, Buffer.from(zipped));\n}\n\nfunction xml(value) {\n  return strToU8(value);\n}\n"}, "tests/unit/office-excel.test.mjs": {"content": "import assert from \"node:assert/strict\";\nimport { dirname, resolve } from \"node:path\";\nimport { fileURLToPath } from \"node:url\";\nimport test from \"node:test\";\nimport {\n  extractTable,\n  inspectWorkbook,\n  listFormulas,\n  previewWorksheet,\n} from \"../../src/office/excel.mjs\";\n\nconst testDirectory = dirname(fileURLToPath(import.meta.url));\nconst fixture = resolve(\n  testDirectory,\n  \"../fixtures/office/sample.xlsx\",\n);\n\ntest(\"Excel inspection reports sheets, tables and formulas\", async () => {\n  const result = await inspectWorkbook(fixture);\n\n  assert.equal(result.sheetCount, 2);\n  assert.equal(result.features.tableCount, 1);\n  assert.equal(result.formulaCellCount, 1);\n  assert.equal(result.sheets[1].state, \"hidden\");\n});\n\ntest(\"Excel preview returns a bounded matrix\", async () => {\n  const result = await previewWorksheet(fixture, {\n    sheet: \"Summary\",\n    range: \"A1:B3\",\n  });\n\n  assert.deepEqual(result.matrix, [\n    [\"Status\", \"Count\"],\n    [\"Approved\", 12],\n    [\"Review\", 3],\n  ]);\n});\n\ntest(\"Excel table extraction produces records\", async () => {\n  const result = await extractTable(fixture, \"StatusTable\");\n\n  assert.equal(result.table, \"StatusTable\");\n  assert.deepEqual(result.records, [\n    { Status: \"Approved\", Count: 12 },\n    { Status: \"Review\", Count: 3 },\n  ]);\n});\n\ntest(\"Formula listing never recalculates formulas\", async () => {\n  const result = await listFormulas(fixture);\n\n  assert.equal(result.formulas.length, 1);\n  assert.equal(result.formulas[0].formula, \"SUM(B2:B3)\");\n  assert.equal(result.formulas[0].result, 15);\n});\n"}, "tests/unit/office-powerpoint.test.mjs": {"content": "import assert from \"node:assert/strict\";\nimport { dirname, resolve } from \"node:path\";\nimport { fileURLToPath } from \"node:url\";\nimport test from \"node:test\";\nimport {\n  inspectPresentation,\n  outlinePresentation,\n  readPresentation,\n} from \"../../src/office/powerpoint.mjs\";\n\nconst testDirectory = dirname(fileURLToPath(import.meta.url));\nconst fixture = resolve(\n  testDirectory,\n  \"../fixtures/office/sample.pptx\",\n);\n\ntest(\"PowerPoint inspection reports slides, notes and media\", async () => {\n  const result = await inspectPresentation(fixture);\n\n  assert.equal(result.slideCount, 1);\n  assert.equal(result.slidesWithNotes, 1);\n  assert.equal(result.imageCount, 1);\n  assert.equal(result.dimensions.widthInches, 13.33);\n});\n\ntest(\"PowerPoint outline uses title placeholders\", async () => {\n  const result = await outlinePresentation(fixture);\n\n  assert.deepEqual(result.slides, [\n    {\n      number: 1,\n      title: \"Agent Hub Overview\",\n      hidden: false,\n    },\n  ]);\n});\n\ntest(\"PowerPoint structured extraction retains text and notes\", async () => {\n  const result = await readPresentation(fixture);\n\n  assert.deepEqual(result.slides[0].text, [\n    \"Agent Hub Overview\",\n    \"Use cases in governance review\",\n  ]);\n  assert.deepEqual(result.slides[0].notes, [\n    \"Explain the governance journey.\",\n  ]);\n  assert.equal(result.slides[0].images[0].fileName, \"image1.png\");\n});\n"}, "tests/integration/office-cli.test.mjs": {"content": "import assert from \"node:assert/strict\";\nimport { rm, stat } from \"node:fs/promises\";\nimport { dirname, resolve } from \"node:path\";\nimport { fileURLToPath } from \"node:url\";\nimport { spawnSync } from \"node:child_process\";\nimport test from \"node:test\";\n\nconst testDirectory = dirname(fileURLToPath(import.meta.url));\nconst projectRoot = resolve(testDirectory, \"../..\");\nconst cliPath = resolve(projectRoot, \"bin\", \"mydash.mjs\");\n\nfunction runCli(args) {\n  return spawnSync(process.execPath, [cliPath, ...args], {\n    cwd: projectRoot,\n    encoding: \"utf8\",\n    stdio: \"pipe\",\n    shell: false,\n  });\n}\n\ntest(\"Excel inspect is exposed through the CLI\", () => {\n  const result = runCli([\n    \"excel\",\n    \"inspect\",\n    \"tests/fixtures/office/sample.xlsx\",\n    \"--json\",\n  ]);\n\n  assert.equal(result.status, 0);\n  const body = JSON.parse(result.stdout);\n  assert.equal(body.command, \"excel inspect\");\n  assert.equal(body.data.sheetCount, 2);\n});\n\ntest(\"Excel preview is exposed through the CLI\", () => {\n  const result = runCli([\n    \"excel\",\n    \"preview\",\n    \"tests/fixtures/office/sample.xlsx\",\n    \"--sheet\",\n    \"Summary\",\n    \"--range\",\n    \"A1:B2\",\n    \"--json\",\n  ]);\n\n  assert.equal(result.status, 0);\n  const body = JSON.parse(result.stdout);\n  assert.deepEqual(body.data.matrix, [\n    [\"Status\", \"Count\"],\n    [\"Approved\", 12],\n  ]);\n});\n\ntest(\"PowerPoint outline is exposed through the CLI\", () => {\n  const result = runCli([\n    \"powerpoint\",\n    \"outline\",\n    \"tests/fixtures/office/sample.pptx\",\n    \"--json\",\n  ]);\n\n  assert.equal(result.status, 0);\n  const body = JSON.parse(result.stdout);\n  assert.equal(body.data.slides[0].title, \"Agent Hub Overview\");\n});\n\ntest(\"PowerPoint extraction creates structured output\", async () => {\n  const output = resolve(\n    projectRoot,\n    \".my-dashboards\",\n    \"temp\",\n    \"office-cli-test\",\n  );\n  await rm(output, { recursive: true, force: true });\n\n  try {\n    const result = runCli([\n      \"powerpoint\",\n      \"extract\",\n      \"tests/fixtures/office/sample.pptx\",\n      \"--output\",\n      \".my-dashboards/temp/office-cli-test\",\n      \"--include-images\",\n      \"--json\",\n    ]);\n\n    assert.equal(result.status, 0, result.stderr);\n    const metadata = await stat(resolve(output, \"presentation.json\"));\n    assert.equal(metadata.isFile(), true);\n  } finally {\n    await rm(output, { recursive: true, force: true });\n  }\n});\n"}, "scripts/tasks/test-office.mjs": {"content": "#!/usr/bin/env node\n\nimport { spawnSync } from \"node:child_process\";\nimport { dirname, resolve } from \"node:path\";\nimport { fileURLToPath } from \"node:url\";\nimport process from \"node:process\";\n\nconst scriptDirectory = dirname(fileURLToPath(import.meta.url));\nconst projectRoot = resolve(scriptDirectory, \"../..\");\n\nconst fixtureResult = spawnSync(\n  process.execPath,\n  [resolve(scriptDirectory, \"create-office-fixtures.mjs\")],\n  {\n    cwd: projectRoot,\n    stdio: \"inherit\",\n    shell: false,\n  },\n);\n\nif (fixtureResult.error) throw fixtureResult.error;\nif (fixtureResult.status !== 0) {\n  process.exit(fixtureResult.status ?? 1);\n}\n\nconst tests = [\n  resolve(projectRoot, \"tests\", \"unit\", \"office-excel.test.mjs\"),\n  resolve(projectRoot, \"tests\", \"unit\", \"office-powerpoint.test.mjs\"),\n  resolve(projectRoot, \"tests\", \"integration\", \"office-cli.test.mjs\"),\n];\n\nconst result = spawnSync(\n  process.execPath,\n  [\"--test\", ...tests],\n  {\n    cwd: projectRoot,\n    stdio: \"inherit\",\n    shell: false,\n  },\n);\n\nif (result.error) throw result.error;\nprocess.exitCode = result.status ?? 1;\n"}};
const REQUIRED_DEPENDENCIES = {"exceljs": "4.4.0", "fast-xml-parser": "5.10.1", "fflate": "0.8.3"};

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
  dependencies: [],
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
      "Bootstrap 06 must run from the root of the My Dashboards Git repository.",
    );
  }

  const dirtyBefore = getDirtyPaths(repoRoot);
  assertPackageFilesSafe(dirtyBefore);

  const ownedAbsolutePaths = [];

  if (!args.dryRun) {
    const packagePaths = await installDependencies();
    ownedAbsolutePaths.push(...packagePaths);
  } else {
    for (const [name, version] of Object.entries(REQUIRED_DEPENDENCIES)) {
      report.dependencies.push(`${name}@${version}`);
    }
    report.updated.push("package.json");
    report.created.push("package-lock.json (when absent)");
  }

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

  const removed = await removeKnownPlaceholder({
    relativePath: "src/office/.gitkeep",
    expectedContent:
      "# Intentionally retained\n\n" +
      "Excel and PowerPoint inspection and extraction services will live here.\n\n" +
      "Implementation is added by a later bootstrap step.\n",
    dirtyBefore,
    repoRoot,
  });

  if (removed) {
    ownedAbsolutePaths.push(join(targetRoot, "src", "office", ".gitkeep"));
  }

  await validateGeneratedState();

  for (const relativePath of [
    "tests/fixtures/office/sample.xlsx",
    "tests/fixtures/office/sample.pptx",
  ]) {
    const absolutePath = join(targetRoot, relativePath);
    if (await pathExists(absolutePath)) {
      ownedAbsolutePaths.push(absolutePath);
      if (!report.created.includes(relativePath)) {
        report.created.push(relativePath);
      }
    }
  }

  const expectedSelfPath = join(
    targetRoot,
    "scripts",
    "06-build-office-utilities.mjs",
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
        "Office utilities were created and validated, but --no-commit disabled the Git checkpoint.",
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
My Dashboards — Bootstrap 06

Usage:
  node scripts/06-build-office-utilities.mjs [options]

Options:
  --target <path>  Build Office utilities in a specific repository root.
  --dry-run        Report intended changes without installing or writing.
  --no-commit      Install, write and validate without committing or pushing.
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
    "package-lock.json",
    "bin/mydash.mjs",
    "cli/registry.mjs",
    "cli/command-options.mjs",
    "cli/commands/file.mjs",
    "src/files/paths.mjs",
    "src/files/output.mjs",
    "src/files/directory-output.mjs",
    "src/office",
    "tests/unit",
    "tests/integration",
    "tests/fixtures",
    "scripts/tasks/test-files.mjs",
  ];

  const missing = [];

  for (const relativePath of required) {
    if (!(await pathExists(join(targetRoot, relativePath)))) {
      missing.push(relativePath);
    }
  }

  // package-lock may not exist if npm has not yet been run. It is not a
  // blocking prerequisite; Bootstrap 06 will create it.
  const filtered = missing.filter((path) => path !== "package-lock.json");

  if (filtered.length > 0) {
    throw new Error(
      [
        "Bootstrap 05 has not been completed.",
        `Missing required paths: ${filtered.join(", ")}`,
      ].join("\n"),
    );
  }
}

function assertPackageFilesSafe(dirtyBefore) {
  const unsafe = ["package.json", "package-lock.json"].filter((path) =>
    dirtyBefore.has(path),
  );

  if (unsafe.length > 0) {
    throw new Error(
      [
        "Bootstrap 06 needs to install pinned Office dependencies.",
        `Commit or otherwise resolve existing changes in: ${unsafe.join(", ")}`,
        "The bootstrap refuses to merge dependency changes into unrelated package edits.",
      ].join("\n"),
    );
  }
}

async function installDependencies() {
  const packagePath = join(targetRoot, "package.json");
  const lockPath = join(targetRoot, "package-lock.json");
  const originalPackage = await readFile(packagePath, "utf8");
  const lockExisted = await pathExists(lockPath);
  const originalLock = lockExisted
    ? await readFile(lockPath)
    : null;

  let packageValue;
  try {
    packageValue = JSON.parse(originalPackage);
  } catch {
    throw new Error("package.json is not valid JSON and was not modified.");
  }

  packageValue.dependencies ??= {};
  for (const [name, version] of Object.entries(REQUIRED_DEPENDENCIES)) {
    packageValue.dependencies[name] = version;
    report.dependencies.push(`${name}@${version}`);
  }

  packageValue.scripts ??= {};
  packageValue.scripts["test:office"] =
    "node scripts/tasks/test-office.mjs";
  packageValue.scripts["fixtures:office"] =
    "node scripts/tasks/create-office-fixtures.mjs";

  const nextPackage = `${JSON.stringify(packageValue, null, 2)}\n`;
  await atomicWrite(packagePath, nextPackage);

  const install = run(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
    { cwd: targetRoot, allowFailure: true },
  );

  if (install.status !== 0) {
    await atomicWrite(packagePath, originalPackage);

    if (lockExisted) {
      await writeBinaryAtomic(lockPath, originalLock);
    } else {
      await rm(lockPath, { force: true });
    }

    throw new Error(
      [
        "npm could not install the Office dependencies.",
        install.stderr || install.stdout,
        "package.json and package-lock.json were restored.",
      ].join("\n"),
    );
  }

  report.updated.push("package.json");

  if (lockExisted) {
    report.updated.push("package-lock.json");
  } else {
    report.created.push("package-lock.json");
  }

  return [packagePath, lockPath];
}

async function writeManagedFile({
  absolutePath,
  content,
  allowedPrevious,
  dirtyBefore,
  repoRoot,
}) {
  const gitPath = relativeGitPath(repoRoot, absolutePath);
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
        "The Office utility layer and dependency changes were calculated without writing them.",
    });
    return;
  }

  const modulePaths = [
    "cli/registry.mjs",
    "cli/commands/excel.mjs",
    "cli/commands/powerpoint.mjs",
    "src/office/ooxml.mjs",
    "src/office/excel.mjs",
    "src/office/tabular-output.mjs",
    "src/office/powerpoint.mjs",
    "src/files/directory-output.mjs",
    "scripts/tasks/create-office-fixtures.mjs",
    "scripts/tasks/test-office.mjs",
    "tests/unit/office-excel.test.mjs",
    "tests/unit/office-powerpoint.test.mjs",
    "tests/integration/office-cli.test.mjs",
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
      `${modulePaths.length} Office and CLI modules passed Node syntax checks.`,
  });

  const dependencyCheck = run(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'await Promise.all([import("exceljs"), import("fast-xml-parser"), import("fflate")]);',
    ],
    { cwd: targetRoot, allowFailure: true },
  );

  if (dependencyCheck.status !== 0) {
    throw new Error(
      `Office dependency import failed:\n${
        dependencyCheck.stderr || dependencyCheck.stdout
      }`,
    );
  }

  report.validation.push({
    check: "dependency-imports",
    ok: true,
    message: "Pinned Office dependencies can be imported.",
  });

  const tests = run(
    process.execPath,
    [join(targetRoot, "scripts", "tasks", "test-office.mjs")],
    { cwd: targetRoot, allowFailure: true },
  );

  if (tests.status !== 0) {
    throw new Error(
      `Office tests failed:\n${tests.stderr || tests.stdout}`,
    );
  }

  report.validation.push({
    check: "office-tests",
    ok: true,
    message: "Excel, PowerPoint and CLI integration tests passed.",
  });

  for (const task of [
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
      "Filesystem, CLI and contract validation still pass after Office integration.",
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
        "Office utilities were already present; there were no task-owned changes to commit.",
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
        "Office utilities were created and validated, but no commit was made because Git user.name or user.email is missing.",
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

async function writeBinaryAtomic(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;

  try {
    await writeFile(temporaryPath, content);
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

  console.log("\nMy Dashboards — Office utilities\n");
  console.log(`Target: ${report.targetRoot}`);
  console.log(`Result: ${report.ok ? "PASS" : "FAIL"}`);
  console.log(`Mode: ${report.dryRun ? "dry-run" : "write"}`);

  printSection("Dependencies", report.dependencies);
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
