#!/usr/bin/env node

/**
 * My Dashboards — Bootstrap 01: Initialise repository
 *
 * Creates the repository metadata and bootstrap machinery without installing
 * dependencies or building application behaviour.
 *
 * Safe defaults:
 * - rerunnable;
 * - does not overwrite existing non-generated files;
 * - never stages unrelated files;
 * - never force-pushes;
 * - skips files that were already dirty before this script ran;
 * - commits and pushes only after validation.
 *
 * Usage:
 *   node scripts/01-init-repository.mjs
 *   node scripts/01-init-repository.mjs --target /path/to/my-dashboards
 *   node scripts/01-init-repository.mjs --dry-run
 *   node scripts/01-init-repository.mjs --no-commit
 *   node scripts/01-init-repository.mjs --no-push
 *   node scripts/01-init-repository.mjs --json
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
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const SCRIPT_NAME = "01-init-repository";
const MIN_NODE_MAJOR = 20;
const COMMIT_MESSAGE = "Initialise My Dashboards repository";

const args = parseArgs(process.argv.slice(2));
const targetRoot = resolve(args.target ?? process.cwd());

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
    initialised: false,
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

  if (!args.dryRun) {
    await mkdir(targetRoot, { recursive: true });
  }

  await assertTargetWritable();

  const gitAvailable = commandAvailable("git", ["--version"]);
  if (!gitAvailable) {
    throw new Error("Git is required for bootstrap 01 but was not found on PATH.");
  }

  const existingRepo = getRepositoryRoot(targetRoot);
  if (existingRepo && resolve(existingRepo) !== targetRoot) {
    throw new Error(
      [
        `The target directory is inside another Git repository: ${existingRepo}`,
        "Run the script from the intended repository root, or choose a different --target.",
        "This guard prevents accidentally initialising or committing into a parent project.",
      ].join("\n"),
    );
  }

  if (!existingRepo) {
    await initialiseGitRepository();
  }

  const repoRoot = getRepositoryRoot(targetRoot);
  if (!repoRoot) {
    throw new Error("Git repository initialisation did not produce a detectable repository.");
  }

  const dirtyBefore = getDirtyPaths(repoRoot);
  const generatedPaths = [];

  await ensureDirectory(join(targetRoot, "scripts", "lib"));
  await ensureDirectory(join(targetRoot, "scripts", "tasks"));

  const packagePath = join(targetRoot, "package.json");
  const packageChanged = await createOrMergePackageJson(packagePath, dirtyBefore);
  if (packageChanged) generatedPaths.push(packagePath);

  const files = buildFileTemplates();

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = join(targetRoot, relativePath);
    const result = await writeOwnedFile(absolutePath, content, dirtyBefore);

    if (result === "created" || result === "updated") {
      generatedPaths.push(absolutePath);
    }
  }

  await validateGeneratedState();

  if (!args.noCommit && !args.dryRun) {
    await checkpointChanges(repoRoot, generatedPaths, dirtyBefore);
  } else if (args.noCommit) {
    report.warnings.push({
      code: "COMMIT_DISABLED",
      message: "The repository was not committed because --no-commit was supplied.",
    });
  }

  report.ok = true;
  finish(0);
}

function parseArgs(argv) {
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
My Dashboards — Bootstrap 01

Usage:
  node scripts/01-init-repository.mjs [options]

Options:
  --target <path>  Initialise a specific project directory.
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

async function assertTargetWritable() {
  if (args.dryRun) return;

  await access(targetRoot, fsConstants.W_OK);
}

function commandAvailable(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    stdio: "pipe",
  });

  return result.status === 0;
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ?? targetRoot,
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : "pipe",
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

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

function getRepositoryRoot(cwd) {
  const result = run("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    allowFailure: true,
  });

  return result.status === 0 ? resolve(result.stdout) : null;
}

async function initialiseGitRepository() {
  if (args.dryRun) {
    report.git.initialised = true;
    report.created.push(".git/");
    return;
  }

  let result = run("git", ["init", "-b", "main"], {
    cwd: targetRoot,
    allowFailure: true,
  });

  if (result.status !== 0) {
    result = run("git", ["init"], { cwd: targetRoot });
    const branch = run("git", ["branch", "-M", "main"], {
      cwd: targetRoot,
      allowFailure: true,
    });

    if (branch.status !== 0) {
      report.warnings.push({
        code: "DEFAULT_BRANCH_NOT_RENAMED",
        message: "Git was initialised, but the default branch could not be renamed to main.",
      });
    }
  }

  report.git.initialised = true;
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
    const path = entry.slice(3);
    paths.add(normaliseGitPath(path));

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

function normaliseGitPath(path) {
  return path.replaceAll("\\", "/");
}

function relativeGitPath(repoRoot, absolutePath) {
  return normaliseGitPath(relative(repoRoot, absolutePath));
}

async function ensureDirectory(directoryPath) {
  if (args.dryRun) return;

  await mkdir(directoryPath, { recursive: true });
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

async function createOrMergePackageJson(packagePath, dirtyBefore) {
  const repoRoot = getRepositoryRoot(targetRoot) ?? targetRoot;
  const gitPath = relativeGitPath(repoRoot, packagePath);

  if (dirtyBefore.has(gitPath)) {
    report.preserved.push(gitPath);
    report.warnings.push({
      code: "PREEXISTING_PACKAGE_CHANGES",
      message: `Preserved pre-existing changes in ${gitPath}; package metadata was not modified.`,
    });
    return false;
  }

  const packageName = sanitisePackageName(basename(targetRoot));
  const requiredScripts = {
    preflight: "node scripts/00-preflight.mjs",
    bootstrap: "node scripts/bootstrap.mjs",
    doctor: "node scripts/00-preflight.mjs --check-remote",
    test: "node --test",
    validate: "node scripts/tasks/validate.mjs",
    start: "node scripts/tasks/start.mjs",
    export: "node scripts/tasks/export.mjs",
  };

  let existing = {};
  let exists = false;

  if (await pathExists(packagePath)) {
    exists = true;
    const raw = await readFile(packagePath, "utf8");

    try {
      existing = JSON.parse(raw);
    } catch {
      throw new Error(
        `Existing package.json is not valid JSON and was not modified: ${packagePath}`,
      );
    }
  }

  const next = {
    name: existing.name ?? packageName,
    version: existing.version ?? "0.1.0",
    private: existing.private ?? true,
    description:
      existing.description ??
      "A local-first library, preview and export system for standalone HTML artefacts.",
    type: existing.type ?? "module",
    engines: {
      ...(existing.engines ?? {}),
      node: existing.engines?.node ?? ">=20",
    },
    scripts: {
      ...requiredScripts,
      ...(existing.scripts ?? {}),
    },
    ...existing,
  };

  // Re-apply nested merges after spreading existing so existing fields are preserved
  // without losing newly introduced defaults.
  next.engines = {
    node: ">=20",
    ...(existing.engines ?? {}),
  };
  next.scripts = {
    ...requiredScripts,
    ...(existing.scripts ?? {}),
  };

  const content = `${JSON.stringify(next, null, 2)}\n`;

  if (exists) {
    const current = await readFile(packagePath, "utf8");
    if (current === content) {
      report.preserved.push(gitPath);
      return false;
    }
  }

  if (args.dryRun) {
    (exists ? report.updated : report.created).push(gitPath);
    return true;
  }

  await atomicWrite(packagePath, content);
  (exists ? report.updated : report.created).push(gitPath);
  return true;
}

function sanitisePackageName(value) {
  const safe = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return safe || "my-dashboards";
}

function buildFileTemplates() {
  return {
    ".gitignore": `# Dependencies
node_modules/

# Generated outputs
dist/
exports/
coverage/

# Agent and application working files
.my-dashboards/

# Environment and local configuration
.env
.env.*
!.env.example

# Logs
*.log
npm-debug.log*

# Operating-system files
.DS_Store
Thumbs.db
`,

    ".editorconfig": `root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
`,

    "README.md": `# My Dashboards

A local-first visual library, preview environment and export system for standalone HTML dashboards, presentations and concepts.

## Current state

The repository foundation is installed. Application behaviour, the shared UI library and the navigator are added by later bootstrap steps.

## Requirements

- Node.js 20 or later
- npm
- Git

## Bootstrap

Run the environment preflight:

\`\`\`bash
npm run preflight
\`\`\`

List available bootstrap steps:

\`\`\`bash
npm run bootstrap -- --list
\`\`\`

Run a specific step:

\`\`\`bash
npm run bootstrap -- 02
\`\`\`

Run every available step through a particular number:

\`\`\`bash
npm run bootstrap -- --through 05
\`\`\`

## Repository principles

- The filesystem is the source of truth.
- Git provides persistence, collaboration and recovery.
- Shared abstractions must earn their place.
- Every artefact must ultimately export as a standalone HTML file.
- Significant validated changes are committed and pushed automatically when safe.
`,

    "scripts/bootstrap.mjs": `#!/usr/bin/env node

import { readdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import process from "node:process";

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptsDirectory, "..");
const argumentsList = process.argv.slice(2);

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  const steps = await discoverSteps();

  if (argumentsList.includes("--list") || argumentsList.length === 0) {
    printSteps(steps);
    return;
  }

  const selected = selectSteps(steps, argumentsList);

  if (selected.length === 0) {
    throw new Error("No bootstrap scripts matched the requested selection.");
  }

  for (const step of selected) {
    console.log(\`\\n=== Running \${step.file} ===\\n\`);

    const result = spawnSync(process.execPath, [join(scriptsDirectory, step.file)], {
      cwd: projectRoot,
      stdio: "inherit",
      shell: false,
    });

    if (result.error) throw result.error;

    if (result.status !== 0) {
      throw new Error(
        \`Bootstrap stopped because \${step.file} exited with code \${result.status}.\`,
      );
    }
  }
}

async function discoverSteps() {
  const entries = await readdir(scriptsDirectory, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && /^\\d{2}-.+\\.mjs$/.test(entry.name))
    .map((entry) => ({
      number: Number.parseInt(entry.name.slice(0, 2), 10),
      file: entry.name,
      name: basename(entry.name, ".mjs"),
    }))
    .sort((left, right) => left.number - right.number);
}

function selectSteps(steps, argv) {
  const exact = argv.find((value) => /^\\d{1,2}$/.test(value));
  const throughIndex = argv.indexOf("--through");
  const fromIndex = argv.indexOf("--from");

  if (argv.includes("--all")) {
    return steps;
  }

  if (exact) {
    const number = Number.parseInt(exact, 10);
    return steps.filter((step) => step.number === number);
  }

  if (throughIndex >= 0) {
    const raw = argv[throughIndex + 1];
    if (!raw || !/^\\d{1,2}$/.test(raw)) {
      throw new Error("--through requires a numeric bootstrap step.");
    }

    const number = Number.parseInt(raw, 10);
    return steps.filter((step) => step.number <= number);
  }

  if (fromIndex >= 0) {
    const raw = argv[fromIndex + 1];
    if (!raw || !/^\\d{1,2}$/.test(raw)) {
      throw new Error("--from requires a numeric bootstrap step.");
    }

    const number = Number.parseInt(raw, 10);
    return steps.filter((step) => step.number >= number);
  }

  throw new Error(
    "Use --list, --all, --through <number>, --from <number>, or a step number.",
  );
}

function printSteps(steps) {
  console.log("Available bootstrap scripts:");

  for (const step of steps) {
    console.log(\`  \${String(step.number).padStart(2, "0")}  \${step.file}\`);
  }

  console.log("\\nExamples:");
  console.log("  node scripts/bootstrap.mjs 02");
  console.log("  node scripts/bootstrap.mjs --through 05");
  console.log("  node scripts/bootstrap.mjs --all");
}
`,

    "scripts/lib/filesystem.mjs": `import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, relative } from "node:path";

export async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function ensureDirectory(path) {
  await mkdir(path, { recursive: true });
}

export async function readJson(path) {
  const content = await readFile(path, "utf8");
  return JSON.parse(content);
}

export async function writeTextAtomic(path, content) {
  await ensureDirectory(dirname(path));
  const temporaryPath = \`\${path}.tmp-\${process.pid}-\${Date.now()}\`;

  try {
    await writeFile(temporaryPath, content, "utf8");
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
}

export async function writeJsonAtomic(path, value) {
  await writeTextAtomic(path, \`\${JSON.stringify(value, null, 2)}\\n\`);
}

export function relativePath(root, path) {
  return relative(root, path).replaceAll("\\\\", "/");
}
`,

    "scripts/lib/process.mjs": `import { spawn } from "node:child_process";

export function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    if (!options.inherit) {
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk;
      });
    }

    child.on("error", reject);
    child.on("close", (code, signal) => {
      const result = {
        code: code ?? 1,
        signal,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      };

      if (result.code !== 0 && !options.allowFailure) {
        const details = result.stderr || result.stdout;
        reject(
          new Error(
            \`\${command} \${args.join(" ")} failed with code \${result.code}\` +
              (details ? \`:\\n\${details}\` : "."),
          ),
        );
        return;
      }

      resolve(result);
    });
  });
}
`,

    "scripts/lib/git.mjs": `import { runCommand } from "./process.mjs";

export async function repositoryRoot(cwd) {
  const result = await runCommand(
    "git",
    ["rev-parse", "--show-toplevel"],
    { cwd, allowFailure: true },
  );

  return result.code === 0 ? result.stdout : null;
}

export async function currentBranch(cwd) {
  const result = await runCommand(
    "git",
    ["branch", "--show-current"],
    { cwd, allowFailure: true },
  );

  return result.code === 0 ? result.stdout : null;
}

export async function upstreamBranch(cwd) {
  const result = await runCommand(
    "git",
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    { cwd, allowFailure: true },
  );

  return result.code === 0 ? result.stdout : null;
}

export async function remotes(cwd) {
  const result = await runCommand("git", ["remote"], {
    cwd,
    allowFailure: true,
  });

  return result.code === 0
    ? result.stdout.split("\\n").map((value) => value.trim()).filter(Boolean)
    : [];
}

export async function stagedFiles(cwd) {
  const result = await runCommand(
    "git",
    ["diff", "--cached", "--name-only"],
    { cwd },
  );

  return result.stdout
    .split("\\n")
    .map((value) => value.trim())
    .filter(Boolean);
}
`,

    "scripts/lib/checkpoint.mjs": `import { currentBranch, remotes, stagedFiles, upstreamBranch } from "./git.mjs";
import { runCommand } from "./process.mjs";

export async function createCheckpoint({
  cwd,
  message,
  paths,
  push = true,
}) {
  if (!message?.trim()) {
    throw new Error("A focused commit message is required.");
  }

  if (!Array.isArray(paths) || paths.length === 0) {
    return {
      committed: false,
      pushed: false,
      reason: "No task-owned paths were supplied.",
    };
  }

  await runCommand("git", ["add", "--", ...paths], { cwd });

  const staged = await stagedFiles(cwd);
  if (staged.length === 0) {
    return {
      committed: false,
      pushed: false,
      reason: "No task-owned changes remained after validation.",
    };
  }

  await runCommand("git", ["commit", "-m", message], { cwd });

  const hash = (
    await runCommand("git", ["rev-parse", "--short", "HEAD"], { cwd })
  ).stdout;

  if (!push) {
    return { committed: true, commit: hash, pushed: false };
  }

  const upstream = await upstreamBranch(cwd);

  if (upstream) {
    const result = await runCommand("git", ["push"], {
      cwd,
      allowFailure: true,
    });

    return {
      committed: true,
      commit: hash,
      pushed: result.code === 0,
      pushError: result.code === 0 ? null : result.stderr || result.stdout,
    };
  }

  const availableRemotes = await remotes(cwd);
  const branch = await currentBranch(cwd);

  if (!availableRemotes.includes("origin") || !branch) {
    return {
      committed: true,
      commit: hash,
      pushed: false,
      pushError: "No upstream branch is configured and origin is unavailable.",
    };
  }

  const result = await runCommand(
    "git",
    ["push", "-u", "origin", branch],
    { cwd, allowFailure: true },
  );

  return {
    committed: true,
    commit: hash,
    pushed: result.code === 0,
    pushError: result.code === 0 ? null : result.stderr || result.stdout,
  };
}
`,

    "scripts/tasks/validate.mjs": `#!/usr/bin/env node

console.log(
  "The workspace validation suite is installed by a later bootstrap step.",
);
console.log("Repository foundation: available");
console.log("Application validation: not installed yet");
`,

    "scripts/tasks/start.mjs": `#!/usr/bin/env node

console.error(
  "The application server is not installed yet. Continue the bootstrap sequence first.",
);
process.exitCode = 2;
`,

    "scripts/tasks/export.mjs": `#!/usr/bin/env node

console.error(
  "The standalone export engine is not installed yet. Continue the bootstrap sequence first.",
);
process.exitCode = 2;
`,
  };
}

async function writeOwnedFile(absolutePath, content, dirtyBefore) {
  const repoRoot = getRepositoryRoot(targetRoot) ?? targetRoot;
  const gitPath = relativeGitPath(repoRoot, absolutePath);
  const exists = await pathExists(absolutePath);

  if (dirtyBefore.has(gitPath)) {
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

    report.preserved.push(gitPath);
    report.warnings.push({
      code: "EXISTING_FILE_PRESERVED",
      message:
        `${gitPath} already exists with different content and was not overwritten. ` +
        "Review it manually before replacing repository-owned infrastructure.",
    });
    return "preserved";
  }

  if (args.dryRun) {
    report.created.push(gitPath);
    return "created";
  }

  await atomicWrite(absolutePath, content);
  report.created.push(gitPath);
  return "created";
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

async function validateGeneratedState() {
  if (args.dryRun) {
    report.validation.push({
      check: "dry-run",
      ok: true,
      message: "Validation requiring generated files was skipped during dry-run.",
    });
    return;
  }

  const packagePath = join(targetRoot, "package.json");
  const packageContent = JSON.parse(await readFile(packagePath, "utf8"));

  const requiredScripts = [
    "preflight",
    "bootstrap",
    "test",
    "validate",
    "start",
    "export",
  ];

  for (const scriptName of requiredScripts) {
    if (!packageContent.scripts?.[scriptName]) {
      throw new Error(`package.json is missing the required script: ${scriptName}`);
    }
  }

  report.validation.push({
    check: "package-json",
    ok: true,
    message: "package.json is valid and contains the required commands.",
  });

  const modulePaths = [
    "scripts/bootstrap.mjs",
    "scripts/lib/filesystem.mjs",
    "scripts/lib/process.mjs",
    "scripts/lib/git.mjs",
    "scripts/lib/checkpoint.mjs",
    "scripts/tasks/validate.mjs",
    "scripts/tasks/start.mjs",
    "scripts/tasks/export.mjs",
  ];

  for (const relativePath of modulePaths) {
    const absolutePath = join(targetRoot, relativePath);
    const check = run(process.execPath, ["--check", absolutePath], {
      cwd: targetRoot,
      allowFailure: true,
    });

    if (check.status !== 0) {
      throw new Error(
        `Generated module failed syntax validation: ${relativePath}\n${check.stderr}`,
      );
    }
  }

  report.validation.push({
    check: "module-syntax",
    ok: true,
    message: `${modulePaths.length} generated modules passed Node syntax checks.`,
  });

  const bootstrapList = run(
    process.execPath,
    [join(targetRoot, "scripts", "bootstrap.mjs"), "--list"],
    { cwd: targetRoot, allowFailure: true },
  );

  if (bootstrapList.status !== 0) {
    throw new Error(
      `Bootstrap runner failed its smoke test:\n${bootstrapList.stderr || bootstrapList.stdout}`,
    );
  }

  report.validation.push({
    check: "bootstrap-runner",
    ok: true,
    message: "The bootstrap runner can discover available numbered scripts.",
  });
}

async function checkpointChanges(repoRoot, generatedPaths, dirtyBefore) {
  const candidatePaths = generatedPaths
    .map((path) => relativeGitPath(repoRoot, path))
    .filter((path) => !dirtyBefore.has(path));

  if (candidatePaths.length === 0) {
    report.warnings.push({
      code: "NO_CHECKPOINT_CHANGES",
      message: "No new task-owned changes were available to commit.",
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
        "Files were created and validated, but no commit was made because Git user.name or user.email is missing.",
    });
    return;
  }

  run("git", ["add", "--", ...candidatePaths], { cwd: repoRoot });

  const staged = run("git", ["diff", "--cached", "--name-only"], {
    cwd: repoRoot,
  }).stdout
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);

  if (staged.length === 0) {
    report.warnings.push({
      code: "NO_STAGED_CHANGES",
      message: "No task-owned changes remained to commit.",
    });
    return;
  }

  const unexpected = staged.filter((path) => !candidatePaths.includes(path));
  if (unexpected.length > 0) {
    run("git", ["reset", "--", ...unexpected], {
      cwd: repoRoot,
      allowFailure: true,
    });

    throw new Error(
      `Refused to commit unexpected staged paths: ${unexpected.join(", ")}`,
    );
  }

  run("git", ["commit", "-m", COMMIT_MESSAGE], { cwd: repoRoot });

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

function finish(exitCode) {
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(exitCode);
  }

  console.log("\nMy Dashboards — repository initialisation\n");
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
  console.log(`  Repository initialised: ${report.git.initialised ? "yes" : "already existed"}`);
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
