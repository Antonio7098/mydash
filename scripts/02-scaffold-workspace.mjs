#!/usr/bin/env node

/**
 * My Dashboards — Bootstrap 02: Scaffold workspace
 *
 * Creates the complete infrastructure-first directory structure.
 * It adds no application behaviour, dependencies, schemas, dashboards, or UI.
 *
 * Safe defaults:
 * - rerunnable;
 * - never overwrites differing existing files;
 * - stages and commits only files created by this step;
 * - never force-pushes;
 * - leaves unrelated working-tree and staged changes untouched.
 *
 * Usage:
 *   node scripts/02-scaffold-workspace.mjs
 *   node scripts/02-scaffold-workspace.mjs --dry-run
 *   node scripts/02-scaffold-workspace.mjs --no-commit
 *   node scripts/02-scaffold-workspace.mjs --no-push
 *   node scripts/02-scaffold-workspace.mjs --json
 *   node scripts/02-scaffold-workspace.mjs --target /path/to/my-dashboards
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
import { spawnSync } from "node:child_process";
import process from "node:process";

const SCRIPT_NAME = "02-scaffold-workspace";
const COMMIT_MESSAGE = "Scaffold workspace directories";
const MIN_NODE_MAJOR = 20;

const args = parseArgs(process.argv.slice(2));
const targetRoot = resolve(args.target ?? process.cwd());

const report = {
  ok: false,
  script: SCRIPT_NAME,
  targetRoot,
  dryRun: args.dryRun,
  createdDirectories: [],
  createdFiles: [],
  preservedFiles: [],
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
      "Bootstrap 02 must run from the root of the My Dashboards Git repository.",
    );
  }

  const dirtyBefore = getDirtyPaths(repoRoot);
  const files = buildWorkspaceFiles();
  const createdAbsolutePaths = [];

  for (const relativePath of requiredDirectories()) {
    await ensureDirectory(join(targetRoot, relativePath));
  }

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = join(targetRoot, relativePath);
    const result = await createFileIfAbsent(
      absolutePath,
      content,
      dirtyBefore,
      repoRoot,
    );

    if (result === "created") {
      createdAbsolutePaths.push(absolutePath);
    }
  }

  await validateWorkspace(files);

  if (!args.noCommit && !args.dryRun) {
    await checkpoint(repoRoot, createdAbsolutePaths);
  } else if (args.noCommit) {
    report.warnings.push({
      code: "COMMIT_DISABLED",
      message: "Files were created and validated, but --no-commit disabled the Git checkpoint.",
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
My Dashboards — Bootstrap 02

Usage:
  node scripts/02-scaffold-workspace.mjs [options]

Options:
  --target <path>  Scaffold a specific repository root.
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
    "scripts/bootstrap.mjs",
    "scripts/lib/filesystem.mjs",
    "scripts/lib/process.mjs",
    "scripts/lib/git.mjs",
    "scripts/lib/checkpoint.mjs",
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
        "Bootstrap 01 has not been completed.",
        `Missing foundation files: ${missing.join(", ")}`,
      ].join("\n"),
    );
  }
}

function requiredDirectories() {
  return [
    "app",
    "bin",
    "cli",
    "cli/commands",
    "server",
    "src",
    "src/workspace",
    "src/files",
    "src/office",
    "src/data",
    "src/library",
    "src/resolution",
    "src/export",
    "src/validation",
    "src/git",
    "config",
    "config/schemas",
    "library",
    "library/dashboards",
    "library/presentations",
    "library/concepts",
    "library/ui",
    "library/ui/primitives",
    "library/ui/primitives/core",
    "library/ui/primitives/collections",
    "library/ui/components",
    "library/ui/components/core",
    "library/ui/components/collections",
    "library/ui/layouts",
    "library/ui/layouts/core",
    "library/ui/layouts/collections",
    "library/themes",
    "library/themes/core",
    "library/themes/collections",
    "library/presets",
    "library/presets/core",
    "library/presets/collections",
    "library/assets",
    "library/assets/core",
    "library/assets/collections",
    "skills",
    "users",
    "tests",
    "tests/unit",
    "tests/integration",
    "tests/fixtures",
  ];
}

function buildWorkspaceFiles() {
  const marker = (purpose) =>
    `# Intentionally retained\n\n${purpose}\n\n` +
    "Implementation is added by a later bootstrap step.\n";

  return {
    "app/README.md": `# Navigator application

This directory will contain the minimal browser interface for discovering, previewing and exporting artefacts.

The navigator is deliberately implemented after the shared services, CLI, discovery, resolution, validation and export systems.
`,

    "bin/README.md": `# Executable entry points

This directory will contain executable wrappers such as the \`mydash\` command.

Command logic belongs in \`cli/\`; reusable behaviour belongs in \`src/\`.
`,

    "cli/README.md": `# Agent-facing CLI

The CLI is a deterministic interface for agents and technical users.

Its commands will delegate to shared application services in \`src/\` rather than reimplementing behaviour.

Planned command groups include:

- workspace and diagnostics;
- file inspection;
- Excel and PowerPoint analysis;
- data preparation;
- library discovery;
- appearance resolution;
- validation;
- standalone export;
- constrained Git checkpoints.
`,

    "cli/commands/.gitkeep": marker(
      "Agent-facing command implementations will live here.",
    ),

    "server/README.md": `# HTTP server

This directory will contain the lightweight Express interface used by the navigator.

The server will call the same shared services as the CLI. It must not become a second implementation of discovery, resolution, export or validation.
`,

    "src/README.md": `# Shared application services

This is the functional core of My Dashboards.

Both the CLI and HTTP server will call these modules:

- \`workspace/\` — workspace configuration and path rules;
- \`files/\` — safe filesystem operations;
- \`office/\` — Excel and PowerPoint inspection and extraction;
- \`data/\` — deterministic data preparation;
- \`library/\` — filesystem discovery and consumer analysis;
- \`resolution/\` — themes, presets, layouts, components, primitives and assets;
- \`export/\` — standalone HTML generation;
- \`validation/\` — workspace and artefact validation;
- \`git/\` — constrained checkpoint operations.
`,

    "src/workspace/.gitkeep": marker(
      "Workspace discovery, configuration and safe path rules will live here.",
    ),
    "src/files/.gitkeep": marker(
      "Safe filesystem identification, hashing and atomic-write services will live here.",
    ),
    "src/office/.gitkeep": marker(
      "Excel and PowerPoint inspection and extraction services will live here.",
    ),
    "src/data/.gitkeep": marker(
      "Deterministic CSV and JSON profiling and transformation services will live here.",
    ),
    "src/library/.gitkeep": marker(
      "Filesystem library discovery and reverse-consumer analysis will live here.",
    ),
    "src/resolution/.gitkeep": marker(
      "Theme, preset, layout, component, primitive and asset resolution will live here.",
    ),
    "src/export/.gitkeep": marker(
      "Standalone HTML composition and asset inlining will live here.",
    ),
    "src/validation/.gitkeep": marker(
      "Schema, reference, consumer and export-safety validation will live here.",
    ),
    "src/git/.gitkeep": marker(
      "Constrained commit and push services will live here.",
    ),

    "config/README.md": `# Workspace configuration

Configuration is file-based and version-controlled.

JSON schemas are added by Bootstrap 03. No manually maintained dashboard index will be stored here; artefacts are discovered from the filesystem.
`,

    "config/schemas/.gitkeep": marker(
      "JSON schemas for workspace and library manifests will live here.",
    ),

    "library/README.md": `# Artefact and design library

The filesystem is the source of truth.

## Artefacts

- \`dashboards/\`
- \`presentations/\`
- \`concepts/\`

Each artefact owns its content, data and any genuinely local UI.

## Shared UI

Shared UI is divided into:

\`\`\`text
Primitives → Components → Layouts
\`\`\`

Each category has:

- \`core/\` — broadly trusted, stable implementations;
- \`collections/\` — narrower reusable families.

New UI normally starts locally inside an artefact. It moves to a collection after demonstrated reuse and reaches Core only after its contract and usefulness have stabilised.

## Appearance

- \`themes/\` define visual tokens;
- \`presets/\` map layouts, components and primitives;
- \`assets/\` stores approved logos, icons, images, illustrations and fonts.
`,

    "library/dashboards/.gitkeep": marker(
      "Dashboard artefact folders will be discovered here.",
    ),
    "library/presentations/.gitkeep": marker(
      "HTML presentation artefact folders will be discovered here.",
    ),
    "library/concepts/.gitkeep": marker(
      "Interactive concept artefact folders will be discovered here.",
    ),

    "library/ui/README.md": `# Shared UI

The shared UI library has three abstraction levels:

1. **Primitives** — context-free controls and visual building blocks.
2. **Components** — reusable semantic interface elements.
3. **Layouts** — page-level composition patterns and named regions.

The default selection order is Core, then relevant collections. New implementations begin locally unless real reuse already exists.
`,

    "library/ui/primitives/core/.gitkeep": marker(
      "Trusted, context-free Core primitives will live here.",
    ),
    "library/ui/primitives/collections/.gitkeep": marker(
      "Reusable collection-specific primitives will live here.",
    ),
    "library/ui/components/core/.gitkeep": marker(
      "Trusted, broadly reusable Core components will live here.",
    ),
    "library/ui/components/collections/.gitkeep": marker(
      "Reusable domain or style collection components will live here.",
    ),
    "library/ui/layouts/core/.gitkeep": marker(
      "A deliberately small set of stable Core layouts will live here.",
    ),
    "library/ui/layouts/collections/.gitkeep": marker(
      "Reusable collection-specific layouts will live here.",
    ),

    "library/themes/README.md": `# Themes

Themes define visual tokens and brand defaults such as colours, typography, spacing, radii, shadows and density.

Themes do not choose page structure. Structural mappings belong to presets.
`,

    "library/themes/core/.gitkeep": marker(
      "Trusted Core themes such as HSBC Light and HSBC Dark will live here.",
    ),
    "library/themes/collections/.gitkeep": marker(
      "Narrower reusable theme collections will live here.",
    ),

    "library/presets/README.md": `# UI presets

Presets select compatible layout, component and primitive implementations for an artefact.

They complement themes:

- themes define visual language;
- presets define structural implementation mappings.
`,

    "library/presets/core/.gitkeep": marker(
      "Stable Core UI presets will live here.",
    ),
    "library/presets/collections/.gitkeep": marker(
      "Collection-specific UI presets will live here.",
    ),

    "library/assets/README.md": `# Assets

Approved logos, icons, illustrations, images, backgrounds and fonts live here.

Assets may be local, collection-level or Core. Shared assets will have manifests describing intended usage and export compatibility.
`,

    "library/assets/core/.gitkeep": marker(
      "Trusted shared assets will live here.",
    ),
    "library/assets/collections/.gitkeep": marker(
      "Collection-specific shared assets will live here.",
    ),

    "docs/agent-workflows/README.md": `# Agent workflows

These references support skills in \`.claude/skills/\`. Deterministic operations
should be delegated to the \`mydash\` CLI.

Planned skills:

- \`/my-dashboard\`
- \`/help\`
- \`/spreadsheet\`
- \`/powerpoint\`
- \`/dashboard\`
- \`/presentation\`
- \`/concept\`
- \`/component\`
- \`/hsbc-visual-standards\`

\`/my-dashboard\` indexes and explains these skills. It does not maintain an index of artefacts.
`,

    "users/README.md": `# Local user preferences

This directory may contain lightweight, file-based preferences such as favourites, recent items and preview appearance.

It is not an authentication system.
`,

    "tests/README.md": `# Tests

- \`unit/\` — isolated service and contract behaviour;
- \`integration/\` — boundaries between shared services, CLI, server and filesystem;
- \`fixtures/\` — intentionally small test workbooks, presentations, manifests and artefacts.

Tests should remain proportional to actual risk and complexity.
`,

    "tests/unit/.gitkeep": marker(
      "Unit tests will live here.",
    ),
    "tests/integration/.gitkeep": marker(
      "Integration tests will live here.",
    ),
    "tests/fixtures/.gitkeep": marker(
      "Small deterministic test fixtures will live here.",
    ),
  };
}

async function ensureDirectory(path) {
  const relativePath = relativeToRoot(path);

  if (args.dryRun) {
    if (!(await pathExists(path))) {
      report.createdDirectories.push(relativePath);
    }
    return;
  }

  const existed = await pathExists(path);
  await mkdir(path, { recursive: true });

  if (!existed) {
    report.createdDirectories.push(relativePath);
  }
}

async function createFileIfAbsent(
  absolutePath,
  content,
  dirtyBefore,
  repoRoot,
) {
  const gitPath = relativeGitPath(repoRoot, absolutePath);
  const exists = await pathExists(absolutePath);

  if (dirtyBefore.has(gitPath)) {
    report.preservedFiles.push(gitPath);
    report.warnings.push({
      code: "PREEXISTING_FILE_CHANGES",
      message: `Preserved pre-existing changes in ${gitPath}.`,
    });
    return "preserved";
  }

  if (exists) {
    const current = await readFile(absolutePath, "utf8");

    if (current !== content) {
      report.warnings.push({
        code: "EXISTING_FILE_PRESERVED",
        message: `${gitPath} already exists with different content and was not overwritten.`,
      });
    }

    report.preservedFiles.push(gitPath);
    return "preserved";
  }

  if (args.dryRun) {
    report.createdFiles.push(gitPath);
    return "created";
  }

  await atomicWrite(absolutePath, content);
  report.createdFiles.push(gitPath);
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

async function validateWorkspace(expectedFiles) {
  if (args.dryRun) {
    report.validation.push({
      check: "dry-run",
      ok: true,
      message: "The complete intended tree was calculated without writing it.",
    });
    return;
  }

  const missingDirectories = [];

  for (const relativePath of requiredDirectories()) {
    const absolutePath = join(targetRoot, relativePath);

    if (!(await isDirectory(absolutePath))) {
      missingDirectories.push(relativePath);
    }
  }

  if (missingDirectories.length > 0) {
    throw new Error(
      `Workspace validation found missing directories: ${missingDirectories.join(", ")}`,
    );
  }

  report.validation.push({
    check: "directory-tree",
    ok: true,
    message: `${requiredDirectories().length} required directories exist.`,
  });

  const missingFiles = [];

  for (const relativePath of Object.keys(expectedFiles)) {
    if (!(await pathExists(join(targetRoot, relativePath)))) {
      missingFiles.push(relativePath);
    }
  }

  if (missingFiles.length > 0) {
    throw new Error(
      `Workspace validation found missing marker files: ${missingFiles.join(", ")}`,
    );
  }

  report.validation.push({
    check: "tracked-markers",
    ok: true,
    message: `${Object.keys(expectedFiles).length} documentation and marker files exist.`,
  });

  const forbidden = [
    "library/index.json",
    "library/dashboards.json",
    "config/artifacts.json",
  ];

  const presentForbidden = [];

  for (const relativePath of forbidden) {
    if (await pathExists(join(targetRoot, relativePath))) {
      presentForbidden.push(relativePath);
    }
  }

  if (presentForbidden.length > 0) {
    report.warnings.push({
      code: "MANUAL_INDEX_PRESENT",
      message:
        "A manually maintained artefact index is present and may become stale: " +
        presentForbidden.join(", "),
    });
  } else {
    report.validation.push({
      check: "filesystem-discovery",
      ok: true,
      message: "No manually maintained artefact index was introduced.",
    });
  }
}

async function checkpoint(repoRoot, createdAbsolutePaths) {
  const ownedPaths = createdAbsolutePaths.map((path) =>
    relativeGitPath(repoRoot, path),
  );

  if (ownedPaths.length === 0) {
    report.warnings.push({
      code: "NO_CHECKPOINT_CHANGES",
      message: "The workspace was already scaffolded; there were no new files to commit.",
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

  // `git commit --only -- <paths>` creates a focused commit from only the
  // task-owned paths and leaves unrelated staged changes in the index.
  const commitResult = run(
    "git",
    ["commit", "--only", "-m", COMMIT_MESSAGE, "--", ...ownedPaths],
    { cwd: repoRoot, allowFailure: true },
  );

  if (commitResult.status !== 0) {
    const status = run(
      "git",
      ["status", "--porcelain=v1", "--", ...ownedPaths],
      { cwd: repoRoot, allowFailure: true },
    );

    if (!status.stdout) {
      report.warnings.push({
        code: "NO_COMMIT_NEEDED",
        message: "No task-owned changes remained to commit.",
      });
      return;
    }

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

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function relativeToRoot(path) {
  return normaliseGitPath(relative(targetRoot, path));
}

function relativeGitPath(repoRoot, path) {
  return normaliseGitPath(relative(repoRoot, path));
}

function normaliseGitPath(path) {
  return path.replaceAll("\\", "/");
}

function finish(exitCode) {
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(exitCode);
  }

  console.log("\nMy Dashboards — workspace scaffold\n");
  console.log(`Target: ${report.targetRoot}`);
  console.log(`Result: ${report.ok ? "PASS" : "FAIL"}`);
  console.log(`Mode: ${report.dryRun ? "dry-run" : "write"}`);

  printSection("Created directories", report.createdDirectories);
  printSection("Created files", report.createdFiles);
  printSection("Preserved files", report.preservedFiles);

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
