#!/usr/bin/env node

/**
 * My Dashboards — Bootstrap 08: Build library discovery
 *
 * Adds filesystem-native discovery and diagnostics:
 *
 *   mydash library scan
 *   mydash library list
 *   mydash library inspect
 *   mydash library diagnostics
 *   mydash library consumers
 *
 * The scanner validates manifests, detects duplicate identifiers, checks
 * lifecycle placement, resolves references and builds a reverse-consumer graph.
 *
 * Usage:
 *   node scripts/08-build-library-discovery.mjs
 *   node scripts/08-build-library-discovery.mjs --dry-run
 *   node scripts/08-build-library-discovery.mjs --no-commit
 *   node scripts/08-build-library-discovery.mjs --no-push
 *   node scripts/08-build-library-discovery.mjs --json
 *   node scripts/08-build-library-discovery.mjs --target /path/to/my-dashboards
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

const SCRIPT_NAME = "08-build-library-discovery";
const COMMIT_MESSAGE = "Add filesystem library discovery";
const MIN_NODE_MAJOR = 20;
const FILES = {"cli/registry.mjs": {"content": "import { helpCommand } from \"./commands/help.mjs\";\nimport { versionCommand } from \"./commands/version.mjs\";\nimport { doctorCommand } from \"./commands/doctor.mjs\";\nimport { inspectCommand } from \"./commands/inspect.mjs\";\nimport { fileCommand } from \"./commands/file.mjs\";\nimport { excelCommand } from \"./commands/excel.mjs\";\nimport { powerpointCommand } from \"./commands/powerpoint.mjs\";\nimport { dataCommand } from \"./commands/data.mjs\";\nimport { libraryCommand } from \"./commands/library.mjs\";\n\nconst commands = [\n  helpCommand,\n  versionCommand,\n  doctorCommand,\n  inspectCommand,\n  fileCommand,\n  excelCommand,\n  powerpointCommand,\n  dataCommand,\n  libraryCommand,\n];\n\nconst commandMap = new Map(\n  commands.map((command) => [command.name, command]),\n);\n\nexport const commandRegistry = {\n  get(name) {\n    return commandMap.get(name) ?? null;\n  },\n\n  list() {\n    return [...commands];\n  },\n\n  names() {\n    return commands.map((command) => command.name);\n  },\n};\n", "allowedPrevious": ["import { helpCommand } from \"./commands/help.mjs\";\nimport { versionCommand } from \"./commands/version.mjs\";\nimport { doctorCommand } from \"./commands/doctor.mjs\";\nimport { inspectCommand } from \"./commands/inspect.mjs\";\nimport { fileCommand } from \"./commands/file.mjs\";\nimport { excelCommand } from \"./commands/excel.mjs\";\nimport { powerpointCommand } from \"./commands/powerpoint.mjs\";\nimport { dataCommand } from \"./commands/data.mjs\";\n\nconst commands = [\n  helpCommand,\n  versionCommand,\n  doctorCommand,\n  inspectCommand,\n  fileCommand,\n  excelCommand,\n  powerpointCommand,\n  dataCommand,\n];\n\nconst commandMap = new Map(\n  commands.map((command) => [command.name, command]),\n);\n\nexport const commandRegistry = {\n  get(name) {\n    return commandMap.get(name) ?? null;\n  },\n\n  list() {\n    return [...commands];\n  },\n\n  names() {\n    return commands.map((command) => command.name);\n  },\n};\n"]}, "cli/commands/library.mjs": {"content": "import {\n  parseCommandArguments,\n  requirePositionals,\n} from \"../command-options.mjs\";\nimport { CliError, EXIT_USAGE, EXIT_VALIDATION } from \"../errors.mjs\";\nimport { findWorkspaceRoot } from \"../../src/workspace/find-root.mjs\";\nimport {\n  findLibraryEntries,\n  scanWorkspaceLibrary,\n} from \"../../src/library/scan.mjs\";\nimport {\n  buildConsumerGraph,\n  consumersForEntry,\n} from \"../../src/library/consumers.mjs\";\n\nconst SUBCOMMANDS = new Set([\n  \"scan\",\n  \"list\",\n  \"inspect\",\n  \"diagnostics\",\n  \"consumers\",\n]);\n\nexport const libraryCommand = {\n  name: \"library\",\n  summary: \"Discover and diagnose artefacts and reusable library resources.\",\n  usage: \"mydash library <subcommand> [arguments] [options]\",\n  options: [\n    \"scan                          Scan all configured library roots.\",\n    \"list                          List discovered entries.\",\n    \"inspect <id>                  Inspect one manifest and its consumers.\",\n    \"diagnostics                   Show validation and reference problems.\",\n    \"consumers <id>                Show reverse consumers of a resource.\",\n    \"--kind <kind>                 Filter or disambiguate by kind.\",\n    \"--level <level>               Filter by local, collection or core.\",\n    \"--collection <id>             Filter by collection.\",\n    \"--workspace <path>            Scan a specific workspace.\",\n    \"--json                        Return structured JSON.\",\n  ],\n\n  async run(invocation, context) {\n    const [subcommand, ...rest] = invocation.args;\n\n    if (!SUBCOMMANDS.has(subcommand)) {\n      throw new CliError(\n        \"UNKNOWN_LIBRARY_SUBCOMMAND\",\n        subcommand\n          ? `Unknown library subcommand: ${subcommand}`\n          : \"A library subcommand is required.\",\n        {\n          exitCode: EXIT_USAGE,\n          details: {\n            availableSubcommands: [...SUBCOMMANDS],\n          },\n          hint:\n            \"Run mydash help library to see available library operations.\",\n        },\n      );\n    }\n\n    const workspaceRoot = await findWorkspaceRoot(\n      invocation.options.workspace ?? context.cwd,\n    );\n\n    if (!workspaceRoot) {\n      throw new CliError(\n        \"WORKSPACE_NOT_FOUND\",\n        \"No My Dashboards workspace was found.\",\n        { exitCode: EXIT_USAGE },\n      );\n    }\n\n    switch (subcommand) {\n      case \"scan\":\n        return runScan(rest, workspaceRoot);\n      case \"list\":\n        return runList(rest, workspaceRoot);\n      case \"inspect\":\n        return runInspect(rest, workspaceRoot);\n      case \"diagnostics\":\n        return runDiagnostics(rest, workspaceRoot);\n      case \"consumers\":\n        return runConsumers(rest, workspaceRoot);\n      default:\n        throw new Error(\"Unreachable library subcommand.\");\n    }\n  },\n};\n\nasync function runScan(args, workspaceRoot) {\n  const parsed = parseCommandArguments(args);\n  rejectPositionals(parsed.positionals, \"mydash library scan\");\n  const scan = await scanWorkspaceLibrary(workspaceRoot);\n\n  return {\n    ok: scan.summary.errorCount === 0,\n    command: \"library scan\",\n    data: serialiseScan(scan),\n    warnings: issuesAsWarnings(scan.issues),\n    exitCode:\n      scan.summary.errorCount === 0 ? 0 : EXIT_VALIDATION,\n    text: renderSummary(scan),\n  };\n}\n\nasync function runList(args, workspaceRoot) {\n  const parsed = parseCommandArguments(args, {\n    values: [\"kind\", \"level\", \"collection\"],\n  });\n  rejectPositionals(parsed.positionals, \"mydash library list\");\n\n  const scan = await scanWorkspaceLibrary(workspaceRoot);\n  const entries = findLibraryEntries(scan.entries, {\n    kind: parsed.options.kind,\n    level: parsed.options.level,\n    collection: parsed.options.collection,\n  });\n\n  return {\n    ok: true,\n    command: \"library list\",\n    data: {\n      filters: parsed.options,\n      entries: entries.map(publicEntry),\n      issueSummary: scan.summary,\n    },\n    warnings: issuesAsWarnings(scan.issues),\n    text:\n      entries.length > 0\n        ? entries\n            .map(\n              (entry) =>\n                `${entry.kind.padEnd(12)} ${entry.id.padEnd(28)} ${entry.displayPath}`,\n            )\n            .join(\"\\n\")\n        : \"No matching library entries found.\",\n  };\n}\n\nasync function runInspect(args, workspaceRoot) {\n  const parsed = parseCommandArguments(args, {\n    values: [\"kind\"],\n  });\n  requirePositionals(\n    parsed.positionals,\n    1,\n    \"mydash library inspect <id> [--kind <kind>]\",\n  );\n\n  const scan = await scanWorkspaceLibrary(workspaceRoot);\n  const entry = requireUniqueEntry(\n    scan.entries,\n    parsed.positionals[0],\n    parsed.options.kind,\n  );\n  const graph = buildConsumerGraph(scan);\n  const consumers = consumersForEntry(entry, graph);\n\n  return {\n    ok: true,\n    command: \"library inspect\",\n    data: {\n      entry: publicEntry(entry, true),\n      consumers,\n      relatedIssues: scan.issues.filter(\n        (issue) =>\n          issue.manifestPath === entry.manifestPath ||\n          issue.targetManifestPath === entry.manifestPath,\n      ),\n    },\n    warnings: issuesAsWarnings(scan.issues),\n    text: renderInspection(entry, consumers),\n  };\n}\n\nasync function runDiagnostics(args, workspaceRoot) {\n  const parsed = parseCommandArguments(args, {\n    values: [\"severity\", \"code\"],\n  });\n  rejectPositionals(\n    parsed.positionals,\n    \"mydash library diagnostics\",\n  );\n\n  const scan = await scanWorkspaceLibrary(workspaceRoot);\n  const issues = scan.issues.filter((issue) => {\n    if (\n      parsed.options.severity &&\n      issue.severity !== parsed.options.severity\n    ) {\n      return false;\n    }\n\n    if (\n      parsed.options.code &&\n      issue.code !== parsed.options.code\n    ) {\n      return false;\n    }\n\n    return true;\n  });\n\n  return {\n    ok: scan.summary.errorCount === 0,\n    command: \"library diagnostics\",\n    data: {\n      summary: scan.summary,\n      issues,\n    },\n    exitCode:\n      scan.summary.errorCount === 0 ? 0 : EXIT_VALIDATION,\n    text:\n      issues.length > 0\n        ? issues\n            .map(\n              (issue) =>\n                `${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`,\n            )\n            .join(\"\\n\")\n        : \"No library diagnostics found.\",\n  };\n}\n\nasync function runConsumers(args, workspaceRoot) {\n  const parsed = parseCommandArguments(args, {\n    values: [\"kind\"],\n  });\n  requirePositionals(\n    parsed.positionals,\n    1,\n    \"mydash library consumers <id> [--kind <kind>]\",\n  );\n\n  const scan = await scanWorkspaceLibrary(workspaceRoot);\n  const entry = requireUniqueEntry(\n    scan.entries,\n    parsed.positionals[0],\n    parsed.options.kind,\n  );\n  const graph = buildConsumerGraph(scan);\n  const consumers = consumersForEntry(entry, graph);\n\n  return {\n    ok: true,\n    command: \"library consumers\",\n    data: {\n      target: publicEntry(entry),\n      consumers,\n    },\n    warnings: issuesAsWarnings(scan.issues),\n    text:\n      consumers.length > 0\n        ? consumers\n            .map(\n              (consumer) =>\n                `${consumer.source.kind}:${consumer.source.id} via ${consumer.field}`,\n            )\n            .join(\"\\n\")\n        : `No consumers found for ${entry.kind}:${entry.id}.`,\n  };\n}\n\nfunction requireUniqueEntry(entries, id, kind) {\n  const matches = entries.filter(\n    (entry) =>\n      entry.id === id &&\n      (!kind || entry.kind === kind || entry.category === kind),\n  );\n\n  if (matches.length === 0) {\n    throw new CliError(\n      \"LIBRARY_ENTRY_NOT_FOUND\",\n      `No library entry found for ${kind ? `${kind}:` : \"\"}${id}.`,\n      { exitCode: EXIT_USAGE },\n    );\n  }\n\n  if (matches.length > 1) {\n    throw new CliError(\n      \"AMBIGUOUS_LIBRARY_ENTRY\",\n      `Multiple library entries use the identifier ${id}.`,\n      {\n        exitCode: EXIT_USAGE,\n        details: {\n          matches: matches.map((entry) => ({\n            kind: entry.kind,\n            path: entry.displayPath,\n          })),\n        },\n        hint: \"Use --kind to disambiguate the entry.\",\n      },\n    );\n  }\n\n  return matches[0];\n}\n\nfunction serialiseScan(scan) {\n  return {\n    workspaceRoot: scan.workspaceRoot,\n    summary: scan.summary,\n    entries: scan.entries.map(publicEntry),\n    issues: scan.issues,\n  };\n}\n\nfunction publicEntry(entry, includeManifest = false) {\n  return {\n    id: entry.id,\n    kind: entry.kind,\n    category: entry.category,\n    title: entry.title,\n    level: entry.level,\n    collection: entry.collection,\n    displayPath: entry.displayPath,\n    manifestPath: entry.manifestPath,\n    ...(includeManifest ? { manifest: entry.manifest } : {}),\n  };\n}\n\nfunction renderSummary(scan) {\n  const lines = [\n    `Library entries: ${scan.summary.entryCount}`,\n    `Artefacts: ${scan.summary.artifactCount}`,\n    `Reusable resources: ${scan.summary.resourceCount}`,\n    `Errors: ${scan.summary.errorCount}`,\n    `Warnings: ${scan.summary.warningCount}`,\n  ];\n\n  for (const [kind, count] of Object.entries(scan.summary.byKind)) {\n    lines.push(`  ${kind}: ${count}`);\n  }\n\n  return lines.join(\"\\n\");\n}\n\nfunction renderInspection(entry, consumers) {\n  const lines = [\n    `${entry.kind}:${entry.id}`,\n    `Name: ${entry.title}`,\n    `Manifest: ${entry.displayPath}`,\n  ];\n\n  if (entry.level) lines.push(`Level: ${entry.level}`);\n  if (entry.collection) {\n    lines.push(`Collection: ${entry.collection}`);\n  }\n\n  lines.push(`Consumers: ${consumers.length}`);\n\n  return lines.join(\"\\n\");\n}\n\nfunction issuesAsWarnings(issues) {\n  return issues\n    .filter((issue) => issue.severity === \"warning\")\n    .map((issue) => ({\n      code: issue.code,\n      message: issue.message,\n    }));\n}\n\nfunction rejectPositionals(positionals, usage) {\n  if (positionals.length > 0) {\n    throw new CliError(\n      \"INVALID_USAGE\",\n      `Unexpected argument: ${positionals[0]}. Usage: ${usage}`,\n      { exitCode: EXIT_USAGE },\n    );\n  }\n}\n"}, "src/library/conventions.mjs": {"content": "export const MANIFEST_SPECS = [\n  {\n    rootKey: \"dashboards\",\n    category: \"artifact\",\n    manifestFile: \"artifact.json\",\n    contract: \"artifact\",\n    expectedKinds: [\"dashboard\"],\n  },\n  {\n    rootKey: \"presentations\",\n    category: \"artifact\",\n    manifestFile: \"artifact.json\",\n    contract: \"artifact\",\n    expectedKinds: [\"presentation\"],\n  },\n  {\n    rootKey: \"concepts\",\n    category: \"artifact\",\n    manifestFile: \"artifact.json\",\n    contract: \"artifact\",\n    expectedKinds: [\"concept\"],\n  },\n  {\n    rootKey: \"primitives\",\n    category: \"ui\",\n    manifestFile: \"ui.json\",\n    contract: \"uiItem\",\n    expectedKinds: [\"primitive\"],\n  },\n  {\n    rootKey: \"components\",\n    category: \"ui\",\n    manifestFile: \"ui.json\",\n    contract: \"uiItem\",\n    expectedKinds: [\"component\"],\n  },\n  {\n    rootKey: \"layouts\",\n    category: \"ui\",\n    manifestFile: \"ui.json\",\n    contract: \"uiItem\",\n    expectedKinds: [\"layout\"],\n  },\n  {\n    rootKey: \"themes\",\n    category: \"theme\",\n    manifestFile: \"theme.json\",\n    contract: \"theme\",\n    expectedKinds: [\"theme\"],\n  },\n  {\n    rootKey: \"presets\",\n    category: \"preset\",\n    manifestFile: \"preset.json\",\n    contract: \"preset\",\n    expectedKinds: [\"preset\"],\n  },\n  {\n    rootKey: \"assets\",\n    category: \"asset\",\n    manifestFile: \"asset.json\",\n    contract: \"asset\",\n    expectedKinds: [\"asset\"],\n  },\n];\n\nexport const REFERENCEABLE_KINDS = new Set([\n  \"primitive\",\n  \"component\",\n  \"layout\",\n  \"theme\",\n  \"preset\",\n  \"asset\",\n]);\n\nexport function manifestSpecForRoot(rootKey) {\n  return MANIFEST_SPECS.find((spec) => spec.rootKey === rootKey) ?? null;\n}\n\nexport function expectedPlacement(entry) {\n  if (entry.category === \"artifact\") {\n    return {\n      expectedLevel: null,\n      expectedCollection: null,\n    };\n  }\n\n  const segments = entry.relativeDirectory\n    .split(\"/\")\n    .filter(Boolean);\n\n  if (segments[0] === \"core\") {\n    return {\n      expectedLevel: \"core\",\n      expectedCollection: null,\n    };\n  }\n\n  if (segments[0] === \"collections\" && segments[1]) {\n    return {\n      expectedLevel: \"collection\",\n      expectedCollection: segments[1],\n    };\n  }\n\n  return {\n    expectedLevel: null,\n    expectedCollection: null,\n  };\n}\n"}, "src/library/scan.mjs": {"content": "import {\n  lstat,\n  readFile,\n  readdir,\n  realpath,\n} from \"node:fs/promises\";\nimport {\n  basename,\n  dirname,\n  isAbsolute,\n  join,\n  relative,\n  resolve,\n} from \"node:path\";\nimport { validateDocument } from \"../validation/contracts.mjs\";\nimport { loadWorkspaceConfig } from \"../workspace/load-config.mjs\";\nimport {\n  MANIFEST_SPECS,\n  expectedPlacement,\n} from \"./conventions.mjs\";\nimport {\n  collectReferences,\n  resolveReferences,\n} from \"./references.mjs\";\n\nconst MAX_MANIFEST_BYTES = 1024 * 1024;\nconst IGNORED_DIRECTORIES = new Set([\n  \".git\",\n  \"node_modules\",\n  \".my-dashboards\",\n]);\n\nexport async function scanWorkspaceLibrary(workspaceRoot) {\n  const canonicalWorkspaceRoot = await realpath(resolve(workspaceRoot));\n  const config = await loadWorkspaceConfig(canonicalWorkspaceRoot);\n  const entries = [];\n  const issues = [];\n\n  for (const spec of MANIFEST_SPECS) {\n    const configuredRoot = config.libraryRoots[spec.rootKey];\n\n    if (!configuredRoot) {\n      issues.push(\n        issue(\n          \"error\",\n          \"LIBRARY_ROOT_NOT_CONFIGURED\",\n          `Workspace library root ${spec.rootKey} is not configured.`,\n          { rootKey: spec.rootKey },\n        ),\n      );\n      continue;\n    }\n\n    const rootPath = resolve(canonicalWorkspaceRoot, configuredRoot);\n\n    if (!isInside(canonicalWorkspaceRoot, rootPath)) {\n      issues.push(\n        issue(\n          \"error\",\n          \"LIBRARY_ROOT_OUTSIDE_WORKSPACE\",\n          `Configured library root escapes the workspace: ${configuredRoot}`,\n          {\n            rootKey: spec.rootKey,\n            rootPath,\n          },\n        ),\n      );\n      continue;\n    }\n\n    const rootMetadata = await safeLstat(rootPath);\n\n    if (!rootMetadata?.isDirectory()) {\n      issues.push(\n        issue(\n          \"error\",\n          \"LIBRARY_ROOT_MISSING\",\n          `Configured library root does not exist: ${configuredRoot}`,\n          {\n            rootKey: spec.rootKey,\n            rootPath,\n          },\n        ),\n      );\n      continue;\n    }\n\n    await scanRoot({\n      workspaceRoot: canonicalWorkspaceRoot,\n      rootPath,\n      configuredRoot,\n      spec,\n      entries,\n      issues,\n    });\n  }\n\n  diagnoseDuplicates(entries, issues);\n  diagnosePlacement(entries, issues);\n\n  const references = entries.flatMap((entry) =>\n    collectReferences(entry).map((reference) => ({\n      ...reference,\n      sourceManifestPath: entry.manifestPath,\n    })),\n  );\n\n  resolveReferences(entries, references, issues);\n\n  return {\n    workspaceRoot: canonicalWorkspaceRoot,\n    config,\n    entries: entries.sort(compareEntries),\n    references,\n    issues: issues.sort(compareIssues),\n    summary: summarise(entries, issues),\n  };\n}\n\nexport function findLibraryEntries(entries, filters = {}) {\n  return entries.filter((entry) => {\n    if (\n      filters.kind &&\n      entry.kind !== filters.kind &&\n      entry.category !== filters.kind\n    ) {\n      return false;\n    }\n\n    if (filters.level && entry.level !== filters.level) {\n      return false;\n    }\n\n    if (\n      filters.collection &&\n      entry.collection !== filters.collection\n    ) {\n      return false;\n    }\n\n    return true;\n  });\n}\n\nasync function scanRoot(context) {\n  const manifestPaths = [];\n  await walk(context.rootPath, \"\");\n\n  for (const manifestPath of manifestPaths) {\n    const entry = await readManifestEntry({\n      ...context,\n      manifestPath,\n    });\n\n    if (entry) {\n      context.entries.push(entry);\n    }\n  }\n\n  async function walk(directory, relativeDirectory) {\n    const directoryEntries = await readdir(directory, {\n      withFileTypes: true,\n    });\n\n    directoryEntries.sort((left, right) =>\n      left.name.localeCompare(right.name, \"en\"),\n    );\n\n    for (const directoryEntry of directoryEntries) {\n      if (directoryEntry.name.startsWith(\".\")) continue;\n      if (IGNORED_DIRECTORIES.has(directoryEntry.name)) continue;\n\n      const absolutePath = join(directory, directoryEntry.name);\n      const childRelative = relativeDirectory\n        ? `${relativeDirectory}/${directoryEntry.name}`\n        : directoryEntry.name;\n      const metadata = await lstat(absolutePath);\n\n      if (metadata.isSymbolicLink()) {\n        context.issues.push(\n          issue(\n            \"warning\",\n            \"SYMLINK_SKIPPED\",\n            `Library scanning skipped symbolic link: ${displayPath(\n              absolutePath,\n              context.workspaceRoot,\n            )}`,\n            {\n              rootKey: context.spec.rootKey,\n              path: absolutePath,\n            },\n          ),\n        );\n        continue;\n      }\n\n      if (metadata.isDirectory()) {\n        await walk(absolutePath, childRelative);\n        continue;\n      }\n\n      if (\n        metadata.isFile() &&\n        directoryEntry.name === context.spec.manifestFile\n      ) {\n        manifestPaths.push(absolutePath);\n      }\n    }\n  }\n}\n\nasync function readManifestEntry(context) {\n  const metadata = await lstat(context.manifestPath);\n\n  if (metadata.size > MAX_MANIFEST_BYTES) {\n    context.issues.push(\n      issue(\n        \"error\",\n        \"MANIFEST_TOO_LARGE\",\n        `Manifest exceeds ${MAX_MANIFEST_BYTES} bytes: ${displayPath(\n          context.manifestPath,\n          context.workspaceRoot,\n        )}`,\n        {\n          manifestPath: context.manifestPath,\n          rootKey: context.spec.rootKey,\n        },\n      ),\n    );\n    return null;\n  }\n\n  const source = await readFile(context.manifestPath, \"utf8\");\n  let manifest;\n\n  try {\n    manifest = JSON.parse(source);\n  } catch (error) {\n    context.issues.push(\n      issue(\n        \"error\",\n        \"MANIFEST_INVALID_JSON\",\n        `Manifest is not valid JSON: ${displayPath(\n          context.manifestPath,\n          context.workspaceRoot,\n        )}: ${error.message}`,\n        {\n          manifestPath: context.manifestPath,\n          rootKey: context.spec.rootKey,\n        },\n      ),\n    );\n    return null;\n  }\n\n  const validation = validateDocument(\n    context.spec.contract,\n    manifest,\n  );\n\n  for (const validationError of validation.errors) {\n    context.issues.push(\n      issue(\n        \"error\",\n        \"MANIFEST_CONTRACT_INVALID\",\n        `${displayPath(\n          context.manifestPath,\n          context.workspaceRoot,\n        )} ${validationError.path}: ${validationError.message}`,\n        {\n          manifestPath: context.manifestPath,\n          rootKey: context.spec.rootKey,\n          contract: context.spec.contract,\n          validationPath: validationError.path,\n        },\n      ),\n    );\n  }\n\n  if (\n    manifest.kind &&\n    !context.spec.expectedKinds.includes(manifest.kind)\n  ) {\n    context.issues.push(\n      issue(\n        \"error\",\n        \"MANIFEST_KIND_MISMATCH\",\n        `Manifest kind ${manifest.kind} does not belong under ${context.spec.rootKey}.`,\n        {\n          manifestPath: context.manifestPath,\n          rootKey: context.spec.rootKey,\n          actualKind: manifest.kind,\n          expectedKinds: context.spec.expectedKinds,\n        },\n      ),\n    );\n  }\n\n  const relativeDirectory = relative(\n    context.rootPath,\n    dirname(context.manifestPath),\n  ).replaceAll(\"\\\\\", \"/\");\n\n  const id =\n    typeof manifest.id === \"string\" && manifest.id\n      ? manifest.id\n      : `invalid-${context.entries.length + 1}`;\n\n  return {\n    id,\n    kind:\n      typeof manifest.kind === \"string\"\n        ? manifest.kind\n        : context.spec.expectedKinds[0],\n    category: context.spec.category,\n    title:\n      manifest.title ??\n      manifest.name ??\n      id,\n    level: manifest.level ?? null,\n    collection: manifest.collection ?? null,\n    ownerArtifact: manifest.ownerArtifact ?? null,\n    rootKey: context.spec.rootKey,\n    rootPath: context.rootPath,\n    directory: dirname(context.manifestPath),\n    relativeDirectory,\n    manifestPath: context.manifestPath,\n    displayPath: displayPath(\n      context.manifestPath,\n      context.workspaceRoot,\n    ),\n    manifest,\n    contractValid: validation.ok,\n  };\n}\n\nfunction diagnoseDuplicates(entries, issues) {\n  const groups = new Map();\n\n  for (const entry of entries) {\n    const namespace =\n      entry.category === \"artifact\"\n        ? \"artifact\"\n        : entry.kind;\n    const key = `${namespace}:${entry.id}`;\n    const group = groups.get(key) ?? [];\n    group.push(entry);\n    groups.set(key, group);\n  }\n\n  for (const [key, group] of groups) {\n    if (group.length < 2) continue;\n\n    for (const entry of group) {\n      issues.push(\n        issue(\n          \"error\",\n          \"DUPLICATE_LIBRARY_ID\",\n          `Duplicate library identifier ${key}: ${group\n            .map((candidate) => candidate.displayPath)\n            .join(\", \")}`,\n          {\n            manifestPath: entry.manifestPath,\n            duplicateKey: key,\n            duplicates: group.map(\n              (candidate) => candidate.manifestPath,\n            ),\n          },\n        ),\n      );\n    }\n  }\n}\n\nfunction diagnosePlacement(entries, issues) {\n  for (const entry of entries) {\n    const directoryName = basename(entry.directory);\n\n    if (directoryName !== entry.id) {\n      issues.push(\n        issue(\n          \"warning\",\n          \"ID_DIRECTORY_MISMATCH\",\n          `Manifest id ${entry.id} does not match its directory ${directoryName}.`,\n          {\n            manifestPath: entry.manifestPath,\n            id: entry.id,\n            directoryName,\n          },\n        ),\n      );\n    }\n\n    const placement = expectedPlacement(entry);\n\n    if (\n      placement.expectedLevel &&\n      entry.level !== placement.expectedLevel\n    ) {\n      issues.push(\n        issue(\n          \"error\",\n          \"LIFECYCLE_PLACEMENT_MISMATCH\",\n          `${entry.kind}:${entry.id} declares level ${entry.level ?? \"(none)\"} but is stored under ${placement.expectedLevel}.`,\n          {\n            manifestPath: entry.manifestPath,\n            expectedLevel: placement.expectedLevel,\n            actualLevel: entry.level,\n          },\n        ),\n      );\n    }\n\n    if (\n      placement.expectedCollection &&\n      entry.collection !== placement.expectedCollection\n    ) {\n      issues.push(\n        issue(\n          \"error\",\n          \"COLLECTION_PLACEMENT_MISMATCH\",\n          `${entry.kind}:${entry.id} declares collection ${entry.collection ?? \"(none)\"} but is stored under ${placement.expectedCollection}.`,\n          {\n            manifestPath: entry.manifestPath,\n            expectedCollection: placement.expectedCollection,\n            actualCollection: entry.collection,\n          },\n        ),\n      );\n    }\n\n    if (\n      entry.category !== \"artifact\" &&\n      !placement.expectedLevel\n    ) {\n      issues.push(\n        issue(\n          \"warning\",\n          \"NONSTANDARD_LIBRARY_PLACEMENT\",\n          `${entry.kind}:${entry.id} is outside the expected core/ or collections/<id>/ structure.`,\n          {\n            manifestPath: entry.manifestPath,\n          },\n        ),\n      );\n    }\n  }\n}\n\nfunction summarise(entries, issues) {\n  const byKind = {};\n\n  for (const entry of entries) {\n    byKind[entry.kind] = (byKind[entry.kind] ?? 0) + 1;\n  }\n\n  return {\n    entryCount: entries.length,\n    artifactCount: entries.filter(\n      (entry) => entry.category === \"artifact\",\n    ).length,\n    resourceCount: entries.filter(\n      (entry) => entry.category !== \"artifact\",\n    ).length,\n    errorCount: issues.filter(\n      (entry) => entry.severity === \"error\",\n    ).length,\n    warningCount: issues.filter(\n      (entry) => entry.severity === \"warning\",\n    ).length,\n    byKind: Object.fromEntries(\n      Object.entries(byKind).sort(([left], [right]) =>\n        left.localeCompare(right, \"en\"),\n      ),\n    ),\n  };\n}\n\nfunction issue(severity, code, message, details = {}) {\n  return {\n    severity,\n    code,\n    message,\n    ...details,\n  };\n}\n\nfunction compareEntries(left, right) {\n  return (\n    left.kind.localeCompare(right.kind, \"en\") ||\n    left.id.localeCompare(right.id, \"en\") ||\n    left.displayPath.localeCompare(right.displayPath, \"en\")\n  );\n}\n\nfunction compareIssues(left, right) {\n  const severityOrder = { error: 0, warning: 1 };\n\n  return (\n    (severityOrder[left.severity] ?? 9) -\n      (severityOrder[right.severity] ?? 9) ||\n    left.code.localeCompare(right.code, \"en\") ||\n    String(left.message).localeCompare(String(right.message), \"en\")\n  );\n}\n\nfunction displayPath(path, workspaceRoot) {\n  const value = relative(workspaceRoot, path).replaceAll(\"\\\\\", \"/\");\n  return value.startsWith(\"..\") ? path : value || \".\";\n}\n\nfunction isInside(root, candidate) {\n  const relationship = relative(root, candidate);\n\n  return (\n    relationship === \"\" ||\n    (!relationship.startsWith(\"..\") && !isAbsolute(relationship))\n  );\n}\n\nasync function safeLstat(path) {\n  try {\n    return await lstat(path);\n  } catch (error) {\n    if (error?.code === \"ENOENT\") return null;\n    throw error;\n  }\n}\n"}, "src/library/references.mjs": {"content": "import { REFERENCEABLE_KINDS } from \"./conventions.mjs\";\n\nexport function collectReferences(entry) {\n  const manifest = entry.manifest;\n  const references = [];\n\n  if (entry.category === \"artifact\") {\n    add(references, \"theme\", manifest.appearance?.theme, \"appearance.theme\");\n    add(references, \"preset\", manifest.appearance?.preset, \"appearance.preset\");\n    add(\n      references,\n      \"layout\",\n      manifest.appearance?.overrides?.layout,\n      \"appearance.overrides.layout\",\n    );\n    addMap(\n      references,\n      \"component\",\n      manifest.appearance?.overrides?.components,\n      \"appearance.overrides.components\",\n    );\n    addMap(\n      references,\n      \"primitive\",\n      manifest.appearance?.overrides?.primitives,\n      \"appearance.overrides.primitives\",\n    );\n    addMap(\n      references,\n      \"asset\",\n      manifest.appearance?.overrides?.assets,\n      \"appearance.overrides.assets\",\n    );\n  }\n\n  if (entry.kind === \"preset\") {\n    add(\n      references,\n      \"layout\",\n      manifest.mappings?.layout,\n      \"mappings.layout\",\n    );\n    addMap(\n      references,\n      \"component\",\n      manifest.mappings?.components,\n      \"mappings.components\",\n    );\n    addMap(\n      references,\n      \"primitive\",\n      manifest.mappings?.primitives,\n      \"mappings.primitives\",\n    );\n    addMap(\n      references,\n      \"asset\",\n      manifest.mappings?.assets,\n      \"mappings.assets\",\n    );\n    addArray(\n      references,\n      \"theme\",\n      manifest.supportedThemes,\n      \"supportedThemes\",\n    );\n  }\n\n  if (\n    entry.kind === \"primitive\" ||\n    entry.kind === \"component\" ||\n    entry.kind === \"layout\"\n  ) {\n    addMap(\n      references,\n      \"primitive\",\n      manifest.dependencies?.primitives,\n      \"dependencies.primitives\",\n    );\n    addMap(\n      references,\n      \"component\",\n      manifest.dependencies?.components,\n      \"dependencies.components\",\n    );\n    addMap(\n      references,\n      \"asset\",\n      manifest.dependencies?.assets,\n      \"dependencies.assets\",\n    );\n    addArray(\n      references,\n      \"theme\",\n      manifest.supportedThemes,\n      \"supportedThemes\",\n    );\n  }\n\n  if (entry.kind === \"theme\") {\n    addMap(references, \"asset\", manifest.assets, \"assets\");\n  }\n\n  return references.map((reference) => ({\n    ...reference,\n    sourceId: entry.id,\n    sourceKind: entry.kind,\n    sourceCategory: entry.category,\n  }));\n}\n\nexport function resolveReferences(entries, references, issues) {\n  for (const reference of references) {\n    if (!REFERENCEABLE_KINDS.has(reference.targetKind)) continue;\n\n    const candidates = findReferenceCandidates(\n      entries,\n      reference.targetKind,\n      reference.value,\n    );\n\n    if (candidates.length === 0) {\n      issues.push({\n        severity: \"error\",\n        code: \"UNRESOLVED_LIBRARY_REFERENCE\",\n        message: `${reference.sourceKind}:${reference.sourceId} references missing ${reference.targetKind}:${reference.value} via ${reference.field}.`,\n        manifestPath: reference.sourceManifestPath,\n        targetKind: reference.targetKind,\n        reference: reference.value,\n        field: reference.field,\n      });\n      continue;\n    }\n\n    if (candidates.length > 1) {\n      issues.push({\n        severity: \"error\",\n        code: \"AMBIGUOUS_LIBRARY_REFERENCE\",\n        message: `${reference.sourceKind}:${reference.sourceId} references ambiguous ${reference.targetKind}:${reference.value} via ${reference.field}.`,\n        manifestPath: reference.sourceManifestPath,\n        targetKind: reference.targetKind,\n        reference: reference.value,\n        field: reference.field,\n        candidateManifestPaths: candidates.map(\n          (candidate) => candidate.manifestPath,\n        ),\n      });\n      continue;\n    }\n\n    reference.targetManifestPath = candidates[0].manifestPath;\n    reference.targetId = candidates[0].id;\n  }\n}\n\nexport function findReferenceCandidates(entries, targetKind, value) {\n  const parts = String(value).split(\"/\").filter(Boolean);\n  const id = parts.at(-1);\n  const qualifier = parts.length > 1 ? parts[0] : null;\n\n  return entries.filter((entry) => {\n    if (entry.kind !== targetKind || entry.id !== id) {\n      return false;\n    }\n\n    if (!qualifier) return true;\n    if (qualifier === \"core\") return entry.level === \"core\";\n\n    return (\n      entry.level === \"collection\" &&\n      entry.collection === qualifier\n    );\n  });\n}\n\nfunction add(references, targetKind, value, field) {\n  if (typeof value !== \"string\" || !value) return;\n\n  references.push({\n    targetKind,\n    value,\n    field,\n  });\n}\n\nfunction addArray(references, targetKind, values, field) {\n  if (!Array.isArray(values)) return;\n\n  values.forEach((value, index) =>\n    add(references, targetKind, value, `${field}[${index}]`),\n  );\n}\n\nfunction addMap(references, targetKind, values, field) {\n  if (!values || typeof values !== \"object\" || Array.isArray(values)) {\n    return;\n  }\n\n  for (const [slot, value] of Object.entries(values)) {\n    add(references, targetKind, value, `${field}.${slot}`);\n  }\n}\n"}, "src/library/consumers.mjs": {"content": "export function buildConsumerGraph(scan) {\n  const entryByManifestPath = new Map(\n    scan.entries.map((entry) => [entry.manifestPath, entry]),\n  );\n  const incoming = new Map();\n  const outgoing = new Map();\n\n  for (const reference of scan.references) {\n    const source = entryByManifestPath.get(\n      reference.sourceManifestPath,\n    );\n\n    if (!source) continue;\n\n    const edge = {\n      source: {\n        id: source.id,\n        kind: source.kind,\n        category: source.category,\n        displayPath: source.displayPath,\n        manifestPath: source.manifestPath,\n      },\n      target: reference.targetManifestPath\n        ? publicTarget(\n            entryByManifestPath.get(reference.targetManifestPath),\n          )\n        : {\n            id: reference.value,\n            kind: reference.targetKind,\n            manifestPath: null,\n          },\n      field: reference.field,\n      reference: reference.value,\n      resolved: Boolean(reference.targetManifestPath),\n    };\n\n    const sourceEdges =\n      outgoing.get(source.manifestPath) ?? [];\n    sourceEdges.push(edge);\n    outgoing.set(source.manifestPath, sourceEdges);\n\n    if (reference.targetManifestPath) {\n      const targetEdges =\n        incoming.get(reference.targetManifestPath) ?? [];\n      targetEdges.push(edge);\n      incoming.set(reference.targetManifestPath, targetEdges);\n    }\n  }\n\n  for (const edges of incoming.values()) sortEdges(edges);\n  for (const edges of outgoing.values()) sortEdges(edges);\n\n  return {\n    incoming,\n    outgoing,\n  };\n}\n\nexport function consumersForEntry(entry, graph) {\n  return graph.incoming.get(entry.manifestPath) ?? [];\n}\n\nexport function dependenciesForEntry(entry, graph) {\n  return graph.outgoing.get(entry.manifestPath) ?? [];\n}\n\nfunction publicTarget(entry) {\n  if (!entry) return null;\n\n  return {\n    id: entry.id,\n    kind: entry.kind,\n    category: entry.category,\n    displayPath: entry.displayPath,\n    manifestPath: entry.manifestPath,\n  };\n}\n\nfunction sortEdges(edges) {\n  edges.sort(\n    (left, right) =>\n      left.source.kind.localeCompare(right.source.kind, \"en\") ||\n      left.source.id.localeCompare(right.source.id, \"en\") ||\n      left.field.localeCompare(right.field, \"en\"),\n  );\n}\n"}, "src/library/README.md": {"content": "# Filesystem library discovery\n\nThe repository is the source of truth. The scanner discovers manifests directly\nfrom configured library roots; no manually maintained artefact index exists.\n\n## Manifest filenames\n\n| Resource | Manifest |\n| --- | --- |\n| Dashboard, presentation, concept | `artifact.json` |\n| Primitive, component, layout | `ui.json` |\n| Theme | `theme.json` |\n| Preset | `preset.json` |\n| Asset | `asset.json` |\n\n## Shared-library placement\n\n```text\nlibrary/<resource>/core/<id>/<manifest>\nlibrary/<resource>/collections/<collection>/<id>/<manifest>\n```\n\nThe manifest `id`, lifecycle level and collection must agree with its directory.\n\n## Diagnostics\n\nThe scanner checks:\n\n- JSON parsing and contract validation;\n- resource kind versus configured root;\n- duplicate identifiers;\n- lifecycle and collection placement;\n- manifest id versus directory name;\n- missing, ambiguous and qualified references;\n- symbolic links, which are skipped rather than followed.\n\n## Reverse consumers\n\nReferences are extracted from:\n\n- artefact appearance configuration;\n- preset mappings;\n- UI dependencies;\n- supported theme declarations;\n- theme asset mappings.\n\nThis supports cautious shared-library changes by showing which artefacts and\nresources consume a component, primitive, layout, theme, preset or asset.\n"}, "tests/fixtures/library-workspace/package.json": {"content": "{\n  \"name\": \"library-fixture\",\n  \"version\": \"0.1.0\",\n  \"private\": true,\n  \"type\": \"module\"\n}\n"}, "tests/fixtures/library-workspace/config/workspace.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"id\": \"library-fixture\",\n  \"name\": \"Library Fixture\",\n  \"libraryRoots\": {\n    \"dashboards\": \"library/dashboards\",\n    \"presentations\": \"library/presentations\",\n    \"concepts\": \"library/concepts\",\n    \"primitives\": \"library/ui/primitives\",\n    \"components\": \"library/ui/components\",\n    \"layouts\": \"library/ui/layouts\",\n    \"themes\": \"library/themes\",\n    \"presets\": \"library/presets\",\n    \"assets\": \"library/assets\"\n  },\n  \"defaults\": {\n    \"theme\": \"hsbc-light\",\n    \"preset\": \"default\"\n  },\n  \"preview\": {\n    \"host\": \"127.0.0.1\",\n    \"port\": 4173\n  },\n  \"export\": {\n    \"outputDirectory\": \"exports\"\n  }\n}\n"}, "tests/fixtures/library-workspace/library/dashboards/use-case-pipeline/artifact.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"dashboard\",\n  \"id\": \"use-case-pipeline\",\n  \"title\": \"Use Case Pipeline\",\n  \"entry\": \"src/index.html\",\n  \"appearance\": {\n    \"theme\": \"hsbc-light\",\n    \"preset\": \"default\",\n    \"overrides\": {\n      \"layout\": null,\n      \"components\": {\n        \"metric-summary\": \"metric-card\"\n      },\n      \"primitives\": {},\n      \"assets\": {}\n    }\n  }\n}\n"}, "tests/fixtures/library-workspace/library/themes/core/hsbc-light/theme.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"theme\",\n  \"id\": \"hsbc-light\",\n  \"name\": \"HSBC Light\",\n  \"level\": \"core\",\n  \"tokens\": {\n    \"colour-primary\": \"#db0011\",\n    \"colour-background\": \"#ffffff\"\n  },\n  \"assets\": {\n    \"brand-logo\": \"hsbc-red\"\n  }\n}\n"}, "tests/fixtures/library-workspace/library/presets/core/default/preset.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"preset\",\n  \"id\": \"default\",\n  \"name\": \"Default\",\n  \"level\": \"core\",\n  \"mappings\": {\n    \"layout\": \"dashboard-grid\",\n    \"components\": {\n      \"metric-summary\": \"metric-card\"\n    },\n    \"primitives\": {\n      \"button\": \"button\"\n    },\n    \"assets\": {\n      \"brand-logo\": \"hsbc-red\"\n    }\n  },\n  \"supportedThemes\": [\n    \"hsbc-light\"\n  ]\n}\n"}, "tests/fixtures/library-workspace/library/ui/layouts/core/dashboard-grid/ui.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"layout\",\n  \"id\": \"dashboard-grid\",\n  \"name\": \"Dashboard Grid\",\n  \"level\": \"core\",\n  \"slot\": \"page-layout\",\n  \"contractVersion\": 1,\n  \"entry\": \"layout.js\",\n  \"supportedThemes\": [\n    \"hsbc-light\"\n  ]\n}\n"}, "tests/fixtures/library-workspace/library/ui/components/core/metric-card/ui.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"component\",\n  \"id\": \"metric-card\",\n  \"name\": \"Metric Card\",\n  \"level\": \"core\",\n  \"slot\": \"metric-summary\",\n  \"contractVersion\": 1,\n  \"entry\": \"component.js\",\n  \"dependencies\": {\n    \"primitives\": {\n      \"button\": \"button\"\n    },\n    \"components\": {},\n    \"assets\": {}\n  },\n  \"supportedThemes\": [\n    \"hsbc-light\"\n  ]\n}\n"}, "tests/fixtures/library-workspace/library/ui/primitives/core/button/ui.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"primitive\",\n  \"id\": \"button\",\n  \"name\": \"Button\",\n  \"level\": \"core\",\n  \"slot\": \"button\",\n  \"contractVersion\": 1,\n  \"entry\": \"primitive.js\",\n  \"supportedThemes\": [\n    \"hsbc-light\"\n  ]\n}\n"}, "tests/fixtures/library-workspace/library/assets/core/hsbc-red/asset.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"asset\",\n  \"id\": \"hsbc-red\",\n  \"name\": \"HSBC Red Logo\",\n  \"level\": \"core\",\n  \"file\": \"hsbc-red.svg\",\n  \"mediaType\": \"image/svg+xml\",\n  \"category\": \"logo\",\n  \"usage\": \"Use on light backgrounds.\",\n  \"approved\": true\n}\n"}, "tests/fixtures/library-workspace/library/presentations/.gitkeep": {"content": ""}, "tests/fixtures/library-workspace/library/concepts/.gitkeep": {"content": ""}, "tests/fixtures/library-workspace/library/ui/primitives/collections/.gitkeep": {"content": ""}, "tests/fixtures/library-workspace/library/ui/components/collections/.gitkeep": {"content": ""}, "tests/fixtures/library-workspace/library/ui/layouts/collections/.gitkeep": {"content": ""}, "tests/fixtures/library-workspace/library/themes/collections/.gitkeep": {"content": ""}, "tests/fixtures/library-workspace/library/presets/collections/.gitkeep": {"content": ""}, "tests/fixtures/library-workspace/library/assets/collections/.gitkeep": {"content": ""}, "tests/unit/library.test.mjs": {"content": "import assert from \"node:assert/strict\";\nimport {\n  mkdir,\n  readFile,\n  rm,\n  writeFile,\n} from \"node:fs/promises\";\nimport { dirname, resolve } from \"node:path\";\nimport { fileURLToPath } from \"node:url\";\nimport test from \"node:test\";\nimport {\n  scanWorkspaceLibrary,\n} from \"../../src/library/scan.mjs\";\nimport {\n  buildConsumerGraph,\n  consumersForEntry,\n} from \"../../src/library/consumers.mjs\";\n\nconst testDirectory = dirname(fileURLToPath(import.meta.url));\nconst fixtureRoot = resolve(\n  testDirectory,\n  \"../fixtures/library-workspace\",\n);\n\ntest(\"library scanner discovers valid artefacts and resources\", async () => {\n  const scan = await scanWorkspaceLibrary(fixtureRoot);\n\n  assert.equal(scan.summary.errorCount, 0);\n  assert.equal(scan.summary.entryCount, 7);\n  assert.equal(scan.summary.artifactCount, 1);\n  assert.equal(scan.summary.byKind.component, 1);\n  assert.equal(scan.summary.byKind.theme, 1);\n});\n\ntest(\"reverse consumers include artefacts and presets\", async () => {\n  const scan = await scanWorkspaceLibrary(fixtureRoot);\n  const graph = buildConsumerGraph(scan);\n  const component = scan.entries.find(\n    (entry) => entry.kind === \"component\",\n  );\n  const consumers = consumersForEntry(component, graph);\n\n  assert.deepEqual(\n    consumers.map(\n      (consumer) =>\n        `${consumer.source.kind}:${consumer.source.id}:${consumer.field}`,\n    ),\n    [\n      \"dashboard:use-case-pipeline:appearance.overrides.components.metric-summary\",\n      \"preset:default:mappings.components.metric-summary\",\n    ],\n  );\n});\n\ntest(\"scanner reports duplicate ids and unresolved references\", async () => {\n  const root = resolve(\n    fixtureRoot,\n    \".tmp-diagnostics\",\n  );\n  await rm(root, { recursive: true, force: true });\n  await copyFixtureWorkspace(fixtureRoot, root);\n\n  try {\n    const duplicateDirectory = resolve(\n      root,\n      \"library/themes/collections/alternate/hsbc-light\",\n    );\n    await mkdir(duplicateDirectory, { recursive: true });\n    const theme = JSON.parse(\n      await readFile(\n        resolve(\n          root,\n          \"library/themes/core/hsbc-light/theme.json\",\n        ),\n        \"utf8\",\n      ),\n    );\n    theme.level = \"collection\";\n    theme.collection = \"alternate\";\n    await writeFile(\n      resolve(duplicateDirectory, \"theme.json\"),\n      `${JSON.stringify(theme, null, 2)}\\n`,\n    );\n\n    const artifactPath = resolve(\n      root,\n      \"library/dashboards/use-case-pipeline/artifact.json\",\n    );\n    const artifact = JSON.parse(\n      await readFile(artifactPath, \"utf8\"),\n    );\n    artifact.appearance.preset = \"missing-preset\";\n    await writeFile(\n      artifactPath,\n      `${JSON.stringify(artifact, null, 2)}\\n`,\n    );\n\n    const scan = await scanWorkspaceLibrary(root);\n    const codes = new Set(scan.issues.map((issue) => issue.code));\n\n    assert.equal(codes.has(\"DUPLICATE_LIBRARY_ID\"), true);\n    assert.equal(codes.has(\"UNRESOLVED_LIBRARY_REFERENCE\"), true);\n  } finally {\n    await rm(root, { recursive: true, force: true });\n  }\n});\n\nasync function copyFixtureWorkspace(source, target) {\n  const { cp } = await import(\"node:fs/promises\");\n  await cp(source, target, {\n    recursive: true,\n    filter(path) {\n      return !path.includes(\".tmp-diagnostics\");\n    },\n  });\n}\n"}, "tests/integration/library-cli.test.mjs": {"content": "import assert from \"node:assert/strict\";\nimport { dirname, resolve } from \"node:path\";\nimport { fileURLToPath } from \"node:url\";\nimport { spawnSync } from \"node:child_process\";\nimport test from \"node:test\";\n\nconst testDirectory = dirname(fileURLToPath(import.meta.url));\nconst projectRoot = resolve(testDirectory, \"../..\");\nconst workspace = resolve(\n  projectRoot,\n  \"tests\",\n  \"fixtures\",\n  \"library-workspace\",\n);\nconst cliPath = resolve(projectRoot, \"bin\", \"mydash.mjs\");\n\nfunction runCli(args) {\n  return spawnSync(process.execPath, [cliPath, ...args], {\n    cwd: projectRoot,\n    encoding: \"utf8\",\n    stdio: \"pipe\",\n    shell: false,\n  });\n}\n\ntest(\"library scan is available through the CLI\", () => {\n  const result = runCli([\n    \"library\",\n    \"scan\",\n    \"--workspace\",\n    workspace,\n    \"--json\",\n  ]);\n\n  assert.equal(result.status, 0, result.stderr);\n  const body = JSON.parse(result.stdout);\n  assert.equal(body.command, \"library scan\");\n  assert.equal(body.data.summary.entryCount, 7);\n});\n\ntest(\"library list supports kind filtering\", () => {\n  const result = runCli([\n    \"library\",\n    \"list\",\n    \"--kind\",\n    \"component\",\n    \"--workspace\",\n    workspace,\n    \"--json\",\n  ]);\n\n  assert.equal(result.status, 0, result.stderr);\n  const body = JSON.parse(result.stdout);\n  assert.deepEqual(\n    body.data.entries.map((entry) => entry.id),\n    [\"metric-card\"],\n  );\n});\n\ntest(\"library consumers returns reverse references\", () => {\n  const result = runCli([\n    \"library\",\n    \"consumers\",\n    \"metric-card\",\n    \"--kind\",\n    \"component\",\n    \"--workspace\",\n    workspace,\n    \"--json\",\n  ]);\n\n  assert.equal(result.status, 0, result.stderr);\n  const body = JSON.parse(result.stdout);\n  assert.equal(body.data.consumers.length, 2);\n});\n"}, "scripts/tasks/test-library.mjs": {"content": "#!/usr/bin/env node\n\nimport { spawnSync } from \"node:child_process\";\nimport { dirname, resolve } from \"node:path\";\nimport { fileURLToPath } from \"node:url\";\nimport process from \"node:process\";\n\nconst scriptDirectory = dirname(fileURLToPath(import.meta.url));\nconst projectRoot = resolve(scriptDirectory, \"../..\");\n\nconst tests = [\n  resolve(projectRoot, \"tests\", \"unit\", \"library.test.mjs\"),\n  resolve(projectRoot, \"tests\", \"integration\", \"library-cli.test.mjs\"),\n];\n\nconst result = spawnSync(\n  process.execPath,\n  [\"--test\", ...tests],\n  {\n    cwd: projectRoot,\n    stdio: \"inherit\",\n    shell: false,\n  },\n);\n\nif (result.error) throw result.error;\nprocess.exitCode = result.status ?? 1;\n"}};

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
      "Bootstrap 08 must run from the root of the My Dashboards Git repository.",
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
    relativePath: "src/library/.gitkeep",
    expectedContent:
      "# Intentionally retained\n\n" +
      "Filesystem library discovery and reverse-consumer analysis will live here.\n\n" +
      "Implementation is added by a later bootstrap step.\n",
    dirtyBefore,
    repoRoot,
  });

  if (removed) {
    ownedAbsolutePaths.push(join(targetRoot, "src", "library", ".gitkeep"));
  }

  await validateGeneratedState();

  const expectedSelfPath = join(
    targetRoot,
    "scripts",
    "08-build-library-discovery.mjs",
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
        "Library discovery was created and validated, but --no-commit disabled the Git checkpoint.",
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
My Dashboards — Bootstrap 08

Usage:
  node scripts/08-build-library-discovery.mjs [options]

Options:
  --target <path>  Build discovery in a specific repository root.
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
    "src/workspace/find-root.mjs",
    "src/workspace/load-config.mjs",
    "src/validation/contracts.mjs",
    "src/library",
    "library/dashboards",
    "library/presentations",
    "library/concepts",
    "library/ui/primitives",
    "library/ui/components",
    "library/ui/layouts",
    "library/themes",
    "library/presets",
    "library/assets",
    "scripts/tasks/test-data.mjs",
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
        "Bootstrap 07 has not been completed.",
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
        "package.json had pre-existing changes, so the library test command was not added automatically.",
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
  value.scripts["test:library"] =
    value.scripts["test:library"] ??
    "node scripts/tasks/test-library.mjs";

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
        "The library discovery layer was calculated without writing it.",
    });
    return;
  }

  const modulePaths = [
    "cli/registry.mjs",
    "cli/commands/library.mjs",
    "src/library/conventions.mjs",
    "src/library/scan.mjs",
    "src/library/references.mjs",
    "src/library/consumers.mjs",
    "tests/unit/library.test.mjs",
    "tests/integration/library-cli.test.mjs",
    "scripts/tasks/test-library.mjs",
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
      `${modulePaths.length} discovery and CLI modules passed Node syntax checks.`,
  });

  const tests = run(
    process.execPath,
    [join(targetRoot, "scripts", "tasks", "test-library.mjs")],
    { cwd: targetRoot, allowFailure: true },
  );

  if (tests.status !== 0) {
    throw new Error(
      `Library discovery tests failed:\n${tests.stderr || tests.stdout}`,
    );
  }

  report.validation.push({
    check: "library-tests",
    ok: true,
    message:
      "Discovery, diagnostics, consumer graph and CLI integration tests passed.",
  });

  const realScan = run(
    process.execPath,
    [
      join(targetRoot, "bin", "mydash.mjs"),
      "library",
      "scan",
      "--json",
    ],
    { cwd: targetRoot, allowFailure: true },
  );

  if (realScan.status !== 0) {
    throw new Error(
      `The real workspace library scan failed:\n${
        realScan.stderr || realScan.stdout
      }`,
    );
  }

  report.validation.push({
    check: "workspace-scan",
    ok: true,
    message:
      "The repository's current empty or populated library scans without errors.",
  });

  for (const task of [
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
      "Data, Office, filesystem, CLI and contract validation still pass.",
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
        "Library discovery was already present; there were no task-owned changes to commit.",
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
        "Library discovery was created and validated, but no commit was made because Git user.name or user.email is missing.",
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

  console.log("\nMy Dashboards — library discovery\n");
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
