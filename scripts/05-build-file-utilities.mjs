#!/usr/bin/env node

/**
 * My Dashboards — Bootstrap 05: Build safe filesystem utilities
 *
 * Adds deterministic, agent-facing filesystem commands:
 *
 *   mydash inspect <path>
 *   mydash file identify <path>
 *   mydash file hash <path>
 *   mydash file tree <directory>
 *   mydash file find <pattern>
 *   mydash file safe-name <text>
 *
 * It also establishes:
 * - workspace-bound path resolution;
 * - explicit read-only access outside the workspace;
 * - symlink-aware escape prevention;
 * - atomic output helpers with overwrite protection;
 * - the ignored `.my-dashboards/` working area;
 * - deterministic file metadata and type detection.
 *
 * Safe defaults:
 * - rerunnable;
 * - does not overwrite unknown existing files;
 * - validates and tests before committing;
 * - commits only task-owned paths;
 * - never force-pushes.
 *
 * Usage:
 *   node scripts/05-build-file-utilities.mjs
 *   node scripts/05-build-file-utilities.mjs --dry-run
 *   node scripts/05-build-file-utilities.mjs --no-commit
 *   node scripts/05-build-file-utilities.mjs --no-push
 *   node scripts/05-build-file-utilities.mjs --json
 *   node scripts/05-build-file-utilities.mjs --target /path/to/my-dashboards
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

const SCRIPT_NAME = "05-build-file-utilities";
const COMMIT_MESSAGE = "Add safe filesystem utilities";
const MIN_NODE_MAJOR = 20;

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
  localDirectories: [],
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
      "Bootstrap 05 must run from the root of the My Dashboards Git repository.",
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

  const removed = await removeKnownPlaceholder({
    relativePath: "src/files/.gitkeep",
    expectedContent:
      "# Intentionally retained\n\n" +
      "Safe filesystem identification, hashing and atomic-write services will live here.\n\n" +
      "Implementation is added by a later bootstrap step.\n",
    dirtyBefore,
    repoRoot,
  });

  if (removed) {
    ownedAbsolutePaths.push(join(targetRoot, "src", "files", ".gitkeep"));
  }

  const packageChanged = await updatePackageJson(dirtyBefore, repoRoot);
  if (packageChanged) {
    ownedAbsolutePaths.push(join(targetRoot, "package.json"));
  }

  await createLocalWorkingDirectories();

  if (!args.dryRun) {
    await chmod(join(targetRoot, "bin", "mydash.mjs"), 0o755).catch(() => {});
  }

  await validateGeneratedState();

  const expectedSelfPath = join(
    targetRoot,
    "scripts",
    "05-build-file-utilities.mjs",
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
        "Filesystem utilities were created and validated, but --no-commit disabled the Git checkpoint.",
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
My Dashboards — Bootstrap 05

Usage:
  node scripts/05-build-file-utilities.mjs [options]

Options:
  --target <path>  Build utilities in a specific repository root.
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
    "bin/mydash.mjs",
    "cli/index.mjs",
    "cli/registry.mjs",
    "cli/errors.mjs",
    "cli/commands/help.mjs",
    "cli/commands/doctor.mjs",
    "src/workspace/find-root.mjs",
    "src/workspace/load-config.mjs",
    "src/files",
    "tests/unit",
    "tests/fixtures",
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
        "Bootstrap 04 has not been completed.",
        `Missing required paths: ${missing.join(", ")}`,
      ].join("\n"),
    );
  }
}

function buildFiles() {
  const previousRegistry = `import { helpCommand } from "./commands/help.mjs";
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
`;

  return {
    "cli/registry.mjs": {
      allowedPrevious: [previousRegistry],
      content: `import { helpCommand } from "./commands/help.mjs";
import { versionCommand } from "./commands/version.mjs";
import { doctorCommand } from "./commands/doctor.mjs";
import { inspectCommand } from "./commands/inspect.mjs";
import { fileCommand } from "./commands/file.mjs";

const commands = [
  helpCommand,
  versionCommand,
  doctorCommand,
  inspectCommand,
  fileCommand,
];

const commandMap = new Map(
  commands.map((command) => [command.name, command]),
);

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

    "cli/command-options.mjs": {
      content: `import { CliError, EXIT_USAGE } from "./errors.mjs";

export function parseCommandArguments(argv, specification = {}) {
  const booleans = new Set(specification.booleans ?? []);
  const values = new Set(specification.values ?? []);
  const aliases = new Map(Object.entries(specification.aliases ?? {}));
  const options = {};
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    if (!token.startsWith("-")) {
      positionals.push(token);
      continue;
    }

    const [rawName, inlineValue] = token.split("=", 2);
    const normalisedRaw = rawName.replace(/^-+/, "");
    const canonical = aliases.get(normalisedRaw) ?? normalisedRaw;

    if (booleans.has(canonical)) {
      if (inlineValue !== undefined) {
        throw usageError(
          \`Boolean option --\${canonical} does not accept a value.\`,
        );
      }

      options[toCamelCase(canonical)] = true;
      continue;
    }

    if (values.has(canonical)) {
      const value = inlineValue ?? argv[index + 1];

      if (
        value === undefined ||
        (inlineValue === undefined && value.startsWith("-"))
      ) {
        throw usageError(\`Option --\${canonical} requires a value.\`);
      }

      options[toCamelCase(canonical)] = value;

      if (inlineValue === undefined) {
        index += 1;
      }

      continue;
    }

    throw usageError(\`Unknown option: \${rawName}\`);
  }

  return { positionals, options };
}

export function requirePositionals(positionals, minimum, usage) {
  if (positionals.length < minimum) {
    throw usageError(
      \`Missing required argument. Usage: \${usage}\`,
    );
  }
}

export function parseIntegerOption(value, options = {}) {
  if (value === undefined) return options.defaultValue;

  const parsed = Number.parseInt(value, 10);

  if (
    !Number.isInteger(parsed) ||
    (options.minimum !== undefined && parsed < options.minimum) ||
    (options.maximum !== undefined && parsed > options.maximum)
  ) {
    const range =
      options.minimum !== undefined || options.maximum !== undefined
        ? \` between \${options.minimum ?? "-∞"} and \${options.maximum ?? "∞"}\`
        : "";

    throw usageError(
      \`\${options.label ?? "Value"} must be an integer\${range}.\`,
    );
  }

  return parsed;
}

function usageError(message) {
  return new CliError("INVALID_USAGE", message, {
    exitCode: EXIT_USAGE,
  });
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}
`,
    },

    "cli/commands/inspect.mjs": {
      content: `import { parseCommandArguments, requirePositionals } from "../command-options.mjs";
import { inspectPath } from "../../src/files/inspect.mjs";
import { resolveCommandPath } from "../../src/files/paths.mjs";
import { findWorkspaceRoot } from "../../src/workspace/find-root.mjs";

export const inspectCommand = {
  name: "inspect",
  summary: "Identify a file or directory and recommend useful next commands.",
  usage: "mydash inspect <path> [--allow-outside] [--workspace <path>]",
  options: [
    "--allow-outside      Permit read-only inspection outside the workspace.",
    "--workspace <path>   Resolve a specific workspace root.",
    "--json               Return structured JSON.",
  ],

  async run(invocation, context) {
    const parsed = parseCommandArguments(invocation.args, {
      booleans: ["allow-outside"],
    });

    requirePositionals(parsed.positionals, 1, this.usage);

    const workspaceRoot = await findWorkspaceRoot(
      invocation.options.workspace ?? context.cwd,
    );

    const path = await resolveCommandPath(parsed.positionals[0], {
      cwd: context.cwd,
      workspaceRoot,
      allowOutside: parsed.options.allowOutside ?? false,
      mustExist: true,
    });

    const data = await inspectPath(path, {
      workspaceRoot,
    });

    return {
      ok: true,
      command: "inspect",
      data,
      text: renderInspection(data),
    };
  },
};

function renderInspection(data) {
  const lines = [
    \`\${data.name}\`,
    \`Type: \${data.type}\`,
    \`Path: \${data.displayPath}\`,
  ];

  if (data.mediaType) {
    lines.push(\`Media type: \${data.mediaType}\`);
  }

  if (data.sizeBytes !== null) {
    lines.push(\`Size: \${data.sizeBytes} bytes\`);
  }

  if (data.recommendedCommands.length > 0) {
    lines.push("");
    lines.push("Recommended commands:");

    for (const command of data.recommendedCommands) {
      lines.push(\`  \${command}\`);
    }
  }

  return lines.join("\\n");
}
`,
    },

    "cli/commands/file.mjs": {
      content: `import {
  parseCommandArguments,
  parseIntegerOption,
  requirePositionals,
} from "../command-options.mjs";
import { CliError, EXIT_USAGE } from "../errors.mjs";
import { identifyFile } from "../../src/files/identify.mjs";
import { hashFile } from "../../src/files/hash.mjs";
import { buildTree } from "../../src/files/tree.mjs";
import { findFiles } from "../../src/files/find.mjs";
import { createSafeName } from "../../src/files/safe-name.mjs";
import { resolveCommandPath } from "../../src/files/paths.mjs";
import { findWorkspaceRoot } from "../../src/workspace/find-root.mjs";

const SUBCOMMANDS = new Set([
  "identify",
  "hash",
  "tree",
  "find",
  "safe-name",
]);

export const fileCommand = {
  name: "file",
  summary: "Run safe deterministic filesystem utilities.",
  usage: "mydash file <subcommand> [arguments] [options]",
  options: [
    "identify <path>              Detect a file's type and media format.",
    "hash <path>                  Calculate a SHA-256 or SHA-512 hash.",
    "tree <directory>             Show a deterministic directory tree.",
    "find <pattern>               Find files using *, ** and ? wildcards.",
    "safe-name <text>             Produce a safe lower-case file name.",
    "--allow-outside              Permit read-only access outside the workspace.",
    "--json                       Return structured JSON.",
  ],

  async run(invocation, context) {
    const [subcommand, ...rest] = invocation.args;

    if (!SUBCOMMANDS.has(subcommand)) {
      throw new CliError(
        "UNKNOWN_FILE_SUBCOMMAND",
        subcommand
          ? \`Unknown file subcommand: \${subcommand}\`
          : "A file subcommand is required.",
        {
          exitCode: EXIT_USAGE,
          details: {
            availableSubcommands: [...SUBCOMMANDS],
          },
          hint: "Run mydash help file to see available file operations.",
        },
      );
    }

    const workspaceRoot = await findWorkspaceRoot(
      invocation.options.workspace ?? context.cwd,
    );

    switch (subcommand) {
      case "identify":
        return runIdentify(rest, context, workspaceRoot);
      case "hash":
        return runHash(rest, context, workspaceRoot);
      case "tree":
        return runTree(rest, context, workspaceRoot);
      case "find":
        return runFind(rest, context, workspaceRoot);
      case "safe-name":
        return runSafeName(rest);
      default:
        throw new Error("Unreachable file subcommand.");
    }
  },
};

async function runIdentify(args, context, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    booleans: ["allow-outside"],
  });

  requirePositionals(
    parsed.positionals,
    1,
    "mydash file identify <path> [--allow-outside]",
  );

  const path = await resolveCommandPath(parsed.positionals[0], {
    cwd: context.cwd,
    workspaceRoot,
    allowOutside: parsed.options.allowOutside ?? false,
    mustExist: true,
    requireFile: true,
  });

  const data = await identifyFile(path, { workspaceRoot });

  return {
    ok: true,
    command: "file identify",
    data,
    text: [
      \`Path: \${data.displayPath}\`,
      \`Type: \${data.type}\`,
      \`Media type: \${data.mediaType}\`,
      \`Confidence: \${data.confidence}\`,
    ].join("\\n"),
  };
}

async function runHash(args, context, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    booleans: ["allow-outside"],
    values: ["algorithm"],
  });

  requirePositionals(
    parsed.positionals,
    1,
    "mydash file hash <path> [--algorithm sha256|sha512]",
  );

  const path = await resolveCommandPath(parsed.positionals[0], {
    cwd: context.cwd,
    workspaceRoot,
    allowOutside: parsed.options.allowOutside ?? false,
    mustExist: true,
    requireFile: true,
  });

  const algorithm = parsed.options.algorithm ?? "sha256";

  if (!["sha256", "sha512"].includes(algorithm)) {
    throw new CliError(
      "UNSUPPORTED_HASH_ALGORITHM",
      "Hash algorithm must be sha256 or sha512.",
      { exitCode: EXIT_USAGE },
    );
  }

  const data = await hashFile(path, {
    algorithm,
    workspaceRoot,
  });

  return {
    ok: true,
    command: "file hash",
    data,
    text: \`\${data.algorithm}  \${data.hash}  \${data.displayPath}\`,
  };
}

async function runTree(args, context, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    booleans: ["allow-outside", "hidden"],
    values: ["depth"],
  });

  requirePositionals(
    parsed.positionals,
    1,
    "mydash file tree <directory> [--depth 3] [--hidden]",
  );

  const path = await resolveCommandPath(parsed.positionals[0], {
    cwd: context.cwd,
    workspaceRoot,
    allowOutside: parsed.options.allowOutside ?? false,
    mustExist: true,
    requireDirectory: true,
  });

  const maxDepth = parseIntegerOption(parsed.options.depth, {
    label: "Depth",
    minimum: 0,
    maximum: 20,
    defaultValue: 3,
  });

  const data = await buildTree(path, {
    workspaceRoot,
    maxDepth,
    includeHidden: parsed.options.hidden ?? false,
  });

  return {
    ok: true,
    command: "file tree",
    data,
    text: data.text,
  };
}

async function runFind(args, context, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    booleans: ["allow-outside", "hidden"],
    values: ["root", "max-results"],
  });

  requirePositionals(
    parsed.positionals,
    1,
    "mydash file find <pattern> [--root <directory>]",
  );

  const rootInput =
    parsed.options.root ??
    (workspaceRoot ? "." : context.cwd);

  const root = await resolveCommandPath(rootInput, {
    cwd: workspaceRoot ?? context.cwd,
    workspaceRoot,
    allowOutside: parsed.options.allowOutside ?? false,
    mustExist: true,
    requireDirectory: true,
  });

  const maxResults = parseIntegerOption(parsed.options.maxResults, {
    label: "Maximum results",
    minimum: 1,
    maximum: 10000,
    defaultValue: 200,
  });

  const data = await findFiles(root, parsed.positionals[0], {
    workspaceRoot,
    includeHidden: parsed.options.hidden ?? false,
    maxResults,
  });

  return {
    ok: true,
    command: "file find",
    data,
    text:
      data.matches.length > 0
        ? data.matches.map((match) => match.path).join("\\n")
        : "No matching files found.",
    warnings: data.truncated
      ? [
          {
            code: "RESULTS_TRUNCATED",
            message:
              \`Results were limited to \${maxResults}. Refine the pattern or increase --max-results.\`,
          },
        ]
      : [],
  };
}

async function runSafeName(args) {
  const parsed = parseCommandArguments(args, {
    values: ["extension"],
  });

  requirePositionals(
    parsed.positionals,
    1,
    "mydash file safe-name <text> [--extension html]",
  );

  const input = parsed.positionals.join(" ");
  const data = createSafeName(input, {
    extension: parsed.options.extension,
  });

  return {
    ok: true,
    command: "file safe-name",
    data,
    text: data.safeName,
  };
}
`,
    },

    "src/files/paths.mjs": {
      content: `import {
  access,
  lstat,
  mkdir,
  realpath,
  stat,
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { CliError, EXIT_UNSAFE_OPERATION } from "../../cli/errors.mjs";

export async function resolveCommandPath(input, options = {}) {
  if (typeof input !== "string" || input.trim() === "") {
    throw new CliError("INVALID_PATH", "A non-empty path is required.", {
      exitCode: 2,
    });
  }

  const cwd = resolve(options.cwd ?? process.cwd());
  const candidate = resolve(cwd, input);

  if (options.mustExist) {
    await assertExists(candidate);
  }

  if (!options.allowOutside) {
    if (!options.workspaceRoot) {
      throw new CliError(
        "WORKSPACE_NOT_FOUND",
        "No My Dashboards workspace was found. Use --workspace or --allow-outside for read-only inspection.",
        {
          exitCode: EXIT_UNSAFE_OPERATION,
        },
      );
    }

    await assertPathInsideWorkspace(candidate, options.workspaceRoot, {
      mustExist: options.mustExist ?? false,
    });
  }

  if (options.requireFile || options.requireDirectory) {
    const metadata = await stat(candidate);

    if (options.requireFile && !metadata.isFile()) {
      throw new CliError("EXPECTED_FILE", \`Expected a file: \${candidate}\`, {
        exitCode: 2,
      });
    }

    if (options.requireDirectory && !metadata.isDirectory()) {
      throw new CliError(
        "EXPECTED_DIRECTORY",
        \`Expected a directory: \${candidate}\`,
        { exitCode: 2 },
      );
    }
  }

  return candidate;
}

export async function assertPathInsideWorkspace(
  candidate,
  workspaceRoot,
  options = {},
) {
  const canonicalRoot = await realpath(resolve(workspaceRoot));
  let canonicalCandidate;

  if (options.mustExist) {
    canonicalCandidate = await realpath(resolve(candidate));
  } else {
    const parent = await nearestExistingParent(dirname(resolve(candidate)));
    const canonicalParent = await realpath(parent);
    canonicalCandidate = join(
      canonicalParent,
      relative(parent, resolve(candidate)),
    );
  }

  if (!isPathInside(canonicalRoot, canonicalCandidate)) {
    throw new CliError(
      "PATH_OUTSIDE_WORKSPACE",
      \`Path is outside the workspace: \${candidate}\`,
      {
        exitCode: EXIT_UNSAFE_OPERATION,
        hint:
          "Use --allow-outside only for deliberate read-only inspection. Writes must remain workspace-bound.",
      },
    );
  }
}

export function isPathInside(root, candidate) {
  const relationship = relative(resolve(root), resolve(candidate));

  return (
    relationship === "" ||
    (!relationship.startsWith("..") && !isAbsolute(relationship))
  );
}

export async function ensureWorkingDirectories(workspaceRoot) {
  const root = join(workspaceRoot, ".my-dashboards");
  const directories = {
    root,
    cache: join(root, "cache"),
    temp: join(root, "temp"),
    extracts: join(root, "extracts"),
    logs: join(root, "logs"),
  };

  for (const path of Object.values(directories)) {
    await mkdir(path, { recursive: true });
    await access(path, fsConstants.W_OK);
  }

  return directories;
}

async function nearestExistingParent(start) {
  let current = resolve(start);

  while (true) {
    try {
      await lstat(current);
      return current;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;

      const parent = dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}

async function assertExists(path) {
  try {
    await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new CliError("PATH_NOT_FOUND", \`Path does not exist: \${path}\`, {
        exitCode: 2,
      });
    }

    throw error;
  }
}
`,
    },

    "src/files/identify.mjs": {
      content: `import { open, stat } from "node:fs/promises";
import { extname, relative } from "node:path";

const EXTENSION_TYPES = new Map([
  [".xlsx", ["excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]],
  [".xlsm", ["excel", "application/vnd.ms-excel.sheet.macroEnabled.12"]],
  [".xls", ["excel", "application/vnd.ms-excel"]],
  [".pptx", ["powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"]],
  [".pptm", ["powerpoint", "application/vnd.ms-powerpoint.presentation.macroEnabled.12"]],
  [".ppt", ["powerpoint", "application/vnd.ms-powerpoint"]],
  [".csv", ["csv", "text/csv"]],
  [".tsv", ["tabular-text", "text/tab-separated-values"]],
  [".json", ["json", "application/json"]],
  [".ndjson", ["ndjson", "application/x-ndjson"]],
  [".html", ["html", "text/html"]],
  [".htm", ["html", "text/html"]],
  [".css", ["css", "text/css"]],
  [".js", ["javascript", "text/javascript"]],
  [".mjs", ["javascript", "text/javascript"]],
  [".txt", ["text", "text/plain"]],
  [".md", ["markdown", "text/markdown"]],
  [".pdf", ["pdf", "application/pdf"]],
  [".svg", ["svg", "image/svg+xml"]],
  [".png", ["image", "image/png"]],
  [".jpg", ["image", "image/jpeg"]],
  [".jpeg", ["image", "image/jpeg"]],
  [".gif", ["image", "image/gif"]],
  [".webp", ["image", "image/webp"]],
  [".zip", ["archive", "application/zip"]],
]);

export async function identifyFile(path, options = {}) {
  const metadata = await stat(path);

  if (!metadata.isFile()) {
    return {
      path,
      displayPath: displayPath(path, options.workspaceRoot),
      type: metadata.isDirectory() ? "directory" : "other",
      mediaType: "application/octet-stream",
      extension: extname(path).toLowerCase(),
      confidence: "high",
      sizeBytes: metadata.size,
      modifiedAt: metadata.mtime.toISOString(),
      magic: null,
    };
  }

  const extension = extname(path).toLowerCase();
  const sample = await readSample(path, 512);
  const magic = detectMagic(sample);
  const extensionType = EXTENSION_TYPES.get(extension);

  let type = extensionType?.[0] ?? "unknown";
  let mediaType = extensionType?.[1] ?? "application/octet-stream";
  let confidence = extensionType ? "medium" : "low";

  if (magic) {
    type = magic.type;
    mediaType = magic.mediaType;
    confidence = "high";

    if (magic.type === "archive" && extensionType) {
      type = extensionType[0];
      mediaType = extensionType[1];
    }
  } else if (!extensionType && looksLikeText(sample)) {
    type = "text";
    mediaType = "text/plain";
    confidence = "medium";
  }

  return {
    path,
    displayPath: displayPath(path, options.workspaceRoot),
    type,
    mediaType,
    extension,
    confidence,
    sizeBytes: metadata.size,
    modifiedAt: metadata.mtime.toISOString(),
    magic: magic?.name ?? null,
  };
}

async function readSample(path, length) {
  const handle = await open(path, "r");

  try {
    const buffer = Buffer.alloc(length);
    const result = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, result.bytesRead);
  } finally {
    await handle.close();
  }
}

function detectMagic(buffer) {
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString() === "%PDF") {
    return { name: "PDF", type: "pdf", mediaType: "application/pdf" };
  }

  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    [0x03, 0x05, 0x07].includes(buffer[2])
  ) {
    return { name: "ZIP", type: "archive", mediaType: "application/zip" };
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    )
  ) {
    return {
      name: "OLE Compound File",
      type: "office-binary",
      mediaType: "application/x-ole-storage",
    };
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return { name: "PNG", type: "image", mediaType: "image/png" };
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { name: "JPEG", type: "image", mediaType: "image/jpeg" };
  }

  if (
    buffer.length >= 6 &&
    ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString())
  ) {
    return { name: "GIF", type: "image", mediaType: "image/gif" };
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString() === "RIFF" &&
    buffer.subarray(8, 12).toString() === "WEBP"
  ) {
    return { name: "WebP", type: "image", mediaType: "image/webp" };
  }

  return null;
}

function looksLikeText(buffer) {
  if (buffer.length === 0) return true;

  let printable = 0;

  for (const byte of buffer) {
    if (
      byte === 0x09 ||
      byte === 0x0a ||
      byte === 0x0d ||
      (byte >= 0x20 && byte <= 0x7e) ||
      byte >= 0x80
    ) {
      printable += 1;
    }
  }

  return printable / buffer.length > 0.9;
}

function displayPath(path, workspaceRoot) {
  if (!workspaceRoot) return path;

  const value = relative(workspaceRoot, path).replaceAll("\\\\", "/");
  return value.startsWith("..") ? path : value || ".";
}
`,
    },

    "src/files/inspect.mjs": {
      content: `import { lstat, readFile } from "node:fs/promises";
import { basename, relative } from "node:path";
import { identifyFile } from "./identify.mjs";

export async function inspectPath(path, options = {}) {
  const metadata = await lstat(path);
  const displayPath = formatPath(path, options.workspaceRoot);

  if (metadata.isDirectory()) {
    return {
      path,
      displayPath,
      name: basename(path),
      type: "directory",
      mediaType: null,
      sizeBytes: null,
      modifiedAt: metadata.mtime.toISOString(),
      isSymbolicLink: false,
      recommendedCommands: [
        \`mydash file tree "\${displayPath}"\`,
        \`mydash file find "**/*" --root "\${displayPath}"\`,
      ],
      details: {},
    };
  }

  const identity = await identifyFile(path, options);
  const details = await inspectKnownTextType(path, identity.type);

  return {
    ...identity,
    name: basename(path),
    isSymbolicLink: metadata.isSymbolicLink(),
    recommendedCommands: recommendedCommands(identity, displayPath),
    details,
  };
}

async function inspectKnownTextType(path, type) {
  if (type !== "json") return {};

  try {
    const source = await readFile(path, "utf8");
    const value = JSON.parse(source);

    if (Array.isArray(value)) {
      return {
        jsonShape: "array",
        itemCount: value.length,
      };
    }

    if (value !== null && typeof value === "object") {
      return {
        jsonShape: "object",
        keys: Object.keys(value).slice(0, 50),
      };
    }

    return {
      jsonShape: typeof value,
    };
  } catch (error) {
    return {
      jsonShape: "invalid",
      parseError: error.message,
    };
  }
}

function recommendedCommands(identity, displayPath) {
  const quoted = \`"\${displayPath}"\`;

  switch (identity.type) {
    case "excel":
      return [
        \`mydash excel inspect \${quoted}\`,
        \`mydash excel preview \${quoted} --sheet <name>\`,
      ];
    case "powerpoint":
      return [
        \`mydash powerpoint inspect \${quoted}\`,
        \`mydash powerpoint outline \${quoted}\`,
      ];
    case "csv":
    case "json":
    case "ndjson":
      return [
        \`mydash data inspect \${quoted}\`,
        \`mydash data profile \${quoted}\`,
      ];
    case "html":
      return [
        \`mydash html inspect \${quoted}\`,
        \`mydash html external-resources \${quoted}\`,
      ];
    default:
      return [
        \`mydash file identify \${quoted}\`,
        \`mydash file hash \${quoted}\`,
      ];
  }
}

function formatPath(path, workspaceRoot) {
  if (!workspaceRoot) return path;

  const value = relative(workspaceRoot, path).replaceAll("\\\\", "/");
  return value.startsWith("..") ? path : value || ".";
}
`,
    },

    "src/files/hash.mjs": {
      content: `import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { relative } from "node:path";

export async function hashFile(path, options = {}) {
  const algorithm = options.algorithm ?? "sha256";
  const hash = createHash(algorithm);
  const stream = createReadStream(path);

  for await (const chunk of stream) {
    hash.update(chunk);
  }

  return {
    path,
    displayPath: displayPath(path, options.workspaceRoot),
    algorithm,
    hash: hash.digest("hex"),
  };
}

function displayPath(path, workspaceRoot) {
  if (!workspaceRoot) return path;

  const value = relative(workspaceRoot, path).replaceAll("\\\\", "/");
  return value.startsWith("..") ? path : value || ".";
}
`,
    },

    "src/files/tree.mjs": {
      content: `import { lstat, readdir } from "node:fs/promises";
import { basename, join, relative } from "node:path";

const DEFAULT_IGNORES = new Set([
  ".git",
  "node_modules",
  ".my-dashboards",
]);

export async function buildTree(root, options = {}) {
  const maxDepth = options.maxDepth ?? 3;
  const includeHidden = options.includeHidden ?? false;
  const entries = [];

  await walk(root, "", 0);

  const rootName = basename(root) || root;
  const textLines = [rootName];

  for (const entry of entries) {
    textLines.push(
      \`\${"  ".repeat(entry.depth)}\${entry.type === "directory" ? "▸ " : "  "}\${entry.name}\${entry.type === "symlink" ? " →" : ""}\`,
    );
  }

  return {
    root,
    displayRoot: displayPath(root, options.workspaceRoot),
    maxDepth,
    includeHidden,
    entries,
    text: textLines.join("\\n"),
  };

  async function walk(directory, parentRelative, depth) {
    if (depth >= maxDepth) return;

    const directoryEntries = await readdir(directory, {
      withFileTypes: true,
    });

    directoryEntries.sort((left, right) =>
      left.name.localeCompare(right.name, "en"),
    );

    for (const entry of directoryEntries) {
      if (!includeHidden && entry.name.startsWith(".")) continue;
      if (DEFAULT_IGNORES.has(entry.name)) continue;

      const absolutePath = join(directory, entry.name);
      const itemRelative = parentRelative
        ? \`\${parentRelative}/\${entry.name}\`
        : entry.name;
      const metadata = await lstat(absolutePath);
      const type = metadata.isSymbolicLink()
        ? "symlink"
        : metadata.isDirectory()
          ? "directory"
          : metadata.isFile()
            ? "file"
            : "other";

      entries.push({
        name: entry.name,
        path: itemRelative,
        type,
        depth: depth + 1,
        sizeBytes: metadata.isFile() ? metadata.size : null,
      });

      if (type === "directory") {
        await walk(absolutePath, itemRelative, depth + 1);
      }
    }
  }
}

function displayPath(path, workspaceRoot) {
  if (!workspaceRoot) return path;

  const value = relative(workspaceRoot, path).replaceAll("\\\\", "/");
  return value.startsWith("..") ? path : value || ".";
}
`,
    },

    "src/files/find.mjs": {
      content: `import { lstat, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const DEFAULT_IGNORES = new Set([
  ".git",
  "node_modules",
  ".my-dashboards",
]);

export async function findFiles(root, pattern, options = {}) {
  const includeHidden = options.includeHidden ?? false;
  const maxResults = options.maxResults ?? 200;
  const expression = globToRegExp(pattern);
  const matches = [];
  let truncated = false;

  await walk(root, "");

  return {
    root,
    pattern,
    matches,
    truncated,
  };

  async function walk(directory, parentRelative) {
    if (truncated) return;

    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) =>
      left.name.localeCompare(right.name, "en"),
    );

    for (const entry of entries) {
      if (!includeHidden && entry.name.startsWith(".")) continue;
      if (DEFAULT_IGNORES.has(entry.name)) continue;

      const absolutePath = join(directory, entry.name);
      const relativePath = parentRelative
        ? \`\${parentRelative}/\${entry.name}\`
        : entry.name;
      const metadata = await lstat(absolutePath);

      if (
        (metadata.isFile() || metadata.isSymbolicLink()) &&
        expression.test(relativePath)
      ) {
        matches.push({
          path: relativePath,
          type: metadata.isSymbolicLink() ? "symlink" : "file",
          sizeBytes: metadata.isFile() ? metadata.size : null,
        });

        if (matches.length >= maxResults) {
          truncated = true;
          return;
        }
      }

      if (metadata.isDirectory() && !metadata.isSymbolicLink()) {
        await walk(absolutePath, relativePath);
      }
    }
  }
}

export function globToRegExp(pattern) {
  if (typeof pattern !== "string" || pattern.length === 0) {
    throw new Error("A non-empty file pattern is required.");
  }

  let source = "^";

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];

    if (character === "*") {
      if (pattern[index + 1] === "*") {
        const followedBySlash = pattern[index + 2] === "/";

        if (followedBySlash) {
          source += "(?:.*/)?";
          index += 2;
        } else {
          source += ".*";
          index += 1;
        }
      } else {
        source += "[^/]*";
      }

      continue;
    }

    if (character === "?") {
      source += "[^/]";
      continue;
    }

    if ("\\\\^$+?.()|{}[]".includes(character)) {
      source += \`\\\\\${character}\`;
    } else {
      source += character;
    }
  }

  source += "$";
  return new RegExp(source, "i");
}
`,
    },

    "src/files/safe-name.mjs": {
      content: `import { extname } from "node:path";

export function createSafeName(input, options = {}) {
  if (typeof input !== "string" || input.trim() === "") {
    throw new Error("A non-empty name is required.");
  }

  const trimmed = input.trim();
  const inferredExtension = extname(trimmed);
  const baseInput = inferredExtension
    ? trimmed.slice(0, -inferredExtension.length)
    : trimmed;
  const extension = normaliseExtension(
    options.extension ?? inferredExtension,
  );

  let base = baseInput
    .normalize("NFKD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (!base) {
    base = "untitled";
  }

  const safeName = \`\${base}\${extension}\`;

  return {
    input,
    safeName,
    base,
    extension,
  };
}

function normaliseExtension(value) {
  if (!value) return "";

  const cleaned = String(value)
    .trim()
    .toLowerCase()
    .replace(/^\\.+/, "")
    .replace(/[^a-z0-9]+/g, "");

  return cleaned ? \`.\${cleaned}\` : "";
}
`,
    },

    "src/files/output.mjs": {
      content: `import {
  mkdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { CliError, EXIT_UNSAFE_OPERATION } from "../../cli/errors.mjs";
import { assertPathInsideWorkspace } from "./paths.mjs";

export async function prepareOutputPath(path, options = {}) {
  const outputPath = resolve(path);

  if (!options.workspaceRoot) {
    throw new CliError(
      "WORKSPACE_REQUIRED_FOR_WRITE",
      "Writes require a My Dashboards workspace.",
      { exitCode: EXIT_UNSAFE_OPERATION },
    );
  }

  await assertPathInsideWorkspace(outputPath, options.workspaceRoot, {
    mustExist: false,
  });

  const exists = await pathExists(outputPath);

  if (exists && !options.overwrite) {
    throw new CliError(
      "OUTPUT_EXISTS",
      \`Output already exists: \${outputPath}\`,
      {
        exitCode: EXIT_UNSAFE_OPERATION,
        hint: "Choose another path or explicitly request overwrite.",
      },
    );
  }

  await mkdir(dirname(outputPath), { recursive: true });
  return outputPath;
}

export async function writeFileAtomic(path, content, options = {}) {
  const outputPath = await prepareOutputPath(path, options);
  const temporaryPath = \`\${outputPath}.tmp-\${process.pid}-\${Date.now()}\`;

  try {
    await writeFile(temporaryPath, content, options.encoding ?? undefined);
    await rename(temporaryPath, outputPath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }

  return outputPath;
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
`,
    },

    "src/files/README.md": {
      content: `# Safe filesystem services

These modules provide deterministic operations for both the CLI and future HTTP
server.

## Safety rules

- Read operations remain inside the workspace by default.
- Read-only access outside the workspace requires \`--allow-outside\`.
- Symlinks are resolved before workspace-bound access is approved.
- Writes always require a workspace and remain inside it.
- Existing outputs are not replaced unless overwrite is explicit.
- Writes use temporary files followed by atomic rename.
- Directory traversal does not follow symbolic links.
- \`.git\`, \`node_modules\` and \`.my-dashboards\` are ignored by default.

## Working area

Runtime scratch files belong in:

\`\`\`text
.my-dashboards/
├── cache/
├── temp/
├── extracts/
└── logs/
\`\`\`

This directory is intentionally ignored by Git.
`,
    },

    "tests/fixtures/files/sample.csv": {
      content: `id,status,owner
UC-001,Approved,Alice
UC-002,Review,Bob
`,
    },

    "tests/fixtures/files/sample.json": {
      content: `{
  "name": "Example",
  "items": [
    {
      "id": 1,
      "status": "active"
    }
  ]
}
`,
    },

    "tests/unit/files.test.mjs": {
      content: `import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { identifyFile } from "../../src/files/identify.mjs";
import { hashFile } from "../../src/files/hash.mjs";
import { buildTree } from "../../src/files/tree.mjs";
import { findFiles, globToRegExp } from "../../src/files/find.mjs";
import { createSafeName } from "../../src/files/safe-name.mjs";
import { writeFileAtomic } from "../../src/files/output.mjs";

test("safe-name preserves and normalises an extension", () => {
  const result = createSafeName("Quarterly Review (Final).xlsx");

  assert.equal(result.safeName, "quarterly-review-final.xlsx");
});

test("safe-name supports an explicit extension", () => {
  const result = createSafeName("Agent Hub Overview", {
    extension: "HTML",
  });

  assert.equal(result.safeName, "agent-hub-overview.html");
});

test("file identification recognises JSON", async () => {
  const path = fileURLToPath(
    new URL("../fixtures/files/sample.json", import.meta.url),
  );
  const result = await identifyFile(path);

  assert.equal(result.type, "json");
  assert.equal(result.mediaType, "application/json");
});

test("hashing produces the expected SHA-256 digest", async () => {
  const path = fileURLToPath(
    new URL("../fixtures/files/sample.csv", import.meta.url),
  );
  const content = await readFile(path);
  const expected = createHash("sha256").update(content).digest("hex");
  const result = await hashFile(path);

  assert.equal(result.hash, expected);
});

test("glob patterns support recursive matching", () => {
  const expression = globToRegExp("**/*.json");

  assert.equal(expression.test("sample.json"), true);
  assert.equal(expression.test("nested/sample.json"), true);
  assert.equal(expression.test("nested/sample.csv"), false);
});

test("tree and find are deterministic", async () => {
  const root = await mkdtemp(join(tmpdir(), "mydash-files-"));

  try {
    await writeFile(join(root, "b.txt"), "b");
    await writeFile(join(root, "a.txt"), "a");

    const tree = await buildTree(root, { maxDepth: 2 });
    assert.deepEqual(
      tree.entries.map((entry) => entry.name),
      ["a.txt", "b.txt"],
    );

    const found = await findFiles(root, "*.txt");
    assert.deepEqual(
      found.matches.map((entry) => entry.path),
      ["a.txt", "b.txt"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("atomic output refuses accidental overwrite", async () => {
  const root = await mkdtemp(join(tmpdir(), "mydash-output-"));

  try {
    const path = join(root, "result.txt");

    await writeFileAtomic(path, "first", {
      workspaceRoot: root,
    });

    await assert.rejects(
      () =>
        writeFileAtomic(path, "second", {
          workspaceRoot: root,
        }),
      (error) => error.code === "OUTPUT_EXISTS",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
`,
    },

    "tests/integration/file-cli.test.mjs": {
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

test("inspect returns structured metadata", () => {
  const result = runCli([
    "inspect",
    "tests/fixtures/files/sample.json",
    "--json",
  ]);

  assert.equal(result.status, 0);
  const body = JSON.parse(result.stdout);
  assert.equal(body.command, "inspect");
  assert.equal(body.data.type, "json");
  assert.equal(body.data.details.jsonShape, "object");
});

test("file safe-name is available through the CLI", () => {
  const result = runCli([
    "file",
    "safe-name",
    "Quarterly Review (Final).xlsx",
  ]);

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "quarterly-review-final.xlsx");
});

test("file find returns matching workspace files", () => {
  const result = runCli([
    "file",
    "find",
    "**/*.json",
    "--root",
    "tests/fixtures/files",
    "--json",
  ]);

  assert.equal(result.status, 0);
  const body = JSON.parse(result.stdout);
  assert.equal(body.command, "file find");
  assert.ok(
    body.data.matches.some((entry) => entry.path === "sample.json"),
  );
});

test("outside reads are refused without explicit permission", () => {
  const result = runCli([
    "inspect",
    "..",
    "--json",
  ]);

  assert.equal(result.status, 5);
  const body = JSON.parse(result.stderr);
  assert.equal(body.error.code, "PATH_OUTSIDE_WORKSPACE");
});
`,
    },

    "scripts/tasks/test-files.mjs": {
      content: `#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "../..");

const tests = [
  resolve(projectRoot, "tests", "unit", "files.test.mjs"),
  resolve(projectRoot, "tests", "integration", "file-cli.test.mjs"),
];

const result = spawnSync(
  process.execPath,
  ["--test", ...tests],
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
        "package.json had pre-existing changes, so filesystem test commands were not added automatically.",
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
  value.scripts["test:files"] =
    value.scripts["test:files"] ?? "node scripts/tasks/test-files.mjs";

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

async function createLocalWorkingDirectories() {
  const paths = [
    ".my-dashboards",
    ".my-dashboards/cache",
    ".my-dashboards/temp",
    ".my-dashboards/extracts",
    ".my-dashboards/logs",
  ];

  for (const relativePath of paths) {
    const absolutePath = join(targetRoot, relativePath);

    if (args.dryRun) {
      report.localDirectories.push(relativePath);
      continue;
    }

    await mkdir(absolutePath, { recursive: true });
    await access(absolutePath, fsConstants.W_OK);
    report.localDirectories.push(relativePath);
  }
}

async function removeKnownPlaceholder({
  relativePath,
  expectedContent,
  dirtyBefore,
  repoRoot,
}) {
  const absolutePath = join(targetRoot, relativePath);
  const gitPath = relativeGitPath(repoRoot, absolutePath);

  if (!(await pathExists(absolutePath))) return false;

  if (dirtyBefore.has(gitPath)) {
    report.preserved.push(gitPath);
    return false;
  }

  const current = await readFile(absolutePath, "utf8");

  if (current !== expectedContent) {
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

async function validateGeneratedState() {
  if (args.dryRun) {
    report.validation.push({
      check: "dry-run",
      ok: true,
      message:
        "The filesystem utility layer was calculated without writing it.",
    });
    return;
  }

  const modulePaths = [
    "cli/registry.mjs",
    "cli/command-options.mjs",
    "cli/commands/inspect.mjs",
    "cli/commands/file.mjs",
    "src/files/paths.mjs",
    "src/files/identify.mjs",
    "src/files/inspect.mjs",
    "src/files/hash.mjs",
    "src/files/tree.mjs",
    "src/files/find.mjs",
    "src/files/safe-name.mjs",
    "src/files/output.mjs",
    "tests/unit/files.test.mjs",
    "tests/integration/file-cli.test.mjs",
    "scripts/tasks/test-files.mjs",
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
      `${modulePaths.length} filesystem and CLI modules passed Node syntax checks.`,
  });

  const safeNameResult = run(
    process.execPath,
    [
      join(targetRoot, "bin", "mydash.mjs"),
      "file",
      "safe-name",
      "Quarterly Review (Final).xlsx",
    ],
    { cwd: targetRoot, allowFailure: true },
  );

  if (
    safeNameResult.status !== 0 ||
    safeNameResult.stdout !== "quarterly-review-final.xlsx"
  ) {
    throw new Error(
      `Safe-name smoke test failed:\n${
        safeNameResult.stderr || safeNameResult.stdout
      }`,
    );
  }

  report.validation.push({
    check: "safe-name-command",
    ok: true,
    message: "The file command group is registered and executable.",
  });

  const inspectResult = run(
    process.execPath,
    [
      join(targetRoot, "bin", "mydash.mjs"),
      "inspect",
      "tests/fixtures/files/sample.json",
      "--json",
    ],
    { cwd: targetRoot, allowFailure: true },
  );

  if (inspectResult.status !== 0) {
    throw new Error(
      `Inspect smoke test failed:\n${
        inspectResult.stderr || inspectResult.stdout
      }`,
    );
  }

  const inspectBody = JSON.parse(inspectResult.stdout);

  if (
    inspectBody.command !== "inspect" ||
    inspectBody.data.type !== "json"
  ) {
    throw new Error("Inspect command returned an unexpected result.");
  }

  report.validation.push({
    check: "inspect-command",
    ok: true,
    message: "Generic file inspection returns structured metadata.",
  });

  const testResult = run(
    process.execPath,
    [join(targetRoot, "scripts", "tasks", "test-files.mjs")],
    { cwd: targetRoot, allowFailure: true },
  );

  if (testResult.status !== 0) {
    throw new Error(
      `Filesystem tests failed:\n${testResult.stderr || testResult.stdout}`,
    );
  }

  report.validation.push({
    check: "filesystem-tests",
    ok: true,
    message: "Filesystem unit and CLI integration tests passed.",
  });

  const cliRegression = run(
    process.execPath,
    [join(targetRoot, "scripts", "tasks", "test-cli.mjs")],
    { cwd: targetRoot, allowFailure: true },
  );

  if (cliRegression.status !== 0) {
    throw new Error(
      `Existing CLI tests failed after filesystem integration:\n${
        cliRegression.stderr || cliRegression.stdout
      }`,
    );
  }

  report.validation.push({
    check: "cli-regression",
    ok: true,
    message: "The existing CLI foundation tests still pass.",
  });

  const workspaceValidation = run(
    process.execPath,
    [join(targetRoot, "scripts", "tasks", "validate.mjs")],
    { cwd: targetRoot, allowFailure: true },
  );

  if (workspaceValidation.status !== 0) {
    throw new Error(
      `Workspace validation failed after filesystem integration:\n${
        workspaceValidation.stderr || workspaceValidation.stdout
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
        "Filesystem utilities were already present; there were no task-owned changes to commit.",
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
        "Filesystem utilities were created and validated, but no commit was made because Git user.name or user.email is missing.",
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

  console.log("\nMy Dashboards — safe filesystem utilities\n");
  console.log(`Target: ${report.targetRoot}`);
  console.log(`Result: ${report.ok ? "PASS" : "FAIL"}`);
  console.log(`Mode: ${report.dryRun ? "dry-run" : "write"}`);

  printSection("Created", report.created);
  printSection("Updated", report.updated);
  printSection("Removed", report.removed);
  printSection("Preserved", report.preserved);
  printSection("Local working directories", report.localDirectories);

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
