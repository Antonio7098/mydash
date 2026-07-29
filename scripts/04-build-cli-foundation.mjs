#!/usr/bin/env node

/**
 * My Dashboards — Bootstrap 04: Build CLI foundation
 *
 * Creates the dependency-free `mydash` command framework and the first
 * agent-facing commands:
 *
 *   mydash help
 *   mydash version
 *   mydash doctor
 *
 * It also adds workspace discovery, structured JSON output, stable exit codes,
 * command-level help and focused tests.
 *
 * Safe defaults:
 * - rerunnable;
 * - does not overwrite unknown existing files;
 * - updates only task-owned files and known package fields;
 * - validates and smoke-tests the CLI before committing;
 * - commits only task-owned paths;
 * - never force-pushes.
 *
 * Usage:
 *   node scripts/04-build-cli-foundation.mjs
 *   node scripts/04-build-cli-foundation.mjs --dry-run
 *   node scripts/04-build-cli-foundation.mjs --no-commit
 *   node scripts/04-build-cli-foundation.mjs --no-push
 *   node scripts/04-build-cli-foundation.mjs --json
 *   node scripts/04-build-cli-foundation.mjs --target /path/to/my-dashboards
 */

import {
  access,
  chmod,
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

const SCRIPT_NAME = "04-build-cli-foundation";
const COMMIT_MESSAGE = "Add mydash CLI foundation";
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
      "Bootstrap 04 must run from the root of the My Dashboards Git repository.",
    );
  }

  const dirtyBefore = getDirtyPaths(repoRoot);
  const ownedAbsolutePaths = [];
  const files = buildFiles();

  for (const [relativePath, descriptor] of Object.entries(files)) {
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

  if (!args.dryRun) {
    await chmod(join(targetRoot, "bin", "mydash.mjs"), 0o755).catch((error) => {
      report.warnings.push({
        code: "EXECUTABLE_BIT_NOT_SET",
        message:
          "The CLI was created, but its executable bit could not be set. " +
          `It can still be run with Node. ${error.message}`,
      });
    });
  }

  await validateGeneratedState();

  const expectedSelfPath = join(
    targetRoot,
    "scripts",
    "04-build-cli-foundation.mjs",
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
        "The CLI was created and validated, but --no-commit disabled the Git checkpoint.",
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
My Dashboards — Bootstrap 04

Usage:
  node scripts/04-build-cli-foundation.mjs [options]

Options:
  --target <path>  Build the CLI in a specific repository root.
  --dry-run        Report intended changes without writing, committing, or pushing.
  --no-commit      Write and validate files without committing or pushing.
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
    "config/workspace.json",
    "config/schemas/workspace.schema.json",
    "src/validation/contracts.mjs",
    "scripts/tasks/validate.mjs",
    "bin",
    "cli",
    "cli/commands",
    "src/workspace",
    "tests/unit",
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
        "Bootstrap 03 has not been completed.",
        `Missing required paths: ${missing.join(", ")}`,
      ].join("\n"),
    );
  }
}

function buildFiles() {
  return {
    "bin/mydash.mjs": {
      content: `#!/usr/bin/env node

import { runCli } from "../cli/index.mjs";

const exitCode = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: process.stdout,
  stderr: process.stderr,
  env: process.env,
});

process.exitCode = exitCode;
`,
    },

    "cli/index.mjs": {
      content: `import { createCommandContext } from "./runtime.mjs";
import { commandRegistry } from "./registry.mjs";
import {
  EXIT_OPERATION_FAILED,
  EXIT_SUCCESS,
  EXIT_USAGE,
  CliError,
  normaliseError,
} from "./errors.mjs";
import { parseInvocation } from "./parser.mjs";
import { writeError, writeResult } from "./output.mjs";

export async function runCli(argv, runtime = {}) {
  const context = createCommandContext(runtime);

  try {
    const invocation = parseInvocation(argv);

    if (invocation.versionRequested) {
      invocation.commandName = "version";
    }

    if (invocation.helpRequested && !invocation.commandName) {
      invocation.commandName = "help";
    }

    if (!invocation.commandName) {
      invocation.commandName = "help";
    }

    const command = commandRegistry.get(invocation.commandName);

    if (!command) {
      throw new CliError(
        "UNKNOWN_COMMAND",
        \`Unknown command: \${invocation.commandName}\`,
        {
          exitCode: EXIT_USAGE,
          details: {
            availableCommands: commandRegistry.names(),
          },
          hint: "Run \`mydash help\` to list available commands.",
        },
      );
    }

    if (invocation.helpRequested && invocation.commandName !== "help") {
      const helpCommand = commandRegistry.get("help");
      const result = await helpCommand.run(
        {
          args: [invocation.commandName],
          options: invocation.options,
        },
        context,
      );

      writeResult(result, {
        json: invocation.json,
        stdout: context.stdout,
      });

      return EXIT_SUCCESS;
    }

    const result = await command.run(
      {
        args: invocation.args,
        options: invocation.options,
        json: invocation.json,
      },
      context,
    );

    writeResult(result, {
      json: invocation.json,
      stdout: context.stdout,
    });

    return result?.exitCode ?? EXIT_SUCCESS;
  } catch (error) {
    const normalised = normaliseError(error);

    writeError(normalised, {
      json: Boolean(safelyReadJsonFlag(argv)),
      stderr: context.stderr,
    });

    return normalised.exitCode ?? EXIT_OPERATION_FAILED;
  }
}

function safelyReadJsonFlag(argv) {
  return argv.includes("--json");
}
`,
    },

    "cli/runtime.mjs": {
      content: `import process from "node:process";

export function createCommandContext(runtime = {}) {
  return {
    cwd: runtime.cwd ?? process.cwd(),
    stdout: runtime.stdout ?? process.stdout,
    stderr: runtime.stderr ?? process.stderr,
    env: runtime.env ?? process.env,
    now: runtime.now ?? (() => new Date()),
  };
}
`,
    },

    "cli/errors.mjs": {
      content: `export const EXIT_SUCCESS = 0;
export const EXIT_OPERATION_FAILED = 1;
export const EXIT_USAGE = 2;
export const EXIT_VALIDATION = 3;
export const EXIT_DEPENDENCY_MISSING = 4;
export const EXIT_UNSAFE_OPERATION = 5;

export class CliError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "CliError";
    this.code = code;
    this.exitCode = options.exitCode ?? EXIT_OPERATION_FAILED;
    this.details = options.details ?? null;
    this.hint = options.hint ?? null;
  }
}

export function normaliseError(error) {
  if (error instanceof CliError) {
    return error;
  }

  return new CliError(
    "UNEXPECTED_ERROR",
    error instanceof Error ? error.message : String(error),
    {
      exitCode: EXIT_OPERATION_FAILED,
      cause: error instanceof Error ? error : undefined,
    },
  );
}
`,
    },

    "cli/parser.mjs": {
      content: `import { CliError, EXIT_USAGE } from "./errors.mjs";

const GLOBAL_OPTIONS_WITH_VALUES = new Set(["--workspace"]);
const GLOBAL_BOOLEAN_OPTIONS = new Set(["--json", "--help", "-h", "--version", "-v"]);

export function parseInvocation(argv) {
  const invocation = {
    commandName: null,
    args: [],
    options: {},
    json: false,
    helpRequested: false,
    versionRequested: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (GLOBAL_BOOLEAN_OPTIONS.has(value)) {
      if (value === "--json") invocation.json = true;
      if (value === "--help" || value === "-h") {
        invocation.helpRequested = true;
      }
      if (value === "--version" || value === "-v") {
        invocation.versionRequested = true;
      }
      continue;
    }

    if (GLOBAL_OPTIONS_WITH_VALUES.has(value)) {
      const next = argv[index + 1];

      if (!next || next.startsWith("-")) {
        throw new CliError(
          "MISSING_OPTION_VALUE",
          \`\${value} requires a value.\`,
          {
            exitCode: EXIT_USAGE,
          },
        );
      }

      invocation.options[normaliseOptionName(value)] = next;
      index += 1;
      continue;
    }

    if (!invocation.commandName && !value.startsWith("-")) {
      invocation.commandName = value;
      continue;
    }

    invocation.args.push(value);
  }

  return invocation;
}

function normaliseOptionName(value) {
  return value
    .replace(/^--/, "")
    .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}
`,
    },

    "cli/output.mjs": {
      content: `export function writeResult(result, options) {
  if (options.json) {
    options.stdout.write(
      \`\${JSON.stringify(
        {
          ok: result?.ok ?? true,
          command: result?.command ?? null,
          data: result?.data ?? null,
          warnings: result?.warnings ?? [],
        },
        null,
        2,
      )}\\n\`,
    );
    return;
  }

  const text = result?.text ?? "";

  if (text) {
    options.stdout.write(text.endsWith("\\n") ? text : \`\${text}\\n\`);
  }

  for (const warning of result?.warnings ?? []) {
    options.stdout.write(\`! \${warning.message ?? warning}\\n\`);
  }
}

export function writeError(error, options) {
  if (options.json) {
    options.stderr.write(
      \`\${JSON.stringify(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
          },
        },
        null,
        2,
      )}\\n\`,
    );
    return;
  }

  options.stderr.write(\`Error [\${error.code}]: \${error.message}\\n\`);

  if (error.hint) {
    options.stderr.write(\`Hint: \${error.hint}\\n\`);
  }
}
`,
    },

    "cli/registry.mjs": {
      content: `import { helpCommand } from "./commands/help.mjs";
import { versionCommand } from "./commands/version.mjs";
import { doctorCommand } from "./commands/doctor.mjs";

const commands = [helpCommand, versionCommand, doctorCommand];
const commandMap = new Map(commands.map((command) => [command.name, command]));

export const commandRegistry = {
  get(name) {
    return commandMap.get(name) ?? null;
  },

  list() {
    return [...commands];
  },

  names() {
    return commands.map((command) => command.name);
  },
};
`,
    },

    "cli/commands/help.mjs": {
      content: `import { commandRegistry } from "../registry.mjs";
import { CliError, EXIT_USAGE } from "../errors.mjs";

export const helpCommand = {
  name: "help",
  summary: "Show CLI usage and command help.",
  usage: "mydash help [command]",
  options: [
    "--json       Return structured JSON.",
    "--workspace  Resolve a specific workspace root.",
  ],

  async run(invocation) {
    const requested = invocation.args[0] ?? null;

    if (requested) {
      const command = commandRegistry.get(requested);

      if (!command) {
        throw new CliError(
          "UNKNOWN_COMMAND",
          \`Unknown command: \${requested}\`,
          {
            exitCode: EXIT_USAGE,
            details: {
              availableCommands: commandRegistry.names(),
            },
          },
        );
      }

      return {
        ok: true,
        command: "help",
        data: commandHelpData(command),
        text: renderCommandHelp(command),
      };
    }

    const commands = commandRegistry.list();

    return {
      ok: true,
      command: "help",
      data: {
        name: "mydash",
        description:
          "Deterministic utilities for My Dashboards agents and technical users.",
        usage: "mydash <command> [options]",
        commands: commands.map((command) => ({
          name: command.name,
          summary: command.summary,
        })),
        globalOptions: [
          "--json",
          "--help, -h",
          "--version, -v",
          "--workspace <path>",
        ],
      },
      text: renderGeneralHelp(commands),
    };
  },
};

function commandHelpData(command) {
  return {
    name: command.name,
    summary: command.summary,
    usage: command.usage,
    options: command.options ?? [],
  };
}

function renderGeneralHelp(commands) {
  const commandLines = commands
    .map(
      (command) =>
        \`  \${command.name.padEnd(10)} \${command.summary}\`,
    )
    .join("\\n");

  return \`My Dashboards CLI

Deterministic utilities for My Dashboards agents and technical users.

Usage:
  mydash <command> [options]

Commands:
\${commandLines}

Global options:
  --json               Return structured JSON.
  --workspace <path>   Resolve a specific workspace root.
  --help, -h           Show help.
  --version, -v        Show the CLI version.

Examples:
  mydash doctor
  mydash doctor --json
  mydash help doctor
\`;
}

function renderCommandHelp(command) {
  const options =
    command.options?.length > 0
      ? \`\\nOptions:\\n\${command.options.map((value) => \`  \${value}\`).join("\\n")}\\n\`
      : "";

  return \`\${command.name}

\${command.summary}

Usage:
  \${command.usage}
\${options}\`;
}
`,
    },

    "cli/commands/version.mjs": {
      content: `import { loadPackageMetadata } from "../../src/workspace/package-metadata.mjs";

export const versionCommand = {
  name: "version",
  summary: "Show the installed My Dashboards CLI version.",
  usage: "mydash version",
  options: ["--json       Return structured JSON."],

  async run(_invocation, context) {
    const metadata = await loadPackageMetadata(context.cwd);

    return {
      ok: true,
      command: "version",
      data: {
        name: metadata.name,
        version: metadata.version,
        node: process.versions.node,
      },
      text: \`\${metadata.name} \${metadata.version}\`,
    };
  },
};
`,
    },

    "cli/commands/doctor.mjs": {
      content: `import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { findWorkspaceRoot } from "../../src/workspace/find-root.mjs";
import { loadWorkspaceConfig } from "../../src/workspace/load-config.mjs";

export const doctorCommand = {
  name: "doctor",
  summary: "Inspect the workstation and report available capabilities.",
  usage: "mydash doctor [--workspace <path>] [--json]",
  options: [
    "--workspace <path>  Inspect a specific workspace.",
    "--json              Return structured JSON.",
  ],

  async run(invocation, context) {
    const checks = [];
    const warnings = [];
    const requestedRoot = invocation.options.workspace ?? context.cwd;

    checks.push(checkNode());
    checks.push(checkCommand("npm", ["--version"], "npm", true));
    checks.push(checkCommand("git", ["--version"], "Git", true));
    checks.push(checkCommand("python3", ["--version"], "Python", false));
    checks.push(checkLibreOffice());

    const workspace = await inspectWorkspace(requestedRoot);
    checks.push(...workspace.checks);
    warnings.push(...workspace.warnings);

    const blocking = checks.filter(
      (check) => check.required && check.status === "fail",
    );

    const data = {
      healthy: blocking.length === 0,
      workspaceRoot: workspace.root,
      checks,
      capabilities: deriveCapabilities(checks),
    };

    return {
      ok: blocking.length === 0,
      command: "doctor",
      data,
      warnings,
      exitCode: blocking.length === 0 ? 0 : 1,
      text: renderDoctor(data),
    };
  },
};

function checkNode() {
  const major = Number.parseInt(process.versions.node.split(".")[0], 10);
  const ok = Number.isInteger(major) && major >= 20;

  return {
    id: "node",
    label: "Node.js",
    required: true,
    status: ok ? "pass" : "fail",
    value: process.versions.node,
    message: ok
      ? "Node.js is available."
      : "Node.js 20 or later is required.",
  };
}

function checkCommand(command, args, label, required) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "pipe",
    shell: false,
  });

  if (result.error || result.status !== 0) {
    return {
      id: command,
      label,
      required,
      status: required ? "fail" : "unavailable",
      value: null,
      message: required
        ? \`\${label} is required but was not found.\`
        : \`\${label} is not currently available.\`,
    };
  }

  return {
    id: command,
    label,
    required,
    status: "pass",
    value: (result.stdout || result.stderr).trim(),
    message: \`\${label} is available.\`,
  };
}

function checkLibreOffice() {
  for (const command of ["libreoffice", "soffice"]) {
    const result = spawnSync(command, ["--version"], {
      encoding: "utf8",
      stdio: "pipe",
      shell: false,
    });

    if (!result.error && result.status === 0) {
      return {
        id: "libreoffice",
        label: "LibreOffice",
        required: false,
        status: "pass",
        value: (result.stdout || result.stderr).trim(),
        message:
          "Optional Office rendering and recalculation capabilities are available.",
      };
    }
  }

  return {
    id: "libreoffice",
    label: "LibreOffice",
    required: false,
    status: "unavailable",
    value: null,
    message:
      "Optional Office rendering and recalculation capabilities are unavailable.",
  };
}

async function inspectWorkspace(startPath) {
  const checks = [];
  const warnings = [];
  const root = await findWorkspaceRoot(startPath);

  if (!root) {
    checks.push({
      id: "workspace",
      label: "Workspace",
      required: true,
      status: "fail",
      value: null,
      message:
        "No My Dashboards workspace was found from the requested path.",
    });

    return { root: null, checks, warnings };
  }

  checks.push({
    id: "workspace",
    label: "Workspace",
    required: true,
    status: "pass",
    value: root,
    message: "My Dashboards workspace was found.",
  });

  try {
    await access(root, fsConstants.W_OK);
    checks.push({
      id: "workspace-write",
      label: "Workspace write access",
      required: true,
      status: "pass",
      value: root,
      message: "The workspace is writable.",
    });
  } catch {
    checks.push({
      id: "workspace-write",
      label: "Workspace write access",
      required: true,
      status: "fail",
      value: root,
      message: "The workspace is not writable.",
    });
  }

  try {
    const config = await loadWorkspaceConfig(root);
    checks.push({
      id: "workspace-config",
      label: "Workspace configuration",
      required: true,
      status: "pass",
      value: join(root, "config", "workspace.json"),
      message: \`Workspace configuration loaded: \${config.name}.\`,
    });
  } catch (error) {
    checks.push({
      id: "workspace-config",
      label: "Workspace configuration",
      required: true,
      status: "fail",
      value: join(root, "config", "workspace.json"),
      message:
        error instanceof Error ? error.message : String(error),
    });
  }

  const gitRoot = commandOutput(
    "git",
    ["rev-parse", "--show-toplevel"],
    root,
  );

  if (gitRoot.ok) {
    checks.push({
      id: "git-repository",
      label: "Git repository",
      required: true,
      status: "pass",
      value: gitRoot.output,
      message: "The workspace is inside a Git repository.",
    });
  } else {
    checks.push({
      id: "git-repository",
      label: "Git repository",
      required: true,
      status: "fail",
      value: null,
      message: "The workspace is not inside a Git repository.",
    });
  }

  const gitName = commandOutput("git", ["config", "user.name"], root);
  const gitEmail = commandOutput("git", ["config", "user.email"], root);
  const identityOk =
    gitName.ok &&
    Boolean(gitName.output) &&
    gitEmail.ok &&
    Boolean(gitEmail.output);

  checks.push({
    id: "git-identity",
    label: "Git identity",
    required: true,
    status: identityOk ? "pass" : "fail",
    value: identityOk ? \`\${gitName.output} <\${gitEmail.output}>\` : null,
    message: identityOk
      ? "Git user.name and user.email are configured."
      : "Git user.name or user.email is missing.",
  });

  const remotes = commandOutput("git", ["remote"], root);
  const remoteList = remotes.ok
    ? remotes.output.split("\\n").map((value) => value.trim()).filter(Boolean)
    : [];

  checks.push({
    id: "git-remote",
    label: "Git remote",
    required: false,
    status: remoteList.length > 0 ? "pass" : "unavailable",
    value: remoteList,
    message:
      remoteList.length > 0
        ? \`Configured remotes: \${remoteList.join(", ")}.\`
        : "No Git remote is configured; changes can only be committed locally.",
  });

  const status = commandOutput(
    "git",
    ["status", "--porcelain=v1"],
    root,
  );

  if (status.ok && status.output) {
    warnings.push({
      code: "WORKTREE_DIRTY",
      message:
        "The Git working tree contains uncommitted changes. Agents must preserve and isolate them.",
    });
  }

  return { root, checks, warnings };
}

function commandOutput(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
    shell: false,
  });

  return {
    ok: !result.error && result.status === 0,
    output: (result.stdout || result.stderr || "").trim(),
  };
}

function deriveCapabilities(checks) {
  const available = new Set(
    checks
      .filter((check) => check.status === "pass")
      .map((check) => check.id),
  );

  return {
    workspaceOperations:
      available.has("workspace") &&
      available.has("workspace-write") &&
      available.has("workspace-config"),
    gitCheckpoints:
      available.has("git") &&
      available.has("git-repository") &&
      available.has("git-identity"),
    officeInspection: available.has("node"),
    officeRendering: available.has("libreoffice"),
    pythonFallback: available.has("python3"),
  };
}

function renderDoctor(data) {
  const lines = ["My Dashboards environment", ""];

  for (const check of data.checks) {
    const symbol =
      check.status === "pass"
        ? "✓"
        : check.status === "unavailable"
          ? "!"
          : "✗";

    lines.push(\`\${symbol} \${check.label}: \${check.message}\`);
  }

  lines.push("");
  lines.push(
    data.healthy
      ? "Required capabilities are available."
      : "One or more required capabilities are unavailable.",
  );

  return lines.join("\\n");
}
`,
    },

    "src/workspace/find-root.mjs": {
      content: `import { stat } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";

export async function findWorkspaceRoot(startPath) {
  let current = resolve(startPath);
  const currentStat = await safeStat(current);

  if (currentStat?.isFile()) {
    current = dirname(current);
  }

  const filesystemRoot = parse(current).root;

  while (true) {
    if (await isWorkspaceRoot(current)) {
      return current;
    }

    if (current === filesystemRoot) {
      return null;
    }

    current = dirname(current);
  }
}

async function isWorkspaceRoot(path) {
  const packagePath = join(path, "package.json");
  const workspacePath = join(path, "config", "workspace.json");

  return Boolean(
    (await safeStat(packagePath))?.isFile() &&
      (await safeStat(workspacePath))?.isFile(),
  );
}

async function safeStat(path) {
  try {
    return await stat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}
`,
    },

    "src/workspace/load-config.mjs": {
      content: `import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateDocument } from "../validation/contracts.mjs";

export async function loadWorkspaceConfig(workspaceRoot) {
  const path = join(workspaceRoot, "config", "workspace.json");
  const source = await readFile(path, "utf8");

  let config;

  try {
    config = JSON.parse(source);
  } catch (error) {
    throw new Error(
      \`Workspace configuration is not valid JSON: \${error.message}\`,
    );
  }

  const validation = validateDocument("workspace", config);

  if (!validation.ok) {
    const details = validation.errors
      .map((error) => \`\${error.path}: \${error.message}\`)
      .join("; ");

    throw new Error(\`Workspace configuration is invalid: \${details}\`);
  }

  return config;
}
`,
    },

    "src/workspace/package-metadata.mjs": {
      content: `import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { findWorkspaceRoot } from "./find-root.mjs";

export async function loadPackageMetadata(startPath) {
  const workspaceRoot = await findWorkspaceRoot(startPath);

  if (!workspaceRoot) {
    return {
      name: "mydash",
      version: "unknown",
    };
  }

  const source = await readFile(
    join(workspaceRoot, "package.json"),
    "utf8",
  );

  const metadata = JSON.parse(source);

  return {
    name: metadata.name ?? "mydash",
    version: metadata.version ?? "unknown",
  };
}
`,
    },

    "scripts/tasks/test-cli.mjs": {
      content: `#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "../..");
const testFile = resolve(projectRoot, "tests", "unit", "cli.test.mjs");

const result = spawnSync(
  process.execPath,
  ["--test", testFile],
  {
    cwd: projectRoot,
    stdio: "inherit",
    shell: false,
  },
);

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
`,
    },

    "tests/unit/cli.test.mjs": {
      content: `import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testDirectory, "../..");
const cliPath = resolve(projectRoot, "bin", "mydash.mjs");

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: "pipe",
    shell: false,
  });
}

test("help lists the foundation commands", () => {
  const result = runCli(["help"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /doctor/);
  assert.match(result.stdout, /version/);
  assert.equal(result.stderr, "");
});

test("--version returns package metadata", () => {
  const result = runCli(["--version"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /0\\.1\\.0/);
});

test("help supports structured JSON", () => {
  const result = runCli(["help", "--json"]);

  assert.equal(result.status, 0);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.command, "help");
  assert.ok(
    body.data.commands.some((command) => command.name === "doctor"),
  );
});

test("unknown commands use the stable usage exit code", () => {
  const result = runCli(["does-not-exist", "--json"]);

  assert.equal(result.status, 2);
  const body = JSON.parse(result.stderr);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "UNKNOWN_COMMAND");
});

test("doctor recognises the repository workspace", () => {
  const result = runCli(["doctor", "--json"]);

  assert.equal(result.status, 0);
  const body = JSON.parse(result.stdout);
  assert.equal(body.command, "doctor");
  assert.equal(body.data.healthy, true);
  assert.equal(body.data.workspaceRoot, projectRoot);
});
`,
    },
  };
}

async function updatePackageJson(dirtyBefore, repoRoot) {
  const packagePath = join(targetRoot, "package.json");
  const gitPath = relativeGitPath(repoRoot, packagePath);

  if (dirtyBefore.has(gitPath)) {
    report.preserved.push(gitPath);
    report.warnings.push({
      code: "PREEXISTING_PACKAGE_CHANGES",
      message:
        "package.json had pre-existing changes, so CLI metadata was not added automatically.",
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

  value.bin ??= {};
  value.bin.mydash = value.bin.mydash ?? "bin/mydash.mjs";

  value.scripts ??= {};
  value.scripts.mydash =
    value.scripts.mydash ?? "node bin/mydash.mjs";
  value.scripts.doctor =
    value.scripts.doctor ?? "node bin/mydash.mjs doctor";
  value.scripts["test:cli"] =
    value.scripts["test:cli"] ?? "node scripts/tasks/test-cli.mjs";

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
      message: "The complete CLI foundation was calculated without writing it.",
    });
    return;
  }

  const modulePaths = [
    "bin/mydash.mjs",
    "cli/index.mjs",
    "cli/runtime.mjs",
    "cli/errors.mjs",
    "cli/parser.mjs",
    "cli/output.mjs",
    "cli/registry.mjs",
    "cli/commands/help.mjs",
    "cli/commands/version.mjs",
    "cli/commands/doctor.mjs",
    "src/workspace/find-root.mjs",
    "src/workspace/load-config.mjs",
    "src/workspace/package-metadata.mjs",
    "scripts/tasks/test-cli.mjs",
    "tests/unit/cli.test.mjs",
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
    message: `${modulePaths.length} CLI modules passed Node syntax checks.`,
  });

  const helpResult = run(
    process.execPath,
    [join(targetRoot, "bin", "mydash.mjs"), "help"],
    { cwd: targetRoot, allowFailure: true },
  );

  if (helpResult.status !== 0 || !helpResult.stdout.includes("doctor")) {
    throw new Error(
      `CLI help smoke test failed:\n${helpResult.stderr || helpResult.stdout}`,
    );
  }

  report.validation.push({
    check: "help-command",
    ok: true,
    message: "The CLI command registry and help renderer are operational.",
  });

  const doctorResult = run(
    process.execPath,
    [join(targetRoot, "bin", "mydash.mjs"), "doctor", "--json"],
    { cwd: targetRoot, allowFailure: true },
  );

  if (doctorResult.status !== 0) {
    throw new Error(
      `CLI doctor smoke test failed:\n${
        doctorResult.stderr || doctorResult.stdout
      }`,
    );
  }

  const doctorBody = JSON.parse(doctorResult.stdout);

  if (
    doctorBody.ok !== true ||
    doctorBody.command !== "doctor" ||
    doctorBody.data.workspaceRoot !== targetRoot
  ) {
    throw new Error("CLI doctor returned an unexpected structured result.");
  }

  report.validation.push({
    check: "doctor-command",
    ok: true,
    message: "The doctor command discovered and validated the workspace.",
  });

  const testResult = run(
    process.execPath,
    [join(targetRoot, "scripts", "tasks", "test-cli.mjs")],
    { cwd: targetRoot, allowFailure: true },
  );

  if (testResult.status !== 0) {
    throw new Error(
      `CLI tests failed:\n${testResult.stderr || testResult.stdout}`,
    );
  }

  report.validation.push({
    check: "cli-tests",
    ok: true,
    message: "The CLI foundation test suite passed.",
  });

  const contractsResult = run(
    process.execPath,
    [join(targetRoot, "scripts", "tasks", "validate.mjs")],
    { cwd: targetRoot, allowFailure: true },
  );

  if (contractsResult.status !== 0) {
    throw new Error(
      `Existing workspace validation failed after CLI integration:\n${
        contractsResult.stderr || contractsResult.stdout
      }`,
    );
  }

  report.validation.push({
    check: "workspace-regression",
    ok: true,
    message: "Existing contract validation still passes.",
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
        "The CLI foundation was already present; there were no task-owned changes to commit.",
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
        "The CLI was created and validated, but no commit was made because Git user.name or user.email is missing.",
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
  const relativePath = relative(root, path);

  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !resolve(path).startsWith(`${resolve(root)}..`))
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

  console.log("\nMy Dashboards — CLI foundation\n");
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
