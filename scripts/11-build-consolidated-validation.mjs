#!/usr/bin/env node

/**
 * My Dashboards — Bootstrap 11: Build consolidated validation
 *
 * Adds:
 *
 *   mydash validate
 *   mydash impact <resource-id>
 *
 * Validation combines workspace contracts, library discovery, appearance
 * resolution, recipe execution checks and in-memory standalone export builds.
 * Impact analysis walks the reverse-consumer graph before shared changes.
 *
 * Usage:
 *   node scripts/11-build-consolidated-validation.mjs
 *   node scripts/11-build-consolidated-validation.mjs --dry-run
 *   node scripts/11-build-consolidated-validation.mjs --no-commit
 *   node scripts/11-build-consolidated-validation.mjs --no-push
 *   node scripts/11-build-consolidated-validation.mjs --json
 *   node scripts/11-build-consolidated-validation.mjs --target /path/to/my-dashboards
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

const SCRIPT_NAME = "11-build-consolidated-validation";
const COMMIT_MESSAGE = "Add consolidated validation and impact analysis";
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
const FILES = {"cli/registry.mjs": {"content": "import { helpCommand } from \"./commands/help.mjs\";\nimport { versionCommand } from \"./commands/version.mjs\";\nimport { doctorCommand } from \"./commands/doctor.mjs\";\nimport { inspectCommand } from \"./commands/inspect.mjs\";\nimport { fileCommand } from \"./commands/file.mjs\";\nimport { excelCommand } from \"./commands/excel.mjs\";\nimport { powerpointCommand } from \"./commands/powerpoint.mjs\";\nimport { dataCommand } from \"./commands/data.mjs\";\nimport { libraryCommand } from \"./commands/library.mjs\";\nimport { appearanceCommand } from \"./commands/appearance.mjs\";\nimport { artifactCommand } from \"./commands/artifact.mjs\";\nimport { validateCommand } from \"./commands/validate.mjs\";\nimport { impactCommand } from \"./commands/impact.mjs\";\n\nconst commands = [\n  helpCommand,\n  versionCommand,\n  doctorCommand,\n  inspectCommand,\n  fileCommand,\n  excelCommand,\n  powerpointCommand,\n  dataCommand,\n  libraryCommand,\n  appearanceCommand,\n  artifactCommand,\n  validateCommand,\n  impactCommand,\n];\n\nconst commandMap = new Map(\n  commands.map((command) => [command.name, command]),\n);\n\nexport const commandRegistry = {\n  get(name) {\n    return commandMap.get(name) ?? null;\n  },\n\n  list() {\n    return [...commands];\n  },\n\n  names() {\n    return commands.map((command) => command.name);\n  },\n};\n", "allowedPrevious": ["import { helpCommand } from \"./commands/help.mjs\";\nimport { versionCommand } from \"./commands/version.mjs\";\nimport { doctorCommand } from \"./commands/doctor.mjs\";\nimport { inspectCommand } from \"./commands/inspect.mjs\";\nimport { fileCommand } from \"./commands/file.mjs\";\nimport { excelCommand } from \"./commands/excel.mjs\";\nimport { powerpointCommand } from \"./commands/powerpoint.mjs\";\nimport { dataCommand } from \"./commands/data.mjs\";\nimport { libraryCommand } from \"./commands/library.mjs\";\nimport { appearanceCommand } from \"./commands/appearance.mjs\";\nimport { artifactCommand } from \"./commands/artifact.mjs\";\n\nconst commands = [\n  helpCommand,\n  versionCommand,\n  doctorCommand,\n  inspectCommand,\n  fileCommand,\n  excelCommand,\n  powerpointCommand,\n  dataCommand,\n  libraryCommand,\n  appearanceCommand,\n  artifactCommand,\n];\n\nconst commandMap = new Map(\n  commands.map((command) => [command.name, command]),\n);\n\nexport const commandRegistry = {\n  get(name) {\n    return commandMap.get(name) ?? null;\n  },\n\n  list() {\n    return [...commands];\n  },\n\n  names() {\n    return commands.map((command) => command.name);\n  },\n};\n"]}, "cli/commands/validate.mjs": {"content": "import { resolve } from \"node:path\";\nimport {\n  parseCommandArguments,\n  parseIntegerOption,\n} from \"../command-options.mjs\";\nimport {\n  CliError,\n  EXIT_USAGE,\n  EXIT_VALIDATION,\n} from \"../errors.mjs\";\nimport { findWorkspaceRoot } from \"../../src/workspace/find-root.mjs\";\nimport { writeFileAtomic } from \"../../src/files/output.mjs\";\nimport {\n  validateWorkspace,\n} from \"../../src/validation/workspace-validation.mjs\";\n\nexport const validateCommand = {\n  name: \"validate\",\n  summary:\n    \"Run consolidated workspace, artefact, recipe and export validation.\",\n  usage: \"mydash validate [options]\",\n  options: [\n    \"--artifact <id>               Validate one artefact only.\",\n    \"--kind <kind>                 Disambiguate its artefact kind.\",\n    \"--skip-exports                Skip in-memory standalone export builds.\",\n    \"--skip-recipes                Skip recipe discovery and execution checks.\",\n    \"--minify                      Minify exports during validation.\",\n    \"--max-bytes <number>          Maximum standalone HTML size.\",\n    \"--fail-on-warning             Treat warnings as validation failures.\",\n    \"--report <path>               Write the complete JSON report.\",\n    \"--workspace <path>            Validate a specific workspace.\",\n    \"--json                        Return structured JSON.\",\n  ],\n\n  async run(invocation, context) {\n    const parsed = parseCommandArguments(invocation.args, {\n      booleans: [\n        \"skip-exports\",\n        \"skip-recipes\",\n        \"minify\",\n        \"fail-on-warning\",\n      ],\n      values: [\n        \"artifact\",\n        \"kind\",\n        \"max-bytes\",\n        \"report\",\n      ],\n    });\n\n    if (parsed.positionals.length > 0) {\n      throw new CliError(\n        \"INVALID_USAGE\",\n        `Unexpected argument: ${parsed.positionals[0]}. Usage: mydash validate [options]`,\n        { exitCode: EXIT_USAGE },\n      );\n    }\n\n    const workspaceRoot = await findWorkspaceRoot(\n      invocation.options.workspace ?? context.cwd,\n    );\n\n    if (!workspaceRoot) {\n      throw new CliError(\n        \"WORKSPACE_NOT_FOUND\",\n        \"No My Dashboards workspace was found.\",\n        { exitCode: EXIT_USAGE },\n      );\n    }\n\n    const maxBytes = parseIntegerOption(parsed.options.maxBytes, {\n      label: \"Maximum output bytes\",\n      minimum: 1024,\n      maximum: 200 * 1024 * 1024,\n      defaultValue: 50 * 1024 * 1024,\n    });\n\n    const report = await validateWorkspace({\n      workspaceRoot,\n      artifactId: parsed.options.artifact,\n      artifactKind: parsed.options.kind,\n      validateExports: !(parsed.options.skipExports ?? false),\n      validateRecipes: !(parsed.options.skipRecipes ?? false),\n      minify: parsed.options.minify ?? false,\n      maxBytes,\n      failOnWarning: parsed.options.failOnWarning ?? false,\n      now: context.now,\n    });\n\n    let reportOutput = null;\n\n    if (parsed.options.report) {\n      const path = resolve(workspaceRoot, parsed.options.report);\n      await writeFileAtomic(\n        path,\n        `${JSON.stringify(report, null, 2)}\\n`,\n        {\n          workspaceRoot,\n          overwrite: true,\n          encoding: \"utf8\",\n        },\n      );\n\n      reportOutput = parsed.options.report\n        .replaceAll(\"\\\\\", \"/\")\n        .replace(/^\\/+/, \"\");\n    }\n\n    return {\n      ok: report.summary.valid,\n      command: \"validate\",\n      data: {\n        ...report,\n        reportOutput,\n      },\n      warnings: report.issues\n        .filter((issue) => issue.severity === \"warning\")\n        .map((issue) => ({\n          code: issue.code,\n          message: issue.message,\n        })),\n      exitCode:\n        report.summary.valid ? 0 : EXIT_VALIDATION,\n      text: renderReport(report, reportOutput),\n    };\n  },\n};\n\nfunction renderReport(report, reportOutput) {\n  const lines = [\n    `Workspace: ${report.workspace.name}`,\n    `Valid: ${report.summary.valid ? \"yes\" : \"no\"}`,\n    `Artefacts: ${report.summary.artifactCount}`,\n    `Recipes: ${report.summary.recipeCount}`,\n    `Exports validated: ${report.summary.exportValidatedCount}`,\n    `Errors: ${report.summary.errorCount}`,\n    `Warnings: ${report.summary.warningCount}`,\n  ];\n\n  for (const [stage, value] of Object.entries(report.stages)) {\n    lines.push(\n      `  ${stage}: ${value.status} (${value.errorCount} errors, ${value.warningCount} warnings)`,\n    );\n  }\n\n  if (reportOutput) {\n    lines.push(`Report: ${reportOutput}`);\n  }\n\n  if (report.issues.length > 0) {\n    lines.push(\"\");\n    lines.push(\"Issues:\");\n\n    for (const issue of report.issues.slice(0, 30)) {\n      lines.push(\n        `  ${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`,\n      );\n    }\n\n    if (report.issues.length > 30) {\n      lines.push(\n        `  … ${report.issues.length - 30} additional issues are available in JSON output.`,\n      );\n    }\n  }\n\n  return lines.join(\"\\n\");\n}\n"}, "cli/commands/impact.mjs": {"content": "import {\n  parseCommandArguments,\n  requirePositionals,\n} from \"../command-options.mjs\";\nimport {\n  CliError,\n  EXIT_USAGE,\n  EXIT_VALIDATION,\n} from \"../errors.mjs\";\nimport { findWorkspaceRoot } from \"../../src/workspace/find-root.mjs\";\nimport {\n  scanWorkspaceLibrary,\n} from \"../../src/library/scan.mjs\";\nimport {\n  findImpactTarget,\n  analyseLibraryImpact,\n} from \"../../src/validation/impact-analysis.mjs\";\n\nconst CHANGE_TYPES = new Set([\n  \"implementation\",\n  \"contract\",\n  \"appearance\",\n  \"asset\",\n]);\n\nexport const impactCommand = {\n  name: \"impact\",\n  summary:\n    \"Report direct and transitive consumers before changing a shared resource.\",\n  usage: \"mydash impact <resource-id> [options]\",\n  options: [\n    \"--kind <kind>                 Disambiguate the target resource.\",\n    \"--change <type>               implementation, contract, appearance or asset.\",\n    \"--fail-if-consumed            Exit with validation failure when consumers exist.\",\n    \"--workspace <path>            Analyse a specific workspace.\",\n    \"--json                        Return structured JSON.\",\n  ],\n\n  async run(invocation, context) {\n    const parsed = parseCommandArguments(invocation.args, {\n      booleans: [\"fail-if-consumed\"],\n      values: [\"kind\", \"change\"],\n    });\n    requirePositionals(\n      parsed.positionals,\n      1,\n      \"mydash impact <resource-id> [--kind <kind>]\",\n    );\n\n    const changeType =\n      parsed.options.change ?? \"implementation\";\n\n    if (!CHANGE_TYPES.has(changeType)) {\n      throw new CliError(\n        \"INVALID_CHANGE_TYPE\",\n        `Unknown change type: ${changeType}.`,\n        {\n          exitCode: EXIT_USAGE,\n          details: {\n            availableChangeTypes: [...CHANGE_TYPES],\n          },\n        },\n      );\n    }\n\n    const workspaceRoot = await findWorkspaceRoot(\n      invocation.options.workspace ?? context.cwd,\n    );\n\n    if (!workspaceRoot) {\n      throw new CliError(\n        \"WORKSPACE_NOT_FOUND\",\n        \"No My Dashboards workspace was found.\",\n        { exitCode: EXIT_USAGE },\n      );\n    }\n\n    const scan = await scanWorkspaceLibrary(workspaceRoot);\n    const target = findImpactTarget(\n      scan.entries,\n      parsed.positionals[0],\n      parsed.options.kind,\n    );\n    const data = analyseLibraryImpact(scan, target, {\n      changeType,\n    });\n    const consumed = data.summary.transitiveConsumerCount > 0;\n    const fail =\n      (parsed.options.failIfConsumed ?? false) && consumed;\n\n    return {\n      ok: !fail,\n      command: \"impact\",\n      data,\n      warnings: scan.issues\n        .filter((issue) => issue.severity === \"warning\")\n        .map((issue) => ({\n          code: issue.code,\n          message: issue.message,\n        })),\n      exitCode: fail ? EXIT_VALIDATION : 0,\n      text: renderImpact(data),\n    };\n  },\n};\n\nfunction renderImpact(data) {\n  const lines = [\n    `${data.target.kind}:${data.target.id}`,\n    `Scope: ${data.summary.scope}`,\n    `Change: ${data.changeType}`,\n    `Risk: ${data.summary.risk}`,\n    `Direct consumers: ${data.summary.directConsumerCount}`,\n    `Transitive consumers: ${data.summary.transitiveConsumerCount}`,\n    `Affected artefacts: ${data.summary.affectedArtifactCount}`,\n  ];\n\n  if (data.affectedArtifacts.length > 0) {\n    lines.push(\"\");\n    lines.push(\"Affected artefacts:\");\n\n    for (const artifact of data.affectedArtifacts) {\n      lines.push(\n        `  ${artifact.kind}:${artifact.id} — ${artifact.displayPath}`,\n      );\n    }\n  }\n\n  if (data.recommendations.length > 0) {\n    lines.push(\"\");\n    lines.push(\"Recommended validation:\");\n\n    for (const recommendation of data.recommendations) {\n      lines.push(`  ${recommendation}`);\n    }\n  }\n\n  return lines.join(\"\\n\");\n}\n"}, "src/validation/recipe-validation.mjs": {"content": "import {\n  lstat,\n  readFile,\n  readdir,\n  realpath,\n  stat,\n} from \"node:fs/promises\";\nimport {\n  extname,\n  isAbsolute,\n  join,\n  relative,\n  resolve,\n} from \"node:path\";\nimport {\n  validateDocument,\n} from \"./contracts.mjs\";\nimport {\n  assertPathInsideWorkspace,\n  isPathInside,\n} from \"../files/paths.mjs\";\nimport {\n  extractTable,\n  extractWorksheet,\n} from \"../office/excel.mjs\";\nimport {\n  readPresentation,\n} from \"../office/powerpoint.mjs\";\nimport {\n  loadDataset,\n} from \"../data/load.mjs\";\n\nconst SOURCE_EXTENSIONS = {\n  excel: new Set([\".xlsx\", \".xlsm\"]),\n  powerpoint: new Set([\".pptx\", \".pptm\"]),\n  csv: new Set([\".csv\"]),\n  json: new Set([\".json\", \".ndjson\", \".jsonl\"]),\n};\n\nexport async function discoverRecipeFiles(\n  workspaceRoot,\n  artifacts = [],\n) {\n  const roots = [\n    resolve(workspaceRoot, \"recipes\"),\n    ...artifacts.map((artifact) =>\n      resolve(artifact.directory, \"recipes\"),\n    ),\n  ];\n  const files = [];\n  const seen = new Set();\n\n  for (const root of roots) {\n    const metadata = await safeLstat(root);\n    if (!metadata?.isDirectory()) continue;\n\n    await walk(root);\n  }\n\n  return files.sort((left, right) =>\n    left.localeCompare(right, \"en\"),\n  );\n\n  async function walk(directory) {\n    const entries = await readdir(directory, {\n      withFileTypes: true,\n    });\n    entries.sort((left, right) =>\n      left.name.localeCompare(right.name, \"en\"),\n    );\n\n    for (const entry of entries) {\n      if (entry.name.startsWith(\".\")) continue;\n\n      const path = join(directory, entry.name);\n      const metadata = await lstat(path);\n\n      if (metadata.isSymbolicLink()) continue;\n\n      if (metadata.isDirectory()) {\n        await walk(path);\n        continue;\n      }\n\n      if (\n        metadata.isFile() &&\n        entry.name.toLowerCase().endsWith(\".json\")\n      ) {\n        const canonical = await realpath(path);\n        if (!seen.has(canonical)) {\n          seen.add(canonical);\n          files.push(canonical);\n        }\n      }\n    }\n  }\n}\n\nexport async function validateRecipeFile(\n  recipePath,\n  options,\n) {\n  const issues = [];\n  let recipe = null;\n\n  try {\n    recipe = JSON.parse(\n      await readFile(recipePath, \"utf8\"),\n    );\n  } catch (error) {\n    issues.push(\n      createIssue(\n        \"error\",\n        \"RECIPE_INVALID_JSON\",\n        `Recipe is not valid JSON: ${displayPath(\n          recipePath,\n          options.workspaceRoot,\n        )}: ${error.message}`,\n      ),\n    );\n\n    return result();\n  }\n\n  const contract = validateDocument(\"dataRecipe\", recipe);\n\n  for (const validationError of contract.errors) {\n    issues.push(\n      createIssue(\n        \"error\",\n        \"RECIPE_CONTRACT_INVALID\",\n        `${displayPath(\n          recipePath,\n          options.workspaceRoot,\n        )} ${validationError.path}: ${validationError.message}`,\n        {\n          validationPath: validationError.path,\n        },\n      ),\n    );\n  }\n\n  const source = await validateSource(\n    recipe,\n    options.workspaceRoot,\n    issues,\n  );\n  const output = await validateOutput(\n    recipe,\n    options.workspaceRoot,\n    source?.path,\n    issues,\n  );\n\n  validateSelectors(recipe, issues);\n\n  let execution = null;\n\n  if (\n    contract.ok &&\n    source?.valid &&\n    output?.valid &&\n    !issues.some((issue) => issue.severity === \"error\") &&\n    options.execute !== false\n  ) {\n    execution = await probeRecipe(\n      recipe,\n      source.path,\n      options,\n      issues,\n    );\n  }\n\n  return result();\n\n  function result() {\n    const errorCount = issues.filter(\n      (issue) => issue.severity === \"error\",\n    ).length;\n    const warningCount = issues.filter(\n      (issue) => issue.severity === \"warning\",\n    ).length;\n\n    return {\n      path: recipePath,\n      displayPath: displayPath(\n        recipePath,\n        options.workspaceRoot,\n      ),\n      id: recipe?.id ?? null,\n      recipe,\n      source,\n      output,\n      execution,\n      issues,\n      valid: errorCount === 0,\n      errorCount,\n      warningCount,\n    };\n  }\n}\n\nasync function validateSource(\n  recipe,\n  workspaceRoot,\n  issues,\n) {\n  const value = recipe?.source?.file;\n\n  if (typeof value !== \"string\" || !value) {\n    return {\n      path: null,\n      valid: false,\n    };\n  }\n\n  if (isAbsolute(value)) {\n    issues.push(\n      createIssue(\n        \"error\",\n        \"RECIPE_SOURCE_ABSOLUTE\",\n        `Recipe source must be workspace-relative: ${value}`,\n      ),\n    );\n    return {\n      path: null,\n      valid: false,\n    };\n  }\n\n  const candidate = resolve(workspaceRoot, value);\n  const canonicalWorkspace = await realpath(workspaceRoot);\n  let canonicalSource;\n\n  try {\n    canonicalSource = await realpath(candidate);\n  } catch (error) {\n    if (error?.code === \"ENOENT\") {\n      issues.push(\n        createIssue(\n          \"error\",\n          \"RECIPE_SOURCE_MISSING\",\n          `Recipe source does not exist: ${value}`,\n        ),\n      );\n      return {\n        path: candidate,\n        valid: false,\n      };\n    }\n\n    throw error;\n  }\n\n  if (!isPathInside(canonicalWorkspace, canonicalSource)) {\n    issues.push(\n      createIssue(\n        \"error\",\n        \"RECIPE_SOURCE_OUTSIDE_WORKSPACE\",\n        `Recipe source escapes the workspace: ${value}`,\n      ),\n    );\n    return {\n      path: canonicalSource,\n      valid: false,\n    };\n  }\n\n  const metadata = await stat(canonicalSource);\n\n  if (!metadata.isFile()) {\n    issues.push(\n      createIssue(\n        \"error\",\n        \"RECIPE_SOURCE_NOT_FILE\",\n        `Recipe source is not a file: ${value}`,\n      ),\n    );\n    return {\n      path: canonicalSource,\n      valid: false,\n    };\n  }\n\n  const sourceType = recipe?.source?.type;\n  const extension = extname(canonicalSource).toLowerCase();\n  const supported = SOURCE_EXTENSIONS[sourceType];\n\n  if (!supported || !supported.has(extension)) {\n    issues.push(\n      createIssue(\n        \"error\",\n        \"RECIPE_SOURCE_TYPE_MISMATCH\",\n        `Recipe source type ${sourceType ?? \"(missing)\"} does not match ${extension || \"(no extension)\"}.`,\n      ),\n    );\n  }\n\n  return {\n    path: canonicalSource,\n    displayPath: displayPath(\n      canonicalSource,\n      workspaceRoot,\n    ),\n    type: sourceType,\n    valid: !issues.some(\n      (issue) =>\n        issue.code.startsWith(\"RECIPE_SOURCE_\") &&\n        issue.severity === \"error\",\n    ),\n  };\n}\n\nasync function validateOutput(\n  recipe,\n  workspaceRoot,\n  sourcePath,\n  issues,\n) {\n  const value = recipe?.output?.file;\n\n  if (typeof value !== \"string\" || !value) {\n    return {\n      path: null,\n      valid: false,\n    };\n  }\n\n  if (isAbsolute(value)) {\n    issues.push(\n      createIssue(\n        \"error\",\n        \"RECIPE_OUTPUT_ABSOLUTE\",\n        `Recipe output must be workspace-relative: ${value}`,\n      ),\n    );\n    return {\n      path: null,\n      valid: false,\n    };\n  }\n\n  const outputPath = resolve(workspaceRoot, value);\n\n  try {\n    await assertPathInsideWorkspace(\n      outputPath,\n      workspaceRoot,\n      { mustExist: false },\n    );\n  } catch (error) {\n    issues.push(\n      createIssue(\n        \"error\",\n        \"RECIPE_OUTPUT_OUTSIDE_WORKSPACE\",\n        error.message,\n      ),\n    );\n    return {\n      path: outputPath,\n      valid: false,\n    };\n  }\n\n  if (\n    sourcePath &&\n    resolve(sourcePath) === resolve(outputPath)\n  ) {\n    issues.push(\n      createIssue(\n        \"error\",\n        \"RECIPE_OUTPUT_OVERWRITES_SOURCE\",\n        \"Recipe output cannot replace its source file.\",\n      ),\n    );\n  }\n\n  const format = recipe?.output?.format;\n  const extension = extname(outputPath)\n    .toLowerCase()\n    .replace(/^\\./, \"\");\n\n  if (\n    ![\"json\", \"csv\", \"ndjson\"].includes(format) ||\n    (extension && extension !== format)\n  ) {\n    issues.push(\n      createIssue(\n        \"error\",\n        \"RECIPE_OUTPUT_FORMAT_MISMATCH\",\n        `Recipe output format ${format ?? \"(missing)\"} does not match ${extension || \"(no extension)\"}.`,\n      ),\n    );\n  }\n\n  return {\n    path: outputPath,\n    displayPath: displayPath(outputPath, workspaceRoot),\n    format,\n    valid: !issues.some(\n      (issue) =>\n        issue.code.startsWith(\"RECIPE_OUTPUT_\") &&\n        issue.severity === \"error\",\n    ),\n  };\n}\n\nfunction validateSelectors(recipe, issues) {\n  if (recipe?.source?.type !== \"excel\") return;\n\n  const source = recipe.source;\n  const hasTable =\n    typeof source.table === \"string\" && source.table;\n  const hasRange =\n    typeof source.range === \"string\" && source.range;\n\n  if (hasTable && (hasRange || source.sheet)) {\n    issues.push(\n      createIssue(\n        \"error\",\n        \"RECIPE_EXCEL_SELECTOR_CONFLICT\",\n        \"An Excel recipe cannot combine a named table with sheet or range selectors.\",\n      ),\n    );\n  }\n}\n\nasync function probeRecipe(\n  recipe,\n  sourcePath,\n  options,\n  issues,\n) {\n  try {\n    if (recipe.source.type === \"excel\") {\n      const result = recipe.source.table\n        ? await extractTable(\n            sourcePath,\n            recipe.source.table,\n            {\n              workspaceRoot: options.workspaceRoot,\n              header: true,\n            },\n          )\n        : await extractWorksheet(sourcePath, {\n            workspaceRoot: options.workspaceRoot,\n            sheet: recipe.source.sheet,\n            range: recipe.source.range,\n            header: true,\n          });\n\n      return {\n        rowCount: result.records.length,\n        sourceType: \"excel\",\n      };\n    }\n\n    if (recipe.source.type === \"powerpoint\") {\n      const result = await readPresentation(sourcePath, {\n        workspaceRoot: options.workspaceRoot,\n      });\n\n      return {\n        rowCount: result.slides.length,\n        sourceType: \"powerpoint\",\n      };\n    }\n\n    const result = await loadDataset(sourcePath, {\n      workspaceRoot: options.workspaceRoot,\n    });\n\n    return {\n      rowCount: result.records.length,\n      sourceType: recipe.source.type,\n      warnings: result.warnings,\n    };\n  } catch (error) {\n    issues.push(\n      createIssue(\n        \"error\",\n        \"RECIPE_EXECUTION_INVALID\",\n        `Recipe source could not be read: ${error.message}`,\n        {\n          causeCode: error.code ?? null,\n        },\n      ),\n    );\n    return null;\n  }\n}\n\nfunction createIssue(\n  severity,\n  code,\n  message,\n  details = {},\n) {\n  return {\n    severity,\n    code,\n    message,\n    ...details,\n  };\n}\n\nfunction displayPath(path, workspaceRoot) {\n  const value = relative(workspaceRoot, path).replaceAll(\"\\\\\", \"/\");\n  return value.startsWith(\"..\") ? path : value || \".\";\n}\n\nasync function safeLstat(path) {\n  try {\n    return await lstat(path);\n  } catch (error) {\n    if (error?.code === \"ENOENT\") return null;\n    throw error;\n  }\n}\n"}, "src/validation/workspace-validation.mjs": {"content": "import {\n  loadWorkspaceConfig,\n} from \"../workspace/load-config.mjs\";\nimport {\n  scanWorkspaceLibrary,\n} from \"../library/scan.mjs\";\nimport {\n  findArtifact,\n} from \"../resolution/find-artifact.mjs\";\nimport {\n  resolveArtifactAppearance,\n} from \"../resolution/resolve.mjs\";\nimport {\n  buildStandaloneArtifact,\n} from \"../export/export-artifact.mjs\";\nimport {\n  discoverRecipeFiles,\n  validateRecipeFile,\n} from \"./recipe-validation.mjs\";\n\nexport async function validateWorkspace(options) {\n  const generatedAt = (\n    options.now ? options.now() : new Date()\n  ).toISOString();\n  const issues = [];\n  const stages = createStages();\n  const artefactReports = [];\n  const recipeReports = [];\n  let config = null;\n  let scan = null;\n\n  try {\n    config = await loadWorkspaceConfig(\n      options.workspaceRoot,\n    );\n    stages.workspace.status = \"passed\";\n  } catch (error) {\n    const issue = errorIssue(\n      \"workspace\",\n      \"WORKSPACE_CONFIGURATION_INVALID\",\n      error,\n    );\n    issues.push(issue);\n    stages.workspace.status = \"failed\";\n    finishStage(stages.workspace, [issue]);\n\n    return finish();\n  }\n\n  try {\n    scan = await scanWorkspaceLibrary(\n      options.workspaceRoot,\n    );\n    const libraryIssues = scan.issues.map((issue) => ({\n      stage: \"library\",\n      ...issue,\n    }));\n    issues.push(...libraryIssues);\n    stages.library.status = libraryIssues.some(\n      (issue) => issue.severity === \"error\",\n    )\n      ? \"failed\"\n      : \"passed\";\n    stages.library.entryCount = scan.summary.entryCount;\n    finishStage(stages.library, libraryIssues);\n  } catch (error) {\n    const issue = errorIssue(\n      \"library\",\n      \"LIBRARY_SCAN_FAILED\",\n      error,\n    );\n    issues.push(issue);\n    stages.library.status = \"failed\";\n    finishStage(stages.library, [issue]);\n\n    return finish();\n  }\n\n  let artifacts = scan.entries.filter(\n    (entry) => entry.category === \"artifact\",\n  );\n\n  if (options.artifactId) {\n    artifacts = [\n      findArtifact(\n        scan,\n        options.artifactId,\n        options.artifactKind,\n      ),\n    ];\n  }\n\n  for (const artifact of artifacts) {\n    const artifactReport = {\n      id: artifact.id,\n      kind: artifact.kind,\n      title: artifact.title,\n      displayPath: artifact.displayPath,\n      appearance: null,\n      export: {\n        status:\n          options.validateExports === false\n            ? \"skipped\"\n            : \"pending\",\n      },\n    };\n\n    let resolution;\n\n    try {\n      resolution = resolveArtifactAppearance(\n        scan,\n        artifact,\n      );\n      artifactReport.appearance = {\n        valid: resolution.summary.valid,\n        summary: resolution.summary,\n        selections: resolution.selections,\n        issues: resolution.issues,\n      };\n\n      const appearanceIssues = resolution.issues.map(\n        (issue) => ({\n          stage: \"appearance\",\n          artifactId: artifact.id,\n          artifactKind: artifact.kind,\n          ...issue,\n        }),\n      );\n      issues.push(...appearanceIssues);\n    } catch (error) {\n      const issue = errorIssue(\n        \"appearance\",\n        \"APPEARANCE_RESOLUTION_FAILED\",\n        error,\n        {\n          artifactId: artifact.id,\n          artifactKind: artifact.kind,\n        },\n      );\n      issues.push(issue);\n      artifactReport.appearance = {\n        valid: false,\n        summary: null,\n        selections: null,\n        issues: [issue],\n      };\n    }\n\n    if (options.validateExports !== false) {\n      if (!artifactReport.appearance?.valid) {\n        artifactReport.export = {\n          status: \"skipped\",\n          reason: \"appearance-invalid\",\n        };\n      } else {\n        try {\n          const built = await buildStandaloneArtifact({\n            workspaceRoot: options.workspaceRoot,\n            scan,\n            artifact,\n            resolution,\n            minify: options.minify ?? false,\n            maxBytes: options.maxBytes,\n          });\n\n          artifactReport.export = {\n            status: \"passed\",\n            sizeBytes: built.sizeBytes,\n            sha256: built.sha256,\n            resourceCounts: built.resources?.counts ?? null,\n            validation: built.validation,\n            warnings: built.warnings,\n          };\n\n          for (const warning of built.warnings ?? []) {\n            issues.push({\n              stage: \"exports\",\n              severity: \"warning\",\n              code:\n                warning.code ??\n                \"STANDALONE_EXPORT_WARNING\",\n              message:\n                warning.message ??\n                String(warning),\n              artifactId: artifact.id,\n              artifactKind: artifact.kind,\n            });\n          }\n        } catch (error) {\n          const issue = errorIssue(\n            \"exports\",\n            error.code ??\n              \"STANDALONE_EXPORT_BUILD_FAILED\",\n            error,\n            {\n              artifactId: artifact.id,\n              artifactKind: artifact.kind,\n              validation: error.validation ?? null,\n            },\n          );\n          issues.push(issue);\n          artifactReport.export = {\n            status: \"failed\",\n            issue,\n          };\n        }\n      }\n    }\n\n    artefactReports.push(artifactReport);\n  }\n\n  const appearanceIssues = issues.filter(\n    (issue) => issue.stage === \"appearance\",\n  );\n  stages.appearance.status = appearanceIssues.some(\n    (issue) => issue.severity === \"error\",\n  )\n    ? \"failed\"\n    : \"passed\";\n  stages.appearance.artifactCount =\n    artefactReports.length;\n  finishStage(stages.appearance, appearanceIssues);\n\n  if (options.validateExports === false) {\n    stages.exports.status = \"skipped\";\n  } else {\n    const exportIssues = issues.filter(\n      (issue) => issue.stage === \"exports\",\n    );\n    stages.exports.status = exportIssues.some(\n      (issue) => issue.severity === \"error\",\n    )\n      ? \"failed\"\n      : \"passed\";\n    stages.exports.validatedCount =\n      artefactReports.filter(\n        (artifact) =>\n          artifact.export.status === \"passed\",\n      ).length;\n    stages.exports.skippedCount =\n      artefactReports.filter(\n        (artifact) =>\n          artifact.export.status === \"skipped\",\n      ).length;\n    finishStage(stages.exports, exportIssues);\n  }\n\n  if (options.validateRecipes === false) {\n    stages.recipes.status = \"skipped\";\n  } else {\n    const recipePaths = await discoverRecipeFiles(\n      options.workspaceRoot,\n      scan.entries.filter(\n        (entry) => entry.category === \"artifact\",\n      ),\n    );\n\n    for (const recipePath of recipePaths) {\n      const recipe = await validateRecipeFile(\n        recipePath,\n        {\n          workspaceRoot: options.workspaceRoot,\n          execute: true,\n        },\n      );\n      recipeReports.push(recipe);\n\n      for (const issue of recipe.issues) {\n        issues.push({\n          stage: \"recipes\",\n          recipePath: recipe.displayPath,\n          recipeId: recipe.id,\n          ...issue,\n        });\n      }\n    }\n\n    const recipeIssues = issues.filter(\n      (issue) => issue.stage === \"recipes\",\n    );\n    stages.recipes.status = recipeIssues.some(\n      (issue) => issue.severity === \"error\",\n    )\n      ? \"failed\"\n      : \"passed\";\n    stages.recipes.recipeCount =\n      recipeReports.length;\n    finishStage(stages.recipes, recipeIssues);\n  }\n\n  return finish();\n\n  function finish() {\n    for (const stage of Object.values(stages)) {\n      if (stage.status === \"pending\") {\n        stage.status = \"skipped\";\n      }\n    }\n\n    const errorCount = issues.filter(\n      (issue) => issue.severity === \"error\",\n    ).length;\n    const warningCount = issues.filter(\n      (issue) => issue.severity === \"warning\",\n    ).length;\n    const valid =\n      errorCount === 0 &&\n      (!options.failOnWarning || warningCount === 0);\n\n    return {\n      schemaVersion: 1,\n      generatedAt,\n      workspace: {\n        id: config?.id ?? null,\n        name: config?.name ?? \"Unknown workspace\",\n        root: options.workspaceRoot,\n      },\n      options: {\n        artifactId: options.artifactId ?? null,\n        artifactKind: options.artifactKind ?? null,\n        validateExports:\n          options.validateExports !== false,\n        validateRecipes:\n          options.validateRecipes !== false,\n        minify: options.minify ?? false,\n        maxBytes: options.maxBytes,\n        failOnWarning:\n          options.failOnWarning ?? false,\n      },\n      stages,\n      artifacts: artefactReports,\n      recipes: recipeReports,\n      issues: sortIssues(issues),\n      summary: {\n        valid,\n        errorCount,\n        warningCount,\n        artifactCount: artefactReports.length,\n        recipeCount: recipeReports.length,\n        exportValidatedCount:\n          artefactReports.filter(\n            (artifact) =>\n              artifact.export.status === \"passed\",\n          ).length,\n        exportFailedCount:\n          artefactReports.filter(\n            (artifact) =>\n              artifact.export.status === \"failed\",\n          ).length,\n      },\n    };\n  }\n}\n\nfunction createStages() {\n  return {\n    workspace: stage(),\n    library: stage(),\n    appearance: stage(),\n    recipes: stage(),\n    exports: stage(),\n  };\n}\n\nfunction stage() {\n  return {\n    status: \"pending\",\n    errorCount: 0,\n    warningCount: 0,\n  };\n}\n\nfunction finishStage(stage, issues) {\n  stage.errorCount = issues.filter(\n    (issue) => issue.severity === \"error\",\n  ).length;\n  stage.warningCount = issues.filter(\n    (issue) => issue.severity === \"warning\",\n  ).length;\n}\n\nfunction errorIssue(\n  stage,\n  code,\n  error,\n  details = {},\n) {\n  return {\n    stage,\n    severity: \"error\",\n    code,\n    message:\n      error instanceof Error\n        ? error.message\n        : String(error),\n    ...details,\n  };\n}\n\nfunction sortIssues(issues) {\n  const severityOrder = {\n    error: 0,\n    warning: 1,\n  };\n  const stageOrder = {\n    workspace: 0,\n    library: 1,\n    appearance: 2,\n    recipes: 3,\n    exports: 4,\n  };\n\n  return [...issues].sort(\n    (left, right) =>\n      (severityOrder[left.severity] ?? 9) -\n        (severityOrder[right.severity] ?? 9) ||\n      (stageOrder[left.stage] ?? 9) -\n        (stageOrder[right.stage] ?? 9) ||\n      String(left.code).localeCompare(\n        String(right.code),\n        \"en\",\n      ) ||\n      String(left.message).localeCompare(\n        String(right.message),\n        \"en\",\n      ),\n  );\n}\n"}, "src/validation/impact-analysis.mjs": {"content": "import {\n  buildConsumerGraph,\n} from \"../library/consumers.mjs\";\nimport {\n  CliError,\n  EXIT_USAGE,\n} from \"../../cli/errors.mjs\";\n\nexport function findImpactTarget(\n  entries,\n  reference,\n  kind = null,\n) {\n  const qualifier = parseTargetReference(reference);\n  const matches = entries.filter((entry) => {\n    if (\n      entry.category === \"artifact\" ||\n      entry.id !== qualifier.id\n    ) {\n      return false;\n    }\n\n    if (\n      kind &&\n      entry.kind !== kind &&\n      entry.category !== kind\n    ) {\n      return false;\n    }\n\n    if (qualifier.scope === \"core\") {\n      return entry.level === \"core\";\n    }\n\n    if (qualifier.scope === \"collection\") {\n      return (\n        entry.level === \"collection\" &&\n        entry.collection === qualifier.collection\n      );\n    }\n\n    if (qualifier.scope === \"local\") {\n      return (\n        entry.level === \"local\" &&\n        entry.ownerArtifact === qualifier.ownerArtifact\n      );\n    }\n\n    return true;\n  });\n\n  if (matches.length === 0) {\n    throw new CliError(\n      \"IMPACT_TARGET_NOT_FOUND\",\n      `No reusable library resource found for ${kind ? `${kind}:` : \"\"}${reference}.`,\n      { exitCode: EXIT_USAGE },\n    );\n  }\n\n  if (matches.length > 1) {\n    throw new CliError(\n      \"AMBIGUOUS_IMPACT_TARGET\",\n      `Multiple reusable resources match ${reference}.`,\n      {\n        exitCode: EXIT_USAGE,\n        details: {\n          matches: matches.map((entry) => ({\n            kind: entry.kind,\n            level: entry.level,\n            collection: entry.collection,\n            ownerArtifact: entry.ownerArtifact,\n            displayPath: entry.displayPath,\n          })),\n        },\n        hint:\n          \"Qualify the target as core/id, collection/id, or local/artefact/id.\",\n      },\n    );\n  }\n\n  return matches[0];\n}\n\nfunction parseTargetReference(reference) {\n  const parts = String(reference).split(\"/\").filter(Boolean);\n\n  if (parts.length === 1) {\n    return {\n      scope: null,\n      id: parts[0],\n    };\n  }\n\n  if (parts.length === 2 && parts[0] === \"core\") {\n    return {\n      scope: \"core\",\n      id: parts[1],\n    };\n  }\n\n  if (\n    parts.length === 3 &&\n    parts[0] === \"local\"\n  ) {\n    return {\n      scope: \"local\",\n      ownerArtifact: parts[1],\n      id: parts[2],\n    };\n  }\n\n  if (parts.length === 2) {\n    return {\n      scope: \"collection\",\n      collection: parts[0],\n      id: parts[1],\n    };\n  }\n\n  throw new CliError(\n    \"INVALID_IMPACT_REFERENCE\",\n    `Invalid impact target reference: ${reference}.`,\n    {\n      exitCode: EXIT_USAGE,\n      hint:\n        \"Use id, core/id, collection/id, or local/artefact/id.\",\n    },\n  );\n}\n\nexport function analyseLibraryImpact(\n  scan,\n  target,\n  options = {},\n) {\n  const graph = buildConsumerGraph(scan);\n  const entryByPath = new Map(\n    scan.entries.map((entry) => [\n      entry.manifestPath,\n      entry,\n    ]),\n  );\n  const queue = [target.manifestPath];\n  const visitedTargets = new Set(queue);\n  const edgeKeys = new Set();\n  const edges = [];\n  const consumers = new Map();\n\n  while (queue.length > 0) {\n    const current = queue.shift();\n    const incoming = graph.incoming.get(current) ?? [];\n\n    for (const edge of incoming) {\n      const key = [\n        edge.source.manifestPath,\n        edge.target?.manifestPath,\n        edge.field,\n      ].join(\"|\");\n\n      if (!edgeKeys.has(key)) {\n        edgeKeys.add(key);\n        edges.push(edge);\n      }\n\n      const source = entryByPath.get(\n        edge.source.manifestPath,\n      );\n\n      if (!source) continue;\n\n      consumers.set(source.manifestPath, source);\n\n      if (!visitedTargets.has(source.manifestPath)) {\n        visitedTargets.add(source.manifestPath);\n        queue.push(source.manifestPath);\n      }\n    }\n  }\n\n  if (target.level === \"local\" && target.ownerArtifact) {\n    const owner = scan.entries.find(\n      (entry) =>\n        entry.category === \"artifact\" &&\n        entry.id === target.ownerArtifact,\n    );\n\n    if (owner) {\n      consumers.set(owner.manifestPath, owner);\n    }\n  }\n\n  const allConsumers = [...consumers.values()];\n  const affectedArtifacts = allConsumers\n    .filter((entry) => entry.category === \"artifact\")\n    .map(publicEntry)\n    .sort(compareEntries);\n  const affectedResources = allConsumers\n    .filter((entry) => entry.category !== \"artifact\")\n    .map(publicEntry)\n    .sort(compareEntries);\n  const directEdges =\n    graph.incoming.get(target.manifestPath) ?? [];\n  const changeType =\n    options.changeType ?? \"implementation\";\n  const scope = target.level ?? \"shared\";\n  const risk = assessRisk({\n    target,\n    changeType,\n    affectedArtifactCount:\n      affectedArtifacts.length,\n    transitiveConsumerCount:\n      allConsumers.length,\n  });\n  const recommendations =\n    buildRecommendations({\n      target,\n      changeType,\n      affectedArtifacts,\n      risk,\n    });\n\n  return {\n    target: publicEntry(target),\n    changeType,\n    directConsumers: directEdges.map(publicEdge),\n    transitiveConsumers: allConsumers\n      .map(publicEntry)\n      .sort(compareEntries),\n    affectedArtifacts,\n    affectedResources,\n    edges: edges.map(publicEdge).sort(compareEdges),\n    recommendations,\n    summary: {\n      scope,\n      risk,\n      directConsumerCount: directEdges.length,\n      transitiveConsumerCount:\n        allConsumers.length,\n      affectedArtifactCount:\n        affectedArtifacts.length,\n      affectedResourceCount:\n        affectedResources.length,\n    },\n  };\n}\n\nfunction assessRisk(options) {\n  if (options.transitiveConsumerCount === 0) {\n    return \"low\";\n  }\n\n  if (\n    options.changeType === \"contract\" ||\n    options.target.level === \"core\"\n  ) {\n    return \"high\";\n  }\n\n  if (\n    options.target.level === \"collection\" ||\n    options.affectedArtifactCount > 1\n  ) {\n    return \"medium\";\n  }\n\n  return \"low\";\n}\n\nfunction buildRecommendations(options) {\n  const commands = [];\n\n  if (options.target.level === \"core\") {\n    commands.push(\"mydash validate\");\n  } else if (\n    options.target.level === \"collection\"\n  ) {\n    for (const artifact of options.affectedArtifacts) {\n      commands.push(\n        `mydash validate --artifact ${artifact.id} --kind ${artifact.kind}`,\n      );\n    }\n\n    if (commands.length === 0) {\n      commands.push(\n        \"mydash library scan\",\n        \"mydash appearance validate\",\n      );\n    }\n  } else if (\n    options.target.level === \"local\" &&\n    options.target.ownerArtifact\n  ) {\n    const owner = options.affectedArtifacts.find(\n      (artifact) =>\n        artifact.id === options.target.ownerArtifact,\n    );\n    commands.push(\n      owner\n        ? `mydash validate --artifact ${owner.id} --kind ${owner.kind}`\n        : `mydash validate --artifact ${options.target.ownerArtifact}`,\n    );\n  }\n\n  if (\n    options.changeType === \"contract\" &&\n    !commands.includes(\"mydash validate\")\n  ) {\n    commands.push(\"mydash validate\");\n  }\n\n  return [...new Set(commands)];\n}\n\nfunction publicEntry(entry) {\n  return {\n    id: entry.id,\n    kind: entry.kind,\n    category: entry.category,\n    title: entry.title,\n    level: entry.level,\n    collection: entry.collection,\n    ownerArtifact: entry.ownerArtifact,\n    displayPath: entry.displayPath,\n    manifestPath: entry.manifestPath,\n  };\n}\n\nfunction publicEdge(edge) {\n  return {\n    source: edge.source,\n    target: edge.target,\n    field: edge.field,\n    reference: edge.reference,\n    resolved: edge.resolved,\n  };\n}\n\nfunction compareEntries(left, right) {\n  return (\n    left.kind.localeCompare(right.kind, \"en\") ||\n    left.id.localeCompare(right.id, \"en\") ||\n    left.displayPath.localeCompare(\n      right.displayPath,\n      \"en\",\n    )\n  );\n}\n\nfunction compareEdges(left, right) {\n  return (\n    left.source.kind.localeCompare(\n      right.source.kind,\n      \"en\",\n    ) ||\n    left.source.id.localeCompare(\n      right.source.id,\n      \"en\",\n    ) ||\n    left.field.localeCompare(right.field, \"en\")\n  );\n}\n"}, "src/validation/README.md": {"content": "# Consolidated validation and impact analysis\n\n`mydash validate` is the repository-wide quality gate. It checks the current\nworkspace without writing exports or recipe outputs.\n\n## Validation stages\n\n1. Workspace configuration\n2. Manifest contracts and filesystem library discovery\n3. Appearance and recursive dependency resolution\n4. Data-recipe discovery, contract validation and read-only execution\n5. In-memory standalone HTML export and final standalone validation\n\nThe flattened issue list retains the stage, artefact or recipe that produced\neach problem. Validation uses exit code `3`.\n\n## Reports\n\nA JSON report can be written with:\n\n```text\nmydash validate --report .my-dashboards/reports/validation.json\n```\n\nReports contain no generated HTML. They include export hashes, sizes,\nresource counts and stage summaries.\n\n## Impact analysis\n\n`mydash impact <id> --kind <kind>` walks the reverse-consumer graph\ntransitively. It reports:\n\n- direct consumers;\n- shared resources that depend on the target;\n- affected artefacts;\n- lifecycle scope;\n- a risk classification;\n- the validation commands that should run before committing.\n\nCore and contract changes are deliberately classified as high risk whenever\nthey have consumers.\n\n## Qualified impact targets\n\nWhen identifiers overlap, use an explicit scope:\n\n```text\ncore/metric-card\nexecutive-reporting/status-card\nlocal/use-case-pipeline/metric-card\n```\n"}, "tests/fixtures/export-workspace/recipes/use-cases.recipe.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"id\": \"use-case-data\",\n  \"source\": {\n    \"type\": \"json\",\n    \"file\": \"library/dashboards/use-case-pipeline/data/use-cases.json\"\n  },\n  \"output\": {\n    \"file\": \"exports/use-cases-refreshed.json\",\n    \"format\": \"json\",\n    \"overwrite\": false\n  }\n}\n"}, "tests/unit/validation.test.mjs": {"content": "import assert from \"node:assert/strict\";\nimport {\n  cp,\n  readFile,\n  rm,\n  writeFile,\n} from \"node:fs/promises\";\nimport { dirname, resolve } from \"node:path\";\nimport { fileURLToPath } from \"node:url\";\nimport test from \"node:test\";\nimport {\n  scanWorkspaceLibrary,\n} from \"../../src/library/scan.mjs\";\nimport {\n  validateWorkspace,\n} from \"../../src/validation/workspace-validation.mjs\";\nimport {\n  findImpactTarget,\n  analyseLibraryImpact,\n} from \"../../src/validation/impact-analysis.mjs\";\n\nconst testDirectory = dirname(fileURLToPath(import.meta.url));\nconst fixtureRoot = resolve(\n  testDirectory,\n  \"../fixtures/export-workspace\",\n);\n\ntest(\"consolidated validation checks library, recipes and exports\", async () => {\n  const report = await validateWorkspace({\n    workspaceRoot: fixtureRoot,\n    validateExports: true,\n    validateRecipes: true,\n    maxBytes: 10 * 1024 * 1024,\n    now: () => new Date(\"2026-07-26T12:00:00.000Z\"),\n  });\n\n  assert.equal(report.summary.valid, true);\n  assert.equal(report.summary.artifactCount, 1);\n  assert.equal(report.summary.recipeCount, 1);\n  assert.equal(report.summary.exportValidatedCount, 1);\n  assert.equal(report.stages.exports.status, \"passed\");\n  assert.match(\n    report.artifacts[0].export.sha256,\n    /^[a-f0-9]{64}$/,\n  );\n  assert.equal(report.recipes[0].execution.rowCount, 2);\n});\n\ntest(\"invalid recipe sources are attributed to the recipes stage\", async () => {\n  const root = resolve(\n    fixtureRoot,\n    \".tmp-validation-test\",\n  );\n  await rm(root, { recursive: true, force: true });\n  await cp(fixtureRoot, root, {\n    recursive: true,\n    filter(path) {\n      return !path.includes(\".tmp-validation-test\");\n    },\n  });\n\n  try {\n    const recipePath = resolve(\n      root,\n      \"recipes/use-cases.recipe.json\",\n    );\n    const recipe = JSON.parse(\n      await readFile(recipePath, \"utf8\"),\n    );\n    recipe.source.file = \"missing.json\";\n    await writeFile(\n      recipePath,\n      `${JSON.stringify(recipe, null, 2)}\\n`,\n    );\n\n    const report = await validateWorkspace({\n      workspaceRoot: root,\n      validateExports: false,\n      validateRecipes: true,\n      maxBytes: 10 * 1024 * 1024,\n    });\n\n    assert.equal(report.summary.valid, false);\n    assert.equal(\n      report.issues.some(\n        (issue) =>\n          issue.stage === \"recipes\" &&\n          issue.code === \"RECIPE_SOURCE_MISSING\",\n      ),\n      true,\n    );\n  } finally {\n    await rm(root, { recursive: true, force: true });\n  }\n});\n\n\ntest(\"impact targets can distinguish Core from local resources\", async () => {\n  const scan = await scanWorkspaceLibrary(fixtureRoot);\n  const core = findImpactTarget(\n    scan.entries,\n    \"core/metric-card\",\n    \"component\",\n  );\n  const local = findImpactTarget(\n    scan.entries,\n    \"local/use-case-pipeline/metric-card\",\n    \"component\",\n  );\n\n  assert.equal(core.level, \"core\");\n  assert.equal(local.level, \"local\");\n  assert.equal(local.ownerArtifact, \"use-case-pipeline\");\n});\n\ntest(\"Core impact analysis walks through resources to artefacts\", async () => {\n  const scan = await scanWorkspaceLibrary(fixtureRoot);\n  const target = findImpactTarget(\n    scan.entries,\n    \"button\",\n    \"primitive\",\n  );\n  const impact = analyseLibraryImpact(scan, target, {\n    changeType: \"implementation\",\n  });\n\n  assert.equal(impact.summary.scope, \"core\");\n  assert.equal(impact.summary.risk, \"high\");\n  assert.deepEqual(\n    impact.affectedArtifacts.map((entry) => entry.id),\n    [\"use-case-pipeline\"],\n  );\n  assert.equal(\n    impact.recommendations.includes(\"mydash validate\"),\n    true,\n  );\n});\n\ntest(\"Local impact analysis stays scoped to its owner artefact\", async () => {\n  const scan = await scanWorkspaceLibrary(fixtureRoot);\n  const target = scan.entries.find(\n    (entry) =>\n      entry.kind === \"component\" &&\n      entry.id === \"metric-card\" &&\n      entry.level === \"local\",\n  );\n  const impact = analyseLibraryImpact(scan, target, {\n    changeType: \"implementation\",\n  });\n\n  assert.equal(impact.summary.scope, \"local\");\n  assert.equal(impact.summary.risk, \"low\");\n  assert.deepEqual(\n    impact.affectedArtifacts.map((entry) => entry.id),\n    [\"use-case-pipeline\"],\n  );\n});\n"}, "tests/integration/validation-cli.test.mjs": {"content": "import assert from \"node:assert/strict\";\nimport {\n  readFile,\n  rm,\n} from \"node:fs/promises\";\nimport { dirname, resolve } from \"node:path\";\nimport { fileURLToPath } from \"node:url\";\nimport { spawnSync } from \"node:child_process\";\nimport test from \"node:test\";\n\nconst testDirectory = dirname(fileURLToPath(import.meta.url));\nconst projectRoot = resolve(testDirectory, \"../..\");\nconst workspace = resolve(\n  projectRoot,\n  \"tests\",\n  \"fixtures\",\n  \"export-workspace\",\n);\nconst cliPath = resolve(projectRoot, \"bin\", \"mydash.mjs\");\nconst reportPath = resolve(\n  workspace,\n  \".my-dashboards\",\n  \"validation-report.json\",\n);\n\nfunction runCli(args) {\n  return spawnSync(process.execPath, [cliPath, ...args], {\n    cwd: projectRoot,\n    encoding: \"utf8\",\n    stdio: \"pipe\",\n    shell: false,\n  });\n}\n\ntest(\"validate command returns the consolidated report\", () => {\n  const result = runCli([\n    \"validate\",\n    \"--workspace\",\n    workspace,\n    \"--json\",\n  ]);\n\n  assert.equal(result.status, 0, result.stderr);\n  const body = JSON.parse(result.stdout);\n  assert.equal(body.command, \"validate\");\n  assert.equal(body.data.summary.valid, true);\n  assert.equal(body.data.summary.exportValidatedCount, 1);\n});\n\ntest(\"validate command can write a JSON report\", async () => {\n  await rm(reportPath, { force: true });\n\n  try {\n    const result = runCli([\n      \"validate\",\n      \"--workspace\",\n      workspace,\n      \"--skip-exports\",\n      \"--report\",\n      \".my-dashboards/validation-report.json\",\n      \"--json\",\n    ]);\n\n    assert.equal(result.status, 0, result.stderr);\n    const report = JSON.parse(\n      await readFile(reportPath, \"utf8\"),\n    );\n    assert.equal(report.schemaVersion, 1);\n    assert.equal(report.stages.exports.status, \"skipped\");\n  } finally {\n    await rm(reportPath, { force: true });\n  }\n});\n\ntest(\"impact command returns affected artefacts and risk\", () => {\n  const result = runCli([\n    \"impact\",\n    \"button\",\n    \"--kind\",\n    \"primitive\",\n    \"--workspace\",\n    workspace,\n    \"--json\",\n  ]);\n\n  assert.equal(result.status, 0, result.stderr);\n  const body = JSON.parse(result.stdout);\n  assert.equal(body.command, \"impact\");\n  assert.equal(body.data.summary.risk, \"high\");\n  assert.deepEqual(\n    body.data.affectedArtifacts.map((entry) => entry.id),\n    [\"use-case-pipeline\"],\n  );\n});\n\ntest(\"impact can fail a guard when the target is consumed\", () => {\n  const result = runCli([\n    \"impact\",\n    \"button\",\n    \"--kind\",\n    \"primitive\",\n    \"--fail-if-consumed\",\n    \"--workspace\",\n    workspace,\n    \"--json\",\n  ]);\n\n  assert.equal(result.status, 3);\n  const body = JSON.parse(result.stdout);\n  assert.equal(body.ok, false);\n  assert.equal(\n    body.data.summary.transitiveConsumerCount > 0,\n    true,\n  );\n});\n"}, "scripts/tasks/test-validation.mjs": {"content": "#!/usr/bin/env node\n\nimport { spawnSync } from \"node:child_process\";\nimport { dirname, resolve } from \"node:path\";\nimport { fileURLToPath } from \"node:url\";\nimport process from \"node:process\";\n\nconst scriptDirectory = dirname(fileURLToPath(import.meta.url));\nconst projectRoot = resolve(scriptDirectory, \"../..\");\n\nconst tests = [\n  resolve(projectRoot, \"tests\", \"unit\", \"validation.test.mjs\"),\n  resolve(projectRoot, \"tests\", \"integration\", \"validation-cli.test.mjs\"),\n];\n\nconst result = spawnSync(\n  process.execPath,\n  [\"--test\", ...tests],\n  {\n    cwd: projectRoot,\n    stdio: \"inherit\",\n    shell: false,\n  },\n);\n\nif (result.error) throw result.error;\nprocess.exitCode = result.status ?? 1;\n"}};

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
      "Bootstrap 11 must run from the root of the My Dashboards Git repository.",
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

  await validateGeneratedState();

  const expectedSelfPath = join(
    targetRoot,
    "scripts",
    "11-build-consolidated-validation.mjs",
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
        "Consolidated validation was created and tested, but --no-commit disabled the Git checkpoint.",
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
My Dashboards — Bootstrap 11

Usage:
  node scripts/11-build-consolidated-validation.mjs [options]

Options:
  --target <path>  Build validation in a specific repository root.
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
    "src/validation/contracts.mjs",
    "src/library/scan.mjs",
    "src/library/consumers.mjs",
    "src/resolution/find-artifact.mjs",
    "src/resolution/resolve.mjs",
    "src/export/export-artifact.mjs",
    "src/data/load.mjs",
    "src/office/excel.mjs",
    "src/office/powerpoint.mjs",
    "scripts/tasks/test-export.mjs",
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
        "Bootstrap 10 has not been completed.",
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
        "package.json had pre-existing changes, so the validation test command was not added automatically.",
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
  value.scripts["test:validation"] =
    value.scripts["test:validation"] ??
    "node scripts/tasks/test-validation.mjs";

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

async function validateGeneratedState() {
  if (args.dryRun) {
    report.validation.push({
      check: "dry-run",
      ok: true,
      message:
        "The consolidated validation layer was calculated without writing it.",
    });
    return;
  }

  const modulePaths = [
    "cli/registry.mjs",
    "cli/commands/validate.mjs",
    "cli/commands/impact.mjs",
    "src/validation/recipe-validation.mjs",
    "src/validation/workspace-validation.mjs",
    "src/validation/impact-analysis.mjs",
    "tests/unit/validation.test.mjs",
    "tests/integration/validation-cli.test.mjs",
    "scripts/tasks/test-validation.mjs",
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
      `${modulePaths.length} validation and CLI modules passed Node syntax checks.`,
  });

  const tests = run(
    process.execPath,
    [join(targetRoot, "scripts", "tasks", "test-validation.mjs")],
    { cwd: targetRoot, allowFailure: true },
  );

  if (tests.status !== 0) {
    throw new Error(
      `Consolidated validation tests failed:\n${
        tests.stderr || tests.stdout
      }`,
    );
  }

  report.validation.push({
    check: "validation-tests",
    ok: true,
    message:
      "Workspace validation, recipes, exports, impact analysis and CLI tests passed.",
  });

  const realValidation = run(
    process.execPath,
    [
      join(targetRoot, "bin", "mydash.mjs"),
      "validate",
      "--json",
    ],
    { cwd: targetRoot, allowFailure: true },
  );

  if (realValidation.status !== 0) {
    throw new Error(
      `The real workspace validation failed:\n${
        realValidation.stderr || realValidation.stdout
      }`,
    );
  }

  report.validation.push({
    check: "workspace-validation",
    ok: true,
    message:
      "The current repository passes the consolidated validation command.",
  });

  for (const task of [
    "scripts/tasks/test-export.mjs",
    "scripts/tasks/test-resolution.mjs",
    "scripts/tasks/test-library.mjs",
    "scripts/tasks/test-data.mjs",
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
      "Export, resolution, library, data, Office, filesystem, CLI and contract tests still pass.",
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
        "Consolidated validation was already present; there were no task-owned changes to commit.",
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
        "Validation was created and tested, but no commit was made because Git user.name or user.email is missing.",
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

  console.log("\nMy Dashboards — consolidated validation\n");
  console.log(`Target: ${report.targetRoot}`);
  console.log(`Result: ${report.ok ? "PASS" : "FAIL"}`);
  console.log(`Mode: ${report.dryRun ? "dry-run" : "write"}`);

  printSection("Created", report.created);
  printSection("Updated", report.updated);
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
