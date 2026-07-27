import { resolve } from "node:path";
import {
  parseCommandArguments,
  parseIntegerOption,
  requirePositionals,
} from "../command-options.mjs";
import {
  CliError,
  EXIT_USAGE,
  EXIT_VALIDATION,
} from "../errors.mjs";
import { findWorkspaceRoot } from "../../src/workspace/find-root.mjs";
import { loadWorkspaceConfig } from "../../src/workspace/load-config.mjs";
import { scanWorkspaceLibrary } from "../../src/library/scan.mjs";
import { findArtifact } from "../../src/resolution/find-artifact.mjs";
import {
  resolveArtifactAppearance,
} from "../../src/resolution/resolve.mjs";
import {
  buildStandaloneArtifact,
  exportStandaloneArtifact,
} from "../../src/export/export-artifact.mjs";

const SUBCOMMANDS = new Set([
  "inspect",
  "dependencies",
  "validate",
  "export",
]);

export const artifactCommand = {
  name: "artifact",
  summary: "Inspect, validate and export standalone artefacts.",
  usage: "mydash artifact <subcommand> <artifact-id> [options]",
  options: [
    "inspect <id>                  Inspect an artefact and its effective appearance.",
    "dependencies <id>             List its complete resolved dependency closure.",
    "validate <id>                 Build and validate a standalone export in memory.",
    "export <id>                   Write one self-contained HTML file.",
    "--kind <kind>                 Disambiguate dashboard, presentation or concept.",
    "--output <path>               Override the configured export path.",
    "--overwrite                   Replace an existing export explicitly.",
    "--minify                      Minify bundled JavaScript and CSS.",
    "--max-bytes <number>          Maximum final HTML size.",
    "--all-users                   Override config user scoping.",
    "--workspace <path>            Use a specific workspace.",
    "--json                        Return structured JSON.",
  ],

  async run(invocation, context) {
    const [subcommand, ...rest] = invocation.args;

    if (!SUBCOMMANDS.has(subcommand)) {
      throw new CliError(
        "UNKNOWN_ARTIFACT_SUBCOMMAND",
        subcommand
          ? `Unknown artifact subcommand: ${subcommand}`
          : "An artifact subcommand is required.",
        {
          exitCode: EXIT_USAGE,
          details: {
            availableSubcommands: [...SUBCOMMANDS],
          },
          hint:
            "Run mydash help artifact to see available artifact operations.",
        },
      );
    }

    const workspaceRoot = await findWorkspaceRoot(
      invocation.options.workspace ?? context.cwd,
    );

    if (!workspaceRoot) {
      throw new CliError(
        "WORKSPACE_NOT_FOUND",
        "No My Dashboards workspace was found.",
        { exitCode: EXIT_USAGE },
      );
    }

    switch (subcommand) {
      case "inspect":
        return runInspect(rest, workspaceRoot);
      case "dependencies":
        return runDependencies(rest, workspaceRoot);
      case "validate":
        return runValidate(rest, workspaceRoot);
      case "export":
        return runExport(rest, workspaceRoot);
      default:
        throw new Error("Unreachable artifact subcommand.");
    }
  },
};

async function runInspect(args, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    booleans: ["all-users"],
    values: ["kind"],
  });
  requirePositionals(
    parsed.positionals,
    1,
    "mydash artifact inspect <artifact-id>",
  );

  const { artifact, resolution } = await loadResolvedArtifact(
    workspaceRoot,
    parsed.positionals[0],
    parsed.options.kind,
    parsed.options.allUsers,
  );

  return {
    ok: resolution.summary.valid,
    command: "artifact inspect",
    data: {
      artifact: {
        id: artifact.id,
        kind: artifact.kind,
        title: artifact.title,
        userId: artifact.userId,
        entry: artifact.manifest.entry,
        displayPath: artifact.displayPath,
      },
      appearance: resolution,
    },
    exitCode: resolution.summary.valid ? 0 : EXIT_VALIDATION,
    text: [
      `${artifact.kind}:${artifact.id}`,
      `Title: ${artifact.title}`,
      `User: ${artifact.userId}`,
      `Entry: ${artifact.manifest.entry}`,
      `Appearance valid: ${resolution.summary.valid ? "yes" : "no"}`,
      `Resolved dependencies: ${resolution.summary.dependencyCount}`,
    ].join("\n"),
  };
}

async function runDependencies(args, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    booleans: ["all-users"],
    values: ["kind"],
  });
  requirePositionals(
    parsed.positionals,
    1,
    "mydash artifact dependencies <artifact-id>",
  );

  const { resolution } = await loadResolvedArtifact(
    workspaceRoot,
    parsed.positionals[0],
    parsed.options.kind,
    parsed.options.allUsers,
  );

  return {
    ok: resolution.summary.valid,
    command: "artifact dependencies",
    data: {
      artifact: resolution.artifact,
      dependencies: resolution.dependencyClosure,
      edges: resolution.edges,
      issues: resolution.issues,
    },
    exitCode: resolution.summary.valid ? 0 : EXIT_VALIDATION,
    text:
      resolution.dependencyClosure.length > 0
        ? resolution.dependencyClosure
            .map(
              (entry) =>
                `${entry.kind.padEnd(10)} ${entry.id.padEnd(28)} ${entry.displayPath}`,
            )
            .join("\n")
        : "The artefact has no resolved shared dependencies.",
  };
}

async function runValidate(args, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    booleans: ["minify", "all-users"],
    values: ["kind", "max-bytes"],
  });
  requirePositionals(
    parsed.positionals,
    1,
    "mydash artifact validate <artifact-id>",
  );

  const maxBytes = parseIntegerOption(parsed.options.maxBytes, {
    label: "Maximum output bytes",
    minimum: 1024,
    maximum: 200 * 1024 * 1024,
    defaultValue: 50 * 1024 * 1024,
  });
  const { scan, artifact, resolution } =
    await loadResolvedArtifact(
      workspaceRoot,
      parsed.positionals[0],
      parsed.options.kind,
      parsed.options.allUsers,
    );

  assertResolutionValid(resolution);

  const data = await buildStandaloneArtifact({
    workspaceRoot,
    scan,
    artifact,
    resolution,
    minify: parsed.options.minify ?? false,
    maxBytes,
  });

  return {
    ok: data.validation.valid,
    command: "artifact validate",
    data: {
      artifact: data.artifact,
      sizeBytes: data.sizeBytes,
      sha256: data.sha256,
      resources: data.resources,
      validation: data.validation,
      warnings: data.warnings,
    },
    exitCode: data.validation.valid ? 0 : EXIT_VALIDATION,
    text: renderValidation(data),
  };
}

async function runExport(args, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    booleans: ["overwrite", "minify", "all-users"],
    values: ["kind", "output", "max-bytes"],
  });
  requirePositionals(
    parsed.positionals,
    1,
    "mydash artifact export <artifact-id>",
  );

  const maxBytes = parseIntegerOption(parsed.options.maxBytes, {
    label: "Maximum output bytes",
    minimum: 1024,
    maximum: 200 * 1024 * 1024,
    defaultValue: 50 * 1024 * 1024,
  });
  const { scan, artifact, resolution } =
    await loadResolvedArtifact(
      workspaceRoot,
      parsed.positionals[0],
      parsed.options.kind,
      parsed.options.allUsers,
    );

  assertResolutionValid(resolution);

  const config = await loadWorkspaceConfig(workspaceRoot);
  const outputPath = parsed.options.output
    ? resolve(workspaceRoot, parsed.options.output)
    : resolve(
        workspaceRoot,
        config.export.outputDirectory,
        `${artifact.id}.html`,
      );

  const data = await exportStandaloneArtifact({
    workspaceRoot,
    scan,
    artifact,
    resolution,
    outputPath,
    overwrite: parsed.options.overwrite ?? false,
    minify: parsed.options.minify ?? false,
    maxBytes,
  });

  return {
    ok: true,
    command: "artifact export",
    data,
    warnings: data.warnings,
    text: [
      `Exported ${artifact.kind}:${artifact.id}`,
      `Output: ${data.output.displayPath}`,
      `Size: ${data.sizeBytes} bytes`,
      `SHA-256: ${data.sha256}`,
    ].join("\n"),
  };
}

async function loadResolvedArtifact(
  workspaceRoot,
  artifactId,
  kind,
  allUsers = false,
) {
  const scan = await scanWorkspaceLibrary(workspaceRoot);
  const artifact = findArtifact(
    scan,
    artifactId,
    kind,
    allUsers ? null : scan.config.userId,
  );
  const resolution = resolveArtifactAppearance(scan, artifact);

  return {
    scan,
    artifact,
    resolution,
  };
}

function assertResolutionValid(resolution) {
  if (resolution.summary.valid) return;

  throw new CliError(
    "ARTIFACT_RESOLUTION_INVALID",
    `Artefact ${resolution.artifact.kind}:${resolution.artifact.id} cannot be exported because appearance resolution failed.`,
    {
      exitCode: EXIT_VALIDATION,
      details: {
        issues: resolution.issues,
      },
    },
  );
}

function renderValidation(data) {
  const lines = [
    `${data.artifact.kind}:${data.artifact.id}`,
    `Standalone: ${data.validation.valid ? "yes" : "no"}`,
    `Size: ${data.sizeBytes} bytes`,
    `SHA-256: ${data.sha256}`,
    `Inlined stylesheets: ${data.resources.stylesheets}`,
    `Bundled scripts: ${data.resources.scripts}`,
    `Embedded data files: ${data.resources.dataFiles}`,
    `Embedded assets: ${data.resources.assets}`,
    `Injected UI resources: ${data.resources.uiResources}`,
  ];

  if (data.validation.issues.length > 0) {
    lines.push("");
    lines.push("Issues:");

    for (const issue of data.validation.issues) {
      lines.push(`  ${issue.code}: ${issue.message}`);
    }
  }

  return lines.join("\n");
}
