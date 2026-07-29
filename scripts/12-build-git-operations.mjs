#!/usr/bin/env node

/**
 * My Dashboards — Bootstrap 12: Build constrained Git operations
 *
 * Adds:
 *
 *   mydash git status
 *   mydash git checkpoint <path...> --message <text>
 *
 * Checkpoints validate the complete workspace, calculate shared-resource
 * impact, stage only explicit paths, commit only those paths and push safely.
 *
 * Usage:
 *   node scripts/12-build-git-operations.mjs
 *   node scripts/12-build-git-operations.mjs --dry-run
 *   node scripts/12-build-git-operations.mjs --no-commit
 *   node scripts/12-build-git-operations.mjs --no-push
 *   node scripts/12-build-git-operations.mjs --json
 *   node scripts/12-build-git-operations.mjs --target /path/to/my-dashboards
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

const SCRIPT_NAME = "12-build-git-operations";
const COMMIT_MESSAGE = "Add constrained Git checkpoints";
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
const FILES = {"cli/registry.mjs": {"content": "import { helpCommand } from \"./commands/help.mjs\";\nimport { versionCommand } from \"./commands/version.mjs\";\nimport { doctorCommand } from \"./commands/doctor.mjs\";\nimport { inspectCommand } from \"./commands/inspect.mjs\";\nimport { fileCommand } from \"./commands/file.mjs\";\nimport { excelCommand } from \"./commands/excel.mjs\";\nimport { powerpointCommand } from \"./commands/powerpoint.mjs\";\nimport { dataCommand } from \"./commands/data.mjs\";\nimport { libraryCommand } from \"./commands/library.mjs\";\nimport { appearanceCommand } from \"./commands/appearance.mjs\";\nimport { artifactCommand } from \"./commands/artifact.mjs\";\nimport { validateCommand } from \"./commands/validate.mjs\";\nimport { impactCommand } from \"./commands/impact.mjs\";\nimport { gitCommand } from \"./commands/git.mjs\";\n\nconst commands = [\n  helpCommand,\n  versionCommand,\n  doctorCommand,\n  inspectCommand,\n  fileCommand,\n  excelCommand,\n  powerpointCommand,\n  dataCommand,\n  libraryCommand,\n  appearanceCommand,\n  artifactCommand,\n  validateCommand,\n  impactCommand,\n  gitCommand,\n];\n\nconst commandMap = new Map(\n  commands.map((command) => [command.name, command]),\n);\n\nexport const commandRegistry = {\n  get(name) {\n    return commandMap.get(name) ?? null;\n  },\n\n  list() {\n    return [...commands];\n  },\n\n  names() {\n    return commands.map((command) => command.name);\n  },\n};\n", "allowedPrevious": ["import { helpCommand } from \"./commands/help.mjs\";\nimport { versionCommand } from \"./commands/version.mjs\";\nimport { doctorCommand } from \"./commands/doctor.mjs\";\nimport { inspectCommand } from \"./commands/inspect.mjs\";\nimport { fileCommand } from \"./commands/file.mjs\";\nimport { excelCommand } from \"./commands/excel.mjs\";\nimport { powerpointCommand } from \"./commands/powerpoint.mjs\";\nimport { dataCommand } from \"./commands/data.mjs\";\nimport { libraryCommand } from \"./commands/library.mjs\";\nimport { appearanceCommand } from \"./commands/appearance.mjs\";\nimport { artifactCommand } from \"./commands/artifact.mjs\";\nimport { validateCommand } from \"./commands/validate.mjs\";\nimport { impactCommand } from \"./commands/impact.mjs\";\n\nconst commands = [\n  helpCommand,\n  versionCommand,\n  doctorCommand,\n  inspectCommand,\n  fileCommand,\n  excelCommand,\n  powerpointCommand,\n  dataCommand,\n  libraryCommand,\n  appearanceCommand,\n  artifactCommand,\n  validateCommand,\n  impactCommand,\n];\n\nconst commandMap = new Map(\n  commands.map((command) => [command.name, command]),\n);\n\nexport const commandRegistry = {\n  get(name) {\n    return commandMap.get(name) ?? null;\n  },\n\n  list() {\n    return [...commands];\n  },\n\n  names() {\n    return commands.map((command) => command.name);\n  },\n};\n"]}, "cli/commands/git.mjs": {"content": "import {\n  parseCommandArguments,\n  requirePositionals,\n} from \"../command-options.mjs\";\nimport {\n  CliError,\n  EXIT_OPERATION_FAILED,\n  EXIT_USAGE,\n} from \"../errors.mjs\";\nimport {\n  findWorkspaceRoot,\n} from \"../../src/workspace/find-root.mjs\";\nimport {\n  checkpointWorkspace,\n} from \"../../src/git/checkpoint.mjs\";\nimport {\n  GitSafetyError,\n} from \"../../src/git/errors.mjs\";\nimport {\n  getRepositoryStatus,\n} from \"../../src/git/status.mjs\";\n\nconst SUBCOMMANDS = new Set([\n  \"status\",\n  \"checkpoint\",\n]);\n\nexport const gitCommand = {\n  name: \"git\",\n  summary:\n    \"Inspect repository state and create validated focused checkpoints.\",\n  usage: \"mydash git <status|checkpoint> [paths...] [options]\",\n  options: [\n    \"status                         Show branch, upstream and working-tree state.\",\n    \"checkpoint <path...>           Validate and commit only explicit paths.\",\n    \"--message <text>               Required checkpoint commit message.\",\n    \"--acknowledge-impact           Confirm reviewed shared-resource consumers.\",\n    \"--fail-on-warning              Treat validation warnings as failures.\",\n    \"--dry-run                      Validate and analyse without committing.\",\n    \"--no-push                      Commit locally without pushing.\",\n    \"--workspace <path>             Use a specific workspace repository.\",\n    \"--json                         Return structured JSON.\",\n  ],\n\n  async run(invocation, context) {\n    const [subcommand, ...rest] = invocation.args;\n\n    if (!SUBCOMMANDS.has(subcommand)) {\n      throw new CliError(\n        \"UNKNOWN_GIT_SUBCOMMAND\",\n        subcommand\n          ? `Unknown Git subcommand: ${subcommand}`\n          : \"A Git subcommand is required.\",\n        {\n          exitCode: EXIT_USAGE,\n          details: {\n            availableSubcommands: [...SUBCOMMANDS],\n          },\n          hint: \"Run mydash help git to see available Git operations.\",\n        },\n      );\n    }\n\n    const workspaceRoot = await findWorkspaceRoot(\n      invocation.options.workspace ?? context.cwd,\n    );\n\n    if (!workspaceRoot) {\n      throw new CliError(\n        \"WORKSPACE_NOT_FOUND\",\n        \"No My Dashboards workspace was found.\",\n        { exitCode: EXIT_USAGE },\n      );\n    }\n\n    try {\n      if (subcommand === \"status\") {\n        return runStatus(rest, workspaceRoot);\n      }\n\n      return runCheckpoint(\n        rest,\n        workspaceRoot,\n        context,\n      );\n    } catch (error) {\n      if (error instanceof GitSafetyError) {\n        throw new CliError(\n          error.code,\n          error.message,\n          {\n            exitCode:\n              error.exitCode ??\n              EXIT_OPERATION_FAILED,\n            details: error.details,\n            hint: error.hint,\n          },\n        );\n      }\n\n      throw error;\n    }\n  },\n};\n\nasync function runStatus(args, workspaceRoot) {\n  const parsed = parseCommandArguments(args);\n\n  if (parsed.positionals.length > 0) {\n    throw new CliError(\n      \"INVALID_USAGE\",\n      `Unexpected argument: ${parsed.positionals[0]}. Usage: mydash git status`,\n      { exitCode: EXIT_USAGE },\n    );\n  }\n\n  const data = await getRepositoryStatus(\n    workspaceRoot,\n  );\n\n  return {\n    ok: true,\n    command: \"git status\",\n    data,\n    warnings: statusWarnings(data),\n    text: renderStatus(data),\n  };\n}\n\nasync function runCheckpoint(\n  args,\n  workspaceRoot,\n  context,\n) {\n  const parsed = parseCommandArguments(args, {\n    booleans: [\n      \"acknowledge-impact\",\n      \"fail-on-warning\",\n      \"dry-run\",\n      \"no-push\",\n    ],\n    values: [\"message\"],\n  });\n  requirePositionals(\n    parsed.positionals,\n    1,\n    \"mydash git checkpoint <path...> --message <text>\",\n  );\n\n  if (!parsed.options.message) {\n    throw new CliError(\n      \"MISSING_COMMIT_MESSAGE\",\n      \"A checkpoint requires --message <text>.\",\n      { exitCode: EXIT_USAGE },\n    );\n  }\n\n  const result = await checkpointWorkspace({\n    workspaceRoot,\n    paths: parsed.positionals,\n    message: parsed.options.message,\n    acknowledgeImpact:\n      parsed.options.acknowledgeImpact ?? false,\n    failOnWarning:\n      parsed.options.failOnWarning ?? false,\n    dryRun: parsed.options.dryRun ?? false,\n    push: !(parsed.options.noPush ?? false),\n    now: context.now,\n  });\n\n  return {\n    ok: result.ok,\n    command: \"git checkpoint\",\n    data: result,\n    warnings: result.warnings,\n    exitCode: result.exitCode,\n    text: renderCheckpoint(result),\n  };\n}\n\nfunction renderStatus(data) {\n  const lines = [\n    `Repository: ${data.root}`,\n    `Branch: ${data.detached ? \"(detached HEAD)\" : data.branch}`,\n    `HEAD: ${data.head ?? \"(no commits)\"}`,\n    `Upstream: ${data.upstream ?? \"(none)\"}`,\n    `Ahead/behind: ${data.ahead}/${data.behind}`,\n    `Clean: ${data.clean ? \"yes\" : \"no\"}`,\n    `Changes: ${data.summary.total}`,\n    `Staged: ${data.summary.staged}`,\n    `Unstaged: ${data.summary.unstaged}`,\n    `Untracked: ${data.summary.untracked}`,\n  ];\n\n  if (data.inProgress.length > 0) {\n    lines.push(\n      `Operation in progress: ${data.inProgress.join(\", \")}`,\n    );\n  }\n\n  if (data.changes.length > 0) {\n    lines.push(\"\");\n    lines.push(\"Working tree:\");\n\n    for (const change of data.changes) {\n      const rename = change.originalPath\n        ? ` <- ${change.originalPath}`\n        : \"\";\n      lines.push(\n        `  ${change.status} ${change.path}${rename}`,\n      );\n    }\n  }\n\n  return lines.join(\"\\n\");\n}\n\nfunction renderCheckpoint(result) {\n  const lines = [\n    `Validation: ${result.validation.summary.valid ? \"passed\" : \"failed\"}`,\n    `Selected changes: ${result.selectedChanges.length}`,\n    `Shared impact: ${result.impact.summary.sharedResourceCount} resources`,\n    `Affected artefacts: ${result.impact.summary.affectedArtifactCount}`,\n  ];\n\n  if (result.dryRun) {\n    lines.push(\"Checkpoint: dry-run only\");\n  } else {\n    lines.push(\n      `Commit: ${result.commit?.hash ?? \"(none)\"}`,\n    );\n    lines.push(\n      `Pushed: ${result.push.pushed ? \"yes\" : \"no\"}`,\n    );\n\n    if (result.push.target) {\n      lines.push(`Push target: ${result.push.target}`);\n    }\n  }\n\n  return lines.join(\"\\n\");\n}\n\nfunction statusWarnings(data) {\n  const warnings = [];\n\n  if (data.detached) {\n    warnings.push({\n      code: \"DETACHED_HEAD\",\n      message:\n        \"HEAD is detached. Checkpoint creation is disabled until a branch is checked out.\",\n    });\n  }\n\n  if (data.inProgress.length > 0) {\n    warnings.push({\n      code: \"GIT_OPERATION_IN_PROGRESS\",\n      message:\n        `Git operation in progress: ${data.inProgress.join(\", \")}.`,\n    });\n  }\n\n  if (!data.identity.configured) {\n    warnings.push({\n      code: \"GIT_IDENTITY_MISSING\",\n      message:\n        \"Git user.name or user.email is not configured.\",\n    });\n  }\n\n  if (!data.upstream) {\n    warnings.push({\n      code: \"GIT_UPSTREAM_MISSING\",\n      message:\n        \"The current branch has no upstream. A safe origin upstream will be created when possible.\",\n    });\n  }\n\n  return warnings;\n}\n"}, "src/git/errors.mjs": {"content": "export class GitSafetyError extends Error {\n  constructor(code, message, options = {}) {\n    super(message);\n    this.name = \"GitSafetyError\";\n    this.code = code;\n    this.exitCode = options.exitCode ?? 1;\n    this.details = options.details ?? null;\n    this.hint = options.hint ?? null;\n  }\n}\n"}, "src/git/run.mjs": {"content": "import { spawnSync } from \"node:child_process\";\n\nexport function runGit(args, options = {}) {\n  const result = spawnSync(\n    \"git\",\n    args,\n    {\n      cwd: options.cwd,\n      encoding: \"utf8\",\n      stdio: \"pipe\",\n      shell: false,\n      env: {\n        ...process.env,\n        ...(options.env ?? {}),\n      },\n      maxBuffer:\n        options.maxBuffer ??\n        64 * 1024 * 1024,\n    },\n  );\n\n  if (result.error) throw result.error;\n\n  const response = {\n    status: result.status ?? 1,\n    stdout: result.stdout ?? \"\",\n    stderr: result.stderr ?? \"\",\n  };\n\n  if (\n    response.status !== 0 &&\n    !options.allowFailure\n  ) {\n    const detail = [\n      response.stderr.trim(),\n      response.stdout.trim(),\n    ]\n      .filter(Boolean)\n      .join(\"\\n\");\n\n    const error = new Error(\n      `git ${args.join(\" \")} failed with exit code ${response.status}` +\n        (detail ? `:\\n${detail}` : \".\"),\n    );\n    error.code = \"GIT_COMMAND_FAILED\";\n    error.command = [\"git\", ...args];\n    error.status = response.status;\n    error.stdout = response.stdout;\n    error.stderr = response.stderr;\n    throw error;\n  }\n\n  return response;\n}\n\nexport function gitOutput(args, options = {}) {\n  return runGit(args, options).stdout.trim();\n}\n"}, "src/git/status.mjs": {"content": "import {\n  access,\n  realpath,\n} from \"node:fs/promises\";\nimport { constants as fsConstants } from \"node:fs\";\nimport {\n  isAbsolute,\n  resolve,\n} from \"node:path\";\nimport {\n  gitOutput,\n  runGit,\n} from \"./run.mjs\";\nimport {\n  GitSafetyError,\n} from \"./errors.mjs\";\n\nexport async function getRepositoryStatus(\n  workspaceRoot,\n) {\n  const root = await requireRepositoryRoot(\n    workspaceRoot,\n  );\n  const branch = gitOutput(\n    [\"branch\", \"--show-current\"],\n    { cwd: root },\n  );\n  const detached = !branch;\n  const headResult = runGit(\n    [\"rev-parse\", \"--short\", \"HEAD\"],\n    {\n      cwd: root,\n      allowFailure: true,\n    },\n  );\n  const head =\n    headResult.status === 0\n      ? headResult.stdout.trim()\n      : null;\n  const upstreamResult = runGit(\n    [\n      \"rev-parse\",\n      \"--abbrev-ref\",\n      \"--symbolic-full-name\",\n      \"@{upstream}\",\n    ],\n    {\n      cwd: root,\n      allowFailure: true,\n    },\n  );\n  const upstream =\n    upstreamResult.status === 0\n      ? upstreamResult.stdout.trim()\n      : null;\n  const divergence = upstream\n    ? parseDivergence(\n        gitOutput(\n          [\n            \"rev-list\",\n            \"--left-right\",\n            \"--count\",\n            \"HEAD...@{upstream}\",\n          ],\n          { cwd: root },\n        ),\n      )\n    : { ahead: 0, behind: 0 };\n  const changes = parsePorcelainV1Z(\n    runGit(\n      [\n        \"status\",\n        \"--porcelain=v1\",\n        \"-z\",\n        \"--untracked-files=all\",\n      ],\n      { cwd: root },\n    ).stdout,\n  );\n  const gitDirectory = await resolveGitDirectory(\n    root,\n  );\n  const inProgress =\n    await detectInProgressOperations(gitDirectory);\n  const userName = gitOutput(\n    [\"config\", \"--get\", \"user.name\"],\n    {\n      cwd: root,\n      allowFailure: true,\n    },\n  );\n  const userEmail = gitOutput(\n    [\"config\", \"--get\", \"user.email\"],\n    {\n      cwd: root,\n      allowFailure: true,\n    },\n  );\n  const remotes = parseRemotes(\n    runGit([\"remote\", \"-v\"], {\n      cwd: root,\n      allowFailure: true,\n    }).stdout,\n  );\n  const summary = summariseChanges(changes);\n\n  return {\n    root,\n    branch: branch || null,\n    detached,\n    head,\n    upstream,\n    ahead: divergence.ahead,\n    behind: divergence.behind,\n    clean: changes.length === 0,\n    changes,\n    summary,\n    inProgress,\n    identity: {\n      name: userName || null,\n      email: userEmail || null,\n      configured: Boolean(userName && userEmail),\n    },\n    remotes,\n  };\n}\n\nexport async function requireRepositoryRoot(\n  workspaceRoot,\n) {\n  const result = runGit(\n    [\"rev-parse\", \"--show-toplevel\"],\n    {\n      cwd: workspaceRoot,\n      allowFailure: true,\n    },\n  );\n\n  if (result.status !== 0) {\n    throw new GitSafetyError(\n      \"GIT_REPOSITORY_NOT_FOUND\",\n      \"The workspace is not inside a Git repository.\",\n      { exitCode: 5 },\n    );\n  }\n\n  const root = await realpath(\n    result.stdout.trim(),\n  );\n  const workspace = await realpath(\n    resolve(workspaceRoot),\n  );\n\n  if (root !== workspace) {\n    throw new GitSafetyError(\n      \"WORKSPACE_NOT_REPOSITORY_ROOT\",\n      \"The My Dashboards workspace must be the Git repository root.\",\n      {\n        exitCode: 5,\n        details: {\n          workspaceRoot: workspace,\n          repositoryRoot: root,\n        },\n      },\n    );\n  }\n\n  return root;\n}\n\nexport function parsePorcelainV1Z(output) {\n  if (!output) return [];\n\n  const fields = output.split(\"\\0\");\n  const changes = [];\n\n  for (\n    let index = 0;\n    index < fields.length;\n    index += 1\n  ) {\n    const field = fields[index];\n    if (!field) continue;\n    if (field.length < 4) continue;\n\n    const status = field.slice(0, 2);\n    const path = normalisePath(\n      field.slice(3),\n    );\n    let originalPath = null;\n\n    if (\n      status.includes(\"R\") ||\n      status.includes(\"C\")\n    ) {\n      originalPath = normalisePath(\n        fields[index + 1] ?? \"\",\n      );\n      index += 1;\n    }\n\n    const untracked = status === \"??\";\n    const indexStatus = status[0];\n    const worktreeStatus = status[1];\n\n    changes.push({\n      status,\n      path,\n      originalPath:\n        originalPath || null,\n      staged:\n        !untracked &&\n        indexStatus !== \" \",\n      unstaged:\n        !untracked &&\n        worktreeStatus !== \" \",\n      untracked,\n      conflicted:\n        [\"DD\", \"AU\", \"UD\", \"UA\", \"DU\", \"AA\", \"UU\"].includes(\n          status,\n        ),\n    });\n  }\n\n  return changes;\n}\n\nexport function summariseChanges(changes) {\n  return {\n    total: changes.length,\n    staged: changes.filter(\n      (change) => change.staged,\n    ).length,\n    unstaged: changes.filter(\n      (change) => change.unstaged,\n    ).length,\n    untracked: changes.filter(\n      (change) => change.untracked,\n    ).length,\n    conflicted: changes.filter(\n      (change) => change.conflicted,\n    ).length,\n  };\n}\n\nasync function resolveGitDirectory(root) {\n  const value = gitOutput(\n    [\"rev-parse\", \"--git-dir\"],\n    { cwd: root },\n  );\n  const path = isAbsolute(value)\n    ? value\n    : resolve(root, value);\n\n  return realpath(path);\n}\n\nasync function detectInProgressOperations(\n  gitDirectory,\n) {\n  const checks = [\n    [\"merge\", \"MERGE_HEAD\"],\n    [\"cherry-pick\", \"CHERRY_PICK_HEAD\"],\n    [\"revert\", \"REVERT_HEAD\"],\n    [\"bisect\", \"BISECT_LOG\"],\n    [\"rebase\", \"rebase-merge\"],\n    [\"rebase\", \"rebase-apply\"],\n  ];\n  const found = new Set();\n\n  for (const [operation, path] of checks) {\n    try {\n      await access(\n        resolve(gitDirectory, path),\n        fsConstants.F_OK,\n      );\n      found.add(operation);\n    } catch {\n      // Missing markers are expected.\n    }\n  }\n\n  return [...found].sort();\n}\n\nfunction parseDivergence(value) {\n  const [ahead, behind] = value\n    .trim()\n    .split(/\\s+/)\n    .map((part) =>\n      Number.parseInt(part, 10),\n    );\n\n  return {\n    ahead:\n      Number.isInteger(ahead) ? ahead : 0,\n    behind:\n      Number.isInteger(behind) ? behind : 0,\n  };\n}\n\nfunction parseRemotes(output) {\n  const remotes = [];\n\n  for (const line of output.split(/\\r?\\n/)) {\n    if (!line.trim()) continue;\n\n    const match = line.match(\n      /^(\\S+)\\s+(.+)\\s+\\((fetch|push)\\)$/,\n    );\n\n    if (!match) continue;\n\n    remotes.push({\n      name: match[1],\n      url: match[2],\n      direction: match[3],\n    });\n  }\n\n  return remotes;\n}\n\nfunction normalisePath(value) {\n  return String(value).replaceAll(\"\\\\\", \"/\");\n}\n"}, "src/git/paths.mjs": {"content": "import {\n  createHash,\n} from \"node:crypto\";\nimport {\n  lstat,\n  readFile,\n  readlink,\n} from \"node:fs/promises\";\nimport {\n  isAbsolute,\n  relative,\n  resolve,\n} from \"node:path\";\nimport {\n  runGit,\n} from \"./run.mjs\";\nimport {\n  parsePorcelainV1Z,\n} from \"./status.mjs\";\nimport {\n  GitSafetyError,\n} from \"./errors.mjs\";\n\nconst PATHSPEC_MAGIC = /^:\\(/;\nconst WILDCARDS = /[*?[]/;\n\nexport async function normaliseCheckpointPaths(\n  repositoryRoot,\n  inputs,\n) {\n  const paths = [];\n\n  for (const input of inputs) {\n    const raw = String(input);\n\n    if (\n      !raw ||\n      raw.includes(\"\\0\") ||\n      raw.includes(\"\\n\") ||\n      raw.includes(\"\\r\")\n    ) {\n      throw unsafePath(\n        raw,\n        \"Checkpoint paths must be non-empty single-line paths.\",\n      );\n    }\n\n    if (\n      isAbsolute(raw) ||\n      /^[A-Za-z]:[\\\\/]/.test(raw)\n    ) {\n      throw unsafePath(\n        raw,\n        \"Checkpoint paths must be repository-relative.\",\n      );\n    }\n\n    if (\n      PATHSPEC_MAGIC.test(raw) ||\n      WILDCARDS.test(raw)\n    ) {\n      throw unsafePath(\n        raw,\n        \"Git pathspec magic and wildcards are not allowed. Name an explicit file or directory.\",\n      );\n    }\n\n    const absolutePath = resolve(\n      repositoryRoot,\n      raw,\n    );\n    const relationship = relative(\n      repositoryRoot,\n      absolutePath,\n    );\n\n    if (\n      !relationship ||\n      relationship === \".\" ||\n      relationship.startsWith(\"..\") ||\n      isAbsolute(relationship)\n    ) {\n      throw unsafePath(\n        raw,\n        \"Checkpoint paths must identify content below the repository root.\",\n      );\n    }\n\n    const path = relationship.replaceAll(\n      \"\\\\\",\n      \"/\",\n    );\n\n    if (\n      path === \".git\" ||\n      path.startsWith(\".git/\")\n    ) {\n      throw unsafePath(\n        raw,\n        \"The Git metadata directory cannot be checkpointed.\",\n      );\n    }\n\n    if (!(await pathExistsOrTracked(\n      repositoryRoot,\n      path,\n    ))) {\n      throw new GitSafetyError(\n        \"CHECKPOINT_PATH_NOT_FOUND\",\n        `Checkpoint path does not exist and is not tracked: ${path}`,\n        {\n          exitCode: 2,\n          details: { path },\n        },\n      );\n    }\n\n    paths.push(path);\n  }\n\n  return removeRedundantPaths(\n    [...new Set(paths)].sort(),\n  );\n}\n\nexport function changesForPaths(\n  repositoryRoot,\n  paths,\n) {\n  return parsePorcelainV1Z(\n    runGit(\n      [\n        \"status\",\n        \"--porcelain=v1\",\n        \"-z\",\n        \"--untracked-files=all\",\n        \"--\",\n        ...paths,\n      ],\n      { cwd: repositoryRoot },\n    ).stdout,\n  );\n}\n\nexport function assertNoPartialStaging(\n  changes,\n) {\n  const partial = changes.filter(\n    (change) =>\n      !change.untracked &&\n      change.staged &&\n      change.unstaged,\n  );\n\n  if (partial.length > 0) {\n    throw new GitSafetyError(\n      \"PARTIALLY_STAGED_PATHS\",\n      \"Checkpoint paths contain both staged and unstaged changes.\",\n      {\n        exitCode: 5,\n        details: {\n          paths: partial.map(\n            (change) => change.path,\n          ),\n        },\n        hint:\n          \"Commit or unstage the partial changes first so the checkpoint has one unambiguous file version.\",\n      },\n    );\n  }\n}\n\nexport async function fingerprintChanges(\n  repositoryRoot,\n  changes,\n) {\n  const hash = createHash(\"sha256\");\n  const ordered = [...changes].sort(\n    (left, right) =>\n      left.path.localeCompare(\n        right.path,\n        \"en\",\n      ),\n  );\n\n  for (const change of ordered) {\n    hash.update(\n      JSON.stringify({\n        status: change.status,\n        path: change.path,\n        originalPath: change.originalPath,\n      }),\n    );\n\n    const absolutePath = resolve(\n      repositoryRoot,\n      change.path,\n    );\n\n    try {\n      const metadata = await lstat(\n        absolutePath,\n      );\n\n      if (metadata.isSymbolicLink()) {\n        hash.update(\"symlink:\");\n        hash.update(\n          await readlink(absolutePath),\n        );\n      } else if (metadata.isFile()) {\n        hash.update(\"file:\");\n        hash.update(\n          await readFile(absolutePath),\n        );\n      } else {\n        hash.update(\n          `other:${metadata.mode}:${metadata.size}`,\n        );\n      }\n    } catch (error) {\n      if (error?.code === \"ENOENT\") {\n        hash.update(\"missing\");\n      } else {\n        throw error;\n      }\n    }\n  }\n\n  return hash.digest(\"hex\");\n}\n\nasync function pathExistsOrTracked(\n  repositoryRoot,\n  path,\n) {\n  try {\n    await lstat(resolve(repositoryRoot, path));\n    return true;\n  } catch (error) {\n    if (error?.code !== \"ENOENT\") throw error;\n  }\n\n  const tracked = runGit(\n    [\"ls-files\", \"-z\", \"--\", path],\n    {\n      cwd: repositoryRoot,\n      allowFailure: true,\n    },\n  );\n\n  return Boolean(tracked.stdout);\n}\n\nfunction removeRedundantPaths(paths) {\n  const result = [];\n\n  for (const path of paths) {\n    const covered = result.some(\n      (parent) =>\n        path === parent ||\n        path.startsWith(`${parent}/`),\n    );\n\n    if (!covered) result.push(path);\n  }\n\n  return result;\n}\n\nfunction unsafePath(path, message) {\n  return new GitSafetyError(\n    \"UNSAFE_CHECKPOINT_PATH\",\n    `${message} Received: ${path || \"(empty)\"}`,\n    { exitCode: 5 },\n  );\n}\n"}, "src/git/impact.mjs": {"content": "import {\n  isAbsolute,\n  relative,\n  resolve,\n} from \"node:path\";\nimport {\n  analyseLibraryImpact,\n} from \"../validation/impact-analysis.mjs\";\n\nconst SHARED_PATH_PATTERN =\n  /^library\\/(?:ui\\/(?:primitives|components|layouts)|themes|presets|assets)\\/(?:core|collections)\\//;\n\nexport function analyseCheckpointImpact(\n  scan,\n  changedPaths,\n) {\n  const entryPaths = new Map();\n\n  for (const path of changedPaths) {\n    const entry = deepestContainingEntry(\n      scan,\n      path,\n    );\n\n    if (!entry) continue;\n\n    const paths =\n      entryPaths.get(entry.manifestPath) ?? [];\n    paths.push(path);\n    entryPaths.set(\n      entry.manifestPath,\n      paths,\n    );\n  }\n\n  const reports = [];\n\n  for (const [\n    manifestPath,\n    paths,\n  ] of entryPaths) {\n    const entry = scan.entries.find(\n      (candidate) =>\n        candidate.manifestPath === manifestPath,\n    );\n\n    if (!entry || entry.category === \"artifact\") {\n      continue;\n    }\n\n    reports.push(\n      analyseLibraryImpact(\n        scan,\n        entry,\n        {\n          changeType:\n            inferChangeType(entry, paths),\n        },\n      ),\n    );\n  }\n\n  const mappedDirectories = reports.map(\n    (report) =>\n      scan.entries.find(\n        (entry) =>\n          entry.manifestPath ===\n          report.target.manifestPath,\n      )?.directory,\n  ).filter(Boolean);\n  const manualReviewPaths = changedPaths.filter(\n    (path) =>\n      SHARED_PATH_PATTERN.test(path) &&\n      !mappedDirectories.some(\n        (directory) =>\n          isContained(\n            directory,\n            resolve(scan.workspaceRoot, path),\n          ),\n      ),\n  );\n  const requiringAcknowledgement =\n    reports.filter(\n      (report) =>\n        [\"core\", \"collection\"].includes(\n          report.target.level,\n        ) &&\n        report.summary.transitiveConsumerCount > 0,\n    );\n  const affectedArtifacts = uniqueEntries(\n    reports.flatMap(\n      (report) => report.affectedArtifacts,\n    ),\n  );\n\n  return {\n    reports,\n    manualReviewPaths,\n    requiringAcknowledgement:\n      requiringAcknowledgement.map(\n        (report) => ({\n          target: report.target,\n          summary: report.summary,\n          affectedArtifacts:\n            report.affectedArtifacts,\n        }),\n      ),\n    summary: {\n      sharedResourceCount:\n        reports.filter(\n          (report) =>\n            [\"core\", \"collection\"].includes(\n              report.target.level,\n            ),\n        ).length,\n      localResourceCount:\n        reports.filter(\n          (report) =>\n            report.target.level === \"local\",\n        ).length,\n      affectedArtifactCount:\n        affectedArtifacts.length,\n      requiresAcknowledgement:\n        requiringAcknowledgement.length > 0 ||\n        manualReviewPaths.length > 0,\n      manualReviewPathCount:\n        manualReviewPaths.length,\n    },\n    affectedArtifacts,\n  };\n}\n\nfunction deepestContainingEntry(scan, path) {\n  const absolutePath = resolve(\n    scan.workspaceRoot,\n    path,\n  );\n  const candidates = scan.entries.filter(\n    (entry) =>\n      isContained(\n        entry.directory,\n        absolutePath,\n      ),\n  );\n\n  candidates.sort(\n    (left, right) =>\n      right.directory.length -\n      left.directory.length,\n  );\n\n  return candidates[0] ?? null;\n}\n\nfunction inferChangeType(entry, paths) {\n  const manifestName =\n    entry.manifestPath\n      .split(/[\\\\/]/)\n      .at(-1);\n\n  if (\n    paths.some(\n      (path) =>\n        path.split(\"/\").at(-1) ===\n        manifestName,\n    )\n  ) {\n    return \"contract\";\n  }\n\n  if (entry.kind === \"asset\") {\n    return \"asset\";\n  }\n\n  if (\n    entry.kind === \"theme\" ||\n    paths.some((path) =>\n      /\\.(?:css|scss|sass|less)$/i.test(path),\n    )\n  ) {\n    return \"appearance\";\n  }\n\n  return \"implementation\";\n}\n\nfunction isContained(parent, candidate) {\n  const relationship = relative(\n    parent,\n    candidate,\n  );\n\n  return (\n    relationship === \"\" ||\n    (!relationship.startsWith(\"..\") &&\n      !isAbsolute(relationship))\n  );\n}\n\nfunction uniqueEntries(entries) {\n  const values = new Map();\n\n  for (const entry of entries) {\n    values.set(\n      entry.manifestPath,\n      entry,\n    );\n  }\n\n  return [...values.values()].sort(\n    (left, right) =>\n      left.kind.localeCompare(\n        right.kind,\n        \"en\",\n      ) ||\n      left.id.localeCompare(\n        right.id,\n        \"en\",\n      ),\n  );\n}\n"}, "src/git/checkpoint.mjs": {"content": "import {\n  runGit,\n} from \"./run.mjs\";\nimport {\n  getRepositoryStatus,\n} from \"./status.mjs\";\nimport {\n  assertNoPartialStaging,\n  changesForPaths,\n  fingerprintChanges,\n  normaliseCheckpointPaths,\n} from \"./paths.mjs\";\nimport {\n  GitSafetyError,\n} from \"./errors.mjs\";\nimport {\n  validateWorkspace,\n} from \"../validation/workspace-validation.mjs\";\nimport {\n  scanWorkspaceLibrary,\n} from \"../library/scan.mjs\";\nimport {\n  analyseCheckpointImpact,\n} from \"./impact.mjs\";\n\nconst DEFAULT_MAX_EXPORT_BYTES =\n  50 * 1024 * 1024;\n\nexport async function checkpointWorkspace(\n  options,\n) {\n  validateMessage(options.message);\n\n  const statusBefore =\n    await getRepositoryStatus(\n      options.workspaceRoot,\n    );\n  assertCheckpointable(statusBefore);\n\n  const paths =\n    await normaliseCheckpointPaths(\n      statusBefore.root,\n      options.paths,\n    );\n  const selectedChanges = changesForPaths(\n    statusBefore.root,\n    paths,\n  );\n\n  if (selectedChanges.length === 0) {\n    throw new GitSafetyError(\n      \"NO_SELECTED_CHANGES\",\n      \"None of the selected paths contain changes.\",\n      {\n        exitCode: 2,\n        details: { paths },\n      },\n    );\n  }\n\n  if (\n    selectedChanges.some(\n      (change) => change.conflicted,\n    )\n  ) {\n    throw new GitSafetyError(\n      \"SELECTED_PATH_CONFLICT\",\n      \"Checkpoint paths contain unresolved merge conflicts.\",\n      {\n        exitCode: 5,\n        details: {\n          paths: selectedChanges\n            .filter(\n              (change) => change.conflicted,\n            )\n            .map((change) => change.path),\n        },\n      },\n    );\n  }\n\n  assertNoPartialStaging(selectedChanges);\n\n  const fingerprintBefore =\n    await fingerprintChanges(\n      statusBefore.root,\n      selectedChanges,\n    );\n  const validation = await validateWorkspace({\n    workspaceRoot: statusBefore.root,\n    validateExports: true,\n    validateRecipes: true,\n    minify: false,\n    maxBytes:\n      options.maxBytes ??\n      DEFAULT_MAX_EXPORT_BYTES,\n    failOnWarning:\n      options.failOnWarning ?? false,\n    now: options.now,\n  });\n\n  if (!validation.summary.valid) {\n    throw new GitSafetyError(\n      \"CHECKPOINT_VALIDATION_FAILED\",\n      \"The repository failed consolidated validation. No files were staged or committed.\",\n      {\n        exitCode: 3,\n        details: {\n          summary: validation.summary,\n          issues: validation.issues.slice(\n            0,\n            50,\n          ),\n        },\n        hint:\n          \"Run mydash validate for the complete report, fix the errors, then retry the checkpoint.\",\n      },\n    );\n  }\n\n  const scan = await scanWorkspaceLibrary(\n    statusBefore.root,\n  );\n  const changedPaths = uniqueChangedPaths(\n    selectedChanges,\n  );\n  const impact = analyseCheckpointImpact(\n    scan,\n    changedPaths,\n  );\n\n  if (\n    impact.summary.requiresAcknowledgement &&\n    !options.acknowledgeImpact\n  ) {\n    throw new GitSafetyError(\n      \"SHARED_IMPACT_ACKNOWLEDGEMENT_REQUIRED\",\n      \"The selected changes affect consumed shared resources. No files were staged or committed.\",\n      {\n        exitCode: 5,\n        details: {\n          impact,\n        },\n        hint:\n          \"Review the affected artefacts with mydash impact, then retry with --acknowledge-impact.\",\n      },\n    );\n  }\n\n  const changesAfterValidation =\n    changesForPaths(\n      statusBefore.root,\n      paths,\n    );\n  const fingerprintAfter =\n    await fingerprintChanges(\n      statusBefore.root,\n      changesAfterValidation,\n    );\n\n  if (\n    fingerprintBefore !== fingerprintAfter ||\n    !sameChangeSet(\n      selectedChanges,\n      changesAfterValidation,\n    )\n  ) {\n    throw new GitSafetyError(\n      \"WORKTREE_CHANGED_DURING_VALIDATION\",\n      \"Selected files changed while validation was running. No checkpoint was created.\",\n      {\n        exitCode: 5,\n        hint:\n          \"Review the latest changes and rerun the checkpoint.\",\n      },\n    );\n  }\n\n  if (options.dryRun) {\n    return {\n      ok: true,\n      exitCode: 0,\n      dryRun: true,\n      repository: statusBefore,\n      paths,\n      selectedChanges,\n      validation,\n      impact,\n      commit: null,\n      push: {\n        requested: false,\n        pushed: false,\n        target: null,\n      },\n      warnings: [],\n    };\n  }\n\n  runGit(\n    [\"add\", \"-A\", \"--\", ...paths],\n    { cwd: statusBefore.root },\n  );\n\n  const staged = runGit(\n    [\n      \"diff\",\n      \"--cached\",\n      \"--name-status\",\n      \"-z\",\n      \"--\",\n      ...paths,\n    ],\n    { cwd: statusBefore.root },\n  ).stdout;\n\n  if (!staged) {\n    throw new GitSafetyError(\n      \"NO_STAGED_CHECKPOINT_CHANGES\",\n      \"The selected changes produced no staged content.\",\n      {\n        exitCode: 2,\n      },\n    );\n  }\n\n  const commitResult = runGit(\n    [\n      \"commit\",\n      \"--only\",\n      \"-m\",\n      options.message.trim(),\n      \"--\",\n      ...paths,\n    ],\n    {\n      cwd: statusBefore.root,\n      allowFailure: true,\n    },\n  );\n\n  if (commitResult.status !== 0) {\n    throw new GitSafetyError(\n      \"GIT_COMMIT_FAILED\",\n      \"The focused Git commit failed. Selected paths may remain staged.\",\n      {\n        exitCode: 1,\n        details: {\n          stdout:\n            commitResult.stdout.trim(),\n          stderr:\n            commitResult.stderr.trim(),\n          paths,\n        },\n        hint:\n          \"Inspect mydash git status before retrying.\",\n      },\n    );\n  }\n\n  const commit = {\n    hash: runGit(\n      [\"rev-parse\", \"--short\", \"HEAD\"],\n      { cwd: statusBefore.root },\n    ).stdout.trim(),\n    fullHash: runGit(\n      [\"rev-parse\", \"HEAD\"],\n      { cwd: statusBefore.root },\n    ).stdout.trim(),\n    message: options.message.trim(),\n    paths: runGit(\n      [\n        \"show\",\n        \"--pretty=format:\",\n        \"--name-only\",\n        \"HEAD\",\n      ],\n      { cwd: statusBefore.root },\n    ).stdout\n      .split(/\\r?\\n/)\n      .map((value) => value.trim())\n      .filter(Boolean),\n  };\n  const push = options.push === false\n    ? {\n        requested: false,\n        pushed: false,\n        target: null,\n        obstacle: null,\n      }\n    : pushCurrentBranch(\n        statusBefore.root,\n      );\n  const warnings = [];\n\n  if (push.obstacle) {\n    warnings.push({\n      code: push.code,\n      message: push.obstacle,\n    });\n  }\n\n  return {\n    ok:\n      !push.requested ||\n      push.pushed ||\n      push.code === \"NO_PUSH_TARGET\",\n    exitCode:\n      push.requested &&\n      !push.pushed &&\n      push.code !== \"NO_PUSH_TARGET\"\n        ? 1\n        : 0,\n    dryRun: false,\n    repository: statusBefore,\n    paths,\n    selectedChanges,\n    validation,\n    impact,\n    commit,\n    push,\n    warnings,\n  };\n}\n\nfunction pushCurrentBranch(root) {\n  const branch = runGit(\n    [\"branch\", \"--show-current\"],\n    { cwd: root },\n  ).stdout.trim();\n  const upstream = runGit(\n    [\n      \"rev-parse\",\n      \"--abbrev-ref\",\n      \"--symbolic-full-name\",\n      \"@{upstream}\",\n    ],\n    {\n      cwd: root,\n      allowFailure: true,\n    },\n  );\n\n  if (upstream.status === 0) {\n    const target =\n      upstream.stdout.trim();\n    const result = runGit(\n      [\"push\"],\n      {\n        cwd: root,\n        allowFailure: true,\n      },\n    );\n\n    return result.status === 0\n      ? {\n          requested: true,\n          pushed: true,\n          target,\n          obstacle: null,\n          code: null,\n        }\n      : {\n          requested: true,\n          pushed: false,\n          target,\n          code: \"PUSH_FAILED\",\n          obstacle:\n            \"The commit was created locally, but Git push failed safely. No force-push was attempted. \" +\n            (result.stderr.trim() ||\n              result.stdout.trim()),\n        };\n  }\n\n  const remotes = runGit(\n    [\"remote\"],\n    {\n      cwd: root,\n      allowFailure: true,\n    },\n  ).stdout\n    .split(/\\r?\\n/)\n    .map((value) => value.trim())\n    .filter(Boolean);\n\n  if (!branch || !remotes.includes(\"origin\")) {\n    return {\n      requested: true,\n      pushed: false,\n      target: null,\n      code: \"NO_PUSH_TARGET\",\n      obstacle:\n        \"The commit was created locally, but no upstream was configured and an origin remote was unavailable.\",\n    };\n  }\n\n  const result = runGit(\n    [\n      \"push\",\n      \"-u\",\n      \"origin\",\n      branch,\n    ],\n    {\n      cwd: root,\n      allowFailure: true,\n    },\n  );\n  const target = `origin/${branch}`;\n\n  return result.status === 0\n    ? {\n        requested: true,\n        pushed: true,\n        target,\n        obstacle: null,\n        code: null,\n      }\n    : {\n        requested: true,\n        pushed: false,\n        target,\n        code: \"PUSH_FAILED\",\n        obstacle:\n          \"The commit was created locally, but Git push failed safely. No force-push was attempted. \" +\n          (result.stderr.trim() ||\n            result.stdout.trim()),\n      };\n}\n\nfunction assertCheckpointable(status) {\n  if (!status.head) {\n    throw new GitSafetyError(\n      \"GIT_HISTORY_REQUIRED\",\n      \"Checkpoint creation requires an existing Git commit.\",\n      { exitCode: 5 },\n    );\n  }\n\n  if (status.detached) {\n    throw new GitSafetyError(\n      \"DETACHED_HEAD\",\n      \"Checkpoint creation is disabled on a detached HEAD.\",\n      {\n        exitCode: 5,\n        hint:\n          \"Check out a branch before creating a checkpoint.\",\n      },\n    );\n  }\n\n  if (status.inProgress.length > 0) {\n    throw new GitSafetyError(\n      \"GIT_OPERATION_IN_PROGRESS\",\n      `Checkpoint creation is disabled during: ${status.inProgress.join(\", \")}.`,\n      { exitCode: 5 },\n    );\n  }\n\n  if (status.summary.conflicted > 0) {\n    throw new GitSafetyError(\n      \"GIT_CONFLICTS_PRESENT\",\n      \"Checkpoint creation is disabled while the repository contains unresolved conflicts.\",\n      { exitCode: 5 },\n    );\n  }\n\n  if (!status.identity.configured) {\n    throw new GitSafetyError(\n      \"GIT_IDENTITY_MISSING\",\n      \"Git user.name and user.email must be configured before committing.\",\n      {\n        exitCode: 4,\n      },\n    );\n  }\n}\n\nfunction validateMessage(message) {\n  const value = String(message ?? \"\").trim();\n\n  if (\n    value.length < 3 ||\n    value.length > 200 ||\n    value.includes(\"\\n\") ||\n    value.includes(\"\\r\")\n  ) {\n    throw new GitSafetyError(\n      \"INVALID_COMMIT_MESSAGE\",\n      \"Commit messages must be a single line between 3 and 200 characters.\",\n      { exitCode: 2 },\n    );\n  }\n}\n\nfunction uniqueChangedPaths(changes) {\n  return [\n    ...new Set(\n      changes.flatMap((change) =>\n        [\n          change.path,\n          change.originalPath,\n        ].filter(Boolean),\n      ),\n    ),\n  ].sort();\n}\n\nfunction sameChangeSet(left, right) {\n  return (\n    JSON.stringify(\n      normaliseChanges(left),\n    ) ===\n    JSON.stringify(\n      normaliseChanges(right),\n    )\n  );\n}\n\nfunction normaliseChanges(changes) {\n  return changes\n    .map((change) => ({\n      status: change.status,\n      path: change.path,\n      originalPath:\n        change.originalPath,\n    }))\n    .sort(\n      (left, right) =>\n        left.path.localeCompare(\n          right.path,\n          \"en\",\n        ),\n    );\n}\n"}, "src/git/README.md": {"content": "# Constrained Git operations\n\nGit is the persistence, collaboration and recovery layer for My Dashboards.\n\n## Status\n\n`mydash git status` reports:\n\n- repository root;\n- branch and detached-HEAD state;\n- HEAD commit;\n- upstream and ahead/behind counts;\n- staged, unstaged, untracked and conflicted paths;\n- active merge, rebase, cherry-pick, revert or bisect operations;\n- configured identity and remotes.\n\n## Checkpoint safety\n\n`mydash git checkpoint <path...> --message <text>`:\n\n1. requires explicit repository-relative paths;\n2. refuses wildcards, Git pathspec magic and the repository root;\n3. refuses detached HEAD, conflicts and in-progress Git operations;\n4. refuses partially staged selected files;\n5. runs complete consolidated validation before staging;\n6. calculates shared-resource impact;\n7. requires `--acknowledge-impact` for consumed Core or Collection resources;\n8. verifies selected files did not change during validation;\n9. stages only the explicit paths;\n10. commits only those paths with `git commit --only`;\n11. preserves unrelated staged and unstaged changes;\n12. pushes the current upstream, or creates `origin/<branch>` safely;\n13. never force-pushes or rewrites published history.\n\nWhen no push target exists, the local commit remains valid and the exact obstacle\nis reported.\n\n## Examples\n\n```text\nmydash git checkpoint app src/server --message \"Add navigator foundation\"\nmydash git checkpoint library/ui/components/core/card --message \"Refine card contract\" --acknowledge-impact\nmydash git checkpoint library/dashboards/pipeline --message \"Update pipeline dashboard\" --no-push\n```\n"}, "tests/unit/git.test.mjs": {"content": "import assert from \"node:assert/strict\";\nimport test from \"node:test\";\nimport {\n  parsePorcelainV1Z,\n  summariseChanges,\n} from \"../../src/git/status.mjs\";\nimport {\n  scanWorkspaceLibrary,\n} from \"../../src/library/scan.mjs\";\nimport {\n  analyseCheckpointImpact,\n} from \"../../src/git/impact.mjs\";\nimport { dirname, resolve } from \"node:path\";\nimport { fileURLToPath } from \"node:url\";\n\nconst testDirectory = dirname(\n  fileURLToPath(import.meta.url),\n);\nconst fixtureRoot = resolve(\n  testDirectory,\n  \"../fixtures/export-workspace\",\n);\n\ntest(\"porcelain status parsing preserves rename and staging state\", () => {\n  const changes = parsePorcelainV1Z(\n    \"M  staged.txt\\0 M unstaged.txt\\0?? new.txt\\0R  renamed.txt\\0old.txt\\0\",\n  );\n\n  assert.deepEqual(changes, [\n    {\n      status: \"M \",\n      path: \"staged.txt\",\n      originalPath: null,\n      staged: true,\n      unstaged: false,\n      untracked: false,\n      conflicted: false,\n    },\n    {\n      status: \" M\",\n      path: \"unstaged.txt\",\n      originalPath: null,\n      staged: false,\n      unstaged: true,\n      untracked: false,\n      conflicted: false,\n    },\n    {\n      status: \"??\",\n      path: \"new.txt\",\n      originalPath: null,\n      staged: false,\n      unstaged: false,\n      untracked: true,\n      conflicted: false,\n    },\n    {\n      status: \"R \",\n      path: \"renamed.txt\",\n      originalPath: \"old.txt\",\n      staged: true,\n      unstaged: false,\n      untracked: false,\n      conflicted: false,\n    },\n  ]);\n\n  assert.deepEqual(\n    summariseChanges(changes),\n    {\n      total: 4,\n      staged: 2,\n      unstaged: 1,\n      untracked: 1,\n      conflicted: 0,\n    },\n  );\n});\n\ntest(\"checkpoint impact identifies consumed Core resources\", async () => {\n  const scan = await scanWorkspaceLibrary(\n    fixtureRoot,\n  );\n  const impact = analyseCheckpointImpact(\n    scan,\n    [\n      \"library/ui/primitives/core/button/primitive.js\",\n    ],\n  );\n\n  assert.equal(\n    impact.summary.sharedResourceCount,\n    1,\n  );\n  assert.equal(\n    impact.summary.requiresAcknowledgement,\n    true,\n  );\n  assert.deepEqual(\n    impact.affectedArtifacts.map(\n      (entry) => entry.id,\n    ),\n    [\"use-case-pipeline\"],\n  );\n});\n\ntest(\"local artefact resources do not require shared acknowledgement\", async () => {\n  const scan = await scanWorkspaceLibrary(\n    fixtureRoot,\n  );\n  const impact = analyseCheckpointImpact(\n    scan,\n    [\n      \"library/dashboards/use-case-pipeline/ui/components/metric-card/component.js\",\n    ],\n  );\n\n  assert.equal(\n    impact.summary.localResourceCount,\n    1,\n  );\n  assert.equal(\n    impact.summary.requiresAcknowledgement,\n    false,\n  );\n});\n"}, "tests/integration/git-cli.test.mjs": {"content": "import assert from \"node:assert/strict\";\nimport {\n  appendFile,\n  cp,\n  mkdir,\n  mkdtemp,\n  readFile,\n  rm,\n  writeFile,\n} from \"node:fs/promises\";\nimport {\n  dirname,\n  join,\n  resolve,\n} from \"node:path\";\nimport {\n  fileURLToPath,\n} from \"node:url\";\nimport {\n  spawnSync,\n} from \"node:child_process\";\nimport test from \"node:test\";\n\nconst testDirectory = dirname(\n  fileURLToPath(import.meta.url),\n);\nconst projectRoot = resolve(\n  testDirectory,\n  \"../..\",\n);\nconst fixtureRoot = resolve(\n  projectRoot,\n  \"tests\",\n  \"fixtures\",\n  \"export-workspace\",\n);\nconst cliPath = resolve(\n  projectRoot,\n  \"bin\",\n  \"mydash.mjs\",\n);\nconst tempParent = resolve(\n  projectRoot,\n  \".my-dashboards\",\n  \"temp\",\n  \"git-cli-tests\",\n);\n\ntest(\"git status returns structured repository state\", async () => {\n  const repository = await createRepository();\n\n  try {\n    const result = runCli([\n      \"git\",\n      \"status\",\n      \"--workspace\",\n      repository,\n      \"--json\",\n    ]);\n\n    assert.equal(result.status, 0, result.stderr);\n    const body = JSON.parse(result.stdout);\n    assert.equal(body.command, \"git status\");\n    assert.equal(body.data.branch, \"main\");\n    assert.equal(body.data.clean, true);\n  } finally {\n    await rm(repository, {\n      recursive: true,\n      force: true,\n    });\n  }\n});\n\ntest(\"checkpoint commits only selected paths and preserves unrelated staging\", async () => {\n  const repository = await createRepository();\n\n  try {\n    const selected =\n      \"library/dashboards/use-case-pipeline/src/main.js\";\n    await appendFile(\n      resolve(repository, selected),\n      \"\\n// focused checkpoint\\n\",\n    );\n    await appendFile(\n      resolve(repository, \"unrelated.txt\"),\n      \"\\nstaged but unrelated\\n\",\n    );\n    git(\n      repository,\n      [\"add\", \"unrelated.txt\"],\n    );\n\n    const result = runCli([\n      \"git\",\n      \"checkpoint\",\n      selected,\n      \"--message\",\n      \"Update dashboard behaviour\",\n      \"--no-push\",\n      \"--workspace\",\n      repository,\n      \"--json\",\n    ]);\n\n    assert.equal(result.status, 0, result.stderr);\n    const body = JSON.parse(result.stdout);\n    assert.equal(body.command, \"git checkpoint\");\n    assert.equal(body.data.commit.paths.includes(selected), true);\n    assert.equal(\n      body.data.commit.paths.includes(\"unrelated.txt\"),\n      false,\n    );\n\n    const staged = git(\n      repository,\n      [\"diff\", \"--cached\", \"--name-only\"],\n    ).stdout\n      .trim()\n      .split(/\\r?\\n/)\n      .filter(Boolean);\n\n    assert.deepEqual(staged, [\"unrelated.txt\"]);\n  } finally {\n    await rm(repository, {\n      recursive: true,\n      force: true,\n    });\n  }\n});\n\ntest(\"checkpoint blocks consumed shared changes until impact is acknowledged\", async () => {\n  const repository = await createRepository();\n\n  try {\n    const selected =\n      \"library/ui/primitives/core/button/primitive.js\";\n    await appendFile(\n      resolve(repository, selected),\n      \"\\n// shared change\\n\",\n    );\n    const before = git(\n      repository,\n      [\"rev-parse\", \"HEAD\"],\n    ).stdout.trim();\n\n    const blocked = runCli([\n      \"git\",\n      \"checkpoint\",\n      selected,\n      \"--message\",\n      \"Update shared button\",\n      \"--no-push\",\n      \"--workspace\",\n      repository,\n      \"--json\",\n    ]);\n\n    assert.equal(blocked.status, 5);\n    assert.equal(\n      git(\n        repository,\n        [\"rev-parse\", \"HEAD\"],\n      ).stdout.trim(),\n      before,\n    );\n\n    const accepted = runCli([\n      \"git\",\n      \"checkpoint\",\n      selected,\n      \"--message\",\n      \"Update shared button\",\n      \"--acknowledge-impact\",\n      \"--no-push\",\n      \"--workspace\",\n      repository,\n      \"--json\",\n    ]);\n\n    assert.equal(\n      accepted.status,\n      0,\n      accepted.stderr,\n    );\n  } finally {\n    await rm(repository, {\n      recursive: true,\n      force: true,\n    });\n  }\n});\n\ntest(\"checkpoint refuses invalid repository content before staging\", async () => {\n  const repository = await createRepository();\n\n  try {\n    const selected =\n      \"library/dashboards/use-case-pipeline/artifact.json\";\n    await writeFile(\n      resolve(repository, selected),\n      \"{ invalid json\\n\",\n    );\n    const before = git(\n      repository,\n      [\"rev-parse\", \"HEAD\"],\n    ).stdout.trim();\n\n    const result = runCli([\n      \"git\",\n      \"checkpoint\",\n      selected,\n      \"--message\",\n      \"Break dashboard manifest\",\n      \"--no-push\",\n      \"--workspace\",\n      repository,\n      \"--json\",\n    ]);\n\n    assert.equal(result.status, 3);\n    assert.equal(\n      git(\n        repository,\n        [\"rev-parse\", \"HEAD\"],\n      ).stdout.trim(),\n      before,\n    );\n    assert.equal(\n      git(\n        repository,\n        [\"diff\", \"--cached\", \"--name-only\"],\n      ).stdout.trim(),\n      \"\",\n    );\n  } finally {\n    await rm(repository, {\n      recursive: true,\n      force: true,\n    });\n  }\n});\n\nasync function createRepository() {\n  await mkdir(tempParent, {\n    recursive: true,\n  });\n  const repository = await mkdtemp(\n    join(tempParent, \"repo-\"),\n  );\n\n  await cp(fixtureRoot, repository, {\n    recursive: true,\n    filter(path) {\n      return !path.includes(\n        \".tmp-\",\n      );\n    },\n  });\n  await writeFile(\n    resolve(repository, \"unrelated.txt\"),\n    \"baseline\\n\",\n  );\n\n  git(repository, [\"init\", \"-b\", \"main\"]);\n  git(repository, [\n    \"config\",\n    \"user.name\",\n    \"My Dashboards Test\",\n  ]);\n  git(repository, [\n    \"config\",\n    \"user.email\",\n    \"mydash@example.test\",\n  ]);\n  git(repository, [\"add\", \".\"]);\n  git(repository, [\n    \"commit\",\n    \"-m\",\n    \"Initial fixture\",\n  ]);\n\n  return repository;\n}\n\nfunction runCli(args) {\n  return spawnSync(\n    process.execPath,\n    [cliPath, ...args],\n    {\n      cwd: projectRoot,\n      encoding: \"utf8\",\n      stdio: \"pipe\",\n      shell: false,\n      maxBuffer:\n        64 * 1024 * 1024,\n    },\n  );\n}\n\nfunction git(cwd, args) {\n  const result = spawnSync(\n    \"git\",\n    args,\n    {\n      cwd,\n      encoding: \"utf8\",\n      stdio: \"pipe\",\n      shell: false,\n    },\n  );\n\n  assert.equal(\n    result.status,\n    0,\n    result.stderr || result.stdout,\n  );\n\n  return result;\n}\n"}, "scripts/tasks/test-git.mjs": {"content": "#!/usr/bin/env node\n\nimport {\n  spawnSync,\n} from \"node:child_process\";\nimport {\n  dirname,\n  resolve,\n} from \"node:path\";\nimport {\n  fileURLToPath,\n} from \"node:url\";\nimport process from \"node:process\";\n\nconst scriptDirectory = dirname(\n  fileURLToPath(import.meta.url),\n);\nconst projectRoot = resolve(\n  scriptDirectory,\n  \"../..\",\n);\n\nconst tests = [\n  resolve(\n    projectRoot,\n    \"tests\",\n    \"unit\",\n    \"git.test.mjs\",\n  ),\n  resolve(\n    projectRoot,\n    \"tests\",\n    \"integration\",\n    \"git-cli.test.mjs\",\n  ),\n];\n\nconst result = spawnSync(\n  process.execPath,\n  [\"--test\", ...tests],\n  {\n    cwd: projectRoot,\n    stdio: \"inherit\",\n    shell: false,\n    maxBuffer:\n      64 * 1024 * 1024,\n  },\n);\n\nif (result.error) throw result.error;\nprocess.exitCode = result.status ?? 1;\n"}};

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
      "Bootstrap 12 must run from the root of the My Dashboards Git repository.",
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
    relativePath: "src/git/.gitkeep",
    expectedContent:
      "# Intentionally retained\n\n" +
      "Constrained commit and push services will live here.\n\n" +
      "Implementation is added by a later bootstrap step.\n",
    dirtyBefore,
    repoRoot,
  });

  if (removed) {
    ownedAbsolutePaths.push(
      join(targetRoot, "src", "git", ".gitkeep"),
    );
  }

  await validateGeneratedState();

  const expectedSelfPath = join(
    targetRoot,
    "scripts",
    "12-build-git-operations.mjs",
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
        "Git operations were created and tested, but --no-commit disabled the bootstrap checkpoint.",
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
My Dashboards — Bootstrap 12

Usage:
  node scripts/12-build-git-operations.mjs [options]

Options:
  --target <path>  Build Git operations in a specific repository root.
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
    "src/git",
    "src/validation/workspace-validation.mjs",
    "src/validation/impact-analysis.mjs",
    "src/library/scan.mjs",
    "scripts/tasks/test-validation.mjs",
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
        "Bootstrap 11 has not been completed.",
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
        "package.json had pre-existing changes, so the Git test command was not added automatically.",
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
  value.scripts["test:git"] =
    value.scripts["test:git"] ??
    "node scripts/tasks/test-git.mjs";

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
        "The constrained Git layer was calculated without writing it.",
    });
    return;
  }

  const modulePaths = [
    "cli/registry.mjs",
    "cli/commands/git.mjs",
    "src/git/errors.mjs",
    "src/git/run.mjs",
    "src/git/status.mjs",
    "src/git/paths.mjs",
    "src/git/impact.mjs",
    "src/git/checkpoint.mjs",
    "tests/unit/git.test.mjs",
    "tests/integration/git-cli.test.mjs",
    "scripts/tasks/test-git.mjs",
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
      `${modulePaths.length} Git and CLI modules passed Node syntax checks.`,
  });

  const tests = run(
    process.execPath,
    [join(targetRoot, "scripts", "tasks", "test-git.mjs")],
    { cwd: targetRoot, allowFailure: true },
  );

  if (tests.status !== 0) {
    throw new Error(
      `Constrained Git tests failed:\n${tests.stderr || tests.stdout}`,
    );
  }

  report.validation.push({
    check: "git-tests",
    ok: true,
    message:
      "Status parsing, focused commits, staging preservation, validation and impact guards passed.",
  });

  const realStatus = run(
    process.execPath,
    [
      join(targetRoot, "bin", "mydash.mjs"),
      "git",
      "status",
      "--json",
    ],
    { cwd: targetRoot, allowFailure: true },
  );

  if (realStatus.status !== 0) {
    throw new Error(
      `The real workspace Git status failed:\n${
        realStatus.stderr || realStatus.stdout
      }`,
    );
  }

  report.validation.push({
    check: "workspace-git-status",
    ok: true,
    message:
      "The current repository can be inspected through mydash git status.",
  });

  for (const task of [
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
      "Validation, export, resolution, library, data, Office, filesystem, CLI and contract tests still pass.",
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
        "Constrained Git operations were already present; there were no task-owned changes to commit.",
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
        "Git operations were created and tested, but no commit was made because Git user.name or user.email is missing.",
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
    maxBuffer: 64 * 1024 * 1024,
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

  console.log("\nMy Dashboards — constrained Git operations\n");
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
