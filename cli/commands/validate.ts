import { resolve } from "node:path";
import {
  parseCommandArguments,
  parseIntegerOption,
} from "../command-options.js";
import {
  CliError,
  EXIT_UNSAFE_OPERATION,
  EXIT_USAGE,
  EXIT_VALIDATION,
} from "../errors.js";
import { findWorkspaceRoot } from "../../src/workspace/find-root.js";
import { writeFileAtomic } from "../../src/files/output.js";
import {
  validateWorkspace,
  type WorkspaceValidationReport,
} from "../../src/validation/workspace-validation.js";
import type { CommandDefinition } from "../types.js";

export const validateCommand: CommandDefinition = {
  name: "validate",
  summary:
    "Run consolidated workspace, artefact, recipe and export validation.",
  usage: "mydash validate [options]",
  options: [
    "--artifact <id>               Validate one artefact only.",
    "--kind <kind>                 Disambiguate its artefact kind.",
    "--skip-exports                Skip in-memory standalone export builds.",
    "--skip-recipes                Skip recipe discovery and execution checks.",
    "--minify                      Minify exports during validation.",
    "--max-bytes <number>          Maximum standalone HTML size.",
    "--fail-on-warning             Treat warnings as validation failures.",
    "--all-users                   Override config user scoping.",
    "--report <path>               Write the complete JSON report.",
    "--workspace <path>            Validate a specific workspace.",
    "--json                        Return structured JSON.",
  ],

  async run(invocation, context) {
    const parsed = parseCommandArguments(invocation.args, {
      booleans: [
        "skip-exports",
        "skip-recipes",
        "minify",
        "fail-on-warning",
        "all-users",
      ],
      values: [
        "artifact",
        "kind",
        "max-bytes",
        "report",
      ],
    });

    if (parsed.positionals.length > 0) {
      throw new CliError(
        "INVALID_USAGE",
        `Unexpected argument: ${parsed.positionals[0]}. Usage: mydash validate [options]`,
        { exitCode: EXIT_USAGE },
      );
    }

    const workspaceRoot = await findWorkspaceRoot(
      typeof invocation.options.workspace === "string"
        ? invocation.options.workspace
        : context.cwd,
    );

    if (!workspaceRoot) {
      throw new CliError(
        "WORKSPACE_NOT_FOUND",
        "No My Dashboards workspace was found.",
        { exitCode: EXIT_UNSAFE_OPERATION },
      );
    }

    const maxBytes = parseIntegerOption(parsed.options.maxBytes, {
      label: "Maximum output bytes",
      minimum: 1024,
      maximum: 200 * 1024 * 1024,
      defaultValue: 50 * 1024 * 1024,
    });

    const report = await validateWorkspace({
      workspaceRoot,
      artifactId: parsed.options.artifact,
      artifactKind: parsed.options.kind,
      validateExports: !(parsed.options.skipExports ?? false),
      validateRecipes: !(parsed.options.skipRecipes ?? false),
      minify: parsed.options.minify ?? false,
      maxBytes,
      failOnWarning: parsed.options.failOnWarning ?? false,
      allUsers: parsed.options.allUsers ?? false,
      now: context.now,
    });

    let reportOutput = null;

    if (parsed.options.report) {
      const path = resolve(workspaceRoot, parsed.options.report);
      await writeFileAtomic(
        path,
        `${JSON.stringify(report, null, 2)}\n`,
        {
          workspaceRoot,
          overwrite: true,
          encoding: "utf8",
        },
      );

      reportOutput = parsed.options.report
        .replaceAll("\\", "/")
        .replace(/^\/+/, "");
    }

    return {
      ok: report.summary.valid,
      command: "validate",
      data: {
        ...report,
        reportOutput,
      },
      warnings: report.issues
        .filter((issue) => issue.severity === "warning")
        .map((issue) => ({
          code: issue.code,
          message: issue.message,
        })),
      exitCode:
        report.summary.valid ? 0 : EXIT_VALIDATION,
      text: renderReport(report, reportOutput),
    };
  },
};

function renderReport(
  report: WorkspaceValidationReport,
  reportOutput: string | null,
): string {
  const lines = [
    `Workspace: ${report.workspace.name}`,
    `Valid: ${report.summary.valid ? "yes" : "no"}`,
    `Artefacts: ${report.summary.artifactCount}`,
    `Recipes: ${report.summary.recipeCount}`,
    `Exports validated: ${report.summary.exportValidatedCount}`,
    `Errors: ${report.summary.errorCount}`,
    `Warnings: ${report.summary.warningCount}`,
  ];

  for (const [stage, value] of Object.entries(report.stages)) {
    if (!value) continue;
    lines.push(
      `  ${stage}: ${value.status} (${value.errorCount} errors, ${value.warningCount} warnings)`,
    );
  }

  if (reportOutput) {
    lines.push(`Report: ${reportOutput}`);
  }

  if (report.issues.length > 0) {
    lines.push("");
    lines.push("Issues:");

    for (const issue of report.issues.slice(0, 30)) {
      lines.push(
        `  ${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`,
      );
    }

    if (report.issues.length > 30) {
      lines.push(
        `  … ${report.issues.length - 30} additional issues are available in JSON output.`,
      );
    }
  }

  return lines.join("\n");
}
