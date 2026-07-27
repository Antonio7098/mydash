import {
  parseCommandArguments,
  requirePositionals,
} from "../command-options.mjs";
import {
  CliError,
  EXIT_USAGE,
  EXIT_VALIDATION,
} from "../errors.mjs";
import { findWorkspaceRoot } from "../../src/workspace/find-root.mjs";
import {
  scanWorkspaceLibrary,
} from "../../src/library/scan.mjs";
import {
  findImpactTarget,
  analyseLibraryImpact,
} from "../../src/validation/impact-analysis.mjs";

const CHANGE_TYPES = new Set([
  "implementation",
  "contract",
  "appearance",
  "asset",
]);

export const impactCommand = {
  name: "impact",
  summary:
    "Report direct and transitive consumers before changing a shared resource.",
  usage: "mydash impact <resource-id> [options]",
  options: [
    "--kind <kind>                 Disambiguate the target resource.",
    "--change <type>               implementation, contract, appearance or asset.",
    "--fail-if-consumed            Exit with validation failure when consumers exist.",
    "--workspace <path>            Analyse a specific workspace.",
    "--json                        Return structured JSON.",
  ],

  async run(invocation, context) {
    const parsed = parseCommandArguments(invocation.args, {
      booleans: ["fail-if-consumed"],
      values: ["kind", "change"],
    });
    requirePositionals(
      parsed.positionals,
      1,
      "mydash impact <resource-id> [--kind <kind>]",
    );

    const changeType =
      parsed.options.change ?? "implementation";

    if (!CHANGE_TYPES.has(changeType)) {
      throw new CliError(
        "INVALID_CHANGE_TYPE",
        `Unknown change type: ${changeType}.`,
        {
          exitCode: EXIT_USAGE,
          details: {
            availableChangeTypes: [...CHANGE_TYPES],
          },
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

    const scan = await scanWorkspaceLibrary(workspaceRoot);
    const target = findImpactTarget(
      scan.entries,
      parsed.positionals[0],
      parsed.options.kind,
    );
    const data = analyseLibraryImpact(scan, target, {
      changeType,
    });
    const consumed = data.summary.transitiveConsumerCount > 0;
    const fail =
      (parsed.options.failIfConsumed ?? false) && consumed;

    return {
      ok: !fail,
      command: "impact",
      data,
      warnings: scan.issues
        .filter((issue) => issue.severity === "warning")
        .map((issue) => ({
          code: issue.code,
          message: issue.message,
        })),
      exitCode: fail ? EXIT_VALIDATION : 0,
      text: renderImpact(data),
    };
  },
};

function renderImpact(data) {
  const lines = [
    `${data.target.kind}:${data.target.id}`,
    `Scope: ${data.summary.scope}`,
    `Change: ${data.changeType}`,
    `Risk: ${data.summary.risk}`,
    `Direct consumers: ${data.summary.directConsumerCount}`,
    `Transitive consumers: ${data.summary.transitiveConsumerCount}`,
    `Affected artefacts: ${data.summary.affectedArtifactCount}`,
  ];

  if (data.affectedArtifacts.length > 0) {
    lines.push("");
    lines.push("Affected artefacts:");

    for (const artifact of data.affectedArtifacts) {
      lines.push(
        `  ${artifact.kind}:${artifact.id} — ${artifact.displayPath}`,
      );
    }
  }

  if (data.recommendations.length > 0) {
    lines.push("");
    lines.push("Recommended validation:");

    for (const recommendation of data.recommendations) {
      lines.push(`  ${recommendation}`);
    }
  }

  return lines.join("\n");
}
