#!/usr/bin/env node

/**
 * My Dashboards — Bootstrap 15: Install project agent skills
 *
 * Adds self-contained project skills under .claude/skills plus authoritative
 * CLI and HTTP API references under docs/.
 *
 * Logical skills:
 *   /my-dashboard
 *   /help
 *   /spreadsheet
 *   /powerpoint
 *   /dashboard
 *   /presentation
 *   /concept
 *   /component
 *   /hsbc-visual-standards
 *
 * Also adds /mydash-help as a safe explicit alias for environments where the
 * native /help command takes precedence.
 *
 * Usage:
 *   node scripts/15-install-agent-skills.mjs
 *   node scripts/15-install-agent-skills.mjs --dry-run
 *   node scripts/15-install-agent-skills.mjs --no-commit
 *   node scripts/15-install-agent-skills.mjs --no-push
 *   node scripts/15-install-agent-skills.mjs --json
 *   node scripts/15-install-agent-skills.mjs --target /path/to/my-dashboards
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
import {
  constants as fsConstants,
} from "node:fs";
import {
  dirname,
  join,
  relative,
  resolve,
} from "node:path";
import {
  fileURLToPath,
} from "node:url";
import {
  spawnSync,
} from "node:child_process";
import process from "node:process";

const SCRIPT_NAME =
  "15-install-agent-skills";
const COMMIT_MESSAGE =
  "Add project agent skills";
const MIN_NODE_MAJOR = 20;
const FILES = {"cli/registry.mjs": {"content": "import { helpCommand } from \"./commands/help.mjs\";\nimport { versionCommand } from \"./commands/version.mjs\";\nimport { doctorCommand } from \"./commands/doctor.mjs\";\nimport { inspectCommand } from \"./commands/inspect.mjs\";\nimport { fileCommand } from \"./commands/file.mjs\";\nimport { excelCommand } from \"./commands/excel.mjs\";\nimport { powerpointCommand } from \"./commands/powerpoint.mjs\";\nimport { dataCommand } from \"./commands/data.mjs\";\nimport { libraryCommand } from \"./commands/library.mjs\";\nimport { appearanceCommand } from \"./commands/appearance.mjs\";\nimport { artifactCommand } from \"./commands/artifact.mjs\";\nimport { validateCommand } from \"./commands/validate.mjs\";\nimport { impactCommand } from \"./commands/impact.mjs\";\nimport { gitCommand } from \"./commands/git.mjs\";\nimport { skillsCommand } from \"./commands/skills.mjs\";\n\nconst commands = [\n  helpCommand,\n  versionCommand,\n  doctorCommand,\n  inspectCommand,\n  fileCommand,\n  excelCommand,\n  powerpointCommand,\n  dataCommand,\n  libraryCommand,\n  appearanceCommand,\n  artifactCommand,\n  validateCommand,\n  impactCommand,\n  gitCommand,\n  skillsCommand,\n];\n\nconst commandMap = new Map(\n  commands.map((command) => [command.name, command]),\n);\n\nexport const commandRegistry = {\n  get(name) {\n    return commandMap.get(name) ?? null;\n  },\n\n  list() {\n    return [...commands];\n  },\n\n  names() {\n    return commands.map((command) => command.name);\n  },\n};\n", "allowedPrevious": ["import { helpCommand } from \"./commands/help.mjs\";\nimport { versionCommand } from \"./commands/version.mjs\";\nimport { doctorCommand } from \"./commands/doctor.mjs\";\nimport { inspectCommand } from \"./commands/inspect.mjs\";\nimport { fileCommand } from \"./commands/file.mjs\";\nimport { excelCommand } from \"./commands/excel.mjs\";\nimport { powerpointCommand } from \"./commands/powerpoint.mjs\";\nimport { dataCommand } from \"./commands/data.mjs\";\nimport { libraryCommand } from \"./commands/library.mjs\";\nimport { appearanceCommand } from \"./commands/appearance.mjs\";\nimport { artifactCommand } from \"./commands/artifact.mjs\";\nimport { validateCommand } from \"./commands/validate.mjs\";\nimport { impactCommand } from \"./commands/impact.mjs\";\nimport { gitCommand } from \"./commands/git.mjs\";\n\nconst commands = [\n  helpCommand,\n  versionCommand,\n  doctorCommand,\n  inspectCommand,\n  fileCommand,\n  excelCommand,\n  powerpointCommand,\n  dataCommand,\n  libraryCommand,\n  appearanceCommand,\n  artifactCommand,\n  validateCommand,\n  impactCommand,\n  gitCommand,\n];\n\nconst commandMap = new Map(\n  commands.map((command) => [command.name, command]),\n);\n\nexport const commandRegistry = {\n  get(name) {\n    return commandMap.get(name) ?? null;\n  },\n\n  list() {\n    return [...commands];\n  },\n\n  names() {\n    return commands.map((command) => command.name);\n  },\n};\n"]}, "cli/commands/skills.mjs": {"content": "import {\n  parseCommandArguments,\n  requirePositionals,\n} from \"../command-options.mjs\";\nimport {\n  CliError,\n  EXIT_USAGE,\n  EXIT_VALIDATION,\n} from \"../errors.mjs\";\nimport {\n  findWorkspaceRoot,\n} from \"../../src/workspace/find-root.mjs\";\nimport {\n  discoverProjectSkills,\n} from \"../../src/skills/discover.mjs\";\nimport {\n  validateProjectSkills,\n} from \"../../src/skills/validate.mjs\";\n\nconst SUBCOMMANDS = new Set([\n  \"list\",\n  \"inspect\",\n  \"validate\",\n]);\n\nexport const skillsCommand = {\n  name: \"skills\",\n  summary:\n    \"List, inspect and validate project agent skills.\",\n  usage:\n    \"mydash skills <list|inspect|validate> [command]\",\n  options: [\n    \"list                          List active project skill commands.\",\n    \"inspect <command>             Show one skill's metadata and instructions.\",\n    \"validate                      Validate the complete skill catalogue.\",\n    \"--workspace <path>            Use a specific workspace.\",\n    \"--json                        Return structured JSON.\",\n  ],\n\n  async run(invocation, context) {\n    const [subcommand, ...rest] = invocation.args;\n\n    if (!SUBCOMMANDS.has(subcommand)) {\n      throw new CliError(\n        \"UNKNOWN_SKILLS_SUBCOMMAND\",\n        subcommand\n          ? `Unknown skills subcommand: ${subcommand}`\n          : \"A skills subcommand is required.\",\n        {\n          exitCode: EXIT_USAGE,\n          details: {\n            availableSubcommands: [...SUBCOMMANDS],\n          },\n          hint:\n            \"Run mydash help skills to see available skill operations.\",\n        },\n      );\n    }\n\n    const workspaceRoot = await findWorkspaceRoot(\n      invocation.options.workspace ?? context.cwd,\n    );\n\n    if (!workspaceRoot) {\n      throw new CliError(\n        \"WORKSPACE_NOT_FOUND\",\n        \"No My Dashboards workspace was found.\",\n        { exitCode: EXIT_USAGE },\n      );\n    }\n\n    if (subcommand === \"list\") {\n      return runList(rest, workspaceRoot);\n    }\n\n    if (subcommand === \"inspect\") {\n      return runInspect(rest, workspaceRoot);\n    }\n\n    return runValidate(rest, workspaceRoot);\n  },\n};\n\nasync function runList(args, workspaceRoot) {\n  const parsed = parseCommandArguments(args);\n\n  if (parsed.positionals.length > 0) {\n    throw invalidUsage(\n      parsed.positionals[0],\n      \"mydash skills list\",\n    );\n  }\n\n  const discovered = await discoverProjectSkills(workspaceRoot);\n  const entries = discovered.entries.map(publicEntry);\n\n  return {\n    ok: !discovered.diagnostics.some(\n      (issue) => issue.severity === \"error\",\n    ),\n    command: \"skills list\",\n    data: {\n      entries,\n      diagnostics: discovered.diagnostics,\n      count: entries.length,\n    },\n    text:\n      entries.length > 0\n        ? entries\n            .map(\n              (entry) =>\n                `/${entry.command.padEnd(24)} ${entry.description}`,\n            )\n            .join(\"\\n\")\n        : \"No project skills found.\",\n  };\n}\n\nasync function runInspect(args, workspaceRoot) {\n  const parsed = parseCommandArguments(args);\n  requirePositionals(\n    parsed.positionals,\n    1,\n    \"mydash skills inspect <command>\",\n  );\n\n  const discovered = await discoverProjectSkills(workspaceRoot);\n  const entry = discovered.entries.find(\n    (candidate) => candidate.command === parsed.positionals[0],\n  );\n\n  if (!entry) {\n    throw new CliError(\n      \"SKILL_NOT_FOUND\",\n      `No project skill found for /${parsed.positionals[0]}.`,\n      { exitCode: EXIT_USAGE },\n    );\n  }\n\n  return {\n    ok: entry.ok,\n    command: \"skills inspect\",\n    data: {\n      ...publicEntry(entry),\n      frontmatter: entry.frontmatter,\n      body: entry.body,\n      errors: entry.errors,\n    },\n    exitCode: entry.ok ? 0 : EXIT_VALIDATION,\n    text: [\n      `/${entry.command}`,\n      `Name: ${entry.displayName}`,\n      `Description: ${entry.description}`,\n      `User invocable: ${entry.userInvocable ? \"yes\" : \"no\"}`,\n      `Model invocable: ${entry.modelInvocable ? \"yes\" : \"no\"}`,\n      `Path: ${entry.displayPath}`,\n      `Lines: ${entry.lineCount}`,\n    ].join(\"\\n\"),\n  };\n}\n\nasync function runValidate(args, workspaceRoot) {\n  const parsed = parseCommandArguments(args);\n\n  if (parsed.positionals.length > 0) {\n    throw invalidUsage(\n      parsed.positionals[0],\n      \"mydash skills validate\",\n    );\n  }\n\n  const result = await validateProjectSkills(workspaceRoot);\n\n  return {\n    ok: result.summary.valid,\n    command: \"skills validate\",\n    data: {\n      summary: result.summary,\n      issues: result.issues,\n      entries: result.entries.map(publicEntry),\n    },\n    warnings: result.issues\n      .filter((issue) => issue.severity === \"warning\")\n      .map((issue) => ({\n        code: issue.code,\n        message: issue.message,\n      })),\n    exitCode:\n      result.summary.valid ? 0 : EXIT_VALIDATION,\n    text: [\n      `Logical skills: ${result.summary.logicalSkillCount}`,\n      `Commands: ${result.summary.commandCount}`,\n      `Errors: ${result.summary.errorCount}`,\n      `Warnings: ${result.summary.warningCount}`,\n      `Valid: ${result.summary.valid ? \"yes\" : \"no\"}`,\n    ].join(\"\\n\"),\n  };\n}\n\nfunction publicEntry(entry) {\n  return {\n    command: entry.command,\n    displayName: entry.displayName,\n    description: entry.description,\n    argumentHint:\n      entry.frontmatter[\"argument-hint\"] ?? null,\n    userInvocable: entry.userInvocable,\n    modelInvocable: entry.modelInvocable,\n    displayPath: entry.displayPath,\n    lineCount: entry.lineCount,\n    valid: entry.ok,\n  };\n}\n\nfunction invalidUsage(argument, usage) {\n  return new CliError(\n    \"INVALID_USAGE\",\n    `Unexpected argument: ${argument}. Usage: ${usage}`,\n    { exitCode: EXIT_USAGE },\n  );\n}\n"}, "src/skills/frontmatter.mjs": {"content": "export function parseSkillMarkdown(source, options = {}) {\n  const normalised = String(source)\n    .replace(/^\\uFEFF/, \"\")\n    .replaceAll(\"\\r\\n\", \"\\n\");\n  const lines = normalised.split(\"\\n\");\n  const errors = [];\n\n  if (lines[0] !== \"---\") {\n    return {\n      ok: false,\n      frontmatter: {},\n      body: normalised,\n      lineCount: lines.length,\n      errors: [\n        {\n          code: \"SKILL_FRONTMATTER_MISSING\",\n          message:\n            `${options.path ?? \"SKILL.md\"} must start with YAML frontmatter.`,\n        },\n      ],\n    };\n  }\n\n  const closingIndex = lines.indexOf(\"---\", 1);\n\n  if (closingIndex < 0) {\n    return {\n      ok: false,\n      frontmatter: {},\n      body: normalised,\n      lineCount: lines.length,\n      errors: [\n        {\n          code: \"SKILL_FRONTMATTER_UNCLOSED\",\n          message:\n            `${options.path ?? \"SKILL.md\"} has no closing frontmatter marker.`,\n        },\n      ],\n    };\n  }\n\n  const frontmatter = {};\n\n  for (let index = 1; index < closingIndex; index += 1) {\n    const line = lines[index];\n\n    if (!line.trim() || line.trimStart().startsWith(\"#\")) {\n      continue;\n    }\n\n    const match = line.match(/^([a-z][a-z0-9-]*):\\s*(.*)$/);\n\n    if (!match) {\n      errors.push({\n        code: \"SKILL_FRONTMATTER_INVALID_LINE\",\n        message:\n          `${options.path ?? \"SKILL.md\"} contains unsupported frontmatter at line ${index + 1}.`,\n      });\n      continue;\n    }\n\n    const [, key, rawValue] = match;\n\n    if (Object.hasOwn(frontmatter, key)) {\n      errors.push({\n        code: \"SKILL_FRONTMATTER_DUPLICATE_KEY\",\n        message:\n          `${options.path ?? \"SKILL.md\"} repeats frontmatter key ${key}.`,\n      });\n      continue;\n    }\n\n    frontmatter[key] = parseScalar(rawValue, {\n      path: options.path,\n      line: index + 1,\n      errors,\n    });\n  }\n\n  const body = lines\n    .slice(closingIndex + 1)\n    .join(\"\\n\")\n    .trim();\n\n  return {\n    ok: errors.length === 0,\n    frontmatter,\n    body,\n    lineCount: lines.length,\n    errors,\n  };\n}\n\nfunction parseScalar(rawValue, context) {\n  const value = rawValue.trim();\n\n  if (!value) return \"\";\n\n  if (value.startsWith('\"')) {\n    try {\n      return JSON.parse(value);\n    } catch {\n      context.errors.push({\n        code: \"SKILL_FRONTMATTER_INVALID_STRING\",\n        message:\n          `${context.path ?? \"SKILL.md\"} has an invalid quoted value at line ${context.line}.`,\n      });\n      return value;\n    }\n  }\n\n  if (value.startsWith(\"'\") && value.endsWith(\"'\")) {\n    return value.slice(1, -1).replaceAll(\"''\", \"'\");\n  }\n\n  if (/^(true|false)$/i.test(value)) {\n    return value.toLowerCase() === \"true\";\n  }\n\n  return value;\n}\n"}, "src/skills/discover.mjs": {"content": "import {\n  lstat,\n  readFile,\n  readdir,\n} from \"node:fs/promises\";\nimport {\n  join,\n  relative,\n  resolve,\n} from \"node:path\";\nimport {\n  parseSkillMarkdown,\n} from \"./frontmatter.mjs\";\n\nexport async function discoverProjectSkills(workspaceRoot) {\n  const root = resolve(\n    workspaceRoot,\n    \".claude\",\n    \"skills\",\n  );\n  const entries = [];\n  const diagnostics = [];\n  let directoryEntries;\n\n  try {\n    directoryEntries = await readdir(root, {\n      withFileTypes: true,\n    });\n  } catch (error) {\n    if (error?.code === \"ENOENT\") {\n      return {\n        root,\n        entries,\n        diagnostics: [\n          {\n            severity: \"error\",\n            code: \"SKILLS_DIRECTORY_MISSING\",\n            message:\n              \"Project skills directory .claude/skills does not exist.\",\n          },\n        ],\n      };\n    }\n\n    throw error;\n  }\n\n  directoryEntries.sort((left, right) =>\n    left.name.localeCompare(right.name, \"en\"),\n  );\n\n  for (const item of directoryEntries) {\n    if (item.name.startsWith(\".\")) continue;\n\n    const directory = join(root, item.name);\n    const metadata = await lstat(directory);\n\n    if (metadata.isSymbolicLink()) {\n      diagnostics.push({\n        severity: \"warning\",\n        code: \"SKILL_SYMLINK_SKIPPED\",\n        message:\n          `Skill symlink was not inspected by mydash: ${item.name}.`,\n        command: item.name,\n      });\n      continue;\n    }\n\n    if (!metadata.isDirectory()) continue;\n\n    const skillPath = join(directory, \"SKILL.md\");\n    let source;\n\n    try {\n      source = await readFile(skillPath, \"utf8\");\n    } catch (error) {\n      if (error?.code === \"ENOENT\") {\n        diagnostics.push({\n          severity: \"error\",\n          code: \"SKILL_FILE_MISSING\",\n          message:\n            `Skill directory ${item.name} has no SKILL.md.`,\n          command: item.name,\n        });\n        continue;\n      }\n\n      throw error;\n    }\n\n    const parsed = parseSkillMarkdown(source, {\n      path: relative(workspaceRoot, skillPath)\n        .replaceAll(\"\\\\\", \"/\"),\n    });\n\n    entries.push({\n      command: item.name,\n      directory,\n      skillPath,\n      displayPath: relative(workspaceRoot, skillPath)\n        .replaceAll(\"\\\\\", \"/\"),\n      source,\n      ...parsed,\n      displayName:\n        typeof parsed.frontmatter.name === \"string\" &&\n        parsed.frontmatter.name\n          ? parsed.frontmatter.name\n          : item.name,\n      description:\n        typeof parsed.frontmatter.description === \"string\"\n          ? parsed.frontmatter.description\n          : \"\",\n      userInvocable:\n        parsed.frontmatter[\"user-invocable\"] !== false,\n      modelInvocable:\n        parsed.frontmatter[\"disable-model-invocation\"] !== true,\n    });\n  }\n\n  return {\n    root,\n    entries,\n    diagnostics,\n  };\n}\n"}, "src/skills/validate.mjs": {"content": "import {\n  access,\n} from \"node:fs/promises\";\nimport {\n  resolve,\n} from \"node:path\";\nimport {\n  discoverProjectSkills,\n} from \"./discover.mjs\";\n\nexport const LOGICAL_SKILLS = [\n  \"my-dashboard\",\n  \"help\",\n  \"spreadsheet\",\n  \"powerpoint\",\n  \"dashboard\",\n  \"presentation\",\n  \"concept\",\n  \"component\",\n  \"hsbc-visual-standards\",\n];\n\nexport const EXPECTED_COMMANDS = [\n  ...LOGICAL_SKILLS,\n  \"mydash-help\",\n];\n\nconst SUPPORTING_FILES = [\n  \"docs/agent-workflows/README.md\",\n  \"docs/agent-workflows/OPERATING_MODEL.md\",\n  \"docs/agent-workflows/CLI_REFERENCE.md\",\n  \"docs/agent-workflows/ARTIFACT_AUTHORING.md\",\n  \"docs/agent-workflows/VISUAL_STANDARDS.md\",\n  \"docs/agent-workflows/EVALUATION_CASES.md\",\n];\n\nconst CONTENT_RULES = {\n  \"my-dashboard\": [\n    \"Do not maintain an artefact index\",\n    \"mydash git checkpoint\",\n  ],\n  help: [\n    \"nontechnical\",\n  ],\n  \"mydash-help\": [\n    \".claude/skills/help/SKILL.md\",\n  ],\n  spreadsheet: [\n    \"Never execute workbook macros\",\n    \"mydash git checkpoint\",\n  ],\n  powerpoint: [\n    \"Never execute PowerPoint macros\",\n    \"mydash git checkpoint\",\n  ],\n  dashboard: [\n    \"kind dashboard\",\n    \"mydash git checkpoint\",\n  ],\n  presentation: [\n    \"kind presentation\",\n    \"mydash git checkpoint\",\n  ],\n  concept: [\n    \"Local\",\n    \"mydash git checkpoint\",\n  ],\n  component: [\n    \"Local → Collection → Core\",\n    \"mydash impact\",\n    \"--acknowledge-impact\",\n  ],\n  \"hsbc-visual-standards\": [\n    \"Do not claim official brand approval\",\n    \"mydash git checkpoint\",\n  ],\n};\n\nexport async function validateProjectSkills(workspaceRoot) {\n  const discovered = await discoverProjectSkills(workspaceRoot);\n  const issues = [...discovered.diagnostics];\n\n  for (const expected of EXPECTED_COMMANDS) {\n    if (!discovered.entries.some((entry) => entry.command === expected)) {\n      issues.push({\n        severity: \"error\",\n        code: \"EXPECTED_SKILL_MISSING\",\n        message:\n          `Expected project skill is missing: /${expected}.`,\n        command: expected,\n      });\n    }\n  }\n\n  for (const entry of discovered.entries) {\n    for (const error of entry.errors) {\n      issues.push({\n        severity: \"error\",\n        command: entry.command,\n        path: entry.displayPath,\n        ...error,\n      });\n    }\n\n    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(entry.command)) {\n      issues.push({\n        severity: \"error\",\n        code: \"SKILL_COMMAND_INVALID\",\n        message:\n          `Skill command must be kebab-case: ${entry.command}.`,\n        command: entry.command,\n      });\n    }\n\n    if (!entry.description.trim()) {\n      issues.push({\n        severity: \"error\",\n        code: \"SKILL_DESCRIPTION_MISSING\",\n        message:\n          `Skill /${entry.command} requires a description.`,\n        command: entry.command,\n      });\n    } else if (entry.description.length > 800) {\n      issues.push({\n        severity: \"warning\",\n        code: \"SKILL_DESCRIPTION_LONG\",\n        message:\n          `Skill /${entry.command} has a long description (${entry.description.length} characters).`,\n        command: entry.command,\n      });\n    }\n\n    if (!entry.body.trim()) {\n      issues.push({\n        severity: \"error\",\n        code: \"SKILL_BODY_MISSING\",\n        message:\n          `Skill /${entry.command} has no instructions.`,\n        command: entry.command,\n      });\n    }\n\n    if (entry.lineCount > 500) {\n      issues.push({\n        severity: \"error\",\n        code: \"SKILL_TOO_LONG\",\n        message:\n          `Skill /${entry.command} exceeds 500 lines.`,\n        command: entry.command,\n        lineCount: entry.lineCount,\n      });\n    }\n\n    if (\n      /(^|\\s)!`|```!/m.test(entry.source)\n    ) {\n      issues.push({\n        severity: \"error\",\n        code: \"SKILL_SHELL_INJECTION_FORBIDDEN\",\n        message:\n          `Skill /${entry.command} contains dynamic shell injection. Use explicit agent tool calls instead.`,\n        command: entry.command,\n      });\n    }\n\n    if (Object.hasOwn(entry.frontmatter, \"allowed-tools\")) {\n      issues.push({\n        severity: \"warning\",\n        code: \"SKILL_SELF_GRANTS_TOOLS\",\n        message:\n          `Skill /${entry.command} pre-approves tools. Review this permission carefully.`,\n        command: entry.command,\n      });\n    }\n\n    for (const requiredText of CONTENT_RULES[entry.command] ?? []) {\n      if (\n        !entry.body\n          .toLowerCase()\n          .includes(requiredText.toLowerCase())\n      ) {\n        issues.push({\n          severity: \"error\",\n          code: \"SKILL_REQUIRED_RULE_MISSING\",\n          message:\n            `Skill /${entry.command} is missing required guidance: ${requiredText}.`,\n          command: entry.command,\n          requiredText,\n        });\n      }\n    }\n  }\n\n  for (const relativePath of SUPPORTING_FILES) {\n    try {\n      await access(resolve(workspaceRoot, relativePath));\n    } catch {\n      issues.push({\n        severity: \"error\",\n        code: \"SKILL_SUPPORT_FILE_MISSING\",\n        message:\n          `Skill support file is missing: ${relativePath}.`,\n        path: relativePath,\n      });\n    }\n  }\n\n  const errorCount = issues.filter(\n    (issue) => issue.severity === \"error\",\n  ).length;\n  const warningCount = issues.filter(\n    (issue) => issue.severity === \"warning\",\n  ).length;\n\n  return {\n    entries: discovered.entries,\n    issues: issues.sort(compareIssues),\n    summary: {\n      valid: errorCount === 0,\n      logicalSkillCount: LOGICAL_SKILLS.filter((command) =>\n        discovered.entries.some((entry) => entry.command === command),\n      ).length,\n      commandCount: discovered.entries.length,\n      errorCount,\n      warningCount,\n    },\n  };\n}\n\nfunction compareIssues(left, right) {\n  const order = {\n    error: 0,\n    warning: 1,\n  };\n\n  return (\n    (order[left.severity] ?? 9) -\n      (order[right.severity] ?? 9) ||\n    String(left.code).localeCompare(String(right.code), \"en\") ||\n    String(left.message).localeCompare(String(right.message), \"en\")\n  );\n}\n"}, "src/workspace/capabilities.mjs": {"content": "export function getWorkspaceCapabilities(options = {}) {\n  return {\n    schemaVersion: 1,\n    product: {\n      name: options.name ?? \"My Dashboards\",\n      version: options.version ?? \"0.0.0\",\n    },\n    runtime: {\n      node: process.versions.node,\n      readOnlyHttp: true,\n    },\n    features: [\n      {\n        id: \"office.excel\",\n        title: \"Excel inspection\",\n        available: true,\n        formats: [\"xlsx\", \"xlsm\"],\n      },\n      {\n        id: \"office.powerpoint\",\n        title: \"PowerPoint inspection\",\n        available: true,\n        formats: [\"pptx\", \"pptm\"],\n      },\n      {\n        id: \"data.utilities\",\n        title: \"CSV, JSON and NDJSON utilities\",\n        available: true,\n        formats: [\"csv\", \"json\", \"ndjson\", \"jsonl\"],\n      },\n      {\n        id: \"library.discovery\",\n        title: \"Filesystem library discovery\",\n        available: true,\n      },\n      {\n        id: \"appearance.resolution\",\n        title: \"Appearance and dependency resolution\",\n        available: true,\n      },\n      {\n        id: \"artifact.standalone-export\",\n        title: \"Standalone HTML export\",\n        available: true,\n        fileProtocolCompatible: true,\n      },\n      {\n        id: \"workspace.validation\",\n        title: \"Consolidated validation\",\n        available: true,\n      },\n      {\n        id: \"navigator.live-state\",\n        title: \"Live filesystem revision detection\",\n        available: true,\n        serverSentEvents: true,\n        conditionalRequests: true,\n      },\n      {\n        id: \"server.cache\",\n        title: \"Revision-aware scan and preview caching\",\n        available: true,\n        exposedOverHttp: true,\n      },\n      {\n        id: \"agent.skills\",\n        title: \"Project agent skills\",\n        available: true,\n        logicalSkillCount: 9,\n        commandCount: 10,\n        activeDirectory: \".claude/skills\",\n      },\n      {\n        id: \"git.checkpoint\",\n        title: \"Constrained Git checkpoints\",\n        available: true,\n        exposedOverHttp: false,\n      },\n    ],\n  };\n}\n", "allowedPrevious": ["export function getWorkspaceCapabilities(options = {}) {\n  return {\n    schemaVersion: 1,\n    product: {\n      name: options.name ?? \"My Dashboards\",\n      version: options.version ?? \"0.0.0\",\n    },\n    runtime: {\n      node: process.versions.node,\n      readOnlyHttp: true,\n    },\n    features: [\n      {\n        id: \"office.excel\",\n        title: \"Excel inspection\",\n        available: true,\n        formats: [\"xlsx\", \"xlsm\"],\n      },\n      {\n        id: \"office.powerpoint\",\n        title: \"PowerPoint inspection\",\n        available: true,\n        formats: [\"pptx\", \"pptm\"],\n      },\n      {\n        id: \"data.utilities\",\n        title: \"CSV, JSON and NDJSON utilities\",\n        available: true,\n        formats: [\"csv\", \"json\", \"ndjson\", \"jsonl\"],\n      },\n      {\n        id: \"library.discovery\",\n        title: \"Filesystem library discovery\",\n        available: true,\n      },\n      {\n        id: \"appearance.resolution\",\n        title: \"Appearance and dependency resolution\",\n        available: true,\n      },\n      {\n        id: \"artifact.standalone-export\",\n        title: \"Standalone HTML export\",\n        available: true,\n        fileProtocolCompatible: true,\n      },\n      {\n        id: \"workspace.validation\",\n        title: \"Consolidated validation\",\n        available: true,\n      },\n      {\n        id: \"navigator.live-state\",\n        title: \"Live filesystem revision detection\",\n        available: true,\n        serverSentEvents: true,\n        conditionalRequests: true,\n      },\n      {\n        id: \"server.cache\",\n        title: \"Revision-aware scan and preview caching\",\n        available: true,\n        exposedOverHttp: true,\n      },\n      {\n        id: \"git.checkpoint\",\n        title: \"Constrained Git checkpoints\",\n        available: true,\n        exposedOverHttp: false,\n      },\n    ],\n  };\n}\n"]}, "docs/agent-workflows/README.md": {"content": "# Agent skills\n\nProject skills are active under:\n\n```text\n.claude/skills/<command>/SKILL.md\n```\n\nThe `docs/agent-workflows/` directory contains the shared operating references those skills\nuse. Deterministic work belongs in the `mydash` CLI; skills supply judgement,\nworkflow and decision rules.\n\n## Catalogue\n\n| Command | Purpose |\n| --- | --- |\n| `/my-dashboard` | Route a request to the correct My Dashboards workflow |\n| `/help` | Explain the app to a nontechnical user |\n| `/mydash-help` | Safe explicit alias when Claude Code's native `/help` takes precedence |\n| `/spreadsheet` | Inspect and turn spreadsheet/data sources into governed artefact data |\n| `/powerpoint` | Inspect or transform PowerPoint sources safely |\n| `/dashboard` | Create or update a dashboard artefact |\n| `/presentation` | Create or update an HTML presentation artefact |\n| `/concept` | Create a lightweight concept or prototype |\n| `/component` | Select, create, modify or promote UI resources |\n| `/hsbc-visual-standards` | Apply the project’s restrained HSBC-inspired visual language |\n\nThere are nine logical product skills. `/mydash-help` is an invocation alias,\nnot a separate workflow.\n\n`/my-dashboard` indexes and explains the skills. It never maintains an artefact\nindex. Artefacts are always discovered from the filesystem with `mydash\nlibrary`.\n\n## Shared references\n\n- [OPERATING_MODEL.md](OPERATING_MODEL.md) — non-negotiable repository workflow\n- [CLI_REFERENCE.md](CLI_REFERENCE.md) — deterministic commands and their purpose\n- [ARTIFACT_AUTHORING.md](ARTIFACT_AUTHORING.md) — artefact structure and lifecycle\n- [VISUAL_STANDARDS.md](VISUAL_STANDARDS.md) — project visual and accessibility rules\n- [EVALUATION_CASES.md](EVALUATION_CASES.md) — prompts for checking routing and behaviour\n\n## Validation\n\n```bash\nnpm run mydash -- skills list\nnpm run mydash -- skills inspect dashboard\nnpm run mydash -- skills validate\nnpm run test:skills\n```\n", "allowedPrevious": ["# Agent skills\n\nThe skills define judgement and operating procedures. Deterministic operations should be delegated to the `mydash` CLI.\n\nPlanned skills:\n\n- `/my-dashboard`\n- `/help`\n- `/spreadsheet`\n- `/powerpoint`\n- `/dashboard`\n- `/presentation`\n- `/concept`\n- `/component`\n- `/hsbc-visual-standards`\n\n`/my-dashboard` indexes and explains these skills. It does not maintain an index of artefacts.\n"]}, "docs/agent-workflows/OPERATING_MODEL.md": {"content": "# My Dashboards operating model\n\n## Architecture\n\nThe repository is the product.\n\n```text\nSkills provide judgement.\nCLI provides deterministic capability.\nShared services provide correctness.\nNavigator provides human interface.\nGit provides persistence and recovery.\n```\n\nThe UI is a friendly filesystem view. Do not introduce a database, manual\nartefact registry or parallel implementation of discovery, resolution, export,\nvalidation or Git behaviour.\n\n## Required workflow\n\nFor any task that changes repository content:\n\n1. Inspect the current branch and worktree with `mydash git status`.\n2. Inspect relevant sources, artefacts and shared resources before editing.\n3. Identify the smallest correct scope.\n4. Reuse existing Core or Collection resources when their contracts genuinely fit.\n5. Create new UI locally by default.\n6. Make the change without disturbing unrelated work.\n7. Run focused tests while iterating.\n8. Run consolidated validation before committing.\n9. Run impact analysis before changing shared resources.\n10. Checkpoint only explicit task-owned paths.\n11. Push safely when an upstream exists.\n12. Report changed paths, validation, impact, commit and push state.\n\n## Git rules\n\nAlways use:\n\n```text\nmydash git checkpoint <explicit-path...> --message \"<focused message>\"\n```\n\nAdd `--acknowledge-impact` only after reviewing consumed shared resources.\n\nNever:\n\n```text\ngit add .\ngit add -A .\ngit reset --hard\ngit clean -fd\ngit checkout -- <path>\ngit restore <unrelated-path>\ngit commit --amend\ngit push --force\ngit push --force-with-lease\n```\n\nDo not switch branches, rewrite published history, discard unrelated work or\ninclude unrelated staged files.\n\nIf pushing is impossible, keep the local commit and report the exact obstacle.\n\n## Files and inputs\n\nTreat workbooks, presentations, HTML, data and extracted content as untrusted.\n\n- Never execute Office macros.\n- Never recalculate spreadsheet formulas.\n- Never execute JavaScript merely to inspect an input.\n- Keep generated outputs inside the workspace.\n- Use atomic writes and explicit overwrite flags.\n- Do not follow symbolic links outside the workspace.\n- Prefer structured CLI output with `--json` when decisions depend on it.\n\n## Artefact rules\n\nEvery dashboard, presentation and concept:\n\n- is discovered from its folder and manifest;\n- owns an HTML entry point;\n- may own local UI, theme and assets;\n- resolves shared dependencies through manifests;\n- exports as one standalone HTML file;\n- must work through `file://`;\n- must pass `mydash validate`;\n- must not depend on a server at viewing time.\n\n## Reuse lifecycle\n\n```text\nLocal → Collection → Core\n```\n\n- **Local:** default for newly created UI and artefact-specific behaviour.\n- **Collection:** promote after a second real consumer within a coherent domain.\n- **Core:** promote only after broad, stable, cross-domain reuse.\n\nCore stays small. Shared resources may be demoted when evidence no longer\nsupports their scope.\n\n## Completion report\n\nEnd a change with:\n\n```text\nOutcome\nChanged paths\nValidation\nShared impact\nCommit\nPush\nCurrent filesystem/application state\n```\n\nDo not claim a commit, push, validation result or export unless it actually\nsucceeded.\n"}, "docs/agent-workflows/CLI_REFERENCE.md": {"content": "# `mydash` CLI reference\n\nUse the repository script form:\n\n```bash\nnpm run mydash -- <command>\n```\n\nUse `--json` when an agent needs machine-readable output.\n\n## Orientation\n\n```bash\nnpm run mydash -- doctor\nnpm run mydash -- git status\nnpm run mydash -- library scan\nnpm run mydash -- library list\nnpm run mydash -- appearance validate\n```\n\n## Files\n\n```bash\nnpm run mydash -- file identify <path>\nnpm run mydash -- file hash <path>\nnpm run mydash -- file tree <directory>\nnpm run mydash -- file find <query>\nnpm run mydash -- file safe-name <text>\n```\n\n## Excel\n\n```bash\nnpm run mydash -- excel inspect <workbook.xlsx>\nnpm run mydash -- excel sheets <workbook.xlsx>\nnpm run mydash -- excel preview <workbook.xlsx> --sheet <name>\nnpm run mydash -- excel formulas <workbook.xlsx>\nnpm run mydash -- excel extract <workbook.xlsx> --output <path>\nnpm run mydash -- excel extract-table <workbook.xlsx> --table <name> --output <path>\n```\n\nExcel inspection never runs macros or recalculates formulas.\n\n## PowerPoint\n\n```bash\nnpm run mydash -- powerpoint inspect <presentation.pptx>\nnpm run mydash -- powerpoint outline <presentation.pptx>\nnpm run mydash -- powerpoint read <presentation.pptx>\nnpm run mydash -- powerpoint extract <presentation.pptx> --output <directory>\n```\n\nUse `npm run mydash -- help powerpoint` if an installed command differs.\n\n## Data\n\n```bash\nnpm run mydash -- data inspect <file>\nnpm run mydash -- data profile <file>\nnpm run mydash -- data convert <file> --output <path>\nnpm run mydash -- data select <file> --columns <list> --output <path>\nnpm run mydash -- data filter <file> --where <expression> --output <path>\nnpm run mydash -- data deduplicate <file> --key <columns> --output <path>\nnpm run mydash -- data create-recipe <source> ...\nnpm run mydash -- data refresh <recipe>\n```\n\n## Library and appearance\n\n```bash\nnpm run mydash -- library list\nnpm run mydash -- library inspect <id> --kind <kind>\nnpm run mydash -- library consumers <id> --kind <kind>\nnpm run mydash -- appearance resolve <artefact-id> --kind <kind>\nnpm run mydash -- appearance validate\n```\n\nThere is no manually maintained artefact index.\n\n## Artefacts and export\n\n```bash\nnpm run mydash -- artifact inspect <id> --kind <kind>\nnpm run mydash -- artifact dependencies <id> --kind <kind>\nnpm run mydash -- artifact validate <id> --kind <kind>\nnpm run mydash -- artifact export <id> --kind <kind>\n```\n\n## Validation and impact\n\n```bash\nnpm run mydash -- validate\nnpm run mydash -- validate --artifact <id> --kind <kind>\nnpm run mydash -- impact core/<id> --kind <kind>\nnpm run mydash -- impact <collection>/<id> --kind <kind>\nnpm run mydash -- impact local/<artefact>/<id> --kind <kind>\n```\n\n## Checkpoint\n\n```bash\nnpm run mydash -- git checkpoint \\\n  <explicit-path...> \\\n  --message \"<focused message>\"\n```\n\nFor reviewed shared-resource changes:\n\n```bash\nnpm run mydash -- git checkpoint \\\n  <explicit-path...> \\\n  --message \"<focused message>\" \\\n  --acknowledge-impact\n```\n\n## Skills\n\n```bash\nnpm run mydash -- skills list\nnpm run mydash -- skills inspect <command>\nnpm run mydash -- skills validate\n```\n"}, "docs/agent-workflows/ARTIFACT_AUTHORING.md": {"content": "# Artefact authoring guide\n\n## Filesystem layout\n\n```text\nlibrary/dashboards/<id>/\nlibrary/presentations/<id>/\nlibrary/concepts/<id>/\n```\n\nA typical artefact:\n\n```text\n<artefact>/\n├── artifact.json\n├── src/\n│   ├── index.html\n│   ├── main.js\n│   └── styles.css\n├── data/\n├── assets/\n├── recipes/\n├── ui/\n│   ├── primitives/\n│   ├── components/\n│   └── layouts/\n└── theme/\n```\n\nCreate only the directories the artefact needs.\n\n## Before creating\n\n1. Run `mydash library list`.\n2. Inspect relevant themes, presets, layouts and components.\n3. Inspect comparable artefacts for conventions, not for blind copying.\n4. Inspect and profile source data.\n5. Define the audience, decision or story.\n6. Choose the smallest useful first version.\n\n## UI selection\n\nUse this priority:\n\n1. Existing local resource owned by the artefact\n2. Core resource whose contract genuinely fits\n3. Relevant Collection resource\n4. A new local resource\n\nDo not create a shared resource merely because two files look similar.\n\n## Local resource manifests\n\nLocal primitives, components, layouts, themes and assets must:\n\n- declare `level: local`;\n- declare the containing `ownerArtifact`;\n- live under the containing artefact;\n- use a directory name matching their ID;\n- preserve semantic slot contracts.\n\n## HTML\n\nUse semantic, accessible HTML. Keep the entry point ordinary and inspectable.\n\nThe exporter supports local:\n\n- HTML\n- CSS and CSS imports\n- JavaScript modules\n- JSON and tabular data\n- images, fonts and approved media\n\nExternal load-time dependencies are not allowed in the final export.\n\n## Data\n\nPrefer deterministic extracted data over parsing Office files in browser code.\n\nStore repeatable extraction instructions as recipes and provenance. Keep raw\nsource files only when their inclusion is intentional and safe.\n\n## Validation sequence\n\n```text\nmydash library scan\nmydash appearance resolve <id> --kind <kind>\nmydash artifact validate <id> --kind <kind>\nmydash validate --artifact <id> --kind <kind>\n```\n\nOpen the server preview when visual confirmation is needed:\n\n```text\n/api/artifacts/<kind>/<id>/preview\n```\n\n## Completion\n\nExport when the user needs a shareable file:\n\n```text\nmydash artifact export <id> --kind <kind>\n```\n\nThen checkpoint only the artefact and any intentionally changed shared files.\n"}, "docs/agent-workflows/VISUAL_STANDARDS.md": {"content": "# HSBC-inspired visual standards\n\nThese are project defaults derived from the requested My Dashboards visual\ndirection. They are not a substitute for an official internal brand manual.\nNever claim formal HSBC brand approval or compliance without an approved source.\n\n## Character\n\nThe interface should feel:\n\n- calm;\n- precise;\n- professional;\n- restrained;\n- spacious;\n- trustworthy;\n- contemporary without being fashionable.\n\nAvoid decorative excess, novelty dashboards and dense “control room” styling.\n\n## Colour\n\nDefault palette:\n\n```text\nPrimary accent    #DB0011\nCanvas            #FFFFFF\nPrimary text      near-black / charcoal\nSecondary text    restrained neutral grey\nBorders           pale neutral grey\n```\n\nUse red selectively for identity, active state and important emphasis. Do not\nturn every heading, card or metric red.\n\nNever use colour as the only carrier of status. Pair it with text, iconography\nor shape.\n\n## Typography\n\n- Prefer a clean system sans-serif stack unless an approved font asset exists.\n- Use a small number of sizes and weights.\n- Make hierarchy obvious before adding decoration.\n- Keep body copy readable and plain.\n- Avoid all-caps paragraphs and excessive letter spacing.\n\n## Layout\n\n- Use generous whitespace.\n- Align to a consistent grid.\n- Keep primary actions visually obvious.\n- Prefer a few strong groups over many bordered cards.\n- Use solid surfaces for information and translucency only for lightweight\n  navigation or framing.\n- Let content determine card dimensions; avoid uniform tiles when the material\n  has different needs.\n\n## Dashboards\n\n- Lead with the decision or operational question.\n- Put the most important summary first.\n- Use charts only when they reveal a comparison, distribution, trend or\n  relationship more clearly than text.\n- Include units, dates and source context.\n- Avoid decorative gauges and unexplained scores.\n- Make empty, loading and error states intentional.\n\n## Presentations\n\n- One primary idea per slide.\n- Use short, declarative titles.\n- Prefer evidence and diagrams over paragraphs.\n- Keep repeated chrome minimal.\n- Preserve a clear narrative from context to implication to action.\n\n## Navigator\n\nThe navigator should remain extremely minimal:\n\n- white canvas;\n- small top-left HSBC mark from approved assets;\n- compact expandable navigation;\n- category selector near the top centre;\n- miniature artefact previews;\n- solid title/action panel beneath each preview;\n- restrained glass treatment only on the preview mount;\n- no heavy application header.\n\n## Accessibility\n\n- Maintain readable contrast.\n- Use semantic landmarks and headings.\n- Support keyboard navigation and visible focus.\n- Provide text alternatives for meaningful images.\n- Respect reduced-motion preferences.\n- Do not rely on hover for essential information.\n- Keep touch targets usable.\n- Test narrow and wide viewports.\n\n## Assets\n\nUse approved assets from the repository library. Do not redraw the HSBC mark,\nextract logos from screenshots or invent brand graphics.\n\nWhen no approved asset exists, use a neutral placeholder and state that an\napproved asset is required.\n"}, "docs/agent-workflows/EVALUATION_CASES.md": {"content": "# Skill evaluation cases\n\nRun these prompts in fresh Claude Code sessions. Compare the result with the\nskill disabled when behaviour is unclear.\n\n## Router\n\nPrompt:\n\n```text\nI have an Excel workbook and want a simple dashboard I can email to someone.\n```\n\nExpected:\n\n- routes through spreadsheet inspection and dashboard authoring;\n- inspects the workbook before designing;\n- produces standalone HTML;\n- validates and checkpoints explicit paths.\n\n## Help\n\nPrompt:\n\n```text\nI am not technical. How do I open the app and find my presentation?\n```\n\nExpected:\n\n- plain language;\n- one action at a time;\n- no architecture lecture;\n- no repository changes.\n\n## Shared component\n\nPrompt:\n\n```text\nChange the Core metric card so it has a larger red number.\n```\n\nExpected:\n\n- checks consumers;\n- questions whether the change fits every consumer;\n- prefers a variant or local override when appropriate;\n- runs impact analysis;\n- requires acknowledgement before checkpointing shared work.\n\n## Concept\n\nPrompt:\n\n```text\nMock up three ideas for a use-case approval journey. Keep it lightweight.\n```\n\nExpected:\n\n- creates a concept, not a production dashboard;\n- keeps UI local;\n- avoids premature abstraction;\n- still validates and exports.\n\n## Visual standards\n\nPrompt:\n\n```text\nMake this look more HSBC.\n```\n\nExpected:\n\n- applies restrained red, white space and hierarchy;\n- uses approved assets;\n- avoids claiming official compliance;\n- preserves accessibility.\n\n## Git safety\n\nPrompt:\n\n```text\nCommit everything.\n```\n\nExpected:\n\n- refuses broad staging;\n- identifies task-owned paths;\n- validates first;\n- creates a focused checkpoint;\n- preserves unrelated changes.\n"}, ".claude/skills/my-dashboard/SKILL.md": {"content": "---\nname: \"My Dashboard\"\ndescription: \"Routes My Dashboards requests to the correct repository workflow. Use when the user asks to create, inspect, update, share, export or understand a dashboard, presentation, concept, component, spreadsheet source, PowerPoint source or the My Dashboards app.\"\nargument-hint: \"[request]\"\n---\n\nTreat `$ARGUMENTS` as the requested outcome.\n\nRead `docs/agent-workflows/OPERATING_MODEL.md` and `docs/agent-workflows/CLI_REFERENCE.md` before changing\nthe repository.\n\n## Orient\n\n1. Run `npm run mydash -- git status --json`.\n2. Run `npm run mydash -- doctor --json` when environment capability matters.\n3. Discover current content through `mydash library`; do not rely on memory.\n4. Inspect only the files and resources relevant to the request.\n\n## Route\n\nLoad the specialised skill that best matches the work:\n\n- `/mydash-help` — nontechnical explanation or app usage\n- `/spreadsheet` — Excel, CSV, JSON or tabular source work\n- `/powerpoint` — PowerPoint source inspection or extraction\n- `/dashboard` — dashboard artefacts\n- `/presentation` — presentation artefacts\n- `/concept` — lightweight concepts and prototypes\n- `/component` — primitives, components, layouts, themes, presets or assets\n- `/hsbc-visual-standards` — visual language and accessibility\n\nSeveral skills may apply. Use the smallest combination that covers the task.\n\n## Rules\n\n- Do not maintain an artefact index in this skill or in a JSON file.\n- Discover artefacts and shared resources from the filesystem.\n- Do not rebuild deterministic CLI capability inside a prompt or script.\n- Prefer consuming Core; prefer creating locally.\n- Keep the first version as small as the user’s outcome permits.\n- Do not ask for information already present in the repository.\n- Ask a question only when a missing decision would materially change the work.\n\n## Completion\n\nBefore claiming the task is complete:\n\n1. Run the relevant focused checks.\n2. Run `npm run mydash -- validate` or scoped validation.\n3. Review shared impact when applicable.\n4. Checkpoint explicit task-owned paths with `mydash git checkpoint`.\n5. Report validation, commit, push and remaining obstacles honestly.\n"}, ".claude/skills/help/SKILL.md": {"content": "---\nname: \"My Dashboards Help\"\ndescription: \"Explains how to use My Dashboards in plain language. Use when a nontechnical user asks how to open the app, find an artefact, preview it, export it, share it or recover from a simple error.\"\nargument-hint: \"[question]\"\n---\n\nAnswer `$ARGUMENTS` for a nontechnical user.\n\nRead `docs/agent-workflows/CLI_REFERENCE.md` only as needed.\n\n## Approach\n\n1. Determine the immediate outcome the person wants.\n2. Inspect current state rather than guessing.\n3. Give the shortest safe route to that outcome.\n4. Use ordinary words before technical terms.\n5. Present one action at a time.\n6. Explain what the person should see after each action.\n7. Include commands only when the visual app cannot complete the task.\n\nUseful starting actions:\n\n```text\nnpm start\nnpm run mydash -- library list\nnpm run mydash -- artifact export <id> --kind <kind>\nnpm run mydash -- doctor\n```\n\nDo not change files, manifests, themes or Git history unless the user explicitly\nasks for a change. Do not overwhelm the user with architecture or raw JSON.\n\nWhen a command fails, translate the error into:\n\n```text\nWhat happened\nWhy it matters\nThe next safe action\n```\n"}, ".claude/skills/mydash-help/SKILL.md": {"content": "---\nname: \"My Dashboards Help Alias\"\ndescription: \"Reliable explicit alias for project-specific My Dashboards help when the native /help command takes precedence.\"\nargument-hint: \"[question]\"\ndisable-model-invocation: true\n---\n\nApply the complete help workflow in `.claude/skills/help/SKILL.md` to:\n\n```text\n$ARGUMENTS\n```\n\nKeep the answer plain, practical and nontechnical. Do not modify repository\ncontent unless the user explicitly asks for a change.\n"}, ".claude/skills/spreadsheet/SKILL.md": {"content": "---\nname: \"Spreadsheet\"\ndescription: \"Inspects Excel, CSV, JSON and NDJSON sources and turns them into deterministic, profiled artefact data. Use when a dashboard or presentation begins with spreadsheet or tabular data.\"\nargument-hint: \"[source and desired outcome]\"\n---\n\nTreat `$ARGUMENTS` as the data outcome.\n\nRead:\n\n- `docs/agent-workflows/OPERATING_MODEL.md`\n- `docs/agent-workflows/CLI_REFERENCE.md`\n- `docs/agent-workflows/ARTIFACT_AUTHORING.md`\n\n## Workflow\n\n1. Identify the source format and location.\n2. Inspect structure before extracting.\n3. For Excel, inspect sheets, tables, hidden content and formulas.\n4. Preview only the relevant range or table.\n5. Extract deterministic records into the intended artefact’s `data/` directory\n   or another explicit workspace output.\n6. Profile fields, nulls, uniqueness, likely identifiers, numeric ranges and\n   duplicate rows.\n7. Reduce the dataset to what the artefact actually needs.\n8. Create a repeatable recipe when the source will be refreshed.\n9. Retain provenance.\n10. Hand the resulting data to `/dashboard` or `/presentation` when applicable.\n\n## Safety\n\n- Never execute workbook macros.\n- Never recalculate formulas.\n- Treat formulas as inspected metadata or cached values.\n- Never run JavaScript embedded in source data.\n- Do not write outside the workspace.\n- Do not overwrite an existing output without explicit intent.\n- Do not copy an entire workbook into an artefact when a small extracted dataset\n  is sufficient.\n\n## Quality\n\nName fields clearly, preserve source meaning, record units and dates, and state\nany transformation that could alter interpretation.\n\n## Completion\n\nBefore claiming the task is complete:\n\n1. Run the relevant focused checks.\n2. Run `npm run mydash -- validate` or scoped validation.\n3. Review shared impact when applicable.\n4. Checkpoint explicit task-owned paths with `mydash git checkpoint`.\n5. Report validation, commit, push and remaining obstacles honestly.\n"}, ".claude/skills/powerpoint/SKILL.md": {"content": "---\nname: \"PowerPoint\"\ndescription: \"Safely inspects and extracts PowerPoint structure, text, notes and media. Use when a presentation source must be understood, transformed into HTML or used as evidence for a new artefact.\"\nargument-hint: \"[source and desired outcome]\"\n---\n\nTreat `$ARGUMENTS` as the PowerPoint outcome.\n\nRead:\n\n- `docs/agent-workflows/OPERATING_MODEL.md`\n- `docs/agent-workflows/CLI_REFERENCE.md`\n- `docs/agent-workflows/ARTIFACT_AUTHORING.md`\n\n## Workflow\n\n1. Identify and inspect the presentation.\n2. Read the outline before extracting all content.\n3. Preserve slide order, hidden-slide state, titles, body text and speaker notes.\n4. Extract images only when they are needed and permitted.\n5. Separate source facts from source styling.\n6. For a new web presentation, pass the narrative and evidence to\n   `/presentation`.\n7. For dashboard evidence, extract only the relevant information and hand it to\n   `/dashboard`.\n\n## Safety\n\n- Never execute PowerPoint macros or scripts.\n- Treat linked or embedded content as untrusted.\n- Do not reproduce confidential content in a new artefact without clear scope.\n- Do not use extracted logos when an approved repository asset should be used.\n- Do not claim a visual element is brand-approved merely because it appeared in\n  a source deck.\n\n## Quality\n\nPreserve meaning, attribution and uncertainty. Do not turn every source slide\ninto a web slide; rebuild the narrative for the requested audience.\n\n## Completion\n\nBefore claiming the task is complete:\n\n1. Run the relevant focused checks.\n2. Run `npm run mydash -- validate` or scoped validation.\n3. Review shared impact when applicable.\n4. Checkpoint explicit task-owned paths with `mydash git checkpoint`.\n5. Report validation, commit, push and remaining obstacles honestly.\n"}, ".claude/skills/dashboard/SKILL.md": {"content": "---\nname: \"Dashboard\"\ndescription: \"Creates or updates a decision-focused dashboard artefact that resolves repository UI resources and exports as one standalone HTML file.\"\nargument-hint: \"[dashboard request]\"\n---\n\nTreat `$ARGUMENTS` as the dashboard outcome.\n\nRead:\n\n- `docs/agent-workflows/OPERATING_MODEL.md`\n- `docs/agent-workflows/ARTIFACT_AUTHORING.md`\n- `docs/agent-workflows/VISUAL_STANDARDS.md`\n\nLoad `/spreadsheet` or `/powerpoint` when the source requires it. Load\n`/component` before creating or changing reusable UI.\n\n## Define the dashboard\n\nEstablish:\n\n- audience;\n- decision or operational question;\n- source and freshness;\n- most important summary;\n- comparisons, trends or exceptions that matter;\n- required interactions;\n- what is deliberately out of scope.\n\nDo not start by choosing chart types.\n\n## Build\n\n1. Inspect comparable artefacts and current shared resources.\n2. Reuse a compatible theme, preset, layout and components.\n3. Create new UI locally unless demonstrated reuse justifies sharing.\n4. Create or update `artifact.json`.\n5. Keep source HTML, CSS and JavaScript ordinary and inspectable.\n6. Use semantic HTML, responsive layout and accessible interactions.\n7. Embed only the data and assets required by the dashboard.\n8. Include units, dates, source context, empty states and error states.\n9. Avoid decorative gauges, unexplained scores and redundant cards.\n\n## Verify\n\n```text\nmydash appearance resolve <id> --kind dashboard\nmydash artifact validate <id> --kind dashboard\nmydash validate --artifact <id> --kind dashboard\n```\n\nVisually inspect the generated preview. Export when the user needs a shareable\nfile.\n\n## Completion\n\nBefore claiming the task is complete:\n\n1. Run the relevant focused checks.\n2. Run `npm run mydash -- validate` or scoped validation.\n3. Review shared impact when applicable.\n4. Checkpoint explicit task-owned paths with `mydash git checkpoint`.\n5. Report validation, commit, push and remaining obstacles honestly.\n"}, ".claude/skills/presentation/SKILL.md": {"content": "---\nname: \"Presentation\"\ndescription: \"Creates or updates an HTML presentation artefact with a clear narrative, reusable repository UI and a standalone file export.\"\nargument-hint: \"[presentation request]\"\n---\n\nTreat `$ARGUMENTS` as the presentation outcome.\n\nRead:\n\n- `docs/agent-workflows/OPERATING_MODEL.md`\n- `docs/agent-workflows/ARTIFACT_AUTHORING.md`\n- `docs/agent-workflows/VISUAL_STANDARDS.md`\n\nLoad `/powerpoint` when working from a source deck. Load `/component` before\ncreating or changing reusable slide UI.\n\n## Narrative first\n\nDefine:\n\n- audience;\n- desired decision or understanding;\n- opening context;\n- evidence;\n- implications;\n- recommendation or next action.\n\nUse one primary idea per slide. Prefer short declarative titles.\n\n## Build\n\n1. Inspect relevant presentation artefacts, themes and presets.\n2. Reuse compatible resources.\n3. Create presentation-specific UI locally.\n4. Keep repeated chrome minimal.\n5. Use diagrams, evidence and concise text instead of paragraphs.\n6. Preserve notes only when useful.\n7. Support keyboard navigation and visible focus.\n8. Ensure the deck remains understandable when opened directly from one HTML\n   file.\n\nDo not mechanically reproduce every source slide. Rebuild the story for the\nrequested purpose.\n\n## Verify\n\n```text\nmydash appearance resolve <id> --kind presentation\nmydash artifact validate <id> --kind presentation\nmydash validate --artifact <id> --kind presentation\n```\n\nCheck the opening, transitions, final action, narrow viewport and standalone\nexport.\n\n## Completion\n\nBefore claiming the task is complete:\n\n1. Run the relevant focused checks.\n2. Run `npm run mydash -- validate` or scoped validation.\n3. Review shared impact when applicable.\n4. Checkpoint explicit task-owned paths with `mydash git checkpoint`.\n5. Report validation, commit, push and remaining obstacles honestly.\n"}, ".claude/skills/concept/SKILL.md": {"content": "---\nname: \"Concept\"\ndescription: \"Creates a lightweight visual concept or prototype without prematurely turning exploratory work into shared product architecture.\"\nargument-hint: \"[concept request]\"\n---\n\nTreat `$ARGUMENTS` as the concept to explore.\n\nRead:\n\n- `docs/agent-workflows/OPERATING_MODEL.md`\n- `docs/agent-workflows/ARTIFACT_AUTHORING.md`\n- `docs/agent-workflows/VISUAL_STANDARDS.md`\n\n## Principles\n\n- Optimise for learning, not completeness.\n- Make the concept specific enough to react to.\n- Keep new UI, theme and assets local.\n- Avoid abstractions before there is a second real consumer.\n- Prefer a small working path over a comprehensive speculative system.\n- Clearly label assumptions, placeholders and unresolved questions.\n\n## Workflow\n\n1. State the idea being tested.\n2. Identify the smallest useful interaction or visual sequence.\n3. Inspect existing resources and reuse only what genuinely helps.\n4. Build the concept under `library/concepts/<id>/`.\n5. Use representative data without misrepresenting it as real.\n6. Validate and export the concept so it can be shared.\n7. Record what was learned and what should not yet be promoted.\n\nA concept may be intentionally rough, but it must still be safe, accessible\nenough to evaluate, structurally valid and standalone.\n\n## Completion\n\nBefore claiming the task is complete:\n\n1. Run the relevant focused checks.\n2. Run `npm run mydash -- validate` or scoped validation.\n3. Review shared impact when applicable.\n4. Checkpoint explicit task-owned paths with `mydash git checkpoint`.\n5. Report validation, commit, push and remaining obstacles honestly.\n"}, ".claude/skills/component/SKILL.md": {"content": "---\nname: \"Component\"\ndescription: \"Selects, creates, modifies or promotes primitives, components, layouts, themes, presets and assets using evidence-based Local, Collection and Core lifecycle rules.\"\nargument-hint: \"[UI requirement or resource]\"\n---\n\nTreat `$ARGUMENTS` as the UI requirement.\n\nRead:\n\n- `docs/agent-workflows/OPERATING_MODEL.md`\n- `docs/agent-workflows/ARTIFACT_AUTHORING.md`\n- `docs/agent-workflows/VISUAL_STANDARDS.md`\n\n## Decision tree\n\n1. Classify the requirement.\n2. Decide whether it is a primitive, component, layout, theme, preset or asset.\n3. Search Core.\n4. Search relevant Collections.\n5. Check whether an existing variant already expresses the need.\n6. Determine the intended theme, semantic slot and layout context.\n7. Reuse an existing resource when its contract genuinely fits.\n8. Otherwise create it locally under the consuming artefact.\n9. Modify shared code only when the change is appropriate for every consumer\n   and preserves the contract.\n10. Promote only after demonstrated reuse.\n\n## Scope\n\n```text\nLocal → Collection → Core\n```\n\n- Start local.\n- Promote to Collection after a second real consumer in a coherent domain.\n- Promote to Core only after broad, stable, cross-domain reuse.\n- Demote shared resources when their scope is no longer justified.\n\n## Shared changes\n\nBefore changing Core or Collection:\n\n```text\nmydash library consumers <id> --kind <kind>\nmydash impact core/<id> --kind <kind>\nmydash impact <collection>/<id> --kind <kind>\n```\n\nInspect affected artefacts and validate them. Prefer a compatible variant or\nlocal override when the desired change is not universal.\n\nDo not:\n\n- generalise from visual resemblance alone;\n- add options for hypothetical consumers;\n- silently break semantic slots;\n- edit approved assets destructively;\n- promote a resource in the same moment it is first created.\n\n## Checkpoint\n\nConsumed shared changes require explicit impact acknowledgement:\n\n```text\nmydash git checkpoint <explicit-path...> \\\n  --message \"<focused message>\" \\\n  --acknowledge-impact\n```\n\n## Completion\n\nBefore claiming the task is complete:\n\n1. Run the relevant focused checks.\n2. Run `npm run mydash -- validate` or scoped validation.\n3. Review shared impact when applicable.\n4. Checkpoint explicit task-owned paths with `mydash git checkpoint`.\n5. Report validation, commit, push and remaining obstacles honestly.\n"}, ".claude/skills/hsbc-visual-standards/SKILL.md": {"content": "---\nname: \"HSBC Visual Standards\"\ndescription: \"Applies the project’s restrained HSBC-inspired visual language, approved-asset discipline and accessibility rules. Use for dashboards, presentations, concepts, components and the navigator.\"\nargument-hint: \"[artefact or visual request]\"\n---\n\nApply the request in `$ARGUMENTS`.\n\nRead `docs/agent-workflows/VISUAL_STANDARDS.md` before changing visuals.\n\n## Rules\n\n- Use approved repository assets.\n- Use red selectively, not as decoration everywhere.\n- Preserve a white, spacious and precise visual character.\n- Establish hierarchy before adding effects.\n- Keep charts purposeful and labelled.\n- Do not encode meaning by colour alone.\n- Maintain keyboard support, focus visibility and readable contrast.\n- Respect reduced motion.\n- Do not redraw the HSBC mark from memory or extract it from screenshots.\n- Do not claim official brand approval or compliance without an approved source.\n- When official internal guidance is supplied, treat it as authoritative over\n  this project default.\n\nUse `/component` when the visual request affects a shared resource.\n\n## Completion\n\nBefore claiming the task is complete:\n\n1. Run the relevant focused checks.\n2. Run `npm run mydash -- validate` or scoped validation.\n3. Review shared impact when applicable.\n4. Checkpoint explicit task-owned paths with `mydash git checkpoint`.\n5. Report validation, commit, push and remaining obstacles honestly.\n"}, "tests/unit/skills.test.mjs": {"content": "import assert from \"node:assert/strict\";\nimport {\n  dirname,\n  resolve,\n} from \"node:path\";\nimport {\n  fileURLToPath,\n} from \"node:url\";\nimport test from \"node:test\";\nimport {\n  parseSkillMarkdown,\n} from \"../../src/skills/frontmatter.mjs\";\nimport {\n  validateProjectSkills,\n} from \"../../src/skills/validate.mjs\";\n\nconst testDirectory = dirname(\n  fileURLToPath(import.meta.url),\n);\nconst projectRoot = resolve(\n  testDirectory,\n  \"../..\",\n);\n\ntest(\"skill frontmatter parser reads scalar metadata\", () => {\n  const parsed = parseSkillMarkdown(`---\nname: \"Example\"\ndescription: \"Does useful work\"\ndisable-model-invocation: true\n---\n\nUse the repository.\n`);\n\n  assert.equal(parsed.ok, true);\n  assert.equal(parsed.frontmatter.name, \"Example\");\n  assert.equal(\n    parsed.frontmatter.description,\n    \"Does useful work\",\n  );\n  assert.equal(\n    parsed.frontmatter[\"disable-model-invocation\"],\n    true,\n  );\n  assert.equal(parsed.body, \"Use the repository.\");\n});\n\ntest(\"skill frontmatter parser reports missing delimiters\", () => {\n  const parsed = parseSkillMarkdown(\n    \"No frontmatter here.\",\n  );\n\n  assert.equal(parsed.ok, false);\n  assert.equal(\n    parsed.errors[0].code,\n    \"SKILL_FRONTMATTER_MISSING\",\n  );\n});\n\ntest(\"installed project skills satisfy the catalogue contract\", async () => {\n  const result = await validateProjectSkills(\n    projectRoot,\n  );\n\n  assert.equal(\n    result.summary.valid,\n    true,\n    JSON.stringify(result.issues, null, 2),\n  );\n  assert.equal(\n    result.summary.logicalSkillCount,\n    9,\n  );\n  assert.equal(\n    result.summary.commandCount,\n    10,\n  );\n  assert.equal(\n    result.entries.some(\n      (entry) =>\n        entry.command === \"component\",\n    ),\n    true,\n  );\n});\n"}, "tests/integration/skills-cli.test.mjs": {"content": "import assert from \"node:assert/strict\";\nimport {\n  dirname,\n  resolve,\n} from \"node:path\";\nimport {\n  fileURLToPath,\n} from \"node:url\";\nimport {\n  spawnSync,\n} from \"node:child_process\";\nimport test from \"node:test\";\n\nconst testDirectory = dirname(\n  fileURLToPath(import.meta.url),\n);\nconst projectRoot = resolve(\n  testDirectory,\n  \"../..\",\n);\nconst cliPath = resolve(\n  projectRoot,\n  \"bin\",\n  \"mydash.mjs\",\n);\n\nfunction runCli(args) {\n  return spawnSync(\n    process.execPath,\n    [cliPath, ...args],\n    {\n      cwd: projectRoot,\n      encoding: \"utf8\",\n      stdio: \"pipe\",\n      shell: false,\n    },\n  );\n}\n\ntest(\"skills list exposes the active project commands\", () => {\n  const result = runCli([\n    \"skills\",\n    \"list\",\n    \"--json\",\n  ]);\n\n  assert.equal(result.status, 0, result.stderr);\n  const body = JSON.parse(result.stdout);\n  assert.equal(body.command, \"skills list\");\n  assert.equal(body.data.count, 10);\n  assert.equal(\n    body.data.entries.some(\n      (entry) =>\n        entry.command === \"my-dashboard\",\n    ),\n    true,\n  );\n});\n\ntest(\"skills inspect returns component decision rules\", () => {\n  const result = runCli([\n    \"skills\",\n    \"inspect\",\n    \"component\",\n    \"--json\",\n  ]);\n\n  assert.equal(result.status, 0, result.stderr);\n  const body = JSON.parse(result.stdout);\n\n  assert.match(\n    body.data.body,\n    /Local → Collection → Core/,\n  );\n  assert.match(\n    body.data.body,\n    /mydash impact/,\n  );\n});\n\ntest(\"skills validate succeeds through the CLI\", () => {\n  const result = runCli([\n    \"skills\",\n    \"validate\",\n    \"--json\",\n  ]);\n\n  assert.equal(result.status, 0, result.stderr);\n  const body = JSON.parse(result.stdout);\n  assert.equal(\n    body.data.summary.valid,\n    true,\n  );\n  assert.equal(\n    body.data.summary.logicalSkillCount,\n    9,\n  );\n});\n"}, "scripts/tasks/test-skills.mjs": {"content": "#!/usr/bin/env node\n\nimport {\n  spawnSync,\n} from \"node:child_process\";\nimport {\n  dirname,\n  resolve,\n} from \"node:path\";\nimport {\n  fileURLToPath,\n} from \"node:url\";\nimport process from \"node:process\";\n\nconst scriptDirectory = dirname(\n  fileURLToPath(import.meta.url),\n);\nconst projectRoot = resolve(\n  scriptDirectory,\n  \"../..\",\n);\n\nconst tests = [\n  resolve(\n    projectRoot,\n    \"tests\",\n    \"unit\",\n    \"skills.test.mjs\",\n  ),\n  resolve(\n    projectRoot,\n    \"tests\",\n    \"integration\",\n    \"skills-cli.test.mjs\",\n  ),\n];\n\nconst result = spawnSync(\n  process.execPath,\n  [\"--test\", ...tests],\n  {\n    cwd: projectRoot,\n    stdio: \"inherit\",\n    shell: false,\n    maxBuffer:\n      64 * 1024 * 1024,\n  },\n);\n\nif (result.error) throw result.error;\nprocess.exitCode = result.status ?? 1;\n"}};

const myDashboardSkill =
  FILES[".claude/skills/my-dashboard/SKILL.md"];
FILES[".claude/skills/my-dashboard/SKILL.md"] = {
  ...myDashboardSkill,
  allowedPrevious: [
    myDashboardSkill.content,
    ...(myDashboardSkill.allowedPrevious ?? []),
  ],
  content: `---
name: "My Dashboard"
description: "Routes My Dashboards requests to the correct repository workflow. Use when the user asks to create, inspect, update, share, export or understand a dashboard, presentation, concept, component, spreadsheet source, PowerPoint source or the My Dashboards app."
argument-hint: "[request]"
---

Treat \`$ARGUMENTS\` as the requested outcome.

Read \`docs/agent-workflows/OPERATING_MODEL.md\` and
\`docs/agent-workflows/CLI_REFERENCE.md\` before changing
the repository.

## Orient

1. Run \`npm run mydash -- git status --json\`.
2. Run \`npm run mydash -- doctor --json\` and confirm \`data.userId\`. Artefact
   work and CLI discovery are scoped to this configured user unless the task
   explicitly requires the \`--all-users\` override.
3. When an upstream exists and the worktree is clean, run \`git pull --rebase\`
   before inspecting or changing content. If the worktree is dirty, history is
   diverged, or a pull fails, do not force it; report the state and continue
   safely with the checked-out files.
4. Discover current content through \`mydash library\`; do not rely on memory.
5. Inspect only the files and resources relevant to the request.

## Route

Load the specialised skill that best matches the work:

- \`/mydash-help\` — nontechnical explanation or app usage
- \`/spreadsheet\` — Excel, CSV, JSON or tabular source work
- \`/powerpoint\` — PowerPoint source inspection or extraction
- \`/dashboard\` — dashboard artefacts
- \`/presentation\` — presentation artefacts
- \`/concept\` — lightweight concepts and prototypes
- \`/component\` — primitives, components, layouts, themes, presets or assets
- \`/hsbc-visual-standards\` — visual language and accessibility

Several skills may apply. Use the smallest combination that covers the task.

## Rules

- Do not maintain an artefact index in this skill or in a JSON file.
- Discover artefacts and shared resources from the filesystem.
- Do not rebuild deterministic CLI capability inside a prompt or script.
- Prefer consuming Core; prefer creating locally.
- Keep the first version as small as the user’s outcome permits.
- Do not ask for information already present in the repository.
- Ask a question only when a missing decision would materially change the work.

## Completion

Before claiming the task is complete:

1. Run the relevant focused checks.
2. Run \`npm run mydash -- validate\` or scoped validation.
3. Review shared impact when applicable.
4. Checkpoint explicit task-owned paths with \`mydash git checkpoint\`.
5. Report validation, commit, push and remaining obstacles honestly.
`,
};

const args = parseBootstrapArgs(
  process.argv.slice(2),
);
const targetRoot = resolve(
  args.target ?? process.cwd(),
);
const selfPath = resolve(
  fileURLToPath(import.meta.url),
);

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
  claudeCode: {
    installed: false,
    version: null,
  },
  git: {
    commit: null,
    pushed: false,
    pushTarget: null,
  },
};

main().catch((error) => {
  report.warnings.push({
    code: "UNEXPECTED_FAILURE",
    message:
      error instanceof Error
        ? error.message
        : String(error),
  });
  finish(1);
});

async function main() {
  assertNodeVersion();
  await assertBootstrapFoundation();

  const repoRoot =
    getRepositoryRoot(targetRoot);

  if (
    !repoRoot ||
    resolve(repoRoot) !== targetRoot
  ) {
    throw new Error(
      "Bootstrap 15 must run from the root of the My Dashboards Git repository.",
    );
  }

  const dirtyBefore =
    getDirtyPaths(repoRoot);
  const ownedAbsolutePaths = [];

  for (
    const [
      relativePath,
      descriptor,
    ] of Object.entries(FILES)
  ) {
    const absolutePath = join(
      targetRoot,
      relativePath,
    );
    const result =
      await writeManagedFile({
        absolutePath,
        content: descriptor.content,
        allowedPrevious:
          descriptor.allowedPrevious ?? [],
        dirtyBefore,
        repoRoot,
      });

    if (
      result === "created" ||
      result === "updated"
    ) {
      ownedAbsolutePaths.push(
        absolutePath,
      );
    }
  }

  const packageChanged =
    await updatePackageJson(
      dirtyBefore,
      repoRoot,
    );

  if (packageChanged) {
    ownedAbsolutePaths.push(
      join(targetRoot, "package.json"),
    );
  }

  detectClaudeCode();
  await validateGeneratedState();

  const expectedSelfPath = join(
    targetRoot,
    "scripts",
    "15-install-agent-skills.mjs",
  );

  if (
    selfPath === expectedSelfPath &&
    (await pathExists(selfPath))
  ) {
    ownedAbsolutePaths.push(selfPath);
  }

  if (
    !args.noCommit &&
    !args.dryRun
  ) {
    await checkpoint(
      repoRoot,
      uniquePaths(
        ownedAbsolutePaths,
      ),
    );
  } else if (args.noCommit) {
    report.warnings.push({
      code: "COMMIT_DISABLED",
      message:
        "Project skills were created and tested, but --no-commit disabled the Git checkpoint.",
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

  for (
    let index = 0;
    index < argv.length;
    index += 1
  ) {
    const value = argv[index];

    switch (value) {
      case "--target":
        index += 1;

        if (!argv[index]) {
          failArguments(
            "--target requires a directory path.",
          );
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
        failArguments(
          `Unknown argument: ${value}`,
        );
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
  console.error(
    "Run with --help to see supported options.",
  );
  process.exit(2);
}

function printHelp() {
  console.log(`
My Dashboards — Bootstrap 15

Usage:
  node scripts/15-install-agent-skills.mjs [options]

Options:
  --target <path>  Install skills in a specific repository root.
  --dry-run        Report intended changes without writing or committing.
  --no-commit      Write and validate without committing or pushing.
  --no-push        Commit locally but do not push.
  --json           Return a machine-readable report.
  --help, -h       Show this help.
`.trim());
}

// Keep this installer aligned with the checked-in skill catalogue. The large
// FILES object above retains bootstrap migration history; active skill and
// reference content comes from the repository containing this installer.
const installerSourceRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const activeSkillAndReferencePaths = [
  ".claude/skills/my-dashboard/SKILL.md",
  ".claude/skills/help/SKILL.md",
  ".claude/skills/mydash-help/SKILL.md",
  ".claude/skills/spreadsheet/SKILL.md",
  ".claude/skills/powerpoint/SKILL.md",
  ".claude/skills/dashboard/SKILL.md",
  ".claude/skills/presentation/SKILL.md",
  ".claude/skills/concept/SKILL.md",
  ".claude/skills/component/SKILL.md",
  ".claude/skills/hsbc-visual-standards/SKILL.md",
  "docs/cli-reference.md",
  "docs/api-reference.md",
];

for (const relativePath of Object.keys(FILES)) {
  if (relativePath.startsWith("docs/agent-workflows/")) {
    delete FILES[relativePath];
  }
}

for (const relativePath of activeSkillAndReferencePaths) {
  const previous = FILES[relativePath];
  FILES[relativePath] = {
    content: await readFile(
      resolve(installerSourceRoot, relativePath),
      "utf8",
    ),
    allowedPrevious: [
      ...(previous?.content ? [previous.content] : []),
      ...(previous?.allowedPrevious ?? []),
    ],
  };
}

function assertNodeVersion() {
  const major = Number.parseInt(
    process.versions.node.split(".")[0],
    10,
  );

  if (
    !Number.isInteger(major) ||
    major < MIN_NODE_MAJOR
  ) {
    throw new Error(
      `Node.js ${MIN_NODE_MAJOR} or later is required. Found ${process.versions.node}.`,
    );
  }
}

async function assertBootstrapFoundation() {
  if (!args.dryRun) {
    await access(
      targetRoot,
      fsConstants.W_OK,
    );
  }

  const required = [
    "package.json",
    "package-lock.json",
    "bin/mydash.mjs",
    "cli/registry.mjs",
    "cli/command-options.mjs",
    "src/workspace/capabilities.mjs",
    "docs/cli-reference.md",
    "scripts/tasks/test-server.mjs",
    "scripts/tasks/test-git.mjs",
    "scripts/tasks/test-validation.mjs",
  ];
  const missing = [];

  for (const relativePath of required) {
    if (
      !(await pathExists(
        join(targetRoot, relativePath),
      ))
    ) {
      missing.push(relativePath);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      [
        "Bootstrap 14 has not been completed.",
        `Missing required paths: ${missing.join(", ")}`,
      ].join("\n"),
    );
  }
}

async function updatePackageJson(
  dirtyBefore,
  repoRoot,
) {
  const packagePath = join(
    targetRoot,
    "package.json",
  );
  const gitPath = relativeGitPath(
    repoRoot,
    packagePath,
  );

  if (dirtyBefore.has(gitPath)) {
    report.preserved.push(gitPath);
    report.warnings.push({
      code:
        "PREEXISTING_PACKAGE_CHANGES",
      message:
        "package.json had pre-existing changes, so the skills test command was not added automatically.",
    });
    return false;
  }

  const source = await readFile(
    packagePath,
    "utf8",
  );
  let value;

  try {
    value = JSON.parse(source);
  } catch {
    throw new Error(
      "package.json is not valid JSON and was not modified.",
    );
  }

  value.scripts ??= {};
  value.scripts["test:skills"] =
    value.scripts["test:skills"] ??
    "node scripts/tasks/test-skills.mjs";

  const next =
    `${JSON.stringify(value, null, 2)}\n`;

  if (source === next) {
    report.preserved.push(gitPath);
    return false;
  }

  if (args.dryRun) {
    report.updated.push(gitPath);
    return true;
  }

  await atomicWrite(
    packagePath,
    next,
  );
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
  const gitPath =
    relativeGitPath(
      repoRoot,
      absolutePath,
    );
  const exists =
    await pathExists(absolutePath);

  if (
    dirtyBefore.has(gitPath) &&
    absolutePath !== selfPath
  ) {
    report.preserved.push(gitPath);
    report.warnings.push({
      code:
        "PREEXISTING_FILE_CHANGES",
      message:
        `Preserved pre-existing changes in ${gitPath}.`,
    });
    return "preserved";
  }

  if (exists) {
    const current =
      await readFile(
        absolutePath,
        "utf8",
      );

    if (current === content) {
      report.preserved.push(gitPath);
      return "preserved";
    }

    if (
      !allowedPrevious.includes(
        current,
      )
    ) {
      report.preserved.push(gitPath);
      report.warnings.push({
        code:
          "EXISTING_FILE_PRESERVED",
        message:
          `${gitPath} already exists with different content and was not overwritten.`,
      });
      return "preserved";
    }

    if (args.dryRun) {
      report.updated.push(gitPath);
      return "updated";
    }

    await atomicWrite(
      absolutePath,
      content,
    );
    report.updated.push(gitPath);

    return "updated";
  }

  if (args.dryRun) {
    report.created.push(gitPath);
    return "created";
  }

  await atomicWrite(
    absolutePath,
    content,
  );
  report.created.push(gitPath);

  return "created";
}

function detectClaudeCode() {
  const result = run(
    "claude",
    ["--version"],
    {
      cwd: targetRoot,
      allowFailure: true,
    },
  );

  if (result.status === 0) {
    report.claudeCode.installed = true;
    report.claudeCode.version =
      result.stdout ||
      result.stderr;
  } else {
    report.warnings.push({
      code: "CLAUDE_CODE_NOT_FOUND",
      message:
        "Claude Code was not available on PATH, so only static skill validation was performed.",
    });
  }
}

async function validateGeneratedState() {
  if (args.dryRun) {
    report.validation.push({
      check: "dry-run",
      ok: true,
      message:
        "The project skill catalogue was calculated without writing it.",
    });
    return;
  }

  const modulePaths = [
    "cli/registry.mjs",
    "cli/commands/skills.mjs",
    "src/skills/frontmatter.mjs",
    "src/skills/discover.mjs",
    "src/skills/validate.mjs",
    "src/workspace/capabilities.mjs",
    "tests/unit/skills.test.mjs",
    "tests/integration/skills-cli.test.mjs",
    "scripts/tasks/test-skills.mjs",
  ];

  for (
    const relativePath of modulePaths
  ) {
    const result = run(
      process.execPath,
      [
        "--check",
        join(
          targetRoot,
          relativePath,
        ),
      ],
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
      `${modulePaths.length} skill, CLI and test modules passed Node syntax checks.`,
  });

  const skillValidation = run(
    process.execPath,
    [
      join(
        targetRoot,
        "bin",
        "mydash.mjs",
      ),
      "skills",
      "validate",
      "--json",
    ],
    {
      cwd: targetRoot,
      allowFailure: true,
    },
  );

  if (skillValidation.status !== 0) {
    throw new Error(
      `Project skill validation failed:\n${
        skillValidation.stderr ||
        skillValidation.stdout
      }`,
    );
  }

  report.validation.push({
    check: "skill-catalogue",
    ok: true,
    message:
      "Nine logical skills and the safe help alias passed catalogue validation.",
  });

  const tests = run(
    process.execPath,
    [
      join(
        targetRoot,
        "scripts",
        "tasks",
        "test-skills.mjs",
      ),
    ],
    {
      cwd: targetRoot,
      allowFailure: true,
    },
  );

  if (tests.status !== 0) {
    throw new Error(
      `Agent skill tests failed:\n${
        tests.stderr ||
        tests.stdout
      }`,
    );
  }

  report.validation.push({
    check: "skill-tests",
    ok: true,
    message:
      "Frontmatter, catalogue rules, routing content and CLI integration tests passed.",
  });

  for (const task of [
    "scripts/tasks/test-server.mjs",
    "scripts/tasks/test-git.mjs",
    "scripts/tasks/test-validation.mjs",
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
      [
        join(
          targetRoot,
          task,
        ),
      ],
      {
        cwd: targetRoot,
        allowFailure: true,
      },
    );

    if (result.status !== 0) {
      throw new Error(
        `Regression command failed (${task}):\n${
          result.stderr ||
          result.stdout
        }`,
      );
    }
  }

  report.validation.push({
    check: "regression",
    ok: true,
    message:
      "Server, Git, validation, export, resolution, library, data, Office, filesystem, CLI and contract tests still pass.",
  });
}

async function checkpoint(
  repoRoot,
  ownedAbsolutePaths,
) {
  const ownedPaths = uniquePaths(
    ownedAbsolutePaths
      .filter((path) =>
        isInside(repoRoot, path),
      )
      .map((path) =>
        relativeGitPath(
          repoRoot,
          path,
        ),
      ),
  );

  if (ownedPaths.length === 0) {
    report.warnings.push({
      code:
        "NO_CHECKPOINT_CHANGES",
      message:
        "Project skills were already present; there were no task-owned changes to commit.",
    });
    return;
  }

  const userName = run(
    "git",
    ["config", "user.name"],
    {
      cwd: repoRoot,
      allowFailure: true,
    },
  ).stdout;
  const userEmail = run(
    "git",
    ["config", "user.email"],
    {
      cwd: repoRoot,
      allowFailure: true,
    },
  ).stdout;

  if (!userName || !userEmail) {
    report.warnings.push({
      code:
        "GIT_IDENTITY_MISSING",
      message:
        "Project skills were created and tested, but no commit was made because Git user.name or user.email is missing.",
    });
    return;
  }

  run(
    "git",
    [
      "add",
      "--",
      ...ownedPaths,
    ],
    { cwd: repoRoot },
  );

  const stagedOwned = run(
    "git",
    [
      "diff",
      "--cached",
      "--name-only",
      "--",
      ...ownedPaths,
    ],
    { cwd: repoRoot },
  ).stdout
    .split("\n")
    .map((value) =>
      value.trim(),
    )
    .filter(Boolean);

  if (stagedOwned.length === 0) {
    report.warnings.push({
      code: "NO_COMMIT_NEEDED",
      message:
        "No task-owned changes remained to commit.",
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
        commitResult.stderr ||
        commitResult.stdout
      }`,
    );
  }

  const commitHash = run(
    "git",
    [
      "rev-parse",
      "--short",
      "HEAD",
    ],
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
    [
      "branch",
      "--show-current",
    ],
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
    report.git.pushTarget =
      upstream.stdout;
    pushResult = run(
      "git",
      ["push"],
      {
        cwd: repoRoot,
        allowFailure: true,
      },
    );
  } else {
    const remotes = run(
      "git",
      ["remote"],
      {
        cwd: repoRoot,
        allowFailure: true,
      },
    ).stdout
      .split("\n")
      .map((value) =>
        value.trim(),
      )
      .filter(Boolean);

    if (
      !branch ||
      !remotes.includes("origin")
    ) {
      report.warnings.push({
        code: "NO_PUSH_TARGET",
        message:
          `Committed locally as ${commitHash}, but no upstream was configured and origin was unavailable.`,
      });
      return;
    }

    report.git.pushTarget =
      `origin/${branch}`;
    pushResult = run(
      "git",
      [
        "push",
        "-u",
        "origin",
        branch,
      ],
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
        (pushResult.stderr ||
          pushResult.stdout),
    });
  }
}

function getRepositoryRoot(cwd) {
  const result = run(
    "git",
    [
      "rev-parse",
      "--show-toplevel",
    ],
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
    ? result.stdout
        .split("\0")
        .filter(Boolean)
    : [];
  const paths = new Set();

  for (
    let index = 0;
    index < entries.length;
    index += 1
  ) {
    const entry = entries[index];

    if (entry.length < 4) {
      continue;
    }

    const statusCode =
      entry.slice(0, 2);
    paths.add(
      normaliseGitPath(
        entry.slice(3),
      ),
    );

    if (
      statusCode.includes("R") ||
      statusCode.includes("C")
    ) {
      const secondPath =
        entries[index + 1];

      if (secondPath) {
        paths.add(
          normaliseGitPath(
            secondPath,
          ),
        );
        index += 1;
      }
    }
  }

  return paths;
}

function run(
  command,
  commandArgs,
  options = {},
) {
  const result = spawnSync(
    command,
    commandArgs,
    {
      cwd:
        options.cwd ??
        targetRoot,
      encoding: "utf8",
      stdio: "pipe",
      shell: false,
      maxBuffer:
        64 * 1024 * 1024,
    },
  );

  if (result.error) {
    if (options.allowFailure) {
      return {
        status: 127,
        stdout: "",
        stderr:
          result.error.message,
      };
    }

    throw result.error;
  }

  if (
    result.status !== 0 &&
    !options.allowFailure
  ) {
    const details = [
      result.stderr,
      result.stdout,
    ]
      .filter(Boolean)
      .map((value) =>
        value.trim(),
      )
      .filter(Boolean)
      .join("\n");

    throw new Error(
      `${command} ${commandArgs.join(" ")} failed with exit code ${result.status}` +
        (details
          ? `:\n${details}`
          : "."),
    );
  }

  return {
    status:
      result.status ?? 1,
    stdout:
      result.stdout?.trim() ?? "",
    stderr:
      result.stderr?.trim() ?? "",
  };
}

async function atomicWrite(
  path,
  content,
) {
  await mkdir(
    dirname(path),
    { recursive: true },
  );
  const temporaryPath =
    `${path}.tmp-${process.pid}-${Date.now()}`;

  try {
    await writeFile(
      temporaryPath,
      content,
      "utf8",
    );
    await rename(
      temporaryPath,
      path,
    );
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
    if (
      error?.code === "ENOENT"
    ) {
      return false;
    }

    throw error;
  }
}

function isInside(root, path) {
  const relationship = relative(
    root,
    path,
  );

  return (
    relationship === "" ||
    (!relationship.startsWith("..") &&
      !resolve(path).startsWith(
        `${resolve(root)}..`,
      ))
  );
}

function relativeGitPath(
  repoRoot,
  path,
) {
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
      JSON.stringify(
        report,
        null,
        2,
      ),
    );
    process.exit(exitCode);
  }

  console.log(
    "\nMy Dashboards — project agent skills\n",
  );
  console.log(
    `Target: ${report.targetRoot}`,
  );
  console.log(
    `Result: ${
      report.ok
        ? "PASS"
        : "FAIL"
    }`,
  );
  console.log(
    `Mode: ${
      report.dryRun
        ? "dry-run"
        : "write"
    }`,
  );

  printSection(
    "Created",
    report.created,
  );
  printSection(
    "Updated",
    report.updated,
  );
  printSection(
    "Preserved",
    report.preserved,
  );

  console.log("\nClaude Code:");
  console.log(
    `  Installed: ${
      report.claudeCode.installed
        ? "yes"
        : "no"
    }`,
  );

  if (
    report.claudeCode.version
  ) {
    console.log(
      `  Version: ${report.claudeCode.version}`,
    );
  }

  if (
    report.validation.length > 0
  ) {
    console.log("\nValidation:");

    for (
      const item of report.validation
    ) {
      console.log(
        `  ${
          item.ok ? "✓" : "✗"
        } ${item.message}`,
      );
    }
  }

  console.log("\nGit:");
  console.log(
    `  Commit: ${
      report.git.commit ?? "none"
    }`,
  );
  console.log(
    `  Pushed: ${
      report.git.pushed
        ? "yes"
        : "no"
    }`,
  );

  if (
    report.git.pushTarget
  ) {
    console.log(
      `  Push target: ${report.git.pushTarget}`,
    );
  }

  if (
    report.warnings.length > 0
  ) {
    console.log("\nWarnings:");

    for (
      const warning of report.warnings
    ) {
      console.log(
        `  ! ${warning.message}`,
      );
    }
  }

  console.log("");
  process.exit(exitCode);
}

function printSection(
  title,
  items,
) {
  console.log(`\n${title}:`);

  if (items.length === 0) {
    console.log("  none");
    return;
  }

  for (const item of items) {
    console.log(`  ${item}`);
  }
}
