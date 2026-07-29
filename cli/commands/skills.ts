import {
  parseCommandArguments,
  requirePositionals,
} from "../command-options.js";
import {
  CliError,
  EXIT_UNSAFE_OPERATION,
  EXIT_USAGE,
  EXIT_VALIDATION,
} from "../errors.js";
import {
  findWorkspaceRoot,
} from "../../src/workspace/find-root.js";
import {
  discoverProjectSkills,
  type SkillEntry,
} from "../../src/skills/discover.js";
import {
  validateProjectSkills,
} from "../../src/skills/validate.js";
import type { CommandDefinition } from "../types.js";

const SUBCOMMANDS = new Set([
  "list",
  "inspect",
  "validate",
]);

export const skillsCommand: CommandDefinition = {
  name: "skills",
  summary:
    "List, inspect and validate project agent skills.",
  usage:
    "mydash skills <list|inspect|validate> [command]",
  options: [
    "list                          List active project skill commands.",
    "inspect <command>             Show one skill's metadata and instructions.",
    "validate                      Validate the complete skill catalogue.",
    "--workspace <path>            Use a specific workspace.",
    "--json                        Return structured JSON.",
  ],

  async run(invocation, context) {
    const [subcommand, ...rest] = invocation.args;

    if (subcommand === undefined || !SUBCOMMANDS.has(subcommand)) {
      throw new CliError(
        "UNKNOWN_SKILLS_SUBCOMMAND",
        subcommand
          ? `Unknown skills subcommand: ${subcommand}`
          : "A skills subcommand is required.",
        {
          exitCode: EXIT_USAGE,
          details: {
            availableSubcommands: [...SUBCOMMANDS],
          },
          hint:
            "Run mydash help skills to see available skill operations.",
        },
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

    if (subcommand === "list") {
      return runList(rest, workspaceRoot);
    }

    if (subcommand === "inspect") {
      return runInspect(rest, workspaceRoot);
    }

    return runValidate(rest, workspaceRoot);
  },
};

async function runList(args: readonly string[], workspaceRoot: string) {
  const parsed = parseCommandArguments(args);

  if (parsed.positionals.length > 0) {
    throw invalidUsage(
      parsed.positionals[0] as string,
      "mydash skills list",
    );
  }

  const discovered = await discoverProjectSkills(workspaceRoot);
  const entries = discovered.entries.map(publicEntry);

  return {
    ok: !discovered.diagnostics.some(
      (issue) => issue.severity === "error",
    ),
    command: "skills list",
    data: {
      entries,
      diagnostics: discovered.diagnostics,
      count: entries.length,
    },
    text:
      entries.length > 0
        ? entries
            .map(
              (entry) =>
                `/${entry.command.padEnd(24)} ${entry.description}`,
            )
            .join("\n")
        : "No project skills found.",
  };
}

async function runInspect(args: readonly string[], workspaceRoot: string) {
  const parsed = parseCommandArguments(args);
  requirePositionals(
    parsed.positionals,
    1,
    "mydash skills inspect <command>",
  );

  const discovered = await discoverProjectSkills(workspaceRoot);
  const entry = discovered.entries.find(
    (candidate) => candidate.command === parsed.positionals[0],
  );

  if (!entry) {
    throw new CliError(
      "SKILL_NOT_FOUND",
      `No project skill found for /${parsed.positionals[0]}.`,
      { exitCode: EXIT_USAGE },
    );
  }

  const valid = entry.errors.length === 0;
  return {
    ok: valid,
    command: "skills inspect",
    data: {
      ...publicEntry(entry),
      frontmatter: entry.frontmatter,
      body: entry.body,
      errors: entry.errors,
    },
    exitCode: valid ? 0 : EXIT_VALIDATION,
    text: [
      `/${entry.command}`,
      `Name: ${entry.displayName}`,
      `Description: ${entry.description}`,
      `User invocable: ${entry.userInvocable ? "yes" : "no"}`,
      `Model invocable: ${entry.modelInvocable ? "yes" : "no"}`,
      `Path: ${entry.displayPath}`,
      `Lines: ${entry.lineCount}`,
    ].join("\n"),
  };
}

async function runValidate(args: readonly string[], workspaceRoot: string) {
  const parsed = parseCommandArguments(args);

  if (parsed.positionals.length > 0) {
    throw invalidUsage(
      parsed.positionals[0] as string,
      "mydash skills validate",
    );
  }

  const result = await validateProjectSkills(workspaceRoot);

  return {
    ok: result.summary.valid,
    command: "skills validate",
    data: {
      summary: result.summary,
      issues: result.issues,
      entries: result.entries.map((entry) =>
        publicEntry(entry as unknown as SkillEntry),
      ),
    },
    warnings: result.issues
      .filter((issue) => issue.severity === "warning")
      .map((issue) => ({
        code: issue.code,
        message: issue.message,
      })),
    exitCode:
      result.summary.valid ? 0 : EXIT_VALIDATION,
    text: [
      `Logical skills: ${result.summary.logicalSkillCount}`,
      `Commands: ${result.summary.commandCount}`,
      `Errors: ${result.summary.errorCount}`,
      `Warnings: ${result.summary.warningCount}`,
      `Valid: ${result.summary.valid ? "yes" : "no"}`,
    ].join("\n"),
  };
}

function publicEntry(entry: SkillEntry) {
  return {
    command: entry.command,
    displayName: entry.displayName,
    description: entry.description,
    argumentHint:
      entry.frontmatter["argument-hint"] ?? null,
    userInvocable: entry.userInvocable,
    modelInvocable: entry.modelInvocable,
    displayPath: entry.displayPath,
    lineCount: entry.lineCount,
    valid: entry.errors.length === 0,
  };
}

function invalidUsage(argument: string, usage: string): CliError {
  return new CliError(
    "INVALID_USAGE",
    `Unexpected argument: ${argument}. Usage: ${usage}`,
    { exitCode: EXIT_USAGE },
  );
}
