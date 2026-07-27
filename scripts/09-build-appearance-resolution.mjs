#!/usr/bin/env node

/**
 * My Dashboards — Bootstrap 09: Build appearance resolution
 *
 * Adds:
 *
 *   mydash appearance resolve <artifact-id>
 *   mydash appearance validate
 *
 * Resolution combines workspace defaults, artefact choices, preset mappings,
 * theme assets, artefact overrides and recursive UI dependencies. It also
 * discovers artefact-local UI, themes and assets.
 *
 * Usage:
 *   node scripts/09-build-appearance-resolution.mjs
 *   node scripts/09-build-appearance-resolution.mjs --dry-run
 *   node scripts/09-build-appearance-resolution.mjs --no-commit
 *   node scripts/09-build-appearance-resolution.mjs --no-push
 *   node scripts/09-build-appearance-resolution.mjs --json
 *   node scripts/09-build-appearance-resolution.mjs --target /path/to/my-dashboards
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

const SCRIPT_NAME = "09-build-appearance-resolution";
const COMMIT_MESSAGE = "Add appearance and dependency resolution";
const MIN_NODE_MAJOR = 20;
const FILES = {"cli/registry.mjs": {"content": "import { helpCommand } from \"./commands/help.mjs\";\nimport { versionCommand } from \"./commands/version.mjs\";\nimport { doctorCommand } from \"./commands/doctor.mjs\";\nimport { inspectCommand } from \"./commands/inspect.mjs\";\nimport { fileCommand } from \"./commands/file.mjs\";\nimport { excelCommand } from \"./commands/excel.mjs\";\nimport { powerpointCommand } from \"./commands/powerpoint.mjs\";\nimport { dataCommand } from \"./commands/data.mjs\";\nimport { libraryCommand } from \"./commands/library.mjs\";\nimport { appearanceCommand } from \"./commands/appearance.mjs\";\n\nconst commands = [\n  helpCommand,\n  versionCommand,\n  doctorCommand,\n  inspectCommand,\n  fileCommand,\n  excelCommand,\n  powerpointCommand,\n  dataCommand,\n  libraryCommand,\n  appearanceCommand,\n];\n\nconst commandMap = new Map(\n  commands.map((command) => [command.name, command]),\n);\n\nexport const commandRegistry = {\n  get(name) {\n    return commandMap.get(name) ?? null;\n  },\n\n  list() {\n    return [...commands];\n  },\n\n  names() {\n    return commands.map((command) => command.name);\n  },\n};\n", "allowedPrevious": ["import { helpCommand } from \"./commands/help.mjs\";\nimport { versionCommand } from \"./commands/version.mjs\";\nimport { doctorCommand } from \"./commands/doctor.mjs\";\nimport { inspectCommand } from \"./commands/inspect.mjs\";\nimport { fileCommand } from \"./commands/file.mjs\";\nimport { excelCommand } from \"./commands/excel.mjs\";\nimport { powerpointCommand } from \"./commands/powerpoint.mjs\";\nimport { dataCommand } from \"./commands/data.mjs\";\nimport { libraryCommand } from \"./commands/library.mjs\";\n\nconst commands = [\n  helpCommand,\n  versionCommand,\n  doctorCommand,\n  inspectCommand,\n  fileCommand,\n  excelCommand,\n  powerpointCommand,\n  dataCommand,\n  libraryCommand,\n];\n\nconst commandMap = new Map(\n  commands.map((command) => [command.name, command]),\n);\n\nexport const commandRegistry = {\n  get(name) {\n    return commandMap.get(name) ?? null;\n  },\n\n  list() {\n    return [...commands];\n  },\n\n  names() {\n    return commands.map((command) => command.name);\n  },\n};\n"]}, "cli/commands/appearance.mjs": {"content": "import {\n  parseCommandArguments,\n  requirePositionals,\n} from \"../command-options.mjs\";\nimport { CliError, EXIT_USAGE, EXIT_VALIDATION } from \"../errors.mjs\";\nimport { findWorkspaceRoot } from \"../../src/workspace/find-root.mjs\";\nimport { scanWorkspaceLibrary } from \"../../src/library/scan.mjs\";\nimport { findArtifact } from \"../../src/resolution/find-artifact.mjs\";\nimport {\n  resolveAllArtifactAppearances,\n  resolveArtifactAppearance,\n} from \"../../src/resolution/resolve.mjs\";\n\nconst SUBCOMMANDS = new Set([\n  \"resolve\",\n  \"validate\",\n]);\n\nexport const appearanceCommand = {\n  name: \"appearance\",\n  summary: \"Resolve effective themes, presets, UI and assets.\",\n  usage: \"mydash appearance <subcommand> [artifact-id] [options]\",\n  options: [\n    \"resolve <artifact-id>          Resolve one artefact's effective appearance.\",\n    \"validate                       Resolve and validate every artefact.\",\n    \"--kind <kind>                  Disambiguate dashboard, presentation or concept.\",\n    \"--workspace <path>             Resolve a specific workspace.\",\n    \"--json                         Return structured JSON.\",\n  ],\n\n  async run(invocation, context) {\n    const [subcommand, ...rest] = invocation.args;\n\n    if (!SUBCOMMANDS.has(subcommand)) {\n      throw new CliError(\n        \"UNKNOWN_APPEARANCE_SUBCOMMAND\",\n        subcommand\n          ? `Unknown appearance subcommand: ${subcommand}`\n          : \"An appearance subcommand is required.\",\n        {\n          exitCode: EXIT_USAGE,\n          details: {\n            availableSubcommands: [...SUBCOMMANDS],\n          },\n          hint:\n            \"Run mydash help appearance to see available appearance operations.\",\n        },\n      );\n    }\n\n    const workspaceRoot = await findWorkspaceRoot(\n      invocation.options.workspace ?? context.cwd,\n    );\n\n    if (!workspaceRoot) {\n      throw new CliError(\n        \"WORKSPACE_NOT_FOUND\",\n        \"No My Dashboards workspace was found.\",\n        { exitCode: EXIT_USAGE },\n      );\n    }\n\n    if (subcommand === \"resolve\") {\n      return runResolve(rest, workspaceRoot);\n    }\n\n    return runValidate(rest, workspaceRoot);\n  },\n};\n\nasync function runResolve(args, workspaceRoot) {\n  const parsed = parseCommandArguments(args, {\n    values: [\"kind\"],\n  });\n  requirePositionals(\n    parsed.positionals,\n    1,\n    \"mydash appearance resolve <artifact-id>\",\n  );\n\n  const scan = await scanWorkspaceLibrary(workspaceRoot);\n  const artifact = findArtifact(\n    scan,\n    parsed.positionals[0],\n    parsed.options.kind,\n  );\n  const data = resolveArtifactAppearance(scan, artifact);\n\n  return {\n    ok: data.summary.valid,\n    command: \"appearance resolve\",\n    data,\n    warnings: data.issues\n      .filter((issue) => issue.severity === \"warning\")\n      .map((issue) => ({\n        code: issue.code,\n        message: issue.message,\n      })),\n    exitCode: data.summary.valid ? 0 : EXIT_VALIDATION,\n    text: renderResolution(data),\n  };\n}\n\nasync function runValidate(args, workspaceRoot) {\n  const parsed = parseCommandArguments(args);\n  if (parsed.positionals.length > 0) {\n    throw new CliError(\n      \"INVALID_USAGE\",\n      `Unexpected argument: ${parsed.positionals[0]}. Usage: mydash appearance validate`,\n      { exitCode: EXIT_USAGE },\n    );\n  }\n\n  const scan = await scanWorkspaceLibrary(workspaceRoot);\n  const data = resolveAllArtifactAppearances(scan);\n  const valid = data.summary.invalidArtifactCount === 0;\n\n  return {\n    ok: valid,\n    command: \"appearance validate\",\n    data,\n    exitCode: valid ? 0 : EXIT_VALIDATION,\n    text: [\n      `Artefacts: ${data.summary.artifactCount}`,\n      `Valid: ${data.summary.validArtifactCount}`,\n      `Invalid: ${data.summary.invalidArtifactCount}`,\n      `Errors: ${data.summary.errorCount}`,\n      `Warnings: ${data.summary.warningCount}`,\n    ].join(\"\\n\"),\n  };\n}\n\nfunction renderResolution(data) {\n  const lines = [\n    `${data.artifact.kind}:${data.artifact.id}`,\n    `Valid: ${data.summary.valid ? \"yes\" : \"no\"}`,\n    `Theme: ${selectionName(data.selections.theme)}`,\n    `Preset: ${selectionName(data.selections.preset)}`,\n    `Layout: ${selectionName(data.selections.layout)}`,\n    `Components: ${Object.keys(data.selections.components).length}`,\n    `Primitives: ${Object.keys(data.selections.primitives).length}`,\n    `Assets: ${Object.keys(data.selections.assets).length}`,\n    `Dependency closure: ${data.summary.dependencyCount}`,\n  ];\n\n  if (data.issues.length > 0) {\n    lines.push(\"\");\n    lines.push(\"Issues:\");\n\n    for (const issue of data.issues) {\n      lines.push(\n        `  ${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`,\n      );\n    }\n  }\n\n  return lines.join(\"\\n\");\n}\n\nfunction selectionName(selection) {\n  if (!selection) return \"(none)\";\n  if (!selection.resolved) return `${selection.reference} (unresolved)`;\n\n  const entry = selection.entry;\n  const scope =\n    entry.level === \"collection\"\n      ? `collection:${entry.collection}`\n      : entry.level === \"local\"\n        ? `local:${entry.ownerArtifact}`\n        : entry.level ?? \"shared\";\n\n  return `${entry.id} [${scope}] via ${selection.source}`;\n}\n"}, "src/library/scan.mjs": {"content": "import {\n  lstat,\n  readFile,\n  readdir,\n  realpath,\n} from \"node:fs/promises\";\nimport {\n  basename,\n  dirname,\n  isAbsolute,\n  join,\n  relative,\n  resolve,\n} from \"node:path\";\nimport { validateDocument } from \"../validation/contracts.mjs\";\nimport { loadWorkspaceConfig } from \"../workspace/load-config.mjs\";\nimport {\n  MANIFEST_SPECS,\n  expectedPlacement,\n} from \"./conventions.mjs\";\nimport {\n  collectReferences,\n  resolveReferences,\n} from \"./references.mjs\";\nimport { scanArtifactLocalResources } from \"./local-resources.mjs\";\n\nconst MAX_MANIFEST_BYTES = 1024 * 1024;\nconst IGNORED_DIRECTORIES = new Set([\n  \".git\",\n  \"node_modules\",\n  \".my-dashboards\",\n]);\n\nexport async function scanWorkspaceLibrary(workspaceRoot) {\n  const canonicalWorkspaceRoot = await realpath(resolve(workspaceRoot));\n  const config = await loadWorkspaceConfig(canonicalWorkspaceRoot);\n  const entries = [];\n  const issues = [];\n\n  for (const spec of MANIFEST_SPECS) {\n    const configuredRoot = config.libraryRoots[spec.rootKey];\n\n    if (!configuredRoot) {\n      issues.push(\n        issue(\n          \"error\",\n          \"LIBRARY_ROOT_NOT_CONFIGURED\",\n          `Workspace library root ${spec.rootKey} is not configured.`,\n          { rootKey: spec.rootKey },\n        ),\n      );\n      continue;\n    }\n\n    const rootPath = resolve(canonicalWorkspaceRoot, configuredRoot);\n\n    if (!isInside(canonicalWorkspaceRoot, rootPath)) {\n      issues.push(\n        issue(\n          \"error\",\n          \"LIBRARY_ROOT_OUTSIDE_WORKSPACE\",\n          `Configured library root escapes the workspace: ${configuredRoot}`,\n          {\n            rootKey: spec.rootKey,\n            rootPath,\n          },\n        ),\n      );\n      continue;\n    }\n\n    const rootMetadata = await safeLstat(rootPath);\n\n    if (!rootMetadata?.isDirectory()) {\n      issues.push(\n        issue(\n          \"error\",\n          \"LIBRARY_ROOT_MISSING\",\n          `Configured library root does not exist: ${configuredRoot}`,\n          {\n            rootKey: spec.rootKey,\n            rootPath,\n          },\n        ),\n      );\n      continue;\n    }\n\n    await scanRoot({\n      workspaceRoot: canonicalWorkspaceRoot,\n      rootPath,\n      configuredRoot,\n      spec,\n      entries,\n      issues,\n    });\n  }\n\n  await scanArtifactLocalResources({\n    workspaceRoot: canonicalWorkspaceRoot,\n    artifacts: entries.filter((entry) => entry.category === \"artifact\"),\n    entries,\n    issues,\n  });\n\n  diagnoseDuplicates(entries, issues);\n  diagnosePlacement(entries, issues);\n\n  const references = entries.flatMap((entry) =>\n    collectReferences(entry).map((reference) => ({\n      ...reference,\n      sourceManifestPath: entry.manifestPath,\n    })),\n  );\n\n  resolveReferences(entries, references, issues);\n\n  return {\n    workspaceRoot: canonicalWorkspaceRoot,\n    config,\n    entries: entries.sort(compareEntries),\n    references,\n    issues: issues.sort(compareIssues),\n    summary: summarise(entries, issues),\n  };\n}\n\nexport function findLibraryEntries(entries, filters = {}) {\n  return entries.filter((entry) => {\n    if (\n      filters.kind &&\n      entry.kind !== filters.kind &&\n      entry.category !== filters.kind\n    ) {\n      return false;\n    }\n\n    if (filters.level && entry.level !== filters.level) {\n      return false;\n    }\n\n    if (\n      filters.collection &&\n      entry.collection !== filters.collection\n    ) {\n      return false;\n    }\n\n    return true;\n  });\n}\n\nasync function scanRoot(context) {\n  const manifestPaths = [];\n  await walk(context.rootPath, \"\");\n\n  for (const manifestPath of manifestPaths) {\n    const entry = await readManifestEntry({\n      ...context,\n      manifestPath,\n    });\n\n    if (entry) {\n      context.entries.push(entry);\n    }\n  }\n\n  async function walk(directory, relativeDirectory) {\n    const directoryEntries = await readdir(directory, {\n      withFileTypes: true,\n    });\n\n    directoryEntries.sort((left, right) =>\n      left.name.localeCompare(right.name, \"en\"),\n    );\n\n    for (const directoryEntry of directoryEntries) {\n      if (directoryEntry.name.startsWith(\".\")) continue;\n      if (IGNORED_DIRECTORIES.has(directoryEntry.name)) continue;\n\n      const absolutePath = join(directory, directoryEntry.name);\n      const childRelative = relativeDirectory\n        ? `${relativeDirectory}/${directoryEntry.name}`\n        : directoryEntry.name;\n      const metadata = await lstat(absolutePath);\n\n      if (metadata.isSymbolicLink()) {\n        context.issues.push(\n          issue(\n            \"warning\",\n            \"SYMLINK_SKIPPED\",\n            `Library scanning skipped symbolic link: ${displayPath(\n              absolutePath,\n              context.workspaceRoot,\n            )}`,\n            {\n              rootKey: context.spec.rootKey,\n              path: absolutePath,\n            },\n          ),\n        );\n        continue;\n      }\n\n      if (metadata.isDirectory()) {\n        await walk(absolutePath, childRelative);\n        continue;\n      }\n\n      if (\n        metadata.isFile() &&\n        directoryEntry.name === context.spec.manifestFile\n      ) {\n        manifestPaths.push(absolutePath);\n      }\n    }\n  }\n}\n\nasync function readManifestEntry(context) {\n  const metadata = await lstat(context.manifestPath);\n\n  if (metadata.size > MAX_MANIFEST_BYTES) {\n    context.issues.push(\n      issue(\n        \"error\",\n        \"MANIFEST_TOO_LARGE\",\n        `Manifest exceeds ${MAX_MANIFEST_BYTES} bytes: ${displayPath(\n          context.manifestPath,\n          context.workspaceRoot,\n        )}`,\n        {\n          manifestPath: context.manifestPath,\n          rootKey: context.spec.rootKey,\n        },\n      ),\n    );\n    return null;\n  }\n\n  const source = await readFile(context.manifestPath, \"utf8\");\n  let manifest;\n\n  try {\n    manifest = JSON.parse(source);\n  } catch (error) {\n    context.issues.push(\n      issue(\n        \"error\",\n        \"MANIFEST_INVALID_JSON\",\n        `Manifest is not valid JSON: ${displayPath(\n          context.manifestPath,\n          context.workspaceRoot,\n        )}: ${error.message}`,\n        {\n          manifestPath: context.manifestPath,\n          rootKey: context.spec.rootKey,\n        },\n      ),\n    );\n    return null;\n  }\n\n  const validation = validateDocument(\n    context.spec.contract,\n    manifest,\n  );\n\n  for (const validationError of validation.errors) {\n    context.issues.push(\n      issue(\n        \"error\",\n        \"MANIFEST_CONTRACT_INVALID\",\n        `${displayPath(\n          context.manifestPath,\n          context.workspaceRoot,\n        )} ${validationError.path}: ${validationError.message}`,\n        {\n          manifestPath: context.manifestPath,\n          rootKey: context.spec.rootKey,\n          contract: context.spec.contract,\n          validationPath: validationError.path,\n        },\n      ),\n    );\n  }\n\n  if (\n    manifest.kind &&\n    !context.spec.expectedKinds.includes(manifest.kind)\n  ) {\n    context.issues.push(\n      issue(\n        \"error\",\n        \"MANIFEST_KIND_MISMATCH\",\n        `Manifest kind ${manifest.kind} does not belong under ${context.spec.rootKey}.`,\n        {\n          manifestPath: context.manifestPath,\n          rootKey: context.spec.rootKey,\n          actualKind: manifest.kind,\n          expectedKinds: context.spec.expectedKinds,\n        },\n      ),\n    );\n  }\n\n  const relativeDirectory = relative(\n    context.rootPath,\n    dirname(context.manifestPath),\n  ).replaceAll(\"\\\\\", \"/\");\n\n  const id =\n    typeof manifest.id === \"string\" && manifest.id\n      ? manifest.id\n      : `invalid-${context.entries.length + 1}`;\n\n  return {\n    id,\n    kind:\n      typeof manifest.kind === \"string\"\n        ? manifest.kind\n        : context.spec.expectedKinds[0],\n    category: context.spec.category,\n    title:\n      manifest.title ??\n      manifest.name ??\n      id,\n    level: manifest.level ?? null,\n    collection: manifest.collection ?? null,\n    ownerArtifact: manifest.ownerArtifact ?? null,\n    rootKey: context.spec.rootKey,\n    rootPath: context.rootPath,\n    directory: dirname(context.manifestPath),\n    relativeDirectory,\n    manifestPath: context.manifestPath,\n    displayPath: displayPath(\n      context.manifestPath,\n      context.workspaceRoot,\n    ),\n    manifest,\n    contractValid: validation.ok,\n  };\n}\n\nfunction diagnoseDuplicates(entries, issues) {\n  const groups = new Map();\n\n  for (const entry of entries) {\n    const namespace =\n      entry.category === \"artifact\"\n        ? \"artifact\"\n        : entry.kind;\n    const scope =\n      entry.level === \"local\"\n        ? `local:${entry.ownerArtifact ?? \"(missing-owner)\"}`\n        : \"shared\";\n    const key = `${namespace}:${scope}:${entry.id}`;\n    const group = groups.get(key) ?? [];\n    group.push(entry);\n    groups.set(key, group);\n  }\n\n  for (const [key, group] of groups) {\n    if (group.length < 2) continue;\n\n    for (const entry of group) {\n      issues.push(\n        issue(\n          \"error\",\n          \"DUPLICATE_LIBRARY_ID\",\n          `Duplicate library identifier ${key}: ${group\n            .map((candidate) => candidate.displayPath)\n            .join(\", \")}`,\n          {\n            manifestPath: entry.manifestPath,\n            duplicateKey: key,\n            duplicates: group.map(\n              (candidate) => candidate.manifestPath,\n            ),\n          },\n        ),\n      );\n    }\n  }\n}\n\nfunction diagnosePlacement(entries, issues) {\n  for (const entry of entries) {\n    const directoryName = basename(entry.directory);\n\n    if (directoryName !== entry.id) {\n      issues.push(\n        issue(\n          \"warning\",\n          \"ID_DIRECTORY_MISMATCH\",\n          `Manifest id ${entry.id} does not match its directory ${directoryName}.`,\n          {\n            manifestPath: entry.manifestPath,\n            id: entry.id,\n            directoryName,\n          },\n        ),\n      );\n    }\n\n    const placement = expectedPlacement(entry);\n\n    if (\n      placement.expectedLevel &&\n      entry.level !== placement.expectedLevel\n    ) {\n      issues.push(\n        issue(\n          \"error\",\n          \"LIFECYCLE_PLACEMENT_MISMATCH\",\n          `${entry.kind}:${entry.id} declares level ${entry.level ?? \"(none)\"} but is stored under ${placement.expectedLevel}.`,\n          {\n            manifestPath: entry.manifestPath,\n            expectedLevel: placement.expectedLevel,\n            actualLevel: entry.level,\n          },\n        ),\n      );\n    }\n\n    if (\n      placement.expectedCollection &&\n      entry.collection !== placement.expectedCollection\n    ) {\n      issues.push(\n        issue(\n          \"error\",\n          \"COLLECTION_PLACEMENT_MISMATCH\",\n          `${entry.kind}:${entry.id} declares collection ${entry.collection ?? \"(none)\"} but is stored under ${placement.expectedCollection}.`,\n          {\n            manifestPath: entry.manifestPath,\n            expectedCollection: placement.expectedCollection,\n            actualCollection: entry.collection,\n          },\n        ),\n      );\n    }\n\n    if (\n      entry.category !== \"artifact\" &&\n      !placement.expectedLevel\n    ) {\n      issues.push(\n        issue(\n          \"warning\",\n          \"NONSTANDARD_LIBRARY_PLACEMENT\",\n          `${entry.kind}:${entry.id} is outside the expected core/ or collections/<id>/ structure.`,\n          {\n            manifestPath: entry.manifestPath,\n          },\n        ),\n      );\n    }\n  }\n}\n\nfunction summarise(entries, issues) {\n  const byKind = {};\n\n  for (const entry of entries) {\n    byKind[entry.kind] = (byKind[entry.kind] ?? 0) + 1;\n  }\n\n  return {\n    entryCount: entries.length,\n    artifactCount: entries.filter(\n      (entry) => entry.category === \"artifact\",\n    ).length,\n    resourceCount: entries.filter(\n      (entry) => entry.category !== \"artifact\",\n    ).length,\n    errorCount: issues.filter(\n      (entry) => entry.severity === \"error\",\n    ).length,\n    warningCount: issues.filter(\n      (entry) => entry.severity === \"warning\",\n    ).length,\n    byKind: Object.fromEntries(\n      Object.entries(byKind).sort(([left], [right]) =>\n        left.localeCompare(right, \"en\"),\n      ),\n    ),\n  };\n}\n\nfunction issue(severity, code, message, details = {}) {\n  return {\n    severity,\n    code,\n    message,\n    ...details,\n  };\n}\n\nfunction compareEntries(left, right) {\n  return (\n    left.kind.localeCompare(right.kind, \"en\") ||\n    left.id.localeCompare(right.id, \"en\") ||\n    left.displayPath.localeCompare(right.displayPath, \"en\")\n  );\n}\n\nfunction compareIssues(left, right) {\n  const severityOrder = { error: 0, warning: 1 };\n\n  return (\n    (severityOrder[left.severity] ?? 9) -\n      (severityOrder[right.severity] ?? 9) ||\n    left.code.localeCompare(right.code, \"en\") ||\n    String(left.message).localeCompare(String(right.message), \"en\")\n  );\n}\n\nfunction displayPath(path, workspaceRoot) {\n  const value = relative(workspaceRoot, path).replaceAll(\"\\\\\", \"/\");\n  return value.startsWith(\"..\") ? path : value || \".\";\n}\n\nfunction isInside(root, candidate) {\n  const relationship = relative(root, candidate);\n\n  return (\n    relationship === \"\" ||\n    (!relationship.startsWith(\"..\") && !isAbsolute(relationship))\n  );\n}\n\nasync function safeLstat(path) {\n  try {\n    return await lstat(path);\n  } catch (error) {\n    if (error?.code === \"ENOENT\") return null;\n    throw error;\n  }\n}\n", "allowedPrevious": ["import {\n  lstat,\n  readFile,\n  readdir,\n  realpath,\n} from \"node:fs/promises\";\nimport {\n  basename,\n  dirname,\n  isAbsolute,\n  join,\n  relative,\n  resolve,\n} from \"node:path\";\nimport { validateDocument } from \"../validation/contracts.mjs\";\nimport { loadWorkspaceConfig } from \"../workspace/load-config.mjs\";\nimport {\n  MANIFEST_SPECS,\n  expectedPlacement,\n} from \"./conventions.mjs\";\nimport {\n  collectReferences,\n  resolveReferences,\n} from \"./references.mjs\";\n\nconst MAX_MANIFEST_BYTES = 1024 * 1024;\nconst IGNORED_DIRECTORIES = new Set([\n  \".git\",\n  \"node_modules\",\n  \".my-dashboards\",\n]);\n\nexport async function scanWorkspaceLibrary(workspaceRoot) {\n  const canonicalWorkspaceRoot = await realpath(resolve(workspaceRoot));\n  const config = await loadWorkspaceConfig(canonicalWorkspaceRoot);\n  const entries = [];\n  const issues = [];\n\n  for (const spec of MANIFEST_SPECS) {\n    const configuredRoot = config.libraryRoots[spec.rootKey];\n\n    if (!configuredRoot) {\n      issues.push(\n        issue(\n          \"error\",\n          \"LIBRARY_ROOT_NOT_CONFIGURED\",\n          `Workspace library root ${spec.rootKey} is not configured.`,\n          { rootKey: spec.rootKey },\n        ),\n      );\n      continue;\n    }\n\n    const rootPath = resolve(canonicalWorkspaceRoot, configuredRoot);\n\n    if (!isInside(canonicalWorkspaceRoot, rootPath)) {\n      issues.push(\n        issue(\n          \"error\",\n          \"LIBRARY_ROOT_OUTSIDE_WORKSPACE\",\n          `Configured library root escapes the workspace: ${configuredRoot}`,\n          {\n            rootKey: spec.rootKey,\n            rootPath,\n          },\n        ),\n      );\n      continue;\n    }\n\n    const rootMetadata = await safeLstat(rootPath);\n\n    if (!rootMetadata?.isDirectory()) {\n      issues.push(\n        issue(\n          \"error\",\n          \"LIBRARY_ROOT_MISSING\",\n          `Configured library root does not exist: ${configuredRoot}`,\n          {\n            rootKey: spec.rootKey,\n            rootPath,\n          },\n        ),\n      );\n      continue;\n    }\n\n    await scanRoot({\n      workspaceRoot: canonicalWorkspaceRoot,\n      rootPath,\n      configuredRoot,\n      spec,\n      entries,\n      issues,\n    });\n  }\n\n  diagnoseDuplicates(entries, issues);\n  diagnosePlacement(entries, issues);\n\n  const references = entries.flatMap((entry) =>\n    collectReferences(entry).map((reference) => ({\n      ...reference,\n      sourceManifestPath: entry.manifestPath,\n    })),\n  );\n\n  resolveReferences(entries, references, issues);\n\n  return {\n    workspaceRoot: canonicalWorkspaceRoot,\n    config,\n    entries: entries.sort(compareEntries),\n    references,\n    issues: issues.sort(compareIssues),\n    summary: summarise(entries, issues),\n  };\n}\n\nexport function findLibraryEntries(entries, filters = {}) {\n  return entries.filter((entry) => {\n    if (\n      filters.kind &&\n      entry.kind !== filters.kind &&\n      entry.category !== filters.kind\n    ) {\n      return false;\n    }\n\n    if (filters.level && entry.level !== filters.level) {\n      return false;\n    }\n\n    if (\n      filters.collection &&\n      entry.collection !== filters.collection\n    ) {\n      return false;\n    }\n\n    return true;\n  });\n}\n\nasync function scanRoot(context) {\n  const manifestPaths = [];\n  await walk(context.rootPath, \"\");\n\n  for (const manifestPath of manifestPaths) {\n    const entry = await readManifestEntry({\n      ...context,\n      manifestPath,\n    });\n\n    if (entry) {\n      context.entries.push(entry);\n    }\n  }\n\n  async function walk(directory, relativeDirectory) {\n    const directoryEntries = await readdir(directory, {\n      withFileTypes: true,\n    });\n\n    directoryEntries.sort((left, right) =>\n      left.name.localeCompare(right.name, \"en\"),\n    );\n\n    for (const directoryEntry of directoryEntries) {\n      if (directoryEntry.name.startsWith(\".\")) continue;\n      if (IGNORED_DIRECTORIES.has(directoryEntry.name)) continue;\n\n      const absolutePath = join(directory, directoryEntry.name);\n      const childRelative = relativeDirectory\n        ? `${relativeDirectory}/${directoryEntry.name}`\n        : directoryEntry.name;\n      const metadata = await lstat(absolutePath);\n\n      if (metadata.isSymbolicLink()) {\n        context.issues.push(\n          issue(\n            \"warning\",\n            \"SYMLINK_SKIPPED\",\n            `Library scanning skipped symbolic link: ${displayPath(\n              absolutePath,\n              context.workspaceRoot,\n            )}`,\n            {\n              rootKey: context.spec.rootKey,\n              path: absolutePath,\n            },\n          ),\n        );\n        continue;\n      }\n\n      if (metadata.isDirectory()) {\n        await walk(absolutePath, childRelative);\n        continue;\n      }\n\n      if (\n        metadata.isFile() &&\n        directoryEntry.name === context.spec.manifestFile\n      ) {\n        manifestPaths.push(absolutePath);\n      }\n    }\n  }\n}\n\nasync function readManifestEntry(context) {\n  const metadata = await lstat(context.manifestPath);\n\n  if (metadata.size > MAX_MANIFEST_BYTES) {\n    context.issues.push(\n      issue(\n        \"error\",\n        \"MANIFEST_TOO_LARGE\",\n        `Manifest exceeds ${MAX_MANIFEST_BYTES} bytes: ${displayPath(\n          context.manifestPath,\n          context.workspaceRoot,\n        )}`,\n        {\n          manifestPath: context.manifestPath,\n          rootKey: context.spec.rootKey,\n        },\n      ),\n    );\n    return null;\n  }\n\n  const source = await readFile(context.manifestPath, \"utf8\");\n  let manifest;\n\n  try {\n    manifest = JSON.parse(source);\n  } catch (error) {\n    context.issues.push(\n      issue(\n        \"error\",\n        \"MANIFEST_INVALID_JSON\",\n        `Manifest is not valid JSON: ${displayPath(\n          context.manifestPath,\n          context.workspaceRoot,\n        )}: ${error.message}`,\n        {\n          manifestPath: context.manifestPath,\n          rootKey: context.spec.rootKey,\n        },\n      ),\n    );\n    return null;\n  }\n\n  const validation = validateDocument(\n    context.spec.contract,\n    manifest,\n  );\n\n  for (const validationError of validation.errors) {\n    context.issues.push(\n      issue(\n        \"error\",\n        \"MANIFEST_CONTRACT_INVALID\",\n        `${displayPath(\n          context.manifestPath,\n          context.workspaceRoot,\n        )} ${validationError.path}: ${validationError.message}`,\n        {\n          manifestPath: context.manifestPath,\n          rootKey: context.spec.rootKey,\n          contract: context.spec.contract,\n          validationPath: validationError.path,\n        },\n      ),\n    );\n  }\n\n  if (\n    manifest.kind &&\n    !context.spec.expectedKinds.includes(manifest.kind)\n  ) {\n    context.issues.push(\n      issue(\n        \"error\",\n        \"MANIFEST_KIND_MISMATCH\",\n        `Manifest kind ${manifest.kind} does not belong under ${context.spec.rootKey}.`,\n        {\n          manifestPath: context.manifestPath,\n          rootKey: context.spec.rootKey,\n          actualKind: manifest.kind,\n          expectedKinds: context.spec.expectedKinds,\n        },\n      ),\n    );\n  }\n\n  const relativeDirectory = relative(\n    context.rootPath,\n    dirname(context.manifestPath),\n  ).replaceAll(\"\\\\\", \"/\");\n\n  const id =\n    typeof manifest.id === \"string\" && manifest.id\n      ? manifest.id\n      : `invalid-${context.entries.length + 1}`;\n\n  return {\n    id,\n    kind:\n      typeof manifest.kind === \"string\"\n        ? manifest.kind\n        : context.spec.expectedKinds[0],\n    category: context.spec.category,\n    title:\n      manifest.title ??\n      manifest.name ??\n      id,\n    level: manifest.level ?? null,\n    collection: manifest.collection ?? null,\n    ownerArtifact: manifest.ownerArtifact ?? null,\n    rootKey: context.spec.rootKey,\n    rootPath: context.rootPath,\n    directory: dirname(context.manifestPath),\n    relativeDirectory,\n    manifestPath: context.manifestPath,\n    displayPath: displayPath(\n      context.manifestPath,\n      context.workspaceRoot,\n    ),\n    manifest,\n    contractValid: validation.ok,\n  };\n}\n\nfunction diagnoseDuplicates(entries, issues) {\n  const groups = new Map();\n\n  for (const entry of entries) {\n    const namespace =\n      entry.category === \"artifact\"\n        ? \"artifact\"\n        : entry.kind;\n    const key = `${namespace}:${entry.id}`;\n    const group = groups.get(key) ?? [];\n    group.push(entry);\n    groups.set(key, group);\n  }\n\n  for (const [key, group] of groups) {\n    if (group.length < 2) continue;\n\n    for (const entry of group) {\n      issues.push(\n        issue(\n          \"error\",\n          \"DUPLICATE_LIBRARY_ID\",\n          `Duplicate library identifier ${key}: ${group\n            .map((candidate) => candidate.displayPath)\n            .join(\", \")}`,\n          {\n            manifestPath: entry.manifestPath,\n            duplicateKey: key,\n            duplicates: group.map(\n              (candidate) => candidate.manifestPath,\n            ),\n          },\n        ),\n      );\n    }\n  }\n}\n\nfunction diagnosePlacement(entries, issues) {\n  for (const entry of entries) {\n    const directoryName = basename(entry.directory);\n\n    if (directoryName !== entry.id) {\n      issues.push(\n        issue(\n          \"warning\",\n          \"ID_DIRECTORY_MISMATCH\",\n          `Manifest id ${entry.id} does not match its directory ${directoryName}.`,\n          {\n            manifestPath: entry.manifestPath,\n            id: entry.id,\n            directoryName,\n          },\n        ),\n      );\n    }\n\n    const placement = expectedPlacement(entry);\n\n    if (\n      placement.expectedLevel &&\n      entry.level !== placement.expectedLevel\n    ) {\n      issues.push(\n        issue(\n          \"error\",\n          \"LIFECYCLE_PLACEMENT_MISMATCH\",\n          `${entry.kind}:${entry.id} declares level ${entry.level ?? \"(none)\"} but is stored under ${placement.expectedLevel}.`,\n          {\n            manifestPath: entry.manifestPath,\n            expectedLevel: placement.expectedLevel,\n            actualLevel: entry.level,\n          },\n        ),\n      );\n    }\n\n    if (\n      placement.expectedCollection &&\n      entry.collection !== placement.expectedCollection\n    ) {\n      issues.push(\n        issue(\n          \"error\",\n          \"COLLECTION_PLACEMENT_MISMATCH\",\n          `${entry.kind}:${entry.id} declares collection ${entry.collection ?? \"(none)\"} but is stored under ${placement.expectedCollection}.`,\n          {\n            manifestPath: entry.manifestPath,\n            expectedCollection: placement.expectedCollection,\n            actualCollection: entry.collection,\n          },\n        ),\n      );\n    }\n\n    if (\n      entry.category !== \"artifact\" &&\n      !placement.expectedLevel\n    ) {\n      issues.push(\n        issue(\n          \"warning\",\n          \"NONSTANDARD_LIBRARY_PLACEMENT\",\n          `${entry.kind}:${entry.id} is outside the expected core/ or collections/<id>/ structure.`,\n          {\n            manifestPath: entry.manifestPath,\n          },\n        ),\n      );\n    }\n  }\n}\n\nfunction summarise(entries, issues) {\n  const byKind = {};\n\n  for (const entry of entries) {\n    byKind[entry.kind] = (byKind[entry.kind] ?? 0) + 1;\n  }\n\n  return {\n    entryCount: entries.length,\n    artifactCount: entries.filter(\n      (entry) => entry.category === \"artifact\",\n    ).length,\n    resourceCount: entries.filter(\n      (entry) => entry.category !== \"artifact\",\n    ).length,\n    errorCount: issues.filter(\n      (entry) => entry.severity === \"error\",\n    ).length,\n    warningCount: issues.filter(\n      (entry) => entry.severity === \"warning\",\n    ).length,\n    byKind: Object.fromEntries(\n      Object.entries(byKind).sort(([left], [right]) =>\n        left.localeCompare(right, \"en\"),\n      ),\n    ),\n  };\n}\n\nfunction issue(severity, code, message, details = {}) {\n  return {\n    severity,\n    code,\n    message,\n    ...details,\n  };\n}\n\nfunction compareEntries(left, right) {\n  return (\n    left.kind.localeCompare(right.kind, \"en\") ||\n    left.id.localeCompare(right.id, \"en\") ||\n    left.displayPath.localeCompare(right.displayPath, \"en\")\n  );\n}\n\nfunction compareIssues(left, right) {\n  const severityOrder = { error: 0, warning: 1 };\n\n  return (\n    (severityOrder[left.severity] ?? 9) -\n      (severityOrder[right.severity] ?? 9) ||\n    left.code.localeCompare(right.code, \"en\") ||\n    String(left.message).localeCompare(String(right.message), \"en\")\n  );\n}\n\nfunction displayPath(path, workspaceRoot) {\n  const value = relative(workspaceRoot, path).replaceAll(\"\\\\\", \"/\");\n  return value.startsWith(\"..\") ? path : value || \".\";\n}\n\nfunction isInside(root, candidate) {\n  const relationship = relative(root, candidate);\n\n  return (\n    relationship === \"\" ||\n    (!relationship.startsWith(\"..\") && !isAbsolute(relationship))\n  );\n}\n\nasync function safeLstat(path) {\n  try {\n    return await lstat(path);\n  } catch (error) {\n    if (error?.code === \"ENOENT\") return null;\n    throw error;\n  }\n}\n"]}, "src/library/references.mjs": {"content": "import { REFERENCEABLE_KINDS } from \"./conventions.mjs\";\n\nexport function collectReferences(entry) {\n  const manifest = entry.manifest;\n  const references = [];\n\n  if (entry.category === \"artifact\") {\n    add(references, \"theme\", manifest.appearance?.theme, \"appearance.theme\");\n    add(references, \"preset\", manifest.appearance?.preset, \"appearance.preset\");\n    add(\n      references,\n      \"layout\",\n      manifest.appearance?.overrides?.layout,\n      \"appearance.overrides.layout\",\n    );\n    addMap(\n      references,\n      \"component\",\n      manifest.appearance?.overrides?.components,\n      \"appearance.overrides.components\",\n    );\n    addMap(\n      references,\n      \"primitive\",\n      manifest.appearance?.overrides?.primitives,\n      \"appearance.overrides.primitives\",\n    );\n    addMap(\n      references,\n      \"asset\",\n      manifest.appearance?.overrides?.assets,\n      \"appearance.overrides.assets\",\n    );\n  }\n\n  if (entry.kind === \"preset\") {\n    add(\n      references,\n      \"layout\",\n      manifest.mappings?.layout,\n      \"mappings.layout\",\n    );\n    addMap(\n      references,\n      \"component\",\n      manifest.mappings?.components,\n      \"mappings.components\",\n    );\n    addMap(\n      references,\n      \"primitive\",\n      manifest.mappings?.primitives,\n      \"mappings.primitives\",\n    );\n    addMap(\n      references,\n      \"asset\",\n      manifest.mappings?.assets,\n      \"mappings.assets\",\n    );\n    addArray(\n      references,\n      \"theme\",\n      manifest.supportedThemes,\n      \"supportedThemes\",\n    );\n  }\n\n  if (\n    entry.kind === \"primitive\" ||\n    entry.kind === \"component\" ||\n    entry.kind === \"layout\"\n  ) {\n    addMap(\n      references,\n      \"primitive\",\n      manifest.dependencies?.primitives,\n      \"dependencies.primitives\",\n    );\n    addMap(\n      references,\n      \"component\",\n      manifest.dependencies?.components,\n      \"dependencies.components\",\n    );\n    addMap(\n      references,\n      \"asset\",\n      manifest.dependencies?.assets,\n      \"dependencies.assets\",\n    );\n    addArray(\n      references,\n      \"theme\",\n      manifest.supportedThemes,\n      \"supportedThemes\",\n    );\n  }\n\n  if (entry.kind === \"theme\") {\n    addMap(references, \"asset\", manifest.assets, \"assets\");\n  }\n\n  return references.map((reference) => ({\n    ...reference,\n    sourceId: entry.id,\n    sourceKind: entry.kind,\n    sourceCategory: entry.category,\n  }));\n}\n\nexport function resolveReferences(entries, references, issues) {\n  const entryByManifest = new Map(\n    entries.map((entry) => [entry.manifestPath, entry]),\n  );\n\n  for (const reference of references) {\n    if (!REFERENCEABLE_KINDS.has(reference.targetKind)) continue;\n\n    const sourceEntry = entryByManifest.get(\n      reference.sourceManifestPath,\n    );\n    const candidates = findReferenceCandidates(\n      entries,\n      reference.targetKind,\n      reference.value,\n      {\n        sourceEntry,\n      },\n    );\n\n    if (candidates.length === 0) {\n      issues.push({\n        severity: \"error\",\n        code: \"UNRESOLVED_LIBRARY_REFERENCE\",\n        message: `${reference.sourceKind}:${reference.sourceId} references missing ${reference.targetKind}:${reference.value} via ${reference.field}.`,\n        manifestPath: reference.sourceManifestPath,\n        targetKind: reference.targetKind,\n        reference: reference.value,\n        field: reference.field,\n      });\n      continue;\n    }\n\n    if (candidates.length > 1) {\n      issues.push({\n        severity: \"error\",\n        code: \"AMBIGUOUS_LIBRARY_REFERENCE\",\n        message: `${reference.sourceKind}:${reference.sourceId} references ambiguous ${reference.targetKind}:${reference.value} via ${reference.field}.`,\n        manifestPath: reference.sourceManifestPath,\n        targetKind: reference.targetKind,\n        reference: reference.value,\n        field: reference.field,\n        candidateManifestPaths: candidates.map(\n          (candidate) => candidate.manifestPath,\n        ),\n      });\n      continue;\n    }\n\n    reference.targetManifestPath = candidates[0].manifestPath;\n    reference.targetId = candidates[0].id;\n  }\n}\n\nexport function findReferenceCandidates(\n  entries,\n  targetKind,\n  value,\n  options = {},\n) {\n  const parts = String(value).split(\"/\").filter(Boolean);\n  const id = parts.at(-1);\n  const qualifier = parts.length > 1 ? parts[0] : null;\n  const sourceEntry = options.sourceEntry ?? null;\n  const ownerArtifact = sourceOwnerArtifact(sourceEntry);\n\n  const matching = entries.filter(\n    (entry) => entry.kind === targetKind && entry.id === id,\n  );\n\n  if (qualifier) {\n    if (qualifier === \"core\") {\n      return matching.filter((entry) => entry.level === \"core\");\n    }\n\n    if (qualifier === \"local\") {\n      if (!ownerArtifact) return [];\n\n      return matching.filter(\n        (entry) =>\n          entry.level === \"local\" &&\n          entry.ownerArtifact === ownerArtifact,\n      );\n    }\n\n    return matching.filter(\n      (entry) =>\n        entry.level === \"collection\" &&\n        entry.collection === qualifier,\n    );\n  }\n\n  if (ownerArtifact) {\n    const local = matching.filter(\n      (entry) =>\n        entry.level === \"local\" &&\n        entry.ownerArtifact === ownerArtifact,\n    );\n\n    if (local.length > 0) return local;\n  }\n\n  const core = matching.filter((entry) => entry.level === \"core\");\n  if (core.length > 0) return core;\n\n  if (sourceEntry?.level === \"collection\" && sourceEntry.collection) {\n    const sameCollection = matching.filter(\n      (entry) =>\n        entry.level === \"collection\" &&\n        entry.collection === sourceEntry.collection,\n    );\n\n    if (sameCollection.length > 0) return sameCollection;\n  }\n\n  return matching.filter((entry) => entry.level === \"collection\");\n}\n\nexport function sourceOwnerArtifact(entry) {\n  if (!entry) return null;\n  if (entry.category === \"artifact\") return entry.id;\n  if (entry.level === \"local\") return entry.ownerArtifact ?? null;\n  return null;\n}\n\nfunction add(references, targetKind, value, field) {\n  if (typeof value !== \"string\" || !value) return;\n\n  references.push({\n    targetKind,\n    value,\n    field,\n  });\n}\n\nfunction addArray(references, targetKind, values, field) {\n  if (!Array.isArray(values)) return;\n\n  values.forEach((value, index) =>\n    add(references, targetKind, value, `${field}[${index}]`),\n  );\n}\n\nfunction addMap(references, targetKind, values, field) {\n  if (!values || typeof values !== \"object\" || Array.isArray(values)) {\n    return;\n  }\n\n  for (const [slot, value] of Object.entries(values)) {\n    add(references, targetKind, value, `${field}.${slot}`);\n  }\n}\n", "allowedPrevious": ["import { REFERENCEABLE_KINDS } from \"./conventions.mjs\";\n\nexport function collectReferences(entry) {\n  const manifest = entry.manifest;\n  const references = [];\n\n  if (entry.category === \"artifact\") {\n    add(references, \"theme\", manifest.appearance?.theme, \"appearance.theme\");\n    add(references, \"preset\", manifest.appearance?.preset, \"appearance.preset\");\n    add(\n      references,\n      \"layout\",\n      manifest.appearance?.overrides?.layout,\n      \"appearance.overrides.layout\",\n    );\n    addMap(\n      references,\n      \"component\",\n      manifest.appearance?.overrides?.components,\n      \"appearance.overrides.components\",\n    );\n    addMap(\n      references,\n      \"primitive\",\n      manifest.appearance?.overrides?.primitives,\n      \"appearance.overrides.primitives\",\n    );\n    addMap(\n      references,\n      \"asset\",\n      manifest.appearance?.overrides?.assets,\n      \"appearance.overrides.assets\",\n    );\n  }\n\n  if (entry.kind === \"preset\") {\n    add(\n      references,\n      \"layout\",\n      manifest.mappings?.layout,\n      \"mappings.layout\",\n    );\n    addMap(\n      references,\n      \"component\",\n      manifest.mappings?.components,\n      \"mappings.components\",\n    );\n    addMap(\n      references,\n      \"primitive\",\n      manifest.mappings?.primitives,\n      \"mappings.primitives\",\n    );\n    addMap(\n      references,\n      \"asset\",\n      manifest.mappings?.assets,\n      \"mappings.assets\",\n    );\n    addArray(\n      references,\n      \"theme\",\n      manifest.supportedThemes,\n      \"supportedThemes\",\n    );\n  }\n\n  if (\n    entry.kind === \"primitive\" ||\n    entry.kind === \"component\" ||\n    entry.kind === \"layout\"\n  ) {\n    addMap(\n      references,\n      \"primitive\",\n      manifest.dependencies?.primitives,\n      \"dependencies.primitives\",\n    );\n    addMap(\n      references,\n      \"component\",\n      manifest.dependencies?.components,\n      \"dependencies.components\",\n    );\n    addMap(\n      references,\n      \"asset\",\n      manifest.dependencies?.assets,\n      \"dependencies.assets\",\n    );\n    addArray(\n      references,\n      \"theme\",\n      manifest.supportedThemes,\n      \"supportedThemes\",\n    );\n  }\n\n  if (entry.kind === \"theme\") {\n    addMap(references, \"asset\", manifest.assets, \"assets\");\n  }\n\n  return references.map((reference) => ({\n    ...reference,\n    sourceId: entry.id,\n    sourceKind: entry.kind,\n    sourceCategory: entry.category,\n  }));\n}\n\nexport function resolveReferences(entries, references, issues) {\n  for (const reference of references) {\n    if (!REFERENCEABLE_KINDS.has(reference.targetKind)) continue;\n\n    const candidates = findReferenceCandidates(\n      entries,\n      reference.targetKind,\n      reference.value,\n    );\n\n    if (candidates.length === 0) {\n      issues.push({\n        severity: \"error\",\n        code: \"UNRESOLVED_LIBRARY_REFERENCE\",\n        message: `${reference.sourceKind}:${reference.sourceId} references missing ${reference.targetKind}:${reference.value} via ${reference.field}.`,\n        manifestPath: reference.sourceManifestPath,\n        targetKind: reference.targetKind,\n        reference: reference.value,\n        field: reference.field,\n      });\n      continue;\n    }\n\n    if (candidates.length > 1) {\n      issues.push({\n        severity: \"error\",\n        code: \"AMBIGUOUS_LIBRARY_REFERENCE\",\n        message: `${reference.sourceKind}:${reference.sourceId} references ambiguous ${reference.targetKind}:${reference.value} via ${reference.field}.`,\n        manifestPath: reference.sourceManifestPath,\n        targetKind: reference.targetKind,\n        reference: reference.value,\n        field: reference.field,\n        candidateManifestPaths: candidates.map(\n          (candidate) => candidate.manifestPath,\n        ),\n      });\n      continue;\n    }\n\n    reference.targetManifestPath = candidates[0].manifestPath;\n    reference.targetId = candidates[0].id;\n  }\n}\n\nexport function findReferenceCandidates(entries, targetKind, value) {\n  const parts = String(value).split(\"/\").filter(Boolean);\n  const id = parts.at(-1);\n  const qualifier = parts.length > 1 ? parts[0] : null;\n\n  return entries.filter((entry) => {\n    if (entry.kind !== targetKind || entry.id !== id) {\n      return false;\n    }\n\n    if (!qualifier) return true;\n    if (qualifier === \"core\") return entry.level === \"core\";\n\n    return (\n      entry.level === \"collection\" &&\n      entry.collection === qualifier\n    );\n  });\n}\n\nfunction add(references, targetKind, value, field) {\n  if (typeof value !== \"string\" || !value) return;\n\n  references.push({\n    targetKind,\n    value,\n    field,\n  });\n}\n\nfunction addArray(references, targetKind, values, field) {\n  if (!Array.isArray(values)) return;\n\n  values.forEach((value, index) =>\n    add(references, targetKind, value, `${field}[${index}]`),\n  );\n}\n\nfunction addMap(references, targetKind, values, field) {\n  if (!values || typeof values !== \"object\" || Array.isArray(values)) {\n    return;\n  }\n\n  for (const [slot, value] of Object.entries(values)) {\n    add(references, targetKind, value, `${field}.${slot}`);\n  }\n}\n"]}, "src/library/local-resources.mjs": {"content": "import {\n  lstat,\n  readFile,\n  readdir,\n} from \"node:fs/promises\";\nimport {\n  basename,\n  dirname,\n  join,\n  relative,\n} from \"node:path\";\nimport { validateDocument } from \"../validation/contracts.mjs\";\n\nconst MAX_MANIFEST_BYTES = 1024 * 1024;\n\nconst LOCAL_SPECS = [\n  {\n    relativeRoot: \"ui/primitives\",\n    rootKey: \"local-primitives\",\n    category: \"ui\",\n    manifestFile: \"ui.json\",\n    contract: \"uiItem\",\n    expectedKind: \"primitive\",\n  },\n  {\n    relativeRoot: \"ui/components\",\n    rootKey: \"local-components\",\n    category: \"ui\",\n    manifestFile: \"ui.json\",\n    contract: \"uiItem\",\n    expectedKind: \"component\",\n  },\n  {\n    relativeRoot: \"ui/layouts\",\n    rootKey: \"local-layouts\",\n    category: \"ui\",\n    manifestFile: \"ui.json\",\n    contract: \"uiItem\",\n    expectedKind: \"layout\",\n  },\n  {\n    relativeRoot: \"theme\",\n    rootKey: \"local-themes\",\n    category: \"theme\",\n    manifestFile: \"theme.json\",\n    contract: \"theme\",\n    expectedKind: \"theme\",\n  },\n  {\n    relativeRoot: \"assets\",\n    rootKey: \"local-assets\",\n    category: \"asset\",\n    manifestFile: \"asset.json\",\n    contract: \"asset\",\n    expectedKind: \"asset\",\n  },\n];\n\nexport async function scanArtifactLocalResources(context) {\n  for (const artifact of context.artifacts) {\n    for (const spec of LOCAL_SPECS) {\n      const rootPath = join(artifact.directory, spec.relativeRoot);\n      const metadata = await safeLstat(rootPath);\n\n      if (!metadata?.isDirectory()) continue;\n\n      await scanLocalRoot({\n        ...context,\n        artifact,\n        spec,\n        rootPath,\n      });\n    }\n  }\n}\n\nasync function scanLocalRoot(context) {\n  const manifestPaths = [];\n  await walk(context.rootPath, \"\");\n\n  for (const manifestPath of manifestPaths) {\n    const entry = await readLocalManifest({\n      ...context,\n      manifestPath,\n    });\n\n    if (entry) context.entries.push(entry);\n  }\n\n  async function walk(directory, relativeDirectory) {\n    const directoryEntries = await readdir(directory, {\n      withFileTypes: true,\n    });\n\n    directoryEntries.sort((left, right) =>\n      left.name.localeCompare(right.name, \"en\"),\n    );\n\n    for (const item of directoryEntries) {\n      if (item.name.startsWith(\".\")) continue;\n\n      const absolutePath = join(directory, item.name);\n      const childRelative = relativeDirectory\n        ? `${relativeDirectory}/${item.name}`\n        : item.name;\n      const metadata = await lstat(absolutePath);\n\n      if (metadata.isSymbolicLink()) {\n        context.issues.push({\n          severity: \"warning\",\n          code: \"SYMLINK_SKIPPED\",\n          message: `Local resource scanning skipped symbolic link: ${displayPath(\n            absolutePath,\n            context.workspaceRoot,\n          )}`,\n          path: absolutePath,\n          manifestPath: context.artifact.manifestPath,\n        });\n        continue;\n      }\n\n      if (metadata.isDirectory()) {\n        await walk(absolutePath, childRelative);\n      } else if (\n        metadata.isFile() &&\n        item.name === context.spec.manifestFile\n      ) {\n        manifestPaths.push(absolutePath);\n      }\n    }\n  }\n}\n\nasync function readLocalManifest(context) {\n  const metadata = await lstat(context.manifestPath);\n\n  if (metadata.size > MAX_MANIFEST_BYTES) {\n    context.issues.push({\n      severity: \"error\",\n      code: \"MANIFEST_TOO_LARGE\",\n      message: `Local manifest exceeds ${MAX_MANIFEST_BYTES} bytes: ${displayPath(\n        context.manifestPath,\n        context.workspaceRoot,\n      )}`,\n      manifestPath: context.manifestPath,\n    });\n    return null;\n  }\n\n  let manifest;\n\n  try {\n    manifest = JSON.parse(\n      await readFile(context.manifestPath, \"utf8\"),\n    );\n  } catch (error) {\n    context.issues.push({\n      severity: \"error\",\n      code: \"MANIFEST_INVALID_JSON\",\n      message: `Local manifest is not valid JSON: ${displayPath(\n        context.manifestPath,\n        context.workspaceRoot,\n      )}: ${error.message}`,\n      manifestPath: context.manifestPath,\n    });\n    return null;\n  }\n\n  const validation = validateDocument(\n    context.spec.contract,\n    manifest,\n  );\n\n  for (const validationError of validation.errors) {\n    context.issues.push({\n      severity: \"error\",\n      code: \"MANIFEST_CONTRACT_INVALID\",\n      message: `${displayPath(\n        context.manifestPath,\n        context.workspaceRoot,\n      )} ${validationError.path}: ${validationError.message}`,\n      manifestPath: context.manifestPath,\n      contract: context.spec.contract,\n      validationPath: validationError.path,\n    });\n  }\n\n  if (manifest.kind !== context.spec.expectedKind) {\n    context.issues.push({\n      severity: \"error\",\n      code: \"MANIFEST_KIND_MISMATCH\",\n      message: `Local manifest kind ${manifest.kind ?? \"(missing)\"} must be ${context.spec.expectedKind}.`,\n      manifestPath: context.manifestPath,\n      actualKind: manifest.kind,\n      expectedKind: context.spec.expectedKind,\n    });\n  }\n\n  if (manifest.level !== \"local\") {\n    context.issues.push({\n      severity: \"error\",\n      code: \"LOCAL_RESOURCE_LEVEL_INVALID\",\n      message: `Local ${context.spec.expectedKind}:${manifest.id ?? \"(missing-id)\"} must declare level local.`,\n      manifestPath: context.manifestPath,\n      actualLevel: manifest.level,\n    });\n  }\n\n  if (manifest.ownerArtifact !== context.artifact.id) {\n    context.issues.push({\n      severity: \"error\",\n      code: \"LOCAL_RESOURCE_OWNER_MISMATCH\",\n      message: `Local ${context.spec.expectedKind}:${manifest.id ?? \"(missing-id)\"} must declare ownerArtifact ${context.artifact.id}.`,\n      manifestPath: context.manifestPath,\n      expectedOwnerArtifact: context.artifact.id,\n      actualOwnerArtifact: manifest.ownerArtifact,\n    });\n  }\n\n  const relativeDirectory = relative(\n    context.rootPath,\n    dirname(context.manifestPath),\n  ).replaceAll(\"\\\\\", \"/\");\n  const id =\n    typeof manifest.id === \"string\" && manifest.id\n      ? manifest.id\n      : `invalid-local-${context.entries.length + 1}`;\n\n  return {\n    id,\n    kind:\n      typeof manifest.kind === \"string\"\n        ? manifest.kind\n        : context.spec.expectedKind,\n    category: context.spec.category,\n    title: manifest.name ?? id,\n    level: manifest.level ?? null,\n    collection: null,\n    ownerArtifact: manifest.ownerArtifact ?? null,\n    rootKey: context.spec.rootKey,\n    rootPath: context.rootPath,\n    directory: dirname(context.manifestPath),\n    relativeDirectory,\n    manifestPath: context.manifestPath,\n    displayPath: displayPath(\n      context.manifestPath,\n      context.workspaceRoot,\n    ),\n    manifest,\n    contractValid: validation.ok,\n  };\n}\n\nfunction displayPath(path, workspaceRoot) {\n  const value = relative(workspaceRoot, path).replaceAll(\"\\\\\", \"/\");\n  return value.startsWith(\"..\") ? path : value || \".\";\n}\n\nasync function safeLstat(path) {\n  try {\n    return await lstat(path);\n  } catch (error) {\n    if (error?.code === \"ENOENT\") return null;\n    throw error;\n  }\n}\n"}, "src/resolution/find-artifact.mjs": {"content": "import { CliError, EXIT_USAGE } from \"../../cli/errors.mjs\";\n\nexport function findArtifact(scan, id, kind = null) {\n  const matches = scan.entries.filter(\n    (entry) =>\n      entry.category === \"artifact\" &&\n      entry.id === id &&\n      (!kind || entry.kind === kind),\n  );\n\n  if (matches.length === 0) {\n    throw new CliError(\n      \"ARTIFACT_NOT_FOUND\",\n      `No artefact found for ${kind ? `${kind}:` : \"\"}${id}.`,\n      { exitCode: EXIT_USAGE },\n    );\n  }\n\n  if (matches.length > 1) {\n    throw new CliError(\n      \"AMBIGUOUS_ARTIFACT\",\n      `Multiple artefacts use the identifier ${id}.`,\n      {\n        exitCode: EXIT_USAGE,\n        details: {\n          matches: matches.map((entry) => ({\n            kind: entry.kind,\n            displayPath: entry.displayPath,\n          })),\n        },\n        hint: \"Use --kind to disambiguate the artefact.\",\n      },\n    );\n  }\n\n  return matches[0];\n}\n"}, "src/resolution/resolve.mjs": {"content": "import {\n  findReferenceCandidates,\n} from \"../library/references.mjs\";\n\nconst UI_KINDS = new Set([\n  \"primitive\",\n  \"component\",\n  \"layout\",\n]);\n\nexport function resolveArtifactAppearance(scan, artifact) {\n  const issues = [];\n  const selections = {\n    theme: null,\n    preset: null,\n    layout: null,\n    components: {},\n    primitives: {},\n    assets: {},\n  };\n  const edges = [];\n  const selectedEntries = new Map();\n\n  const themeChoice = chooseTopLevelReference(\n    artifact,\n    scan.config.defaults.theme,\n    artifact.manifest.appearance?.theme,\n    \"theme\",\n    \"appearance.theme\",\n  );\n  selections.theme = resolveSelection(\n    scan,\n    artifact,\n    themeChoice,\n    issues,\n  );\n\n  const presetChoice = chooseTopLevelReference(\n    artifact,\n    scan.config.defaults.preset,\n    artifact.manifest.appearance?.preset,\n    \"preset\",\n    \"appearance.preset\",\n  );\n  selections.preset = resolveSelection(\n    scan,\n    artifact,\n    presetChoice,\n    issues,\n  );\n\n  if (selections.theme?.entry) {\n    selectedEntries.set(\n      selections.theme.entry.manifestPath,\n      selections.theme.entry,\n    );\n  }\n\n  if (selections.preset?.entry) {\n    selectedEntries.set(\n      selections.preset.entry.manifestPath,\n      selections.preset.entry,\n    );\n  }\n\n  validatePresetTheme(\n    scan,\n    selections.preset?.entry,\n    selections.theme?.entry,\n    issues,\n  );\n\n  const preset = selections.preset?.entry?.manifest ?? {};\n  const appearance = artifact.manifest.appearance ?? {};\n  const overrides = appearance.overrides ?? {};\n\n  const layoutChoice = chooseMappingReference({\n    presetEntry: selections.preset?.entry,\n    presetValue: preset.mappings?.layout,\n    artifact,\n    artifactValue: overrides.layout,\n    targetKind: \"layout\",\n    field: \"appearance.overrides.layout\",\n    presetField: \"mappings.layout\",\n  });\n\n  selections.layout = resolveSelection(\n    scan,\n    artifact,\n    layoutChoice,\n    issues,\n  );\n\n  selections.components = resolveMappingSet({\n    scan,\n    artifact,\n    presetEntry: selections.preset?.entry,\n    presetValues: preset.mappings?.components,\n    artifactValues: overrides.components,\n    targetKind: \"component\",\n    presetField: \"mappings.components\",\n    artifactField: \"appearance.overrides.components\",\n    issues,\n  });\n\n  selections.primitives = resolveMappingSet({\n    scan,\n    artifact,\n    presetEntry: selections.preset?.entry,\n    presetValues: preset.mappings?.primitives,\n    artifactValues: overrides.primitives,\n    targetKind: \"primitive\",\n    presetField: \"mappings.primitives\",\n    artifactField: \"appearance.overrides.primitives\",\n    issues,\n  });\n\n  selections.assets = resolveAssetMappings({\n    scan,\n    artifact,\n    themeEntry: selections.theme?.entry,\n    presetEntry: selections.preset?.entry,\n    artifactValues: overrides.assets,\n    issues,\n  });\n\n  const roots = [\n    selections.layout,\n    ...Object.values(selections.components),\n    ...Object.values(selections.primitives),\n    ...Object.values(selections.assets),\n  ].filter(Boolean);\n\n  for (const selection of roots) {\n    if (selection.entry) {\n      selectedEntries.set(\n        selection.entry.manifestPath,\n        selection.entry,\n      );\n    }\n  }\n\n  const dependencyState = {\n    scan,\n    artifact,\n    selectedTheme: selections.theme?.entry ?? null,\n    issues,\n    edges,\n    selectedEntries,\n    visiting: new Set(),\n    visited: new Set(),\n  };\n\n  for (const selection of roots) {\n    if (selection.entry && UI_KINDS.has(selection.entry.kind)) {\n      visitDependencies(selection.entry, dependencyState);\n    }\n  }\n\n  return {\n    artifact: publicEntry(artifact),\n    selections: {\n      theme: publicSelection(selections.theme),\n      preset: publicSelection(selections.preset),\n      layout: publicSelection(selections.layout),\n      components: publicSelectionMap(selections.components),\n      primitives: publicSelectionMap(selections.primitives),\n      assets: publicSelectionMap(selections.assets),\n    },\n    dependencyClosure: [...selectedEntries.values()]\n      .map(publicEntry)\n      .sort(comparePublicEntries),\n    edges: edges.sort(compareEdges),\n    issues: issues.sort(compareIssues),\n    summary: {\n      valid: !issues.some((issue) => issue.severity === \"error\"),\n      errorCount: issues.filter(\n        (issue) => issue.severity === \"error\",\n      ).length,\n      warningCount: issues.filter(\n        (issue) => issue.severity === \"warning\",\n      ).length,\n      dependencyCount: selectedEntries.size,\n    },\n  };\n}\n\nexport function resolveAllArtifactAppearances(scan) {\n  const artifacts = scan.entries.filter(\n    (entry) => entry.category === \"artifact\",\n  );\n  const results = artifacts.map((artifact) =>\n    resolveArtifactAppearance(scan, artifact),\n  );\n\n  return {\n    results,\n    summary: {\n      artifactCount: results.length,\n      validArtifactCount: results.filter(\n        (result) => result.summary.valid,\n      ).length,\n      invalidArtifactCount: results.filter(\n        (result) => !result.summary.valid,\n      ).length,\n      errorCount: results.reduce(\n        (total, result) => total + result.summary.errorCount,\n        0,\n      ),\n      warningCount: results.reduce(\n        (total, result) => total + result.summary.warningCount,\n        0,\n      ),\n    },\n  };\n}\n\nfunction chooseTopLevelReference(\n  artifact,\n  workspaceValue,\n  artifactValue,\n  targetKind,\n  artifactField,\n) {\n  if (artifactValue) {\n    return {\n      value: artifactValue,\n      targetKind,\n      sourceEntry: artifact,\n      source: \"artifact\",\n      field: artifactField,\n      allowLocal: true,\n    };\n  }\n\n  if (workspaceValue) {\n    return {\n      value: workspaceValue,\n      targetKind,\n      sourceEntry: null,\n      source: \"workspace-default\",\n      field: `defaults.${targetKind}`,\n      allowLocal: false,\n    };\n  }\n\n  return null;\n}\n\nfunction chooseMappingReference(options) {\n  if (options.artifactValue) {\n    return {\n      value: options.artifactValue,\n      targetKind: options.targetKind,\n      sourceEntry: options.artifact,\n      source: \"artifact-override\",\n      field: options.field,\n      allowLocal: true,\n    };\n  }\n\n  if (options.presetValue && options.presetEntry) {\n    return {\n      value: options.presetValue,\n      targetKind: options.targetKind,\n      sourceEntry: options.presetEntry,\n      source: \"preset\",\n      field: options.presetField,\n      allowLocal: false,\n    };\n  }\n\n  return null;\n}\n\nfunction resolveMappingSet(options) {\n  const selections = {};\n  const presetValues = options.presetValues ?? {};\n  const artifactValues = options.artifactValues ?? {};\n  const slots = new Set([\n    ...Object.keys(presetValues),\n    ...Object.keys(artifactValues),\n  ]);\n\n  for (const slot of slots) {\n    const choice = chooseMappingReference({\n      presetEntry: options.presetEntry,\n      presetValue: presetValues[slot],\n      artifact: options.artifact,\n      artifactValue: artifactValues[slot],\n      targetKind: options.targetKind,\n      field: `${options.artifactField}.${slot}`,\n      presetField: `${options.presetField}.${slot}`,\n    });\n\n    const selection = resolveSelection(\n      options.scan,\n      options.artifact,\n      choice,\n      options.issues,\n    );\n\n    if (selection) {\n      validateSlot(slot, selection.entry, options.issues, choice);\n      selections[slot] = selection;\n    }\n  }\n\n  return selections;\n}\n\nfunction resolveAssetMappings(options) {\n  const selections = {};\n  const sources = [\n    {\n      values: options.themeEntry?.manifest.assets ?? {},\n      sourceEntry: options.themeEntry,\n      source: \"theme\",\n      field: \"assets\",\n      allowLocal: false,\n    },\n    {\n      values:\n        options.presetEntry?.manifest.mappings?.assets ?? {},\n      sourceEntry: options.presetEntry,\n      source: \"preset\",\n      field: \"mappings.assets\",\n      allowLocal: false,\n    },\n    {\n      values: options.artifactValues ?? {},\n      sourceEntry: options.artifact,\n      source: \"artifact-override\",\n      field: \"appearance.overrides.assets\",\n      allowLocal: true,\n    },\n  ];\n\n  for (const source of sources) {\n    for (const [slot, value] of Object.entries(source.values)) {\n      selections[slot] = resolveSelection(\n        options.scan,\n        options.artifact,\n        {\n          value,\n          targetKind: \"asset\",\n          sourceEntry: source.sourceEntry,\n          source: source.source,\n          field: `${source.field}.${slot}`,\n          allowLocal: source.allowLocal,\n        },\n        options.issues,\n      );\n    }\n  }\n\n  return selections;\n}\n\nfunction resolveSelection(scan, artifact, choice, issues) {\n  if (!choice?.value) return null;\n\n  const sourceEntry =\n    choice.allowLocal === false\n      ? withoutArtifactLocalContext(choice.sourceEntry)\n      : choice.sourceEntry;\n  const candidates = findReferenceCandidates(\n    scan.entries,\n    choice.targetKind,\n    choice.value,\n    {\n      sourceEntry,\n    },\n  );\n\n  if (candidates.length === 0) {\n    issues.push({\n      severity: \"error\",\n      code: \"APPEARANCE_REFERENCE_UNRESOLVED\",\n      message: `${choice.field} references missing ${choice.targetKind}:${choice.value}.`,\n      artifactId: artifact.id,\n      field: choice.field,\n      targetKind: choice.targetKind,\n      reference: choice.value,\n    });\n    return {\n      ...choice,\n      entry: null,\n    };\n  }\n\n  if (candidates.length > 1) {\n    issues.push({\n      severity: \"error\",\n      code: \"APPEARANCE_REFERENCE_AMBIGUOUS\",\n      message: `${choice.field} references ambiguous ${choice.targetKind}:${choice.value}.`,\n      artifactId: artifact.id,\n      field: choice.field,\n      targetKind: choice.targetKind,\n      reference: choice.value,\n      candidateManifestPaths: candidates.map(\n        (candidate) => candidate.manifestPath,\n      ),\n    });\n    return {\n      ...choice,\n      entry: null,\n    };\n  }\n\n  return {\n    ...choice,\n    entry: candidates[0],\n  };\n}\n\nfunction withoutArtifactLocalContext(entry) {\n  if (!entry || entry.category !== \"artifact\") return entry;\n\n  return {\n    ...entry,\n    category: \"workspace\",\n  };\n}\n\nfunction visitDependencies(entry, state) {\n  if (state.visited.has(entry.manifestPath)) return;\n\n  if (state.visiting.has(entry.manifestPath)) {\n    state.issues.push({\n      severity: \"error\",\n      code: \"DEPENDENCY_CYCLE\",\n      message: `Dependency cycle detected at ${entry.kind}:${entry.id}.`,\n      artifactId: state.artifact.id,\n      manifestPath: entry.manifestPath,\n    });\n    return;\n  }\n\n  state.visiting.add(entry.manifestPath);\n  validateThemeCompatibility(\n    state.scan,\n    entry,\n    state.selectedTheme,\n    state.issues,\n  );\n\n  const dependencyGroups = [\n    [\"primitive\", entry.manifest.dependencies?.primitives ?? {}],\n    [\"component\", entry.manifest.dependencies?.components ?? {}],\n    [\"asset\", entry.manifest.dependencies?.assets ?? {}],\n  ];\n\n  for (const [targetKind, mappings] of dependencyGroups) {\n    for (const [slot, value] of Object.entries(mappings)) {\n      const choice = {\n        value,\n        targetKind,\n        sourceEntry: entry,\n        source: \"dependency\",\n        field: `dependencies.${targetKind}s.${slot}`,\n        allowLocal: entry.level === \"local\",\n      };\n      const selection = resolveSelection(\n        state.scan,\n        state.artifact,\n        choice,\n        state.issues,\n      );\n\n      if (!selection?.entry) continue;\n\n      validateSlot(slot, selection.entry, state.issues, choice);\n      state.selectedEntries.set(\n        selection.entry.manifestPath,\n        selection.entry,\n      );\n      state.edges.push({\n        source: publicEntry(entry),\n        target: publicEntry(selection.entry),\n        field: choice.field,\n        reference: value,\n      });\n\n      if (UI_KINDS.has(selection.entry.kind)) {\n        visitDependencies(selection.entry, state);\n      }\n    }\n  }\n\n  state.visiting.delete(entry.manifestPath);\n  state.visited.add(entry.manifestPath);\n}\n\nfunction validatePresetTheme(scan, preset, theme, issues) {\n  if (!preset || !theme) return;\n\n  const supported = preset.manifest.supportedThemes ?? [];\n  if (supported.length === 0) return;\n\n  if (!referencesEntry(scan, preset, \"theme\", supported, theme)) {\n    issues.push({\n      severity: \"error\",\n      code: \"PRESET_THEME_INCOMPATIBLE\",\n      message: `Preset ${preset.id} does not support theme ${theme.id}.`,\n      presetId: preset.id,\n      themeId: theme.id,\n    });\n  }\n}\n\nfunction validateThemeCompatibility(scan, entry, theme, issues) {\n  if (!theme) return;\n\n  const supported = entry.manifest.supportedThemes ?? [];\n  if (supported.length === 0) return;\n\n  if (!referencesEntry(scan, entry, \"theme\", supported, theme)) {\n    issues.push({\n      severity: \"error\",\n      code: \"UI_THEME_INCOMPATIBLE\",\n      message: `${entry.kind}:${entry.id} does not support theme ${theme.id}.`,\n      manifestPath: entry.manifestPath,\n      themeId: theme.id,\n    });\n  }\n}\n\nfunction referencesEntry(\n  scan,\n  sourceEntry,\n  targetKind,\n  references,\n  expectedEntry,\n) {\n  return references.some((value) => {\n    const candidates = findReferenceCandidates(\n      scan.entries,\n      targetKind,\n      value,\n      { sourceEntry },\n    );\n\n    return candidates.some(\n      (candidate) =>\n        candidate.manifestPath === expectedEntry.manifestPath,\n    );\n  });\n}\n\nfunction validateSlot(slot, entry, issues, choice) {\n  if (!entry || entry.kind === \"asset\") return;\n\n  const declared = entry.manifest.slot;\n  if (declared && declared !== slot) {\n    issues.push({\n      severity: \"error\",\n      code: \"UI_SLOT_MISMATCH\",\n      message: `${choice.field} maps slot ${slot} to ${entry.kind}:${entry.id}, which declares slot ${declared}.`,\n      field: choice.field,\n      slot,\n      declaredSlot: declared,\n      manifestPath: entry.manifestPath,\n    });\n  }\n}\n\nfunction publicSelection(selection) {\n  if (!selection) return null;\n\n  return {\n    reference: selection.value,\n    source: selection.source,\n    field: selection.field,\n    resolved: Boolean(selection.entry),\n    entry: selection.entry\n      ? publicEntry(selection.entry)\n      : null,\n  };\n}\n\nfunction publicSelectionMap(values) {\n  return Object.fromEntries(\n    Object.entries(values).map(([slot, selection]) => [\n      slot,\n      publicSelection(selection),\n    ]),\n  );\n}\n\nfunction publicEntry(entry) {\n  return {\n    id: entry.id,\n    kind: entry.kind,\n    category: entry.category,\n    title: entry.title,\n    level: entry.level,\n    collection: entry.collection,\n    ownerArtifact: entry.ownerArtifact,\n    contractVersion:\n      entry.manifest.contractVersion ?? null,\n    slot: entry.manifest.slot ?? null,\n    displayPath: entry.displayPath,\n    manifestPath: entry.manifestPath,\n  };\n}\n\nfunction comparePublicEntries(left, right) {\n  return (\n    left.kind.localeCompare(right.kind, \"en\") ||\n    left.id.localeCompare(right.id, \"en\") ||\n    left.displayPath.localeCompare(right.displayPath, \"en\")\n  );\n}\n\nfunction compareEdges(left, right) {\n  return (\n    left.source.kind.localeCompare(right.source.kind, \"en\") ||\n    left.source.id.localeCompare(right.source.id, \"en\") ||\n    left.field.localeCompare(right.field, \"en\")\n  );\n}\n\nfunction compareIssues(left, right) {\n  const order = { error: 0, warning: 1 };\n\n  return (\n    (order[left.severity] ?? 9) -\n      (order[right.severity] ?? 9) ||\n    left.code.localeCompare(right.code, \"en\") ||\n    left.message.localeCompare(right.message, \"en\")\n  );\n}\n"}, "src/resolution/README.md": {"content": "# Appearance and dependency resolution\n\nResolution turns declarative manifests into one explicit effective appearance.\n\n## Precedence\n\n```text\nworkspace default\n    ↓\nartefact theme / preset choice\n    ↓\npreset layout, component, primitive and asset mappings\n    ↓\ntheme asset mappings\n    ↓\nartefact overrides\n    ↓\nrecursive UI dependencies\n```\n\nLater layers override earlier mappings for the same slot.\n\n## Reference scope\n\nQualified references are explicit:\n\n```text\ncore/metric-card\nexecutive-reporting/status-card\nlocal/risk-summary\n```\n\nUnqualified references resolve in this order:\n\n1. a local resource owned by the current artefact;\n2. Core;\n3. the source resource's own collection;\n4. a unique remaining Collection match.\n\nAmbiguous Collection matches are errors.\n\nWorkspace defaults and shared presets cannot resolve artefact-local resources.\nLocal UI may depend on resources owned by the same artefact.\n\n## Validation\n\nResolution reports:\n\n- missing and ambiguous references;\n- preset/theme incompatibility;\n- UI/theme incompatibility;\n- slot mismatches;\n- dependency cycles;\n- complete dependency closure.\n\nNo source files are executed during resolution.\n"}, "tests/unit/resolution.test.mjs": {"content": "import assert from \"node:assert/strict\";\nimport {\n  cp,\n  mkdir,\n  readFile,\n  rm,\n  writeFile,\n} from \"node:fs/promises\";\nimport { dirname, resolve } from \"node:path\";\nimport { fileURLToPath } from \"node:url\";\nimport test from \"node:test\";\nimport { scanWorkspaceLibrary } from \"../../src/library/scan.mjs\";\nimport { findArtifact } from \"../../src/resolution/find-artifact.mjs\";\nimport {\n  resolveArtifactAppearance,\n} from \"../../src/resolution/resolve.mjs\";\n\nconst testDirectory = dirname(fileURLToPath(import.meta.url));\nconst fixtureRoot = resolve(\n  testDirectory,\n  \"../fixtures/resolution-workspace\",\n);\n\ntest(\"scanner discovers artefact-local resources without shared duplicate errors\", async () => {\n  const scan = await scanWorkspaceLibrary(fixtureRoot);\n  const local = scan.entries.find(\n    (entry) =>\n      entry.kind === \"component\" &&\n      entry.level === \"local\",\n  );\n\n  assert.equal(scan.summary.errorCount, 0);\n  assert.equal(scan.summary.entryCount, 8);\n  assert.equal(local.id, \"metric-card\");\n  assert.equal(local.ownerArtifact, \"use-case-pipeline\");\n});\n\ntest(\"appearance resolution applies local, Core and preset precedence\", async () => {\n  const scan = await scanWorkspaceLibrary(fixtureRoot);\n  const artifact = findArtifact(\n    scan,\n    \"use-case-pipeline\",\n    \"dashboard\",\n  );\n  const result = resolveArtifactAppearance(scan, artifact);\n\n  assert.equal(result.summary.valid, true);\n  assert.equal(result.selections.theme.entry.id, \"hsbc-light\");\n  assert.equal(result.selections.theme.source, \"artifact\");\n  assert.equal(result.selections.preset.entry.id, \"default\");\n  assert.equal(result.selections.layout.entry.id, \"dashboard-grid\");\n  assert.equal(\n    result.selections.components[\"metric-summary\"].entry.level,\n    \"local\",\n  );\n  assert.equal(\n    result.selections.components[\"metric-summary\"].entry.ownerArtifact,\n    \"use-case-pipeline\",\n  );\n  assert.equal(\n    result.selections.primitives.button.entry.level,\n    \"core\",\n  );\n  assert.equal(\n    result.selections.assets[\"brand-logo\"].entry.id,\n    \"hsbc-red\",\n  );\n});\n\ntest(\"dependency closure includes transitive Core dependencies\", async () => {\n  const scan = await scanWorkspaceLibrary(fixtureRoot);\n  const artifact = findArtifact(scan, \"use-case-pipeline\");\n  const result = resolveArtifactAppearance(scan, artifact);\n\n  assert.equal(\n    result.dependencyClosure.some(\n      (entry) =>\n        entry.kind === \"primitive\" &&\n        entry.id === \"button\",\n    ),\n    true,\n  );\n  assert.equal(\n    result.edges.some(\n      (edge) =>\n        edge.source.kind === \"component\" &&\n        edge.target.kind === \"primitive\",\n    ),\n    true,\n  );\n});\n\ntest(\"preset and theme incompatibility is reported\", async () => {\n  const root = resolve(fixtureRoot, \".tmp-theme-test\");\n  await rm(root, { recursive: true, force: true });\n  await cp(fixtureRoot, root, {\n    recursive: true,\n    filter(path) {\n      return !path.includes(\".tmp-theme-test\");\n    },\n  });\n\n  try {\n    const darkDirectory = resolve(\n      root,\n      \"library/themes/core/hsbc-dark\",\n    );\n    await mkdir(darkDirectory, { recursive: true });\n    await writeFile(\n      resolve(darkDirectory, \"theme.json\"),\n      `${JSON.stringify(\n        {\n          schemaVersion: 1,\n          kind: \"theme\",\n          id: \"hsbc-dark\",\n          name: \"HSBC Dark\",\n          level: \"core\",\n          tokens: {\n            \"colour-background\": \"#111111\",\n          },\n        },\n        null,\n        2,\n      )}\\n`,\n    );\n\n    const artifactPath = resolve(\n      root,\n      \"library/dashboards/use-case-pipeline/artifact.json\",\n    );\n    const artifact = JSON.parse(\n      await readFile(artifactPath, \"utf8\"),\n    );\n    artifact.appearance.theme = \"hsbc-dark\";\n    await writeFile(\n      artifactPath,\n      `${JSON.stringify(artifact, null, 2)}\\n`,\n    );\n\n    const scan = await scanWorkspaceLibrary(root);\n    const target = findArtifact(scan, \"use-case-pipeline\");\n    const result = resolveArtifactAppearance(scan, target);\n    const codes = new Set(\n      result.issues.map((issue) => issue.code),\n    );\n\n    assert.equal(result.summary.valid, false);\n    assert.equal(codes.has(\"PRESET_THEME_INCOMPATIBLE\"), true);\n    assert.equal(codes.has(\"UI_THEME_INCOMPATIBLE\"), true);\n  } finally {\n    await rm(root, { recursive: true, force: true });\n  }\n});\n"}, "tests/integration/appearance-cli.test.mjs": {"content": "import assert from \"node:assert/strict\";\nimport { dirname, resolve } from \"node:path\";\nimport { fileURLToPath } from \"node:url\";\nimport { spawnSync } from \"node:child_process\";\nimport test from \"node:test\";\n\nconst testDirectory = dirname(fileURLToPath(import.meta.url));\nconst projectRoot = resolve(testDirectory, \"../..\");\nconst workspace = resolve(\n  projectRoot,\n  \"tests\",\n  \"fixtures\",\n  \"resolution-workspace\",\n);\nconst cliPath = resolve(projectRoot, \"bin\", \"mydash.mjs\");\n\nfunction runCli(args) {\n  return spawnSync(process.execPath, [cliPath, ...args], {\n    cwd: projectRoot,\n    encoding: \"utf8\",\n    stdio: \"pipe\",\n    shell: false,\n  });\n}\n\ntest(\"appearance resolve returns explicit effective selections\", () => {\n  const result = runCli([\n    \"appearance\",\n    \"resolve\",\n    \"use-case-pipeline\",\n    \"--kind\",\n    \"dashboard\",\n    \"--workspace\",\n    workspace,\n    \"--json\",\n  ]);\n\n  assert.equal(result.status, 0, result.stderr);\n  const body = JSON.parse(result.stdout);\n  assert.equal(body.command, \"appearance resolve\");\n  assert.equal(\n    body.data.selections.components[\"metric-summary\"].entry.level,\n    \"local\",\n  );\n});\n\ntest(\"appearance validate resolves every artefact\", () => {\n  const result = runCli([\n    \"appearance\",\n    \"validate\",\n    \"--workspace\",\n    workspace,\n    \"--json\",\n  ]);\n\n  assert.equal(result.status, 0, result.stderr);\n  const body = JSON.parse(result.stdout);\n  assert.equal(body.data.summary.artifactCount, 1);\n  assert.equal(body.data.summary.invalidArtifactCount, 0);\n});\n"}, "scripts/tasks/test-resolution.mjs": {"content": "#!/usr/bin/env node\n\nimport { spawnSync } from \"node:child_process\";\nimport { dirname, resolve } from \"node:path\";\nimport { fileURLToPath } from \"node:url\";\nimport process from \"node:process\";\n\nconst scriptDirectory = dirname(fileURLToPath(import.meta.url));\nconst projectRoot = resolve(scriptDirectory, \"../..\");\n\nconst tests = [\n  resolve(projectRoot, \"tests\", \"unit\", \"resolution.test.mjs\"),\n  resolve(projectRoot, \"tests\", \"integration\", \"appearance-cli.test.mjs\"),\n];\n\nconst result = spawnSync(\n  process.execPath,\n  [\"--test\", ...tests],\n  {\n    cwd: projectRoot,\n    stdio: \"inherit\",\n    shell: false,\n  },\n);\n\nif (result.error) throw result.error;\nprocess.exitCode = result.status ?? 1;\n"}, "tests/fixtures/resolution-workspace/package.json": {"content": "{\n  \"name\": \"library-fixture\",\n  \"version\": \"0.1.0\",\n  \"private\": true,\n  \"type\": \"module\"\n}\n"}, "tests/fixtures/resolution-workspace/config/workspace.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"id\": \"library-fixture\",\n  \"name\": \"Library Fixture\",\n  \"libraryRoots\": {\n    \"dashboards\": \"library/dashboards\",\n    \"presentations\": \"library/presentations\",\n    \"concepts\": \"library/concepts\",\n    \"primitives\": \"library/ui/primitives\",\n    \"components\": \"library/ui/components\",\n    \"layouts\": \"library/ui/layouts\",\n    \"themes\": \"library/themes\",\n    \"presets\": \"library/presets\",\n    \"assets\": \"library/assets\"\n  },\n  \"defaults\": {\n    \"theme\": \"hsbc-light\",\n    \"preset\": \"default\"\n  },\n  \"preview\": {\n    \"host\": \"127.0.0.1\",\n    \"port\": 4173\n  },\n  \"export\": {\n    \"outputDirectory\": \"exports\"\n  }\n}\n"}, "tests/fixtures/resolution-workspace/library/dashboards/use-case-pipeline/artifact.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"dashboard\",\n  \"id\": \"use-case-pipeline\",\n  \"title\": \"Use Case Pipeline\",\n  \"entry\": \"src/index.html\",\n  \"appearance\": {\n    \"theme\": \"hsbc-light\",\n    \"preset\": \"default\",\n    \"overrides\": {\n      \"layout\": null,\n      \"components\": {\n        \"metric-summary\": \"metric-card\"\n      },\n      \"primitives\": {},\n      \"assets\": {}\n    }\n  }\n}\n"}, "tests/fixtures/resolution-workspace/library/themes/core/hsbc-light/theme.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"theme\",\n  \"id\": \"hsbc-light\",\n  \"name\": \"HSBC Light\",\n  \"level\": \"core\",\n  \"tokens\": {\n    \"colour-primary\": \"#db0011\",\n    \"colour-background\": \"#ffffff\"\n  },\n  \"assets\": {\n    \"brand-logo\": \"hsbc-red\"\n  }\n}\n"}, "tests/fixtures/resolution-workspace/library/presets/core/default/preset.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"preset\",\n  \"id\": \"default\",\n  \"name\": \"Default\",\n  \"level\": \"core\",\n  \"mappings\": {\n    \"layout\": \"dashboard-grid\",\n    \"components\": {\n      \"metric-summary\": \"metric-card\"\n    },\n    \"primitives\": {\n      \"button\": \"button\"\n    },\n    \"assets\": {\n      \"brand-logo\": \"hsbc-red\"\n    }\n  },\n  \"supportedThemes\": [\n    \"hsbc-light\"\n  ]\n}\n"}, "tests/fixtures/resolution-workspace/library/ui/layouts/core/dashboard-grid/ui.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"layout\",\n  \"id\": \"dashboard-grid\",\n  \"name\": \"Dashboard Grid\",\n  \"level\": \"core\",\n  \"slot\": \"page-layout\",\n  \"contractVersion\": 1,\n  \"entry\": \"layout.js\",\n  \"supportedThemes\": [\n    \"hsbc-light\"\n  ]\n}\n"}, "tests/fixtures/resolution-workspace/library/ui/components/core/metric-card/ui.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"component\",\n  \"id\": \"metric-card\",\n  \"name\": \"Metric Card\",\n  \"level\": \"core\",\n  \"slot\": \"metric-summary\",\n  \"contractVersion\": 1,\n  \"entry\": \"component.js\",\n  \"dependencies\": {\n    \"primitives\": {\n      \"button\": \"button\"\n    },\n    \"components\": {},\n    \"assets\": {}\n  },\n  \"supportedThemes\": [\n    \"hsbc-light\"\n  ]\n}\n"}, "tests/fixtures/resolution-workspace/library/ui/primitives/core/button/ui.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"primitive\",\n  \"id\": \"button\",\n  \"name\": \"Button\",\n  \"level\": \"core\",\n  \"slot\": \"button\",\n  \"contractVersion\": 1,\n  \"entry\": \"primitive.js\",\n  \"supportedThemes\": [\n    \"hsbc-light\"\n  ]\n}\n"}, "tests/fixtures/resolution-workspace/library/assets/core/hsbc-red/asset.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"asset\",\n  \"id\": \"hsbc-red\",\n  \"name\": \"HSBC Red Logo\",\n  \"level\": \"core\",\n  \"file\": \"hsbc-red.svg\",\n  \"mediaType\": \"image/svg+xml\",\n  \"category\": \"logo\",\n  \"usage\": \"Use on light backgrounds.\",\n  \"approved\": true\n}\n"}, "tests/fixtures/resolution-workspace/library/presentations/.gitkeep": {"content": ""}, "tests/fixtures/resolution-workspace/library/concepts/.gitkeep": {"content": ""}, "tests/fixtures/resolution-workspace/library/ui/primitives/collections/.gitkeep": {"content": ""}, "tests/fixtures/resolution-workspace/library/ui/components/collections/.gitkeep": {"content": ""}, "tests/fixtures/resolution-workspace/library/ui/layouts/collections/.gitkeep": {"content": ""}, "tests/fixtures/resolution-workspace/library/themes/collections/.gitkeep": {"content": ""}, "tests/fixtures/resolution-workspace/library/presets/collections/.gitkeep": {"content": ""}, "tests/fixtures/resolution-workspace/library/assets/collections/.gitkeep": {"content": ""}, "tests/fixtures/resolution-workspace/library/dashboards/use-case-pipeline/ui/components/metric-card/ui.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"component\",\n  \"id\": \"metric-card\",\n  \"name\": \"Local Metric Card\",\n  \"level\": \"local\",\n  \"ownerArtifact\": \"use-case-pipeline\",\n  \"slot\": \"metric-summary\",\n  \"contractVersion\": 1,\n  \"entry\": \"component.js\",\n  \"dependencies\": {\n    \"primitives\": {\n      \"button\": \"button\"\n    },\n    \"components\": {},\n    \"assets\": {}\n  },\n  \"supportedThemes\": [\n    \"hsbc-light\"\n  ]\n}\n"}};

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
      "Bootstrap 09 must run from the root of the My Dashboards Git repository.",
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
    relativePath: "src/resolution/.gitkeep",
    expectedContent:
      "# Intentionally retained\n\n" +
      "Theme, preset, UI and asset resolution services will live here.\n\n" +
      "Implementation is added by a later bootstrap step.\n",
    dirtyBefore,
    repoRoot,
  });

  if (removed) {
    ownedAbsolutePaths.push(
      join(targetRoot, "src", "resolution", ".gitkeep"),
    );
  }

  await validateGeneratedState();

  const expectedSelfPath = join(
    targetRoot,
    "scripts",
    "09-build-appearance-resolution.mjs",
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
        "Appearance resolution was created and validated, but --no-commit disabled the Git checkpoint.",
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
My Dashboards — Bootstrap 09

Usage:
  node scripts/09-build-appearance-resolution.mjs [options]

Options:
  --target <path>  Build resolution in a specific repository root.
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
    "src/library/scan.mjs",
    "src/library/references.mjs",
    "src/library/consumers.mjs",
    "src/resolution",
    "scripts/tasks/test-library.mjs",
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
        "Bootstrap 08 has not been completed.",
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
        "package.json had pre-existing changes, so the resolution test command was not added automatically.",
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
  value.scripts["test:resolution"] =
    value.scripts["test:resolution"] ??
    "node scripts/tasks/test-resolution.mjs";

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
        "The appearance resolution layer was calculated without writing it.",
    });
    return;
  }

  const modulePaths = [
    "cli/registry.mjs",
    "cli/commands/appearance.mjs",
    "src/library/scan.mjs",
    "src/library/references.mjs",
    "src/library/local-resources.mjs",
    "src/resolution/find-artifact.mjs",
    "src/resolution/resolve.mjs",
    "tests/unit/resolution.test.mjs",
    "tests/integration/appearance-cli.test.mjs",
    "scripts/tasks/test-resolution.mjs",
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
      `${modulePaths.length} resolution and CLI modules passed Node syntax checks.`,
  });

  const tests = run(
    process.execPath,
    [join(targetRoot, "scripts", "tasks", "test-resolution.mjs")],
    { cwd: targetRoot, allowFailure: true },
  );

  if (tests.status !== 0) {
    throw new Error(
      `Appearance resolution tests failed:\n${
        tests.stderr || tests.stdout
      }`,
    );
  }

  report.validation.push({
    check: "resolution-tests",
    ok: true,
    message:
      "Local scope, precedence, dependency closure and compatibility tests passed.",
  });

  const realValidation = run(
    process.execPath,
    [
      join(targetRoot, "bin", "mydash.mjs"),
      "appearance",
      "validate",
      "--json",
    ],
    { cwd: targetRoot, allowFailure: true },
  );

  if (realValidation.status !== 0) {
    throw new Error(
      `The real workspace appearance validation failed:\n${
        realValidation.stderr || realValidation.stdout
      }`,
    );
  }

  report.validation.push({
    check: "workspace-resolution",
    ok: true,
    message:
      "The repository's current artefacts resolve without appearance errors.",
  });

  for (const task of [
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
      "Library, data, Office, filesystem, CLI and contract validation still pass.",
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
        "Appearance resolution was already present; there were no task-owned changes to commit.",
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
        "Appearance resolution was created and validated, but no commit was made because Git user.name or user.email is missing.",
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

  console.log("\nMy Dashboards — appearance resolution\n");
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
