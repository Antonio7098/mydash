#!/usr/bin/env node

/**
 * My Dashboards — Bootstrap 10: Build standalone HTML export
 *
 * Adds:
 *
 *   mydash artifact inspect <artifact-id>
 *   mydash artifact dependencies <artifact-id>
 *   mydash artifact validate <artifact-id>
 *   mydash artifact export <artifact-id>
 *
 * The exporter resolves appearance dependencies, bundles JavaScript, inlines
 * CSS and assets, embeds artefact data, installs a local fetch-compatible
 * runtime and validates that the final HTML has no load-time dependencies.
 *
 * Usage:
 *   node scripts/10-build-standalone-export.mjs
 *   node scripts/10-build-standalone-export.mjs --dry-run
 *   node scripts/10-build-standalone-export.mjs --no-commit
 *   node scripts/10-build-standalone-export.mjs --no-push
 *   node scripts/10-build-standalone-export.mjs --json
 *   node scripts/10-build-standalone-export.mjs --target /path/to/my-dashboards
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

const SCRIPT_NAME = "10-build-standalone-export";
const COMMIT_MESSAGE = "Add standalone HTML export";
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
const FILES = {"cli/registry.mjs": {"content": "import { helpCommand } from \"./commands/help.mjs\";\nimport { versionCommand } from \"./commands/version.mjs\";\nimport { doctorCommand } from \"./commands/doctor.mjs\";\nimport { inspectCommand } from \"./commands/inspect.mjs\";\nimport { fileCommand } from \"./commands/file.mjs\";\nimport { excelCommand } from \"./commands/excel.mjs\";\nimport { powerpointCommand } from \"./commands/powerpoint.mjs\";\nimport { dataCommand } from \"./commands/data.mjs\";\nimport { libraryCommand } from \"./commands/library.mjs\";\nimport { appearanceCommand } from \"./commands/appearance.mjs\";\nimport { artifactCommand } from \"./commands/artifact.mjs\";\n\nconst commands = [\n  helpCommand,\n  versionCommand,\n  doctorCommand,\n  inspectCommand,\n  fileCommand,\n  excelCommand,\n  powerpointCommand,\n  dataCommand,\n  libraryCommand,\n  appearanceCommand,\n  artifactCommand,\n];\n\nconst commandMap = new Map(\n  commands.map((command) => [command.name, command]),\n);\n\nexport const commandRegistry = {\n  get(name) {\n    return commandMap.get(name) ?? null;\n  },\n\n  list() {\n    return [...commands];\n  },\n\n  names() {\n    return commands.map((command) => command.name);\n  },\n};\n", "allowedPrevious": ["import { helpCommand } from \"./commands/help.mjs\";\nimport { versionCommand } from \"./commands/version.mjs\";\nimport { doctorCommand } from \"./commands/doctor.mjs\";\nimport { inspectCommand } from \"./commands/inspect.mjs\";\nimport { fileCommand } from \"./commands/file.mjs\";\nimport { excelCommand } from \"./commands/excel.mjs\";\nimport { powerpointCommand } from \"./commands/powerpoint.mjs\";\nimport { dataCommand } from \"./commands/data.mjs\";\nimport { libraryCommand } from \"./commands/library.mjs\";\nimport { appearanceCommand } from \"./commands/appearance.mjs\";\n\nconst commands = [\n  helpCommand,\n  versionCommand,\n  doctorCommand,\n  inspectCommand,\n  fileCommand,\n  excelCommand,\n  powerpointCommand,\n  dataCommand,\n  libraryCommand,\n  appearanceCommand,\n];\n\nconst commandMap = new Map(\n  commands.map((command) => [command.name, command]),\n);\n\nexport const commandRegistry = {\n  get(name) {\n    return commandMap.get(name) ?? null;\n  },\n\n  list() {\n    return [...commands];\n  },\n\n  names() {\n    return commands.map((command) => command.name);\n  },\n};\n"]}, "cli/commands/artifact.mjs": {"content": "import { resolve } from \"node:path\";\nimport {\n  parseCommandArguments,\n  parseIntegerOption,\n  requirePositionals,\n} from \"../command-options.mjs\";\nimport {\n  CliError,\n  EXIT_USAGE,\n  EXIT_VALIDATION,\n} from \"../errors.mjs\";\nimport { findWorkspaceRoot } from \"../../src/workspace/find-root.mjs\";\nimport { loadWorkspaceConfig } from \"../../src/workspace/load-config.mjs\";\nimport { scanWorkspaceLibrary } from \"../../src/library/scan.mjs\";\nimport { findArtifact } from \"../../src/resolution/find-artifact.mjs\";\nimport {\n  resolveArtifactAppearance,\n} from \"../../src/resolution/resolve.mjs\";\nimport {\n  buildStandaloneArtifact,\n  exportStandaloneArtifact,\n} from \"../../src/export/export-artifact.mjs\";\n\nconst SUBCOMMANDS = new Set([\n  \"inspect\",\n  \"dependencies\",\n  \"validate\",\n  \"export\",\n]);\n\nexport const artifactCommand = {\n  name: \"artifact\",\n  summary: \"Inspect, validate and export standalone artefacts.\",\n  usage: \"mydash artifact <subcommand> <artifact-id> [options]\",\n  options: [\n    \"inspect <id>                  Inspect an artefact and its effective appearance.\",\n    \"dependencies <id>             List its complete resolved dependency closure.\",\n    \"validate <id>                 Build and validate a standalone export in memory.\",\n    \"export <id>                   Write one self-contained HTML file.\",\n    \"--kind <kind>                 Disambiguate dashboard, presentation or concept.\",\n    \"--output <path>               Override the configured export path.\",\n    \"--overwrite                   Replace an existing export explicitly.\",\n    \"--minify                      Minify bundled JavaScript and CSS.\",\n    \"--max-bytes <number>          Maximum final HTML size.\",\n    \"--workspace <path>            Use a specific workspace.\",\n    \"--json                        Return structured JSON.\",\n  ],\n\n  async run(invocation, context) {\n    const [subcommand, ...rest] = invocation.args;\n\n    if (!SUBCOMMANDS.has(subcommand)) {\n      throw new CliError(\n        \"UNKNOWN_ARTIFACT_SUBCOMMAND\",\n        subcommand\n          ? `Unknown artifact subcommand: ${subcommand}`\n          : \"An artifact subcommand is required.\",\n        {\n          exitCode: EXIT_USAGE,\n          details: {\n            availableSubcommands: [...SUBCOMMANDS],\n          },\n          hint:\n            \"Run mydash help artifact to see available artifact operations.\",\n        },\n      );\n    }\n\n    const workspaceRoot = await findWorkspaceRoot(\n      invocation.options.workspace ?? context.cwd,\n    );\n\n    if (!workspaceRoot) {\n      throw new CliError(\n        \"WORKSPACE_NOT_FOUND\",\n        \"No My Dashboards workspace was found.\",\n        { exitCode: EXIT_USAGE },\n      );\n    }\n\n    switch (subcommand) {\n      case \"inspect\":\n        return runInspect(rest, workspaceRoot);\n      case \"dependencies\":\n        return runDependencies(rest, workspaceRoot);\n      case \"validate\":\n        return runValidate(rest, workspaceRoot);\n      case \"export\":\n        return runExport(rest, workspaceRoot);\n      default:\n        throw new Error(\"Unreachable artifact subcommand.\");\n    }\n  },\n};\n\nasync function runInspect(args, workspaceRoot) {\n  const parsed = parseCommandArguments(args, {\n    values: [\"kind\"],\n  });\n  requirePositionals(\n    parsed.positionals,\n    1,\n    \"mydash artifact inspect <artifact-id>\",\n  );\n\n  const { artifact, resolution } = await loadResolvedArtifact(\n    workspaceRoot,\n    parsed.positionals[0],\n    parsed.options.kind,\n  );\n\n  return {\n    ok: resolution.summary.valid,\n    command: \"artifact inspect\",\n    data: {\n      artifact: {\n        id: artifact.id,\n        kind: artifact.kind,\n        title: artifact.title,\n        entry: artifact.manifest.entry,\n        displayPath: artifact.displayPath,\n      },\n      appearance: resolution,\n    },\n    exitCode: resolution.summary.valid ? 0 : EXIT_VALIDATION,\n    text: [\n      `${artifact.kind}:${artifact.id}`,\n      `Title: ${artifact.title}`,\n      `Entry: ${artifact.manifest.entry}`,\n      `Appearance valid: ${resolution.summary.valid ? \"yes\" : \"no\"}`,\n      `Resolved dependencies: ${resolution.summary.dependencyCount}`,\n    ].join(\"\\n\"),\n  };\n}\n\nasync function runDependencies(args, workspaceRoot) {\n  const parsed = parseCommandArguments(args, {\n    values: [\"kind\"],\n  });\n  requirePositionals(\n    parsed.positionals,\n    1,\n    \"mydash artifact dependencies <artifact-id>\",\n  );\n\n  const { resolution } = await loadResolvedArtifact(\n    workspaceRoot,\n    parsed.positionals[0],\n    parsed.options.kind,\n  );\n\n  return {\n    ok: resolution.summary.valid,\n    command: \"artifact dependencies\",\n    data: {\n      artifact: resolution.artifact,\n      dependencies: resolution.dependencyClosure,\n      edges: resolution.edges,\n      issues: resolution.issues,\n    },\n    exitCode: resolution.summary.valid ? 0 : EXIT_VALIDATION,\n    text:\n      resolution.dependencyClosure.length > 0\n        ? resolution.dependencyClosure\n            .map(\n              (entry) =>\n                `${entry.kind.padEnd(10)} ${entry.id.padEnd(28)} ${entry.displayPath}`,\n            )\n            .join(\"\\n\")\n        : \"The artefact has no resolved shared dependencies.\",\n  };\n}\n\nasync function runValidate(args, workspaceRoot) {\n  const parsed = parseCommandArguments(args, {\n    booleans: [\"minify\"],\n    values: [\"kind\", \"max-bytes\"],\n  });\n  requirePositionals(\n    parsed.positionals,\n    1,\n    \"mydash artifact validate <artifact-id>\",\n  );\n\n  const maxBytes = parseIntegerOption(parsed.options.maxBytes, {\n    label: \"Maximum output bytes\",\n    minimum: 1024,\n    maximum: 200 * 1024 * 1024,\n    defaultValue: 50 * 1024 * 1024,\n  });\n  const { scan, artifact, resolution } =\n    await loadResolvedArtifact(\n      workspaceRoot,\n      parsed.positionals[0],\n      parsed.options.kind,\n    );\n\n  assertResolutionValid(resolution);\n\n  const data = await buildStandaloneArtifact({\n    workspaceRoot,\n    scan,\n    artifact,\n    resolution,\n    minify: parsed.options.minify ?? false,\n    maxBytes,\n  });\n\n  return {\n    ok: data.validation.valid,\n    command: \"artifact validate\",\n    data: {\n      artifact: data.artifact,\n      sizeBytes: data.sizeBytes,\n      sha256: data.sha256,\n      resources: data.resources,\n      validation: data.validation,\n      warnings: data.warnings,\n    },\n    exitCode: data.validation.valid ? 0 : EXIT_VALIDATION,\n    text: renderValidation(data),\n  };\n}\n\nasync function runExport(args, workspaceRoot) {\n  const parsed = parseCommandArguments(args, {\n    booleans: [\"overwrite\", \"minify\"],\n    values: [\"kind\", \"output\", \"max-bytes\"],\n  });\n  requirePositionals(\n    parsed.positionals,\n    1,\n    \"mydash artifact export <artifact-id>\",\n  );\n\n  const maxBytes = parseIntegerOption(parsed.options.maxBytes, {\n    label: \"Maximum output bytes\",\n    minimum: 1024,\n    maximum: 200 * 1024 * 1024,\n    defaultValue: 50 * 1024 * 1024,\n  });\n  const { scan, artifact, resolution } =\n    await loadResolvedArtifact(\n      workspaceRoot,\n      parsed.positionals[0],\n      parsed.options.kind,\n    );\n\n  assertResolutionValid(resolution);\n\n  const config = await loadWorkspaceConfig(workspaceRoot);\n  const outputPath = parsed.options.output\n    ? resolve(workspaceRoot, parsed.options.output)\n    : resolve(\n        workspaceRoot,\n        config.export.outputDirectory,\n        `${artifact.id}.html`,\n      );\n\n  const data = await exportStandaloneArtifact({\n    workspaceRoot,\n    scan,\n    artifact,\n    resolution,\n    outputPath,\n    overwrite: parsed.options.overwrite ?? false,\n    minify: parsed.options.minify ?? false,\n    maxBytes,\n  });\n\n  return {\n    ok: true,\n    command: \"artifact export\",\n    data,\n    warnings: data.warnings,\n    text: [\n      `Exported ${artifact.kind}:${artifact.id}`,\n      `Output: ${data.output.displayPath}`,\n      `Size: ${data.sizeBytes} bytes`,\n      `SHA-256: ${data.sha256}`,\n    ].join(\"\\n\"),\n  };\n}\n\nasync function loadResolvedArtifact(\n  workspaceRoot,\n  artifactId,\n  kind,\n) {\n  const scan = await scanWorkspaceLibrary(workspaceRoot);\n  const artifact = findArtifact(scan, artifactId, kind);\n  const resolution = resolveArtifactAppearance(scan, artifact);\n\n  return {\n    scan,\n    artifact,\n    resolution,\n  };\n}\n\nfunction assertResolutionValid(resolution) {\n  if (resolution.summary.valid) return;\n\n  throw new CliError(\n    \"ARTIFACT_RESOLUTION_INVALID\",\n    `Artefact ${resolution.artifact.kind}:${resolution.artifact.id} cannot be exported because appearance resolution failed.`,\n    {\n      exitCode: EXIT_VALIDATION,\n      details: {\n        issues: resolution.issues,\n      },\n    },\n  );\n}\n\nfunction renderValidation(data) {\n  const lines = [\n    `${data.artifact.kind}:${data.artifact.id}`,\n    `Standalone: ${data.validation.valid ? \"yes\" : \"no\"}`,\n    `Size: ${data.sizeBytes} bytes`,\n    `SHA-256: ${data.sha256}`,\n    `Inlined stylesheets: ${data.resources.stylesheets}`,\n    `Bundled scripts: ${data.resources.scripts}`,\n    `Embedded data files: ${data.resources.dataFiles}`,\n    `Embedded assets: ${data.resources.assets}`,\n    `Injected UI resources: ${data.resources.uiResources}`,\n  ];\n\n  if (data.validation.issues.length > 0) {\n    lines.push(\"\");\n    lines.push(\"Issues:\");\n\n    for (const issue of data.validation.issues) {\n      lines.push(`  ${issue.code}: ${issue.message}`);\n    }\n  }\n\n  return lines.join(\"\\n\");\n}\n"}, "src/export/paths.mjs": {"content": "import {\n  lstat,\n  realpath,\n  stat,\n} from \"node:fs/promises\";\nimport {\n  dirname,\n  isAbsolute,\n  relative,\n  resolve,\n} from \"node:path\";\n\nexport async function resolveExportSourcePath(\n  baseFile,\n  reference,\n  workspaceRoot,\n  options = {},\n) {\n  const parsed = splitReference(reference);\n\n  if (\n    parsed.path.startsWith(\"data:\") ||\n    parsed.path.startsWith(\"#\")\n  ) {\n    return {\n      kind: \"embedded\",\n      reference,\n      path: null,\n      suffix: parsed.suffix,\n    };\n  }\n\n  if (isExternalReference(parsed.path)) {\n    throw exportPathError(\n      \"EXTERNAL_RESOURCE_NOT_ALLOWED\",\n      `External resource is not allowed in a standalone export: ${reference}`,\n    );\n  }\n\n  if (\n    parsed.path.startsWith(\"blob:\") ||\n    parsed.path.startsWith(\"javascript:\")\n  ) {\n    throw exportPathError(\n      \"UNSAFE_RESOURCE_REFERENCE\",\n      `Unsupported resource reference: ${reference}`,\n    );\n  }\n\n  const candidate = resolve(\n    dirname(baseFile),\n    decodeURIComponent(parsed.path),\n  );\n  const canonicalWorkspace = await realpath(resolve(workspaceRoot));\n  const metadata = await safeLstat(candidate);\n\n  if (!metadata) {\n    throw exportPathError(\n      \"RESOURCE_NOT_FOUND\",\n      `Referenced resource does not exist: ${reference} from ${baseFile}`,\n    );\n  }\n\n  if (metadata.isSymbolicLink()) {\n    throw exportPathError(\n      \"SYMLINK_RESOURCE_REFUSED\",\n      `Symbolic-link resources are refused during export: ${candidate}`,\n    );\n  }\n\n  const canonicalCandidate = await realpath(candidate);\n\n  if (!isInside(canonicalWorkspace, canonicalCandidate)) {\n    throw exportPathError(\n      \"RESOURCE_OUTSIDE_WORKSPACE\",\n      `Referenced resource escapes the workspace: ${reference}`,\n    );\n  }\n\n  if (options.requireFile !== false) {\n    const canonicalMetadata = await stat(canonicalCandidate);\n\n    if (!canonicalMetadata.isFile()) {\n      throw exportPathError(\n        \"RESOURCE_NOT_FILE\",\n        `Referenced resource is not a file: ${reference}`,\n      );\n    }\n  }\n\n  return {\n    kind: \"file\",\n    reference,\n    path: canonicalCandidate,\n    suffix: parsed.suffix,\n  };\n}\n\nexport function isExternalReference(value) {\n  return (\n    /^https?:/i.test(value) ||\n    /^\\/\\//.test(value) ||\n    /^(?:ftp|file|ws|wss):/i.test(value)\n  );\n}\n\nexport function isInlineSafeReference(value) {\n  return (\n    value.startsWith(\"data:\") ||\n    value.startsWith(\"#\") ||\n    value === \"\"\n  );\n}\n\nexport function splitReference(value) {\n  const text = String(value).trim();\n  const match = text.match(/^([^?#]*)(.*)$/);\n\n  return {\n    path: match?.[1] ?? text,\n    suffix: match?.[2] ?? \"\",\n  };\n}\n\nexport function workspaceDisplayPath(path, workspaceRoot) {\n  const value = relative(workspaceRoot, path).replaceAll(\"\\\\\", \"/\");\n  return value.startsWith(\"..\") ? path : value || \".\";\n}\n\nfunction isInside(root, candidate) {\n  const relationship = relative(root, candidate);\n\n  return (\n    relationship === \"\" ||\n    (!relationship.startsWith(\"..\") && !isAbsolute(relationship))\n  );\n}\n\nfunction exportPathError(code, message) {\n  const error = new Error(message);\n  error.code = code;\n  return error;\n}\n\nasync function safeLstat(path) {\n  try {\n    return await lstat(path);\n  } catch (error) {\n    if (error?.code === \"ENOENT\") return null;\n    throw error;\n  }\n}\n"}, "src/export/mime.mjs": {"content": "import { extname } from \"node:path\";\n\nconst MEDIA_TYPES = new Map([\n  [\".avif\", \"image/avif\"],\n  [\".bmp\", \"image/bmp\"],\n  [\".css\", \"text/css;charset=utf-8\"],\n  [\".csv\", \"text/csv;charset=utf-8\"],\n  [\".gif\", \"image/gif\"],\n  [\".html\", \"text/html;charset=utf-8\"],\n  [\".htm\", \"text/html;charset=utf-8\"],\n  [\".ico\", \"image/x-icon\"],\n  [\".jpeg\", \"image/jpeg\"],\n  [\".jpg\", \"image/jpeg\"],\n  [\".js\", \"text/javascript;charset=utf-8\"],\n  [\".json\", \"application/json;charset=utf-8\"],\n  [\".mjs\", \"text/javascript;charset=utf-8\"],\n  [\".mp3\", \"audio/mpeg\"],\n  [\".mp4\", \"video/mp4\"],\n  [\".ndjson\", \"application/x-ndjson;charset=utf-8\"],\n  [\".ogg\", \"audio/ogg\"],\n  [\".otf\", \"font/otf\"],\n  [\".pdf\", \"application/pdf\"],\n  [\".png\", \"image/png\"],\n  [\".svg\", \"image/svg+xml\"],\n  [\".tsv\", \"text/tab-separated-values;charset=utf-8\"],\n  [\".ttf\", \"font/ttf\"],\n  [\".txt\", \"text/plain;charset=utf-8\"],\n  [\".wav\", \"audio/wav\"],\n  [\".webm\", \"video/webm\"],\n  [\".webp\", \"image/webp\"],\n  [\".woff\", \"font/woff\"],\n  [\".woff2\", \"font/woff2\"],\n  [\".xml\", \"application/xml;charset=utf-8\"],\n]);\n\nexport function mediaTypeForPath(path) {\n  return (\n    MEDIA_TYPES.get(extname(path).toLowerCase()) ??\n    \"application/octet-stream\"\n  );\n}\n\nexport function toDataUri(buffer, mediaType) {\n  return `data:${mediaType};base64,${Buffer.from(buffer).toString(\"base64\")}`;\n}\n"}, "src/export/css.mjs": {"content": "import { readFile } from \"node:fs/promises\";\nimport { dirname } from \"node:path\";\nimport { transform } from \"esbuild\";\nimport {\n  resolveExportSourcePath,\n} from \"./paths.mjs\";\nimport {\n  mediaTypeForPath,\n  toDataUri,\n} from \"./mime.mjs\";\n\nconst IMPORT_PATTERN =\n  /@import\\s+(?:url\\(\\s*)?(?:\"([^\"]+)\"|'([^']+)')\\s*\\)?\\s*([^;]*);/gi;\nconst URL_PATTERN =\n  /url\\(\\s*(?:\"([^\"]+)\"|'([^']+)'|([^)\"']+))\\s*\\)/gi;\n\nexport async function bundleCssFile(\n  path,\n  options,\n  state = createCssState(),\n) {\n  if (state.stack.has(path)) {\n    throw cssError(\n      \"CSS_IMPORT_CYCLE\",\n      `CSS import cycle detected at ${path}.`,\n    );\n  }\n\n  if (state.cache.has(path)) {\n    return state.cache.get(path);\n  }\n\n  state.stack.add(path);\n  let source = await readFile(path, \"utf8\");\n  source = await expandImports(source, path, options, state);\n  source = await inlineUrls(source, path, options);\n\n  if (options.minify) {\n    const result = await transform(source, {\n      loader: \"css\",\n      minify: true,\n      legalComments: \"none\",\n    });\n    source = result.code;\n  }\n\n  state.stack.delete(path);\n  state.cache.set(path, source);\n  return source;\n}\n\nexport async function bundleInlineCss(\n  source,\n  baseFile,\n  options,\n  state = createCssState(),\n) {\n  let output = await expandImports(\n    String(source),\n    baseFile,\n    options,\n    state,\n  );\n  output = await inlineUrls(output, baseFile, options);\n\n  if (options.minify) {\n    const result = await transform(output, {\n      loader: \"css\",\n      minify: true,\n      legalComments: \"none\",\n    });\n    output = result.code;\n  }\n\n  return output;\n}\n\nexport async function bundleStyleAttribute(\n  source,\n  baseFile,\n  options,\n) {\n  return inlineUrls(String(source), baseFile, options);\n}\n\nexport function createCssState() {\n  return {\n    cache: new Map(),\n    stack: new Set(),\n  };\n}\n\nasync function expandImports(\n  source,\n  baseFile,\n  options,\n  state,\n) {\n  const matches = [...source.matchAll(IMPORT_PATTERN)];\n  let output = source;\n\n  for (const match of matches.reverse()) {\n    const reference = match[1] ?? match[2];\n    const media = match[3]?.trim() ?? \"\";\n    const resolved = await resolveExportSourcePath(\n      baseFile,\n      reference,\n      options.workspaceRoot,\n    );\n\n    if (resolved.kind !== \"file\") {\n      throw cssError(\n        \"CSS_IMPORT_NOT_FILE\",\n        `CSS @import must reference a local file: ${reference}`,\n      );\n    }\n\n    const imported = await bundleCssFile(\n      resolved.path,\n      options,\n      state,\n    );\n    const replacement = media\n      ? `@media ${media}{${imported}}`\n      : imported;\n\n    output =\n      output.slice(0, match.index) +\n      replacement +\n      output.slice(match.index + match[0].length);\n  }\n\n  return output;\n}\n\nasync function inlineUrls(source, baseFile, options) {\n  const matches = [...source.matchAll(URL_PATTERN)];\n  let output = source;\n\n  for (const match of matches.reverse()) {\n    const reference = (\n      match[1] ??\n      match[2] ??\n      match[3] ??\n      \"\"\n    ).trim();\n\n    if (\n      !reference ||\n      reference.startsWith(\"data:\") ||\n      reference.startsWith(\"#\")\n    ) {\n      continue;\n    }\n\n    const resolved = await resolveExportSourcePath(\n      baseFile,\n      reference,\n      options.workspaceRoot,\n    );\n\n    if (resolved.kind !== \"file\") continue;\n\n    const content = await readFile(resolved.path);\n    options.onAsset?.(resolved.path);\n    const dataUri =\n      toDataUri(content, mediaTypeForPath(resolved.path)) +\n      resolved.suffix;\n    const replacement = `url(\"${dataUri}\")`;\n\n    output =\n      output.slice(0, match.index) +\n      replacement +\n      output.slice(match.index + match[0].length);\n  }\n\n  return output;\n}\n\nfunction cssError(code, message) {\n  const error = new Error(message);\n  error.code = code;\n  return error;\n}\n"}, "src/export/javascript.mjs": {"content": "import { build } from \"esbuild\";\nimport { dirname, extname } from \"node:path\";\n\nconst LOADER = {\n  \".avif\": \"dataurl\",\n  \".bmp\": \"dataurl\",\n  \".csv\": \"text\",\n  \".gif\": \"dataurl\",\n  \".html\": \"text\",\n  \".ico\": \"dataurl\",\n  \".jpeg\": \"dataurl\",\n  \".jpg\": \"dataurl\",\n  \".json\": \"json\",\n  \".png\": \"dataurl\",\n  \".svg\": \"dataurl\",\n  \".txt\": \"text\",\n  \".webp\": \"dataurl\",\n  \".woff\": \"dataurl\",\n  \".woff2\": \"dataurl\",\n};\n\nexport async function bundleJavaScriptFile(path, options = {}) {\n  const moduleScript =\n    options.module ??\n    [\".mjs\", \".mts\"].includes(extname(path).toLowerCase());\n\n  return buildJavaScript({\n    entryPoints: [path],\n    moduleScript,\n    options,\n  });\n}\n\nexport async function bundleInlineJavaScript(\n  source,\n  baseFile,\n  options = {},\n) {\n  return buildJavaScript({\n    stdin: {\n      contents: String(source),\n      resolveDir: dirname(baseFile),\n      sourcefile: `${baseFile}#inline-script`,\n      loader: options.loader ?? \"js\",\n    },\n    moduleScript: options.module ?? false,\n    options,\n  });\n}\n\nasync function buildJavaScript({\n  entryPoints,\n  stdin,\n  moduleScript,\n  options,\n}) {\n  let result;\n\n  try {\n    result = await build({\n      ...(entryPoints ? { entryPoints } : {}),\n      ...(stdin ? { stdin } : {}),\n      bundle: true,\n      write: false,\n      platform: \"browser\",\n      format: moduleScript ? \"esm\" : \"iife\",\n      target: [\"es2020\"],\n      minify: options.minify ?? false,\n      sourcemap: false,\n      legalComments: \"none\",\n      treeShaking: true,\n      charset: \"utf8\",\n      loader: LOADER,\n      logLevel: \"silent\",\n      define: {\n        \"process.env.NODE_ENV\": '\"production\"',\n      },\n    });\n  } catch (error) {\n    const wrapped = new Error(\n      `JavaScript bundling failed: ${formatBuildError(error)}`,\n    );\n    wrapped.code = \"JAVASCRIPT_BUNDLE_FAILED\";\n    throw wrapped;\n  }\n\n  let code = \"\";\n  const css = [];\n\n  for (const output of result.outputFiles ?? []) {\n    if (output.path.endsWith(\".css\")) {\n      css.push(output.text);\n    } else {\n      code += output.text;\n    }\n  }\n\n  return {\n    code: escapeScriptText(code),\n    css,\n    module: moduleScript,\n  };\n}\n\nexport function escapeScriptText(value) {\n  return String(value)\n    .replace(/<\\/script/gi, \"<\\\\/script\")\n    .replace(/<!--/g, \"<\\\\!--\");\n}\n\nfunction formatBuildError(error) {\n  if (Array.isArray(error?.errors) && error.errors.length > 0) {\n    return error.errors\n      .map((entry) => entry.text)\n      .join(\"; \");\n  }\n\n  return error instanceof Error ? error.message : String(error);\n}\n"}, "src/export/html-tree.mjs": {"content": "import {\n  parse,\n  parseFragment,\n  serialize,\n} from \"parse5\";\n\nexport function parseHtmlDocument(source) {\n  return parse(String(source), {\n    sourceCodeLocationInfo: false,\n  });\n}\n\nexport function serialiseHtml(node) {\n  return serialize(node);\n}\n\nexport function walkHtml(node, visitor) {\n  visitor(node);\n\n  for (const child of [...(node.childNodes ?? [])]) {\n    walkHtml(child, visitor);\n  }\n\n  if (node.content) {\n    walkHtml(node.content, visitor);\n  }\n}\n\nexport function findElement(root, tagName) {\n  let match = null;\n\n  walkHtml(root, (node) => {\n    if (!match && node.tagName === tagName) {\n      match = node;\n    }\n  });\n\n  return match;\n}\n\nexport function elementsByTag(root, tagName) {\n  const matches = [];\n\n  walkHtml(root, (node) => {\n    if (node.tagName === tagName) matches.push(node);\n  });\n\n  return matches;\n}\n\nexport function getAttribute(node, name) {\n  return node.attrs?.find((attribute) => attribute.name === name)\n    ?.value;\n}\n\nexport function hasAttribute(node, name) {\n  return node.attrs?.some((attribute) => attribute.name === name);\n}\n\nexport function setAttribute(node, name, value) {\n  node.attrs ??= [];\n  const existing = node.attrs.find(\n    (attribute) => attribute.name === name,\n  );\n\n  if (existing) {\n    existing.value = String(value);\n  } else {\n    node.attrs.push({\n      name,\n      value: String(value),\n    });\n  }\n}\n\nexport function removeAttribute(node, name) {\n  if (!node.attrs) return;\n  node.attrs = node.attrs.filter(\n    (attribute) => attribute.name !== name,\n  );\n}\n\nexport function textContent(node) {\n  return (node.childNodes ?? [])\n    .map((child) =>\n      child.nodeName === \"#text\"\n        ? child.value\n        : textContent(child),\n    )\n    .join(\"\");\n}\n\nexport function setTextContent(node, value) {\n  node.childNodes = [\n    {\n      nodeName: \"#text\",\n      value: String(value),\n      parentNode: node,\n    },\n  ];\n}\n\nexport function createNodes(fragment) {\n  return parseFragment(String(fragment)).childNodes ?? [];\n}\n\nexport function prependNodes(parent, nodes) {\n  parent.childNodes ??= [];\n\n  for (const node of [...nodes].reverse()) {\n    node.parentNode = parent;\n    parent.childNodes.unshift(node);\n  }\n}\n\nexport function appendNodes(parent, nodes) {\n  parent.childNodes ??= [];\n\n  for (const node of nodes) {\n    node.parentNode = parent;\n    parent.childNodes.push(node);\n  }\n}\n\nexport function replaceNode(node, replacements) {\n  const parent = node.parentNode;\n  if (!parent?.childNodes) return;\n\n  const index = parent.childNodes.indexOf(node);\n  if (index < 0) return;\n\n  for (const replacement of replacements) {\n    replacement.parentNode = parent;\n  }\n\n  parent.childNodes.splice(index, 1, ...replacements);\n}\n\nexport function removeNode(node) {\n  replaceNode(node, []);\n}\n"}, "src/export/runtime.mjs": {"content": "import { escapeScriptText } from \"./javascript.mjs\";\n\nexport function createStandaloneRuntime(options) {\n  const payload = Buffer.from(\n    JSON.stringify({\n      files: options.files,\n      assetSlots: options.assetSlots,\n      exportMetadata: options.exportMetadata,\n      resources: options.resources,\n    }),\n    \"utf8\",\n  ).toString(\"base64\");\n\n  return escapeScriptText(`(() => {\n  \"use strict\";\n\n  const decodeText = (base64) => {\n    const binary = atob(base64);\n    const bytes = Uint8Array.from(binary, (character) =>\n      character.charCodeAt(0),\n    );\n    return new TextDecoder().decode(bytes);\n  };\n\n  const payload = JSON.parse(decodeText(\"${payload}\"));\n  const files = new Map(Object.entries(payload.files));\n\n  const normalise = (value) => {\n    const raw =\n      value instanceof Request\n        ? value.url\n        : value instanceof URL\n          ? value.href\n          : String(value);\n    const clean = decodeURIComponent(raw.split(/[?#]/, 1)[0])\n      .replaceAll(\"\\\\\\\\\", \"/\");\n\n    try {\n      const url = new URL(clean, document.baseURI);\n      return url.pathname.replace(/^\\\\/+/, \"\");\n    } catch {\n      return clean.replace(/^\\\\.\\\\//, \"\").replace(/^\\\\/+/, \"\");\n    }\n  };\n\n  const findEntry = (input) => {\n    const path = normalise(input);\n    const direct = files.get(path);\n    if (direct) return direct;\n\n    for (const [key, entry] of files) {\n      const comparable = key\n        .replace(/^\\\\.\\\\.\\\\//, \"\")\n        .replace(/^\\\\.\\\\//, \"\")\n        .replace(/^\\\\/+/, \"\");\n\n      if (\n        path === comparable ||\n        path.endsWith(\"/\" + comparable)\n      ) {\n        return entry;\n      }\n    }\n\n    return null;\n  };\n\n  const bytesFor = (entry) =>\n    Uint8Array.from(atob(entry.base64), (character) =>\n      character.charCodeAt(0),\n    );\n\n  window.fetch = async (input, init = {}) => {\n    const method = String(init.method ?? \"GET\").toUpperCase();\n    const entry = findEntry(input);\n\n    if (!entry) {\n      throw new Error(\n        \"Standalone export blocked an unavailable or external fetch: \" +\n          String(input),\n      );\n    }\n\n    if (method !== \"GET\" && method !== \"HEAD\") {\n      throw new Error(\n        \"Standalone embedded resources only support GET and HEAD.\",\n      );\n    }\n\n    return new Response(\n      method === \"HEAD\" ? null : bytesFor(entry),\n      {\n        status: 200,\n        headers: {\n          \"Content-Type\": entry.mediaType,\n          \"Content-Length\": String(entry.sizeBytes),\n          \"X-MyDash-Embedded\": \"true\",\n        },\n      },\n    );\n  };\n\n  const getEmbedded = (path) => {\n    const entry = findEntry(path);\n    if (!entry) return null;\n\n    return {\n      mediaType: entry.mediaType,\n      sizeBytes: entry.sizeBytes,\n      bytes: () => bytesFor(entry),\n      text: () => decodeText(entry.base64),\n      json: () => JSON.parse(decodeText(entry.base64)),\n      dataUri: () =>\n        \"data:\" +\n        entry.mediaType +\n        \";base64,\" +\n        entry.base64,\n    };\n  };\n\n  window.MyDash = Object.freeze({\n    export: Object.freeze(payload.exportMetadata),\n    resources: Object.freeze(payload.resources),\n    assetSlots: Object.freeze(payload.assetSlots),\n    embedded: Object.freeze({\n      get: getEmbedded,\n      has: (path) => Boolean(findEntry(path)),\n      keys: () => [...files.keys()],\n    }),\n  });\n\n  document.documentElement.dataset.mydashStandalone = \"true\";\n})();`);\n}\n"}, "src/export/resources.mjs": {"content": "import {\n  lstat,\n  readFile,\n  readdir,\n  realpath,\n  stat,\n} from \"node:fs/promises\";\nimport {\n  basename,\n  dirname,\n  extname,\n  isAbsolute,\n  join,\n  relative,\n  resolve,\n} from \"node:path\";\nimport {\n  mediaTypeForPath,\n  toDataUri,\n} from \"./mime.mjs\";\nimport {\n  resolveExportSourcePath,\n  workspaceDisplayPath,\n} from \"./paths.mjs\";\n\nconst DEFAULT_SINGLE_FILE_LIMIT = 20 * 1024 * 1024;\nconst DEFAULT_TOTAL_LIMIT = 40 * 1024 * 1024;\n\nexport async function collectArtifactEmbeddedFiles(options) {\n  const files = {};\n  const seenPaths = new Set();\n  let totalBytes = 0;\n  let dataCount = 0;\n  let assetCount = 0;\n\n  for (const directoryName of [\"data\", \"assets\"]) {\n    const directory = resolve(\n      options.artifact.directory,\n      directoryName,\n    );\n\n    if (!(await isDirectory(directory))) continue;\n\n    await walk(directory, directoryName);\n  }\n\n  return {\n    files,\n    count: seenPaths.size,\n    dataCount,\n    assetCount,\n    totalBytes,\n  };\n\n  async function walk(directory, artifactRelativeDirectory) {\n    const entries = await readdir(directory, {\n      withFileTypes: true,\n    });\n    entries.sort((left, right) =>\n      left.name.localeCompare(right.name, \"en\"),\n    );\n\n    for (const entry of entries) {\n      if (entry.name.startsWith(\".\")) continue;\n\n      const absolutePath = join(directory, entry.name);\n      const relativePath =\n        `${artifactRelativeDirectory}/${entry.name}`.replaceAll(\n          \"\\\\\",\n          \"/\",\n        );\n      const metadata = await lstat(absolutePath);\n\n      if (metadata.isSymbolicLink()) {\n        throw resourceError(\n          \"SYMLINK_RESOURCE_REFUSED\",\n          `Embedded resource is a symbolic link: ${absolutePath}`,\n        );\n      }\n\n      if (metadata.isDirectory()) {\n        await walk(absolutePath, relativePath);\n        continue;\n      }\n\n      if (!metadata.isFile()) continue;\n      await addFile(\n        absolutePath,\n        relativePath,\n        artifactRelativeDirectory.split(\"/\", 1)[0],\n      );\n    }\n  }\n\n  async function addFile(\n    path,\n    artifactRelativePath,\n    category,\n  ) {\n    const canonical = await realpath(path);\n    if (seenPaths.has(canonical)) return;\n\n    const metadata = await stat(canonical);\n    const singleLimit =\n      options.singleFileLimit ?? DEFAULT_SINGLE_FILE_LIMIT;\n    const totalLimit =\n      options.totalLimit ?? DEFAULT_TOTAL_LIMIT;\n\n    if (metadata.size > singleLimit) {\n      throw resourceError(\n        \"EMBEDDED_FILE_TOO_LARGE\",\n        `Embedded file exceeds ${singleLimit} bytes: ${path}`,\n      );\n    }\n\n    totalBytes += metadata.size;\n    if (totalBytes > totalLimit) {\n      throw resourceError(\n        \"EMBEDDED_RESOURCES_TOO_LARGE\",\n        `Embedded artifact data and assets exceed ${totalLimit} bytes.`,\n      );\n    }\n\n    const content = await readFile(canonical);\n    const value = {\n      mediaType: mediaTypeForPath(canonical),\n      base64: content.toString(\"base64\"),\n      sizeBytes: metadata.size,\n      source: workspaceDisplayPath(\n        canonical,\n        options.workspaceRoot,\n      ),\n    };\n\n    for (const alias of aliasesFor(\n      artifactRelativePath,\n      options.entryPath,\n      options.artifact.directory,\n    )) {\n      files[alias] = value;\n    }\n\n    seenPaths.add(canonical);\n\n    if (category === \"data\") {\n      dataCount += 1;\n    } else if (category === \"assets\") {\n      assetCount += 1;\n    }\n\n    options.onFile?.(canonical, category);\n  }\n}\n\nexport async function resolveAssetSlots(options) {\n  const assetSlots = {};\n  const files = {};\n  const seen = new Set();\n\n  for (const [slot, selection] of Object.entries(\n    options.resolution.selections.assets,\n  )) {\n    const manifestPath = selection?.entry?.manifestPath;\n    if (!manifestPath) continue;\n\n    const entry = options.scan.entries.find(\n      (candidate) =>\n        candidate.manifestPath === manifestPath,\n    );\n    const file = entry?.manifest.file;\n\n    if (!entry || !file) continue;\n\n    const resolved = await resolveExportSourcePath(\n      entry.manifestPath,\n      file,\n      options.workspaceRoot,\n    );\n\n    if (resolved.kind !== \"file\") {\n      throw resourceError(\n        \"ASSET_FILE_INVALID\",\n        `Asset ${entry.id} does not point to a local file.`,\n      );\n    }\n\n    const canonical = resolved.path;\n    const metadata = await stat(canonical);\n    const content = await readFile(canonical);\n    const mediaType =\n      entry.manifest.mediaType ?? mediaTypeForPath(canonical);\n    const dataUri = toDataUri(content, mediaType);\n\n    assetSlots[slot] = {\n      id: entry.id,\n      mediaType,\n      dataUri,\n      sizeBytes: metadata.size,\n    };\n\n    const registryValue = {\n      mediaType,\n      base64: content.toString(\"base64\"),\n      sizeBytes: metadata.size,\n      source: workspaceDisplayPath(\n        canonical,\n        options.workspaceRoot,\n      ),\n    };\n\n    for (const alias of [\n      `assets/${entry.id}/${basename(canonical)}`,\n      `asset:${slot}`,\n      `asset:${entry.id}`,\n    ]) {\n      files[alias] = registryValue;\n    }\n\n    if (!seen.has(canonical)) {\n      seen.add(canonical);\n      options.onAsset?.(canonical);\n    }\n  }\n\n  return {\n    assetSlots,\n    files,\n    count: seen.size,\n  };\n}\n\nfunction aliasesFor(\n  artifactRelativePath,\n  entryPath,\n  artifactDirectory,\n) {\n  const entryDirectory = dirname(entryPath);\n  const absolute = resolve(\n    artifactDirectory,\n    artifactRelativePath,\n  );\n  const relativeFromEntry = relative(\n    entryDirectory,\n    absolute,\n  ).replaceAll(\"\\\\\", \"/\");\n  const clean = artifactRelativePath.replace(/^\\/+/, \"\");\n\n  return [...new Set([\n    clean,\n    `./${clean}`,\n    `/${clean}`,\n    relativeFromEntry,\n    relativeFromEntry.startsWith(\".\")\n      ? relativeFromEntry\n      : `./${relativeFromEntry}`,\n  ])];\n}\n\nasync function isDirectory(path) {\n  try {\n    return (await stat(path)).isDirectory();\n  } catch (error) {\n    if (error?.code === \"ENOENT\") return false;\n    throw error;\n  }\n}\n\nfunction resourceError(code, message) {\n  const error = new Error(message);\n  error.code = code;\n  return error;\n}\n"}, "src/export/validate-html.mjs": {"content": "import { Buffer } from \"node:buffer\";\nimport {\n  getAttribute,\n  parseHtmlDocument,\n  textContent,\n  walkHtml,\n} from \"./html-tree.mjs\";\nimport {\n  isInlineSafeReference,\n} from \"./paths.mjs\";\n\nconst RESOURCE_ATTRIBUTES = new Map([\n  [\"audio\", [\"src\"]],\n  [\"embed\", [\"src\"]],\n  [\"iframe\", [\"src\"]],\n  [\"img\", [\"src\", \"srcset\"]],\n  [\"input\", [\"src\"]],\n  [\"link\", [\"href\"]],\n  [\"object\", [\"data\"]],\n  [\"script\", [\"src\"]],\n  [\"source\", [\"src\", \"srcset\"]],\n  [\"track\", [\"src\"]],\n  [\"video\", [\"src\", \"poster\"]],\n]);\n\nexport function validateStandaloneHtml(source, options = {}) {\n  const issues = [];\n  const sizeBytes = Buffer.byteLength(source);\n  const maxBytes = options.maxBytes ?? 50 * 1024 * 1024;\n\n  if (sizeBytes > maxBytes) {\n    issues.push({\n      code: \"EXPORT_TOO_LARGE\",\n      message: `Export is ${sizeBytes} bytes; maximum is ${maxBytes}.`,\n    });\n  }\n\n  const document = parseHtmlDocument(source);\n  let runtimeFound = false;\n  let cspFound = false;\n\n  walkHtml(document, (node) => {\n    if (node.tagName === \"script\") {\n      const sourceReference = getAttribute(node, \"src\");\n      if (sourceReference) {\n        issues.push({\n          code: \"SCRIPT_SOURCE_REMAINS\",\n          message: `Script source remains: ${sourceReference}`,\n        });\n      }\n\n      if (\n        textContent(node).includes(\n          'document.documentElement.dataset.mydashStandalone = \"true\"',\n        )\n      ) {\n        runtimeFound = true;\n      }\n    }\n\n    if (node.tagName === \"meta\") {\n      const equivalent = getAttribute(node, \"http-equiv\");\n      if (\n        equivalent?.toLowerCase() === \"content-security-policy\"\n      ) {\n        cspFound = true;\n      }\n    }\n\n    if (node.tagName === \"style\") {\n      validateCss(textContent(node), issues);\n    }\n\n    const attributes =\n      RESOURCE_ATTRIBUTES.get(node.tagName) ?? [];\n\n    for (const attribute of attributes) {\n      const value = getAttribute(node, attribute);\n      if (!value) continue;\n\n      if (\n        node.tagName === \"link\" &&\n        attribute === \"href\" &&\n        !isResourceLink(node)\n      ) {\n        continue;\n      }\n\n      if (attribute === \"srcset\") {\n        for (const candidate of parseSrcset(value)) {\n          if (!isInlineSafeReference(candidate)) {\n            issues.push({\n              code: \"RESOURCE_REFERENCE_REMAINS\",\n              message: `${node.tagName}[${attribute}] still references ${candidate}.`,\n            });\n          }\n        }\n      } else if (!isInlineSafeReference(value)) {\n        issues.push({\n          code: \"RESOURCE_REFERENCE_REMAINS\",\n          message: `${node.tagName}[${attribute}] still references ${value}.`,\n        });\n      }\n    }\n  });\n\n  if (!runtimeFound) {\n    issues.push({\n      code: \"STANDALONE_RUNTIME_MISSING\",\n      message: \"The standalone embedded-resource runtime is missing.\",\n    });\n  }\n\n  if (!cspFound) {\n    issues.push({\n      code: \"EXPORT_CSP_MISSING\",\n      message: \"The standalone Content Security Policy is missing.\",\n    });\n  }\n\n  return {\n    valid: issues.length === 0,\n    sizeBytes,\n    issues,\n  };\n}\n\nfunction validateCss(source, issues) {\n  if (/@import\\s/i.test(source)) {\n    issues.push({\n      code: \"CSS_IMPORT_REMAINS\",\n      message: \"An unresolved CSS @import remains.\",\n    });\n  }\n\n  const pattern =\n    /url\\(\\s*(?:\"([^\"]+)\"|'([^']+)'|([^)\"']+))\\s*\\)/gi;\n\n  for (const match of source.matchAll(pattern)) {\n    const reference = (\n      match[1] ??\n      match[2] ??\n      match[3] ??\n      \"\"\n    ).trim();\n\n    if (!isInlineSafeReference(reference)) {\n      issues.push({\n        code: \"CSS_RESOURCE_REMAINS\",\n        message: `CSS still references ${reference}.`,\n      });\n    }\n  }\n}\n\nfunction isResourceLink(node) {\n  const relation = (\n    getAttribute(node, \"rel\") ?? \"\"\n  ).toLowerCase();\n\n  return [\n    \"stylesheet\",\n    \"icon\",\n    \"shortcut icon\",\n    \"apple-touch-icon\",\n    \"manifest\",\n    \"preload\",\n    \"modulepreload\",\n    \"prefetch\",\n  ].some((value) => relation.includes(value));\n}\n\nfunction parseSrcset(value) {\n  return value\n    .split(\",\")\n    .map((candidate) => candidate.trim().split(/\\s+/, 1)[0])\n    .filter(Boolean);\n}\n"}, "src/export/export-artifact.mjs": {"content": "import {\n  createHash,\n} from \"node:crypto\";\nimport {\n  readFile,\n} from \"node:fs/promises\";\nimport {\n  extname,\n  resolve,\n} from \"node:path\";\nimport {\n  buildStandaloneArtifactDocument,\n} from \"./rewrite-html.mjs\";\nimport {\n  validateStandaloneHtml,\n} from \"./validate-html.mjs\";\nimport {\n  writeFileAtomic,\n} from \"../files/output.mjs\";\nimport {\n  resolveExportSourcePath,\n  workspaceDisplayPath,\n} from \"./paths.mjs\";\n\nexport async function buildStandaloneArtifact(options) {\n  const entryPath = await resolveArtifactEntry(options);\n  const source = await readFile(entryPath, \"utf8\");\n  const rewritten = await buildStandaloneArtifactDocument({\n    ...options,\n    entryPath,\n    source,\n  });\n  const validation = validateStandaloneHtml(rewritten.html, {\n    maxBytes: options.maxBytes,\n  });\n\n  if (!validation.valid) {\n    const error = new Error(\n      `Standalone export validation failed: ${validation.issues\n        .map((issue) => `${issue.code}: ${issue.message}`)\n        .join(\"; \")}`,\n    );\n    error.code = \"STANDALONE_EXPORT_INVALID\";\n    error.validation = validation;\n    throw error;\n  }\n\n  const sha256 = createHash(\"sha256\")\n    .update(rewritten.html)\n    .digest(\"hex\");\n\n  return {\n    artifact: {\n      id: options.artifact.id,\n      kind: options.artifact.kind,\n      title: options.artifact.title,\n      source: options.artifact.displayPath,\n      entry: workspaceDisplayPath(\n        entryPath,\n        options.workspaceRoot,\n      ),\n    },\n    html: rewritten.html,\n    sizeBytes: validation.sizeBytes,\n    sha256,\n    validation,\n    resources: rewritten.resources,\n    warnings: rewritten.warnings,\n    sourceEntryPath: entryPath,\n  };\n}\n\nexport async function exportStandaloneArtifact(options) {\n  const built = await buildStandaloneArtifact(options);\n  if (resolve(options.outputPath) === built.sourceEntryPath) {\n    const error = new Error(\n      \"Export output cannot overwrite the artefact source entry.\",\n    );\n    error.code = \"OUTPUT_OVERWRITES_SOURCE\";\n    throw error;\n  }\n\n  const outputPath = await writeFileAtomic(\n    options.outputPath,\n    built.html,\n    {\n      workspaceRoot: options.workspaceRoot,\n      overwrite: options.overwrite ?? false,\n      encoding: \"utf8\",\n    },\n  );\n\n  return {\n    artifact: built.artifact,\n    output: {\n      path: outputPath,\n      displayPath: workspaceDisplayPath(\n        outputPath,\n        options.workspaceRoot,\n      ),\n    },\n    sizeBytes: built.sizeBytes,\n    sha256: built.sha256,\n    validation: built.validation,\n    resources: built.resources,\n    warnings: built.warnings,\n  };\n}\n\nasync function resolveArtifactEntry(options) {\n  const entry = options.artifact.manifest.entry;\n\n  if (\n    typeof entry !== \"string\" ||\n    extname(entry).toLowerCase() !== \".html\"\n  ) {\n    const error = new Error(\n      `Artefact entry must be an HTML file: ${entry ?? \"(missing)\"}`,\n    );\n    error.code = \"ARTIFACT_ENTRY_NOT_HTML\";\n    throw error;\n  }\n\n  const resolved = await resolveExportSourcePath(\n    options.artifact.manifestPath,\n    entry,\n    options.workspaceRoot,\n  );\n\n  if (resolved.kind !== \"file\") {\n    const error = new Error(\n      `Artefact entry is not a local file: ${entry}`,\n    );\n    error.code = \"ARTIFACT_ENTRY_INVALID\";\n    throw error;\n  }\n\n  return resolved.path;\n}\n"}, "src/export/rewrite-html.mjs": {"content": "import {\n  readFile,\n} from \"node:fs/promises\";\nimport {\n  extname,\n} from \"node:path\";\nimport {\n  appendNodes,\n  createNodes,\n  findElement,\n  getAttribute,\n  hasAttribute,\n  parseHtmlDocument,\n  prependNodes,\n  removeAttribute,\n  removeNode,\n  replaceNode,\n  serialiseHtml,\n  setAttribute,\n  setTextContent,\n  textContent,\n  walkHtml,\n} from \"./html-tree.mjs\";\nimport {\n  bundleCssFile,\n  bundleInlineCss,\n  bundleStyleAttribute,\n  createCssState,\n} from \"./css.mjs\";\nimport {\n  bundleInlineJavaScript,\n  bundleJavaScriptFile,\n  escapeScriptText,\n} from \"./javascript.mjs\";\nimport {\n  mediaTypeForPath,\n  toDataUri,\n} from \"./mime.mjs\";\nimport {\n  resolveExportSourcePath,\n  workspaceDisplayPath,\n} from \"./paths.mjs\";\nimport {\n  collectArtifactEmbeddedFiles,\n  resolveAssetSlots,\n} from \"./resources.mjs\";\nimport {\n  createStandaloneRuntime,\n} from \"./runtime.mjs\";\n\nconst CSP =\n  \"default-src 'none'; img-src data:; media-src data:; font-src data:; \" +\n  \"style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; \" +\n  \"object-src 'none'; frame-src data:; base-uri 'none'; form-action 'none'\";\n\nconst RESOURCE_ATTRIBUTES = new Map([\n  [\"audio\", [\"src\"]],\n  [\"embed\", [\"src\"]],\n  [\"iframe\", [\"src\"]],\n  [\"img\", [\"src\", \"srcset\"]],\n  [\"input\", [\"src\"]],\n  [\"object\", [\"data\"]],\n  [\"source\", [\"src\", \"srcset\"]],\n  [\"track\", [\"src\"]],\n  [\"video\", [\"src\", \"poster\"]],\n]);\n\nexport async function buildStandaloneArtifactDocument(options) {\n  const document = parseHtmlDocument(options.source);\n  const head = findElement(document, \"head\");\n  const body = findElement(document, \"body\");\n\n  if (!head || !body) {\n    const error = new Error(\n      \"Artefact HTML must contain head and body elements.\",\n    );\n    error.code = \"ARTIFACT_HTML_STRUCTURE_INVALID\";\n    throw error;\n  }\n\n  const counters = {\n    stylesheets: 0,\n    scripts: 0,\n    dataFiles: 0,\n    assets: 0,\n    uiResources: 0,\n  };\n  const warnings = [];\n  const consumedAssets = new Set();\n  const cssState = createCssState();\n  const sharedStyles = [];\n  const sharedScripts = [];\n  const templates = [];\n\n  const embedded = await collectArtifactEmbeddedFiles({\n    workspaceRoot: options.workspaceRoot,\n    artifact: options.artifact,\n    entryPath: options.entryPath,\n    onFile(path, category) {\n      if (category === \"assets\") {\n        consumedAssets.add(path);\n      }\n    },\n  });\n  counters.dataFiles = embedded.dataCount;\n\n  const assetResult = await resolveAssetSlots({\n    workspaceRoot: options.workspaceRoot,\n    scan: options.scan,\n    resolution: options.resolution,\n    onAsset(path) {\n      consumedAssets.add(path);\n    },\n  });\n\n  Object.assign(embedded.files, assetResult.files);\n  counters.assets = consumedAssets.size;\n\n  await processArtifactDocument(document, {\n    ...options,\n    cssState,\n    counters,\n    warnings,\n    consumedAssets,\n    assetSlots: assetResult.assetSlots,\n    sharedStyles,\n    onAsset(path) {\n      consumedAssets.add(path);\n      counters.assets = consumedAssets.size;\n    },\n  });\n\n  await collectResolvedUiResources({\n    ...options,\n    cssState,\n    counters,\n    warnings,\n    consumedAssets,\n    sharedStyles,\n    sharedScripts,\n    templates,\n  });\n\n  const metadata = {\n    schemaVersion: 1,\n    artifact: {\n      id: options.artifact.id,\n      kind: options.artifact.kind,\n      title: options.artifact.title,\n    },\n    generatedAt: new Date().toISOString(),\n    sourceEntry: workspaceDisplayPath(\n      options.entryPath,\n      options.workspaceRoot,\n    ),\n    appearance: options.resolution.selections,\n  };\n\n  const runtime = createStandaloneRuntime({\n    files: embedded.files,\n    assetSlots: Object.fromEntries(\n      Object.entries(assetResult.assetSlots).map(\n        ([slot, value]) => [slot, value.dataUri],\n      ),\n    ),\n    exportMetadata: metadata,\n    resources: {\n      dependencies: options.resolution.dependencyClosure,\n    },\n  });\n\n  const headNodes = createNodes([\n    `<meta http-equiv=\"Content-Security-Policy\" content=\"${escapeAttribute(CSP)}\">`,\n    `<meta name=\"mydash-export\" content=\"standalone-v1\">`,\n    `<script data-mydash-runtime>${runtime}</script>`,\n    themeStyle(options),\n    sharedStyles.length > 0\n      ? `<style data-mydash-shared>${escapeStyleText(\n          sharedStyles.join(\"\\n\"),\n        )}</style>`\n      : \"\",\n    ...sharedScripts.map(\n      (script) =>\n        `<script${script.module ? ' type=\"module\"' : \"\"} data-mydash-shared-script=\"${escapeAttribute(script.id)}\">${script.code}</script>`,\n    ),\n  ].join(\"\"));\n\n  prependNodes(head, headNodes);\n\n  if (templates.length > 0) {\n    appendNodes(\n      body,\n      createNodes(\n        templates\n          .map(\n            (template) =>\n              `<template data-mydash-resource=\"${escapeAttribute(\n                template.id,\n              )}\">${template.html}</template>`,\n          )\n          .join(\"\"),\n      ),\n    );\n  }\n\n  const html = serialiseHtml(document);\n\n  return {\n    html,\n    resources: counters,\n    warnings,\n  };\n}\n\nasync function processArtifactDocument(document, context) {\n  const nodes = [];\n  walkHtml(document, (node) => nodes.push(node));\n\n  for (const node of nodes) {\n    if (node.tagName === \"base\") {\n      removeNode(node);\n      context.warnings.push({\n        code: \"BASE_ELEMENT_REMOVED\",\n        message:\n          \"The HTML base element was removed so the standalone file uses stable embedded-resource resolution.\",\n      });\n      continue;\n    }\n\n    if (node.tagName === \"link\") {\n      await processLink(node, context);\n      continue;\n    }\n\n    if (node.tagName === \"style\") {\n      const css = await bundleInlineCss(\n        textContent(node),\n        context.entryPath,\n        context,\n        context.cssState,\n      );\n      setTextContent(node, escapeStyleText(css));\n      continue;\n    }\n\n    if (node.tagName === \"script\") {\n      await processScript(node, context);\n      continue;\n    }\n\n    const inlineStyle = getAttribute(node, \"style\");\n    if (inlineStyle) {\n      setAttribute(\n        node,\n        \"style\",\n        await bundleStyleAttribute(\n          inlineStyle,\n          context.entryPath,\n          context,\n        ),\n      );\n    }\n\n    await applyAssetSlot(node, context);\n    await inlineElementResources(node, context);\n  }\n}\n\nasync function processLink(node, context) {\n  const relation = (\n    getAttribute(node, \"rel\") ?? \"\"\n  ).toLowerCase();\n  const href = getAttribute(node, \"href\");\n\n  if (!href) return;\n\n  if (relation.includes(\"stylesheet\")) {\n    const resolved = await resolveExportSourcePath(\n      context.entryPath,\n      href,\n      context.workspaceRoot,\n    );\n\n    if (resolved.kind !== \"file\") {\n      throw exportError(\n        \"STYLESHEET_NOT_LOCAL\",\n        `Stylesheet must be a local file: ${href}`,\n      );\n    }\n\n    const css = await bundleCssFile(\n      resolved.path,\n      context,\n      context.cssState,\n    );\n    replaceNode(\n      node,\n      createNodes(\n        `<style data-mydash-source=\"${escapeAttribute(\n          workspaceDisplayPath(\n            resolved.path,\n            context.workspaceRoot,\n          ),\n        )}\">${escapeStyleText(css)}</style>`,\n      ),\n    );\n    context.counters.stylesheets += 1;\n    return;\n  }\n\n  if (\n    relation.includes(\"preload\") ||\n    relation.includes(\"prefetch\") ||\n    relation.includes(\"modulepreload\")\n  ) {\n    removeNode(node);\n    return;\n  }\n\n  if (\n    relation.includes(\"icon\") ||\n    relation.includes(\"manifest\")\n  ) {\n    const resolved = await resolveExportSourcePath(\n      context.entryPath,\n      href,\n      context.workspaceRoot,\n    );\n\n    if (resolved.kind === \"file\") {\n      const content = await readFile(resolved.path);\n      setAttribute(\n        node,\n        \"href\",\n        toDataUri(\n          content,\n          mediaTypeForPath(resolved.path),\n        ),\n      );\n      context.consumedAssets.add(resolved.path);\n      context.counters.assets =\n        context.consumedAssets.size;\n    }\n  }\n}\n\nasync function processScript(node, context) {\n  const type = (\n    getAttribute(node, \"type\") ?? \"\"\n  ).toLowerCase();\n\n  if (\n    type &&\n    ![\n      \"module\",\n      \"text/javascript\",\n      \"application/javascript\",\n    ].includes(type)\n  ) {\n    return;\n  }\n\n  const sourceReference = getAttribute(node, \"src\");\n  let bundled;\n\n  if (sourceReference) {\n    const resolved = await resolveExportSourcePath(\n      context.entryPath,\n      sourceReference,\n      context.workspaceRoot,\n    );\n\n    if (resolved.kind !== \"file\") {\n      throw exportError(\n        \"SCRIPT_NOT_LOCAL\",\n        `Script must be a local file: ${sourceReference}`,\n      );\n    }\n\n    bundled = await bundleJavaScriptFile(\n      resolved.path,\n      {\n        minify: context.minify,\n        module: type === \"module\",\n      },\n    );\n    removeAttribute(node, \"src\");\n    removeAttribute(node, \"integrity\");\n    removeAttribute(node, \"crossorigin\");\n  } else {\n    const source = textContent(node);\n    if (!source.trim()) return;\n\n    bundled = await bundleInlineJavaScript(\n      source,\n      context.entryPath,\n      {\n        minify: context.minify,\n        module: type === \"module\",\n      },\n    );\n  }\n\n  setTextContent(node, bundled.code);\n\n  if (bundled.module) {\n    setAttribute(node, \"type\", \"module\");\n  } else {\n    removeAttribute(node, \"type\");\n  }\n\n  if (bundled.css.length > 0) {\n    context.sharedStyles.push(...bundled.css);\n    context.warnings.push({\n      code: \"SCRIPT_CSS_EMITTED\",\n      message:\n        \"A JavaScript bundle emitted CSS; it was added to the shared export stylesheet.\",\n    });\n  }\n\n  removeAttribute(node, \"async\");\n  removeAttribute(node, \"defer\");\n  removeAttribute(node, \"nomodule\");\n  context.counters.scripts += 1;\n}\n\nasync function applyAssetSlot(node, context) {\n  const slot = getAttribute(node, \"data-mydash-asset\");\n  if (!slot) return;\n\n  const asset = context.assetSlots[slot];\n  if (!asset) {\n    throw exportError(\n      \"ASSET_SLOT_UNRESOLVED\",\n      `HTML references unresolved asset slot ${slot}.`,\n    );\n  }\n\n  const attribute =\n    node.tagName === \"object\"\n      ? \"data\"\n      : node.tagName === \"link\"\n        ? \"href\"\n        : \"src\";\n\n  setAttribute(node, attribute, asset.dataUri);\n  setAttribute(node, \"data-mydash-asset-id\", asset.id);\n}\n\nasync function inlineElementResources(node, context) {\n  const attributes =\n    RESOURCE_ATTRIBUTES.get(node.tagName) ?? [];\n\n  for (const attribute of attributes) {\n    const value = getAttribute(node, attribute);\n    if (!value || value.startsWith(\"data:\") || value.startsWith(\"#\")) {\n      continue;\n    }\n\n    if (attribute === \"srcset\") {\n      setAttribute(\n        node,\n        attribute,\n        await inlineSrcset(value, context),\n      );\n      continue;\n    }\n\n    if (node.tagName === \"iframe\") {\n      throw exportError(\n        \"IFRAME_SOURCE_UNSUPPORTED\",\n        `Standalone export does not inline iframe source ${value}. Use srcdoc or remove the iframe.`,\n      );\n    }\n\n    const resolved = await resolveExportSourcePath(\n      context.entryPath,\n      value,\n      context.workspaceRoot,\n    );\n\n    if (resolved.kind !== \"file\") continue;\n\n    const content = await readFile(resolved.path);\n    setAttribute(\n      node,\n      attribute,\n      toDataUri(\n        content,\n        mediaTypeForPath(resolved.path),\n      ) + resolved.suffix,\n    );\n    context.consumedAssets.add(resolved.path);\n    context.counters.assets =\n      context.consumedAssets.size;\n  }\n}\n\nasync function inlineSrcset(value, context) {\n  const candidates = value\n    .split(\",\")\n    .map((candidate) => candidate.trim())\n    .filter(Boolean);\n  const output = [];\n\n  for (const candidate of candidates) {\n    const [reference, ...descriptor] =\n      candidate.split(/\\s+/);\n\n    if (reference.startsWith(\"data:\")) {\n      output.push(candidate);\n      continue;\n    }\n\n    const resolved = await resolveExportSourcePath(\n      context.entryPath,\n      reference,\n      context.workspaceRoot,\n    );\n    const content = await readFile(resolved.path);\n    const dataUri = toDataUri(\n      content,\n      mediaTypeForPath(resolved.path),\n    );\n    output.push(\n      [dataUri, ...descriptor].join(\" \"),\n    );\n    context.consumedAssets.add(resolved.path);\n  }\n\n  context.counters.assets =\n    context.consumedAssets.size;\n  return output.join(\", \");\n}\n\nasync function collectResolvedUiResources(context) {\n  const seen = new Set();\n\n  for (const publicEntry of context.resolution.dependencyClosure) {\n    if (\n      ![\"layout\", \"component\", \"primitive\"].includes(\n        publicEntry.kind,\n      )\n    ) {\n      continue;\n    }\n\n    const entry = context.scan.entries.find(\n      (candidate) =>\n        candidate.manifestPath === publicEntry.manifestPath,\n    );\n\n    if (!entry || seen.has(entry.manifestPath)) continue;\n    seen.add(entry.manifestPath);\n\n    const sourcePath = await resolveUiEntry(\n      entry,\n      context.workspaceRoot,\n    );\n    const extension = extname(sourcePath).toLowerCase();\n    const id = `${entry.kind}:${entry.id}`;\n\n    if (extension === \".css\") {\n      context.sharedStyles.push(\n        await bundleCssFile(\n          sourcePath,\n          context,\n          context.cssState,\n        ),\n      );\n    } else if (\n      [\".js\", \".mjs\", \".jsx\", \".ts\", \".tsx\"].includes(\n        extension,\n      )\n    ) {\n      const bundled = await bundleJavaScriptFile(\n        sourcePath,\n        {\n          minify: context.minify,\n          module:\n            extension === \".mjs\" ||\n            entry.manifest.module === true,\n        },\n      );\n      context.sharedScripts.push({\n        id,\n        code: bundled.code,\n        module: bundled.module,\n      });\n      context.sharedStyles.push(...bundled.css);\n    } else if (\n      extension === \".html\" ||\n      extension === \".htm\"\n    ) {\n      const html = await readFile(sourcePath, \"utf8\");\n      context.templates.push({\n        id,\n        html,\n      });\n    } else {\n      throw exportError(\n        \"UI_ENTRY_FORMAT_UNSUPPORTED\",\n        `Unsupported UI entry format for ${id}: ${extension}`,\n      );\n    }\n\n    context.counters.uiResources += 1;\n  }\n}\n\nasync function resolveUiEntry(entry, workspaceRoot) {\n  const reference = entry.manifest.entry;\n\n  if (!reference) {\n    throw exportError(\n      \"UI_ENTRY_MISSING\",\n      `${entry.kind}:${entry.id} has no entry file.`,\n    );\n  }\n\n  const resolved = await resolveExportSourcePath(\n    entry.manifestPath,\n    reference,\n    workspaceRoot,\n  );\n\n  if (resolved.kind !== \"file\") {\n    throw exportError(\n      \"UI_ENTRY_INVALID\",\n      `${entry.kind}:${entry.id} entry is not a local file.`,\n    );\n  }\n\n  return resolved.path;\n}\n\nfunction themeStyle(options) {\n  const selection = options.resolution.selections.theme;\n  if (!selection?.entry?.manifestPath) return \"\";\n\n  const entry = options.scan.entries.find(\n    (candidate) =>\n      candidate.manifestPath ===\n      selection.entry.manifestPath,\n  );\n  const tokens = flattenTokens(entry?.manifest.tokens ?? {});\n  const declarations = Object.entries(tokens)\n    .map(([key, value]) => {\n      const name = key.startsWith(\"--\")\n        ? key\n        : `--${normaliseTokenName(key)}`;\n\n      return `${name}:${escapeCssValue(value)};`;\n    })\n    .join(\"\");\n\n  return declarations\n    ? `<style data-mydash-theme=\"true\">:root{${declarations}}</style>`\n    : \"\";\n}\n\nfunction flattenTokens(value, prefix = \"\", output = {}) {\n  for (const [key, child] of Object.entries(value)) {\n    const path = prefix ? `${prefix}-${key}` : key;\n\n    if (\n      child !== null &&\n      typeof child === \"object\" &&\n      !Array.isArray(child)\n    ) {\n      flattenTokens(child, path, output);\n    } else {\n      output[path] = child;\n    }\n  }\n\n  return output;\n}\n\nfunction normaliseTokenName(value) {\n  return String(value)\n    .trim()\n    .toLowerCase()\n    .replace(/[^a-z0-9_-]+/g, \"-\")\n    .replace(/^-+|-+$/g, \"\");\n}\n\nfunction escapeCssValue(value) {\n  return String(value)\n    .replace(/[{};]/g, \"\")\n    .trim();\n}\n\nfunction escapeAttribute(value) {\n  return String(value)\n    .replaceAll(\"&\", \"&amp;\")\n    .replaceAll('\"', \"&quot;\")\n    .replaceAll(\"<\", \"&lt;\");\n}\n\nfunction escapeStyleText(value) {\n  return String(value).replace(/<\\/style/gi, \"<\\\\/style\");\n}\n\nfunction exportError(code, message) {\n  const error = new Error(message);\n  error.code = code;\n  return error;\n}\n"}, "src/export/README.md": {"content": "# Standalone HTML export\n\nThe export engine converts a resolved artefact into one HTML file that works\ndirectly through `file://`.\n\n## Build sequence\n\n```text\nartefact HTML entry\n    ↓\nresolve theme, preset and UI dependencies\n    ↓\nbundle JavaScript with esbuild\n    ↓\ninline stylesheets and CSS imports\n    ↓\nconvert referenced images, fonts and media to data URIs\n    ↓\nembed artefact data and asset directories\n    ↓\ninject a local fetch-compatible runtime\n    ↓\nvalidate that no resource dependencies remain\n    ↓\nwrite atomically\n```\n\n## Runtime contract\n\nThe generated file exposes:\n\n```js\nwindow.MyDash.export\nwindow.MyDash.resources\nwindow.MyDash.assetSlots\nwindow.MyDash.embedded.get(path)\nwindow.MyDash.embedded.has(path)\nwindow.MyDash.embedded.keys()\n```\n\nLiteral and computed `fetch()` calls for embedded artefact files are intercepted.\nUnknown or external fetches are refused.\n\n## HTML asset slots\n\nAn artefact may request a resolved asset mapping:\n\n```html\n<img data-mydash-asset=\"brand-logo\" alt=\"Brand\">\n```\n\nThe export replaces the source with the selected asset's data URI.\n\n## Restrictions\n\nStandalone export rejects:\n\n- external scripts, stylesheets, fonts, images and media;\n- symbolic-link resources;\n- missing files;\n- iframe `src` resources;\n- CSS import cycles;\n- unresolved or incompatible appearance dependencies;\n- outputs above the configured size limit.\n\nLinks in normal `<a href>` elements may still navigate to websites because they\nare not load-time dependencies.\n\nA restrictive Content Security Policy prevents network connections and external\nresource loading after the file is opened.\n"}, "tests/unit/export.test.mjs": {"content": "import assert from \"node:assert/strict\";\nimport {\n  readFile,\n  rm,\n} from \"node:fs/promises\";\nimport { dirname, resolve } from \"node:path\";\nimport { fileURLToPath } from \"node:url\";\nimport test from \"node:test\";\nimport { scanWorkspaceLibrary } from \"../../src/library/scan.mjs\";\nimport { findArtifact } from \"../../src/resolution/find-artifact.mjs\";\nimport { resolveArtifactAppearance } from \"../../src/resolution/resolve.mjs\";\nimport {\n  buildStandaloneArtifact,\n  exportStandaloneArtifact,\n} from \"../../src/export/export-artifact.mjs\";\nimport { validateStandaloneHtml } from \"../../src/export/validate-html.mjs\";\n\nconst testDirectory = dirname(fileURLToPath(import.meta.url));\nconst fixtureRoot = resolve(\n  testDirectory,\n  \"../fixtures/export-workspace\",\n);\n\nasync function fixtureContext() {\n  const scan = await scanWorkspaceLibrary(fixtureRoot);\n  const artifact = findArtifact(\n    scan,\n    \"use-case-pipeline\",\n    \"dashboard\",\n  );\n  const resolution = resolveArtifactAppearance(scan, artifact);\n\n  return { scan, artifact, resolution };\n}\n\ntest(\"standalone build inlines CSS, scripts, data and assets\", async () => {\n  const context = await fixtureContext();\n  const result = await buildStandaloneArtifact({\n    workspaceRoot: fixtureRoot,\n    ...context,\n    maxBytes: 10 * 1024 * 1024,\n  });\n\n  assert.equal(result.validation.valid, true);\n  assert.equal(result.resources.stylesheets, 1);\n  assert.equal(result.resources.scripts, 1);\n  assert.equal(result.resources.dataFiles, 1);\n  assert.equal(result.resources.uiResources, 3);\n  assert.match(result.html, /data-mydash-runtime/);\n  assert.match(result.html, /data:image\\/svg\\+xml;base64/);\n  assert.match(result.html, /use-cases\\.json/);\n  assert.doesNotMatch(result.html, /<script[^>]+src=/i);\n  assert.doesNotMatch(\n    result.html,\n    /<link[^>]+rel=\"stylesheet\"/i,\n  );\n});\n\ntest(\"standalone validator detects remaining dependencies\", () => {\n  const result = validateStandaloneHtml(\n    `<!doctype html><html><head></head><body><script src=\"app.js\"></script></body></html>`,\n  );\n\n  assert.equal(result.valid, false);\n  assert.equal(\n    result.issues.some(\n      (issue) => issue.code === \"SCRIPT_SOURCE_REMAINS\",\n    ),\n    true,\n  );\n});\n\ntest(\"export writes one atomically protected HTML file\", async () => {\n  const context = await fixtureContext();\n  const output = resolve(\n    fixtureRoot,\n    \".my-dashboards\",\n    \"temp\",\n    \"export-test.html\",\n  );\n  await rm(output, { force: true });\n\n  try {\n    const result = await exportStandaloneArtifact({\n      workspaceRoot: fixtureRoot,\n      ...context,\n      outputPath: output,\n      maxBytes: 10 * 1024 * 1024,\n    });\n\n    const html = await readFile(output, \"utf8\");\n    assert.equal(result.output.path, output);\n    assert.equal(result.sha256.length, 64);\n    assert.match(html, /Content-Security-Policy/);\n\n    await assert.rejects(\n      () =>\n        exportStandaloneArtifact({\n          workspaceRoot: fixtureRoot,\n          ...context,\n          outputPath: output,\n          maxBytes: 10 * 1024 * 1024,\n        }),\n      (error) => error.code === \"OUTPUT_EXISTS\",\n    );\n  } finally {\n    await rm(output, { force: true });\n  }\n});\n"}, "tests/integration/artifact-cli.test.mjs": {"content": "import assert from \"node:assert/strict\";\nimport {\n  readFile,\n  rm,\n} from \"node:fs/promises\";\nimport { dirname, resolve } from \"node:path\";\nimport { fileURLToPath } from \"node:url\";\nimport { spawnSync } from \"node:child_process\";\nimport test from \"node:test\";\n\nconst testDirectory = dirname(fileURLToPath(import.meta.url));\nconst projectRoot = resolve(testDirectory, \"../..\");\nconst workspace = resolve(\n  projectRoot,\n  \"tests\",\n  \"fixtures\",\n  \"export-workspace\",\n);\nconst output = resolve(\n  workspace,\n  \".my-dashboards\",\n  \"temp\",\n  \"cli-export.html\",\n);\nconst cliPath = resolve(projectRoot, \"bin\", \"mydash.mjs\");\n\nfunction runCli(args) {\n  return spawnSync(process.execPath, [cliPath, ...args], {\n    cwd: projectRoot,\n    encoding: \"utf8\",\n    stdio: \"pipe\",\n    shell: false,\n  });\n}\n\ntest(\"artifact validate builds the standalone export in memory\", () => {\n  const result = runCli([\n    \"artifact\",\n    \"validate\",\n    \"use-case-pipeline\",\n    \"--kind\",\n    \"dashboard\",\n    \"--workspace\",\n    workspace,\n    \"--json\",\n  ]);\n\n  assert.equal(result.status, 0, result.stderr);\n  const body = JSON.parse(result.stdout);\n  assert.equal(body.command, \"artifact validate\");\n  assert.equal(body.data.validation.valid, true);\n});\n\ntest(\"artifact export creates one self-contained HTML file\", async () => {\n  await rm(output, { force: true });\n\n  try {\n    const result = runCli([\n      \"artifact\",\n      \"export\",\n      \"use-case-pipeline\",\n      \"--kind\",\n      \"dashboard\",\n      \"--workspace\",\n      workspace,\n      \"--output\",\n      \".my-dashboards/temp/cli-export.html\",\n      \"--json\",\n    ]);\n\n    assert.equal(result.status, 0, result.stderr);\n    const body = JSON.parse(result.stdout);\n    assert.equal(body.command, \"artifact export\");\n    assert.equal(body.data.validation.valid, true);\n\n    const html = await readFile(output, \"utf8\");\n    assert.match(html, /mydash-export/);\n    assert.doesNotMatch(html, /src=\"\\.\\/main\\.js\"/);\n  } finally {\n    await rm(output, { force: true });\n  }\n});\n"}, "scripts/tasks/test-export.mjs": {"content": "#!/usr/bin/env node\n\nimport { spawnSync } from \"node:child_process\";\nimport { dirname, resolve } from \"node:path\";\nimport { fileURLToPath } from \"node:url\";\nimport process from \"node:process\";\n\nconst scriptDirectory = dirname(fileURLToPath(import.meta.url));\nconst projectRoot = resolve(scriptDirectory, \"../..\");\n\nconst tests = [\n  resolve(projectRoot, \"tests\", \"unit\", \"export.test.mjs\"),\n  resolve(projectRoot, \"tests\", \"integration\", \"artifact-cli.test.mjs\"),\n];\n\nconst result = spawnSync(\n  process.execPath,\n  [\"--test\", ...tests],\n  {\n    cwd: projectRoot,\n    stdio: \"inherit\",\n    shell: false,\n  },\n);\n\nif (result.error) throw result.error;\nprocess.exitCode = result.status ?? 1;\n"}, "tests/fixtures/export-workspace/package.json": {"content": "{\n  \"name\": \"library-fixture\",\n  \"version\": \"0.1.0\",\n  \"private\": true,\n  \"type\": \"module\"\n}\n"}, "tests/fixtures/export-workspace/config/workspace.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"id\": \"library-fixture\",\n  \"name\": \"Library Fixture\",\n  \"libraryRoots\": {\n    \"dashboards\": \"library/dashboards\",\n    \"presentations\": \"library/presentations\",\n    \"concepts\": \"library/concepts\",\n    \"primitives\": \"library/ui/primitives\",\n    \"components\": \"library/ui/components\",\n    \"layouts\": \"library/ui/layouts\",\n    \"themes\": \"library/themes\",\n    \"presets\": \"library/presets\",\n    \"assets\": \"library/assets\"\n  },\n  \"defaults\": {\n    \"theme\": \"hsbc-light\",\n    \"preset\": \"default\"\n  },\n  \"preview\": {\n    \"host\": \"127.0.0.1\",\n    \"port\": 4173\n  },\n  \"export\": {\n    \"outputDirectory\": \"exports\"\n  }\n}\n"}, "tests/fixtures/export-workspace/library/dashboards/use-case-pipeline/artifact.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"dashboard\",\n  \"id\": \"use-case-pipeline\",\n  \"title\": \"Use Case Pipeline\",\n  \"entry\": \"src/index.html\",\n  \"appearance\": {\n    \"theme\": \"hsbc-light\",\n    \"preset\": \"default\",\n    \"overrides\": {\n      \"layout\": null,\n      \"components\": {\n        \"metric-summary\": \"metric-card\"\n      },\n      \"primitives\": {},\n      \"assets\": {}\n    }\n  }\n}\n"}, "tests/fixtures/export-workspace/library/themes/core/hsbc-light/theme.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"theme\",\n  \"id\": \"hsbc-light\",\n  \"name\": \"HSBC Light\",\n  \"level\": \"core\",\n  \"tokens\": {\n    \"colour-primary\": \"#db0011\",\n    \"colour-background\": \"#ffffff\"\n  },\n  \"assets\": {\n    \"brand-logo\": \"hsbc-red\"\n  }\n}\n"}, "tests/fixtures/export-workspace/library/presets/core/default/preset.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"preset\",\n  \"id\": \"default\",\n  \"name\": \"Default\",\n  \"level\": \"core\",\n  \"mappings\": {\n    \"layout\": \"dashboard-grid\",\n    \"components\": {\n      \"metric-summary\": \"metric-card\"\n    },\n    \"primitives\": {\n      \"button\": \"button\"\n    },\n    \"assets\": {\n      \"brand-logo\": \"hsbc-red\"\n    }\n  },\n  \"supportedThemes\": [\n    \"hsbc-light\"\n  ]\n}\n"}, "tests/fixtures/export-workspace/library/ui/layouts/core/dashboard-grid/ui.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"layout\",\n  \"id\": \"dashboard-grid\",\n  \"name\": \"Dashboard Grid\",\n  \"level\": \"core\",\n  \"slot\": \"page-layout\",\n  \"contractVersion\": 1,\n  \"entry\": \"layout.js\",\n  \"supportedThemes\": [\n    \"hsbc-light\"\n  ]\n}\n"}, "tests/fixtures/export-workspace/library/ui/components/core/metric-card/ui.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"component\",\n  \"id\": \"metric-card\",\n  \"name\": \"Metric Card\",\n  \"level\": \"core\",\n  \"slot\": \"metric-summary\",\n  \"contractVersion\": 1,\n  \"entry\": \"component.js\",\n  \"dependencies\": {\n    \"primitives\": {\n      \"button\": \"button\"\n    },\n    \"components\": {},\n    \"assets\": {}\n  },\n  \"supportedThemes\": [\n    \"hsbc-light\"\n  ]\n}\n"}, "tests/fixtures/export-workspace/library/ui/primitives/core/button/ui.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"primitive\",\n  \"id\": \"button\",\n  \"name\": \"Button\",\n  \"level\": \"core\",\n  \"slot\": \"button\",\n  \"contractVersion\": 1,\n  \"entry\": \"primitive.js\",\n  \"supportedThemes\": [\n    \"hsbc-light\"\n  ]\n}\n"}, "tests/fixtures/export-workspace/library/assets/core/hsbc-red/asset.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"asset\",\n  \"id\": \"hsbc-red\",\n  \"name\": \"HSBC Red Logo\",\n  \"level\": \"core\",\n  \"file\": \"hsbc-red.svg\",\n  \"mediaType\": \"image/svg+xml\",\n  \"category\": \"logo\",\n  \"usage\": \"Use on light backgrounds.\",\n  \"approved\": true\n}\n"}, "tests/fixtures/export-workspace/library/presentations/.gitkeep": {"content": ""}, "tests/fixtures/export-workspace/library/concepts/.gitkeep": {"content": ""}, "tests/fixtures/export-workspace/library/ui/primitives/collections/.gitkeep": {"content": ""}, "tests/fixtures/export-workspace/library/ui/components/collections/.gitkeep": {"content": ""}, "tests/fixtures/export-workspace/library/ui/layouts/collections/.gitkeep": {"content": ""}, "tests/fixtures/export-workspace/library/themes/collections/.gitkeep": {"content": ""}, "tests/fixtures/export-workspace/library/presets/collections/.gitkeep": {"content": ""}, "tests/fixtures/export-workspace/library/assets/collections/.gitkeep": {"content": ""}, "tests/fixtures/export-workspace/library/dashboards/use-case-pipeline/ui/components/metric-card/ui.json": {"content": "{\n  \"schemaVersion\": 1,\n  \"kind\": \"component\",\n  \"id\": \"metric-card\",\n  \"name\": \"Local Metric Card\",\n  \"level\": \"local\",\n  \"ownerArtifact\": \"use-case-pipeline\",\n  \"slot\": \"metric-summary\",\n  \"contractVersion\": 1,\n  \"entry\": \"component.js\",\n  \"dependencies\": {\n    \"primitives\": {\n      \"button\": \"button\"\n    },\n    \"components\": {},\n    \"assets\": {}\n  },\n  \"supportedThemes\": [\n    \"hsbc-light\"\n  ]\n}\n"}, "tests/fixtures/export-workspace/library/dashboards/use-case-pipeline/src/index.html": {"content": "<!doctype html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n    <title>Use Case Pipeline</title>\n    <link rel=\"stylesheet\" href=\"./styles.css\">\n  </head>\n  <body>\n    <header class=\"masthead\">\n      <img data-mydash-asset=\"brand-logo\" alt=\"HSBC\">\n      <h1>Use Case Pipeline</h1>\n    </header>\n    <main id=\"app\" aria-live=\"polite\"></main>\n    <script type=\"module\" src=\"./main.js\"></script>\n  </body>\n</html>\n"}, "tests/fixtures/export-workspace/library/dashboards/use-case-pipeline/src/styles.css": {"content": "@import \"./typography.css\";\n\n:root {\n  font-family: Arial, sans-serif;\n}\n\nbody {\n  margin: 0;\n  background: var(--colour-background);\n}\n\n.masthead {\n  min-height: 5rem;\n  padding: 1rem;\n  background-image: url(\"../assets/pattern.svg\");\n}\n\n.masthead img {\n  width: 7rem;\n}\n"}, "tests/fixtures/export-workspace/library/dashboards/use-case-pipeline/src/typography.css": {"content": "h1 {\n  color: var(--colour-primary);\n  letter-spacing: -0.02em;\n}\n"}, "tests/fixtures/export-workspace/library/dashboards/use-case-pipeline/src/main.js": {"content": "import { summaryText } from \"./summary.js\";\n\nconst response = await fetch(\"../data/use-cases.json\");\nconst rows = await response.json();\ndocument.querySelector(\"#app\").textContent = summaryText(rows);\ndocument.documentElement.dataset.exportTestReady = \"true\";\n"}, "tests/fixtures/export-workspace/library/dashboards/use-case-pipeline/src/summary.js": {"content": "export function summaryText(rows) {\n  return `${rows.length} use cases`;\n}\n"}, "tests/fixtures/export-workspace/library/dashboards/use-case-pipeline/data/use-cases.json": {"content": "[\n  {\n    \"id\": \"UC-001\",\n    \"status\": \"Approved\"\n  },\n  {\n    \"id\": \"UC-002\",\n    \"status\": \"Review\"\n  }\n]\n"}, "tests/fixtures/export-workspace/library/dashboards/use-case-pipeline/assets/pattern.svg": {"content": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\">\n  <path d=\"M0 0h16v16H0z\" fill=\"#f5f5f5\"/>\n  <path d=\"M0 16L16 0\" stroke=\"#e5e5e5\"/>\n</svg>\n"}, "tests/fixtures/export-workspace/library/dashboards/use-case-pipeline/ui/components/metric-card/component.js": {"content": "window.MyDashComponents = {\n  ...(window.MyDashComponents ?? {}),\n  \"metric-card\": { source: \"local\" },\n};\n"}, "tests/fixtures/export-workspace/library/ui/layouts/core/dashboard-grid/layout.js": {"content": "window.MyDashLayouts = {\n  ...(window.MyDashLayouts ?? {}),\n  \"dashboard-grid\": { columns: 12 },\n};\n"}, "tests/fixtures/export-workspace/library/ui/components/core/metric-card/component.js": {"content": "window.MyDashComponents = {\n  ...(window.MyDashComponents ?? {}),\n  \"metric-card-core\": true,\n};\n"}, "tests/fixtures/export-workspace/library/ui/primitives/core/button/primitive.js": {"content": "window.MyDashPrimitives = {\n  ...(window.MyDashPrimitives ?? {}),\n  button: { role: \"button\" },\n};\n"}, "tests/fixtures/export-workspace/library/assets/core/hsbc-red/hsbc-red.svg": {"content": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"120\" height=\"24\" viewBox=\"0 0 120 24\">\n  <rect width=\"120\" height=\"24\" fill=\"white\"/>\n  <path d=\"M2 12L14 2l12 10-12 10z\" fill=\"#db0011\"/>\n  <text x=\"34\" y=\"17\" font-family=\"Arial\" font-size=\"14\" fill=\"#111\">HSBC</text>\n</svg>\n"}};
const REQUIRED_DEPENDENCIES = {"esbuild": "0.28.1", "parse5": "8.0.1"};
const GITIGNORE_BLOCK = `
# My Dashboards generated exports
/exports/
`;

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
      "Bootstrap 10 must run from the root of the My Dashboards Git repository.",
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

  const gitignoreChanged = await updateGitignore(
    dirtyBefore,
    repoRoot,
  );

  if (gitignoreChanged) {
    ownedAbsolutePaths.push(join(targetRoot, ".gitignore"));
  }

  const removed = await removeKnownPlaceholder({
    relativePath: "src/export/.gitkeep",
    expectedContents: [
      "# Intentionally retained\n\n" +
        "Standalone HTML export services will live here.\n\n" +
        "Implementation is added by a later bootstrap step.\n",
      "# Intentionally retained\n\n" +
        "Self-contained HTML export services will live here.\n\n" +
        "Implementation is added by a later bootstrap step.\n",
    ],
    dirtyBefore,
    repoRoot,
  });

  if (removed) {
    ownedAbsolutePaths.push(
      join(targetRoot, "src", "export", ".gitkeep"),
    );
  }

  await validateGeneratedState();

  const expectedSelfPath = join(
    targetRoot,
    "scripts",
    "10-build-standalone-export.mjs",
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
        "Standalone export was created and validated, but --no-commit disabled the Git checkpoint.",
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
        if (!argv[index]) {
          failArguments("--target requires a directory path.");
        }
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
My Dashboards — Bootstrap 10

Usage:
  node scripts/10-build-standalone-export.mjs [options]

Options:
  --target <path>  Build export services in a specific repository root.
  --dry-run        Report intended changes without installing or writing.
  --no-commit      Install, write and validate without committing or pushing.
  --no-push        Commit locally but do not push.
  --json           Return a machine-readable report.
  --help, -h       Show this help.
`.trim());
}

function assertNodeVersion() {
  const major = Number.parseInt(
    process.versions.node.split(".")[0],
    10,
  );

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
    "src/files/output.mjs",
    "src/library/scan.mjs",
    "src/resolution/find-artifact.mjs",
    "src/resolution/resolve.mjs",
    "src/export",
    "scripts/tasks/test-resolution.mjs",
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
        "Bootstrap 09 has not been completed.",
        `Missing required paths: ${missing.join(", ")}`,
      ].join("\n"),
    );
  }
}

function assertPackageFilesSafe(dirtyBefore) {
  const unsafe = ["package.json", "package-lock.json"].filter(
    (path) => dirtyBefore.has(path),
  );

  if (unsafe.length > 0) {
    throw new Error(
      [
        "Bootstrap 10 needs to install pinned export dependencies.",
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
    throw new Error(
      "package.json is not valid JSON and was not modified.",
    );
  }

  packageValue.dependencies ??= {};

  for (const [name, version] of Object.entries(
    REQUIRED_DEPENDENCIES,
  )) {
    packageValue.dependencies[name] = version;
    report.dependencies.push(`${name}@${version}`);
  }

  packageValue.scripts ??= {};
  packageValue.scripts["test:export"] =
    "node scripts/tasks/test-export.mjs";

  await atomicWrite(
    packagePath,
    `${JSON.stringify(packageValue, null, 2)}\n`,
  );

  const install = run(
    "npm",
    ["install", "--no-audit", "--no-fund"],
    {
      cwd: targetRoot,
      allowFailure: true,
    },
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
        "npm could not install the standalone-export dependencies.",
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

async function updateGitignore(dirtyBefore, repoRoot) {
  const path = join(targetRoot, ".gitignore");
  const gitPath = relativeGitPath(repoRoot, path);

  if (dirtyBefore.has(gitPath)) {
    report.preserved.push(gitPath);
    report.warnings.push({
      code: "PREEXISTING_GITIGNORE_CHANGES",
      message:
        ".gitignore had pre-existing changes, so the generated-export rule was not added automatically.",
    });
    return false;
  }

  const source = (await pathExists(path))
    ? await readFile(path, "utf8")
    : "";

  if (
    source.includes("/exports/") ||
    source.includes("# My Dashboards generated exports")
  ) {
    report.preserved.push(gitPath);
    return false;
  }

  const separator =
    source.length === 0 || source.endsWith("\n") ? "" : "\n";
  const next = `${source}${separator}${GITIGNORE_BLOCK}`;

  if (args.dryRun) {
    if (source) {
      report.updated.push(gitPath);
    } else {
      report.created.push(gitPath);
    }
    return true;
  }

  await atomicWrite(path, next);

  if (source) {
    report.updated.push(gitPath);
  } else {
    report.created.push(gitPath);
  }

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
  expectedContents,
  dirtyBefore,
  repoRoot,
}) {
  const absolutePath = join(targetRoot, relativePath);
  const gitPath = relativeGitPath(repoRoot, absolutePath);

  if (
    !(await pathExists(absolutePath)) ||
    dirtyBefore.has(gitPath)
  ) {
    return false;
  }

  const current = await readFile(absolutePath, "utf8");

  if (!expectedContents.includes(current)) {
    report.preserved.push(gitPath);
    return false;
  }

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
        "The standalone export layer and dependency changes were calculated without writing them.",
    });
    return;
  }

  const modulePaths = [
    "cli/registry.mjs",
    "cli/commands/artifact.mjs",
    "src/export/paths.mjs",
    "src/export/mime.mjs",
    "src/export/css.mjs",
    "src/export/javascript.mjs",
    "src/export/html-tree.mjs",
    "src/export/runtime.mjs",
    "src/export/resources.mjs",
    "src/export/validate-html.mjs",
    "src/export/rewrite-html.mjs",
    "src/export/export-artifact.mjs",
    "tests/unit/export.test.mjs",
    "tests/integration/artifact-cli.test.mjs",
    "scripts/tasks/test-export.mjs",
  ];

  for (const relativePath of modulePaths) {
    const result = run(
      process.execPath,
      ["--check", join(targetRoot, relativePath)],
      {
        cwd: targetRoot,
        allowFailure: true,
      },
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
      `${modulePaths.length} export and CLI modules passed Node syntax checks.`,
  });

  const dependencyCheck = run(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'await Promise.all([import("esbuild"), import("parse5")]);',
    ],
    {
      cwd: targetRoot,
      allowFailure: true,
    },
  );

  if (dependencyCheck.status !== 0) {
    throw new Error(
      `Export dependency import failed:\n${
        dependencyCheck.stderr || dependencyCheck.stdout
      }`,
    );
  }

  report.validation.push({
    check: "dependency-imports",
    ok: true,
    message:
      "Pinned esbuild and parse5 dependencies can be imported.",
  });

  const tests = run(
    process.execPath,
    [join(targetRoot, "scripts", "tasks", "test-export.mjs")],
    {
      cwd: targetRoot,
      allowFailure: true,
    },
  );

  if (tests.status !== 0) {
    throw new Error(
      `Standalone export tests failed:\n${
        tests.stderr || tests.stdout
      }`,
    );
  }

  report.validation.push({
    check: "export-tests",
    ok: true,
    message:
      "Bundling, inlining, embedded fetch, validation and CLI export tests passed.",
  });

  const appearanceValidation = run(
    process.execPath,
    [
      join(targetRoot, "bin", "mydash.mjs"),
      "appearance",
      "validate",
      "--json",
    ],
    {
      cwd: targetRoot,
      allowFailure: true,
    },
  );

  if (appearanceValidation.status !== 0) {
    throw new Error(
      `The current workspace appearance validation failed:\n${
        appearanceValidation.stderr ||
        appearanceValidation.stdout
      }`,
    );
  }

  report.validation.push({
    check: "workspace-appearance",
    ok: true,
    message:
      "The current repository still has a valid resolvable appearance model.",
  });

  for (const task of [
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
      {
        cwd: targetRoot,
        allowFailure: true,
      },
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
      "Resolution, library, data, Office, filesystem, CLI and contract validation still pass.",
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
        "Standalone export was already present; there were no task-owned changes to commit.",
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
        "Standalone export was created and validated, but no commit was made because Git user.name or user.email is missing.",
    });
    return;
  }

  run("git", ["add", "--", ...ownedPaths], {
    cwd: repoRoot,
  });

  const stagedOwned = run(
    "git",
    ["diff", "--cached", "--name-only", "--", ...ownedPaths],
    {
      cwd: repoRoot,
    },
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
    [
      "commit",
      "--only",
      "-m",
      COMMIT_MESSAGE,
      "--",
      ...ownedPaths,
    ],
    {
      cwd: repoRoot,
      allowFailure: true,
    },
  );

  if (commitResult.status !== 0) {
    throw new Error(
      `Focused Git commit failed:\n${
        commitResult.stderr || commitResult.stdout
      }`,
    );
  }

  const commitHash = run(
    "git",
    ["rev-parse", "--short", "HEAD"],
    { cwd: repoRoot },
  ).stdout;
  report.git.commit = commitHash;

  if (args.noPush) {
    report.warnings.push({
      code: "PUSH_DISABLED",
      message:
        `Committed locally as ${commitHash}; --no-push prevented remote push.`,
    });
    return;
  }

  const branch = run(
    "git",
    ["branch", "--show-current"],
    { cwd: repoRoot },
  ).stdout;
  const upstream = run(
    "git",
    [
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{upstream}",
    ],
    {
      cwd: repoRoot,
      allowFailure: true,
    },
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
    pushResult = run(
      "git",
      ["push", "-u", "origin", branch],
      {
        cwd: repoRoot,
        allowFailure: true,
      },
    );
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
  const result = run(
    "git",
    ["rev-parse", "--show-toplevel"],
    {
      cwd,
      allowFailure: true,
    },
  );

  return result.status === 0
    ? resolve(result.stdout)
    : null;
}

function getDirtyPaths(repoRoot) {
  const result = run(
    "git",
    [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
    ],
    { cwd: repoRoot },
  );
  const entries = result.stdout
    ? result.stdout.split("\0").filter(Boolean)
    : [];
  const paths = new Set();

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry.length < 4) continue;

    const statusCode = entry.slice(0, 2);
    paths.add(normaliseGitPath(entry.slice(3)));

    if (
      statusCode.includes("R") ||
      statusCode.includes("C")
    ) {
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

  if (
    result.status !== 0 &&
    !options.allowFailure
  ) {
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
  const temporaryPath =
    `${path}.tmp-${process.pid}-${Date.now()}`;

  try {
    await writeFile(
      temporaryPath,
      content,
      "utf8",
    );
    await rename(temporaryPath, path);
  } finally {
    await rm(
      temporaryPath,
      { force: true },
    ).catch(() => {});
  }
}

async function writeBinaryAtomic(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath =
    `${path}.tmp-${process.pid}-${Date.now()}`;

  try {
    await writeFile(temporaryPath, content);
    await rename(temporaryPath, path);
  } finally {
    await rm(
      temporaryPath,
      { force: true },
    ).catch(() => {});
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
    (
      !relationship.startsWith("..") &&
      !resolve(path).startsWith(
        `${resolve(root)}..`,
      )
    )
  );
}

function relativeGitPath(repoRoot, path) {
  return normaliseGitPath(
    relative(repoRoot, path),
  );
}

function normaliseGitPath(path) {
  return path.replaceAll("\\", "/");
}

function uniquePaths(paths) {
  return [...new Set(paths)];
}

function finish(exitCode) {
  if (args.json) {
    console.log(
      JSON.stringify(report, null, 2),
    );
    process.exit(exitCode);
  }

  console.log(
    "\nMy Dashboards — standalone HTML export\n",
  );
  console.log(`Target: ${report.targetRoot}`);
  console.log(
    `Result: ${report.ok ? "PASS" : "FAIL"}`,
  );
  console.log(
    `Mode: ${report.dryRun ? "dry-run" : "write"}`,
  );

  printSection(
    "Dependencies",
    report.dependencies,
  );
  printSection("Created", report.created);
  printSection("Updated", report.updated);
  printSection("Removed", report.removed);
  printSection("Preserved", report.preserved);

  if (report.validation.length > 0) {
    console.log("\nValidation:");

    for (const item of report.validation) {
      console.log(
        `  ${item.ok ? "✓" : "✗"} ${item.message}`,
      );
    }
  }

  console.log("\nGit:");
  console.log(
    `  Commit: ${report.git.commit ?? "none"}`,
  );
  console.log(
    `  Pushed: ${report.git.pushed ? "yes" : "no"}`,
  );

  if (report.git.pushTarget) {
    console.log(
      `  Push target: ${report.git.pushTarget}`,
    );
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
