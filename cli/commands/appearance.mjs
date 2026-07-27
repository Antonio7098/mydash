import {
  parseCommandArguments,
  requirePositionals,
} from "../command-options.mjs";
import { CliError, EXIT_USAGE, EXIT_VALIDATION } from "../errors.mjs";
import { findWorkspaceRoot } from "../../src/workspace/find-root.mjs";
import { scanWorkspaceLibrary } from "../../src/library/scan.mjs";
import { findArtifact } from "../../src/resolution/find-artifact.mjs";
import {
  resolveAllArtifactAppearances,
  resolveArtifactAppearance,
} from "../../src/resolution/resolve.mjs";

const SUBCOMMANDS = new Set([
  "resolve",
  "validate",
]);

export const appearanceCommand = {
  name: "appearance",
  summary: "Resolve effective themes, presets, UI and assets.",
  usage: "mydash appearance <subcommand> [artifact-id] [options]",
  options: [
    "resolve <artifact-id>          Resolve one artefact's effective appearance.",
    "validate                       Resolve and validate every artefact.",
    "--kind <kind>                  Disambiguate dashboard, presentation or concept.",
    "--workspace <path>             Resolve a specific workspace.",
    "--json                         Return structured JSON.",
  ],

  async run(invocation, context) {
    const [subcommand, ...rest] = invocation.args;

    if (!SUBCOMMANDS.has(subcommand)) {
      throw new CliError(
        "UNKNOWN_APPEARANCE_SUBCOMMAND",
        subcommand
          ? `Unknown appearance subcommand: ${subcommand}`
          : "An appearance subcommand is required.",
        {
          exitCode: EXIT_USAGE,
          details: {
            availableSubcommands: [...SUBCOMMANDS],
          },
          hint:
            "Run mydash help appearance to see available appearance operations.",
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

    if (subcommand === "resolve") {
      return runResolve(rest, workspaceRoot);
    }

    return runValidate(rest, workspaceRoot);
  },
};

async function runResolve(args, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    values: ["kind"],
  });
  requirePositionals(
    parsed.positionals,
    1,
    "mydash appearance resolve <artifact-id>",
  );

  const scan = await scanWorkspaceLibrary(workspaceRoot);
  const artifact = findArtifact(
    scan,
    parsed.positionals[0],
    parsed.options.kind,
  );
  const data = resolveArtifactAppearance(scan, artifact);

  return {
    ok: data.summary.valid,
    command: "appearance resolve",
    data,
    warnings: data.issues
      .filter((issue) => issue.severity === "warning")
      .map((issue) => ({
        code: issue.code,
        message: issue.message,
      })),
    exitCode: data.summary.valid ? 0 : EXIT_VALIDATION,
    text: renderResolution(data),
  };
}

async function runValidate(args, workspaceRoot) {
  const parsed = parseCommandArguments(args);
  if (parsed.positionals.length > 0) {
    throw new CliError(
      "INVALID_USAGE",
      `Unexpected argument: ${parsed.positionals[0]}. Usage: mydash appearance validate`,
      { exitCode: EXIT_USAGE },
    );
  }

  const scan = await scanWorkspaceLibrary(workspaceRoot);
  const data = resolveAllArtifactAppearances(scan);
  const valid = data.summary.invalidArtifactCount === 0;

  return {
    ok: valid,
    command: "appearance validate",
    data,
    exitCode: valid ? 0 : EXIT_VALIDATION,
    text: [
      `Artefacts: ${data.summary.artifactCount}`,
      `Valid: ${data.summary.validArtifactCount}`,
      `Invalid: ${data.summary.invalidArtifactCount}`,
      `Errors: ${data.summary.errorCount}`,
      `Warnings: ${data.summary.warningCount}`,
    ].join("\n"),
  };
}

function renderResolution(data) {
  const lines = [
    `${data.artifact.kind}:${data.artifact.id}`,
    `Valid: ${data.summary.valid ? "yes" : "no"}`,
    `Theme: ${selectionName(data.selections.theme)}`,
    `Preset: ${selectionName(data.selections.preset)}`,
    `Layout: ${selectionName(data.selections.layout)}`,
    `Components: ${Object.keys(data.selections.components).length}`,
    `Primitives: ${Object.keys(data.selections.primitives).length}`,
    `Assets: ${Object.keys(data.selections.assets).length}`,
    `Dependency closure: ${data.summary.dependencyCount}`,
  ];

  if (data.issues.length > 0) {
    lines.push("");
    lines.push("Issues:");

    for (const issue of data.issues) {
      lines.push(
        `  ${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`,
      );
    }
  }

  return lines.join("\n");
}

function selectionName(selection) {
  if (!selection) return "(none)";
  if (!selection.resolved) return `${selection.reference} (unresolved)`;

  const entry = selection.entry;
  const scope =
    entry.level === "collection"
      ? `collection:${entry.collection}`
      : entry.level === "local"
        ? `local:${entry.ownerArtifact}`
        : entry.level ?? "shared";

  return `${entry.id} [${scope}] via ${selection.source}`;
}
