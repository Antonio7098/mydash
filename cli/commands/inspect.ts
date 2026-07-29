import { parseCommandArguments, requirePositionals } from "../command-options.js";
import { inspectPath, type InspectPathResult } from "../../src/files/inspect.js";
import { resolveCommandPath } from "../../src/files/paths.js";
import { findWorkspaceRoot } from "../../src/workspace/find-root.js";
import type { CommandContext, CommandDefinition } from "../types.js";

export const inspectCommand: CommandDefinition = {
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

    const workspaceRoot = (await findWorkspaceRoot(
      typeof invocation.options.workspace === "string"
        ? invocation.options.workspace
        : context.cwd,
    )) ?? undefined;

    const path = await resolveCommandPath(parsed.positionals[0], {
      cwd: context.cwd,
      workspaceRoot,
      allowOutside: parsed.options.allowOutside ?? false,
      mustExist: true,
    });

    const data = await inspectPath(path, {
      workspaceRoot: workspaceRoot ?? undefined,
    });

    return {
      ok: true,
      command: "inspect",
      data,
      text: renderInspection(data),
    };
  },
};

function renderInspection(data: InspectPathResult): string {
  const lines = [
    `${data.name}`,
    `Type: ${data.type}`,
    `Path: ${data.displayPath}`,
  ];

  if (data.mediaType) {
    lines.push(`Media type: ${data.mediaType}`);
  }

  if (data.sizeBytes !== null) {
    lines.push(`Size: ${data.sizeBytes} bytes`);
  }

  if (data.recommendedCommands.length > 0) {
    lines.push("");
    lines.push("Recommended commands:");

    for (const command of data.recommendedCommands) {
      lines.push(`  ${command}`);
    }
  }

  return lines.join("\n");
}
