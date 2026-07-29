import {
  parseCommandArguments,
  requirePositionals,
} from "../command-options.js";
import {
  CliError,
  EXIT_OPERATION_FAILED,
  EXIT_UNSAFE_OPERATION,
  EXIT_USAGE,
} from "../errors.js";
import {
  findWorkspaceRoot,
} from "../../src/workspace/find-root.js";
import {
  checkpointWorkspace,
  type CheckpointReport,
} from "../../src/git/checkpoint.js";
import {
  GitSafetyError,
} from "../../src/git/errors.js";
import {
  getRepositoryStatus,
  type RepositoryStatus,
} from "../../src/git/status.js";
import type { CommandContext, CommandDefinition, Warning } from "../types.js";

const SUBCOMMANDS = new Set([
  "status",
  "checkpoint",
]);

export const gitCommand: CommandDefinition = {
  name: "git",
  summary:
    "Inspect repository state and create validated focused checkpoints.",
  usage: "mydash git <status|checkpoint> [paths...] [options]",
  options: [
    "status                         Show branch, upstream and working-tree state.",
    "checkpoint <path...>           Validate and commit only explicit paths.",
    "--message <text>               Required checkpoint commit message.",
    "--acknowledge-impact           Confirm reviewed shared-resource consumers.",
    "--fail-on-warning              Treat validation warnings as failures.",
    "--all-users                   Validate artifacts for every user.",
    "--dry-run                      Validate and analyse without committing.",
    "--no-push                      Commit locally without pushing.",
    "--workspace <path>             Use a specific workspace repository.",
    "--json                         Return structured JSON.",
  ],

  async run(invocation, context) {
    const [subcommand, ...rest] = invocation.args;

    if (subcommand === undefined || !SUBCOMMANDS.has(subcommand)) {
      throw new CliError(
        "UNKNOWN_GIT_SUBCOMMAND",
        subcommand
          ? `Unknown Git subcommand: ${subcommand}`
          : "A Git subcommand is required.",
        {
          exitCode: EXIT_USAGE,
          details: {
            availableSubcommands: [...SUBCOMMANDS],
          },
          hint: "Run mydash help git to see available Git operations.",
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

    try {
      if (subcommand === "status") {
        return runStatus(rest, workspaceRoot);
      }

      return await runCheckpoint(
        rest,
        workspaceRoot,
        context,
      );
    } catch (error) {
      if (error instanceof GitSafetyError) {
        throw new CliError(
          error.code,
          error.message,
          {
            exitCode:
              error.exitCode ??
              EXIT_OPERATION_FAILED,
            details: error.details,
            hint: error.hint,
          },
        );
      }

      throw error;
    }
  },
};

async function runStatus(args: readonly string[], workspaceRoot: string) {
  const parsed = parseCommandArguments(args);

  if (parsed.positionals.length > 0) {
    throw new CliError(
      "INVALID_USAGE",
      `Unexpected argument: ${parsed.positionals[0]}. Usage: mydash git status`,
      { exitCode: EXIT_USAGE },
    );
  }

  const data = await getRepositoryStatus(
    workspaceRoot,
  );

  return {
    ok: true,
    command: "git status",
    data,
    warnings: statusWarnings(data),
    text: renderStatus(data),
  };
}

async function runCheckpoint(
  args: readonly string[],
  workspaceRoot: string,
  context: CommandContext,
) {
  const parsed = parseCommandArguments(args, {
    booleans: [
      "acknowledge-impact",
      "fail-on-warning",
      "dry-run",
      "no-push",
      "all-users",
    ],
    values: ["message"],
  });
  requirePositionals(
    parsed.positionals,
    1,
    "mydash git checkpoint <path...> --message <text>",
  );

  if (!parsed.options.message) {
    throw new CliError(
      "MISSING_COMMIT_MESSAGE",
      "A checkpoint requires --message <text>.",
      { exitCode: EXIT_USAGE },
    );
  }

  const result = await checkpointWorkspace({
    workspaceRoot,
    paths: parsed.positionals,
    message: parsed.options.message,
    acknowledgeImpact:
      parsed.options.acknowledgeImpact ?? false,
    failOnWarning:
      parsed.options.failOnWarning ?? false,
    dryRun: parsed.options.dryRun ?? false,
    allUsers: parsed.options.allUsers ?? false,
    push: !(parsed.options.noPush ?? false),
    now: context.now,
  });

  return {
    ok: result.ok,
    command: "git checkpoint",
    data: result,
    warnings: result.warnings,
    exitCode: result.exitCode,
    text: renderCheckpoint(result),
  };
}

function renderStatus(data: RepositoryStatus): string {
  const lines = [
    `Repository: ${data.root}`,
    `Branch: ${data.detached ? "(detached HEAD)" : data.branch}`,
    `HEAD: ${data.head ?? "(no commits)"}`,
    `Upstream: ${data.upstream ?? "(none)"}`,
    `Ahead/behind: ${data.ahead}/${data.behind}`,
    `Clean: ${data.clean ? "yes" : "no"}`,
    `Changes: ${data.summary.total}`,
    `Staged: ${data.summary.staged}`,
    `Unstaged: ${data.summary.unstaged}`,
    `Untracked: ${data.summary.untracked}`,
  ];

  if (data.inProgress.length > 0) {
    lines.push(
      `Operation in progress: ${data.inProgress.join(", ")}`,
    );
  }

  if (data.changes.length > 0) {
    lines.push("");
    lines.push("Working tree:");

    for (const change of data.changes) {
      const rename = change.originalPath
        ? ` <- ${change.originalPath}`
        : "";
      lines.push(
        `  ${change.status} ${change.path}${rename}`,
      );
    }
  }

  return lines.join("\n");
}

function renderCheckpoint(result: CheckpointReport): string {
  const lines = [
    `Validation: ${result.validation.summary.valid ? "passed" : "failed"}`,
    `Selected changes: ${result.selectedChanges.length}`,
    `Shared impact: ${result.impact.summary.sharedResourceCount} resources`,
    `Affected artefacts: ${result.impact.summary.affectedArtifactCount}`,
  ];

  if (result.dryRun) {
    lines.push("Checkpoint: dry-run only");
  } else {
    lines.push(
      `Commit: ${result.commit?.hash ?? "(none)"}`,
    );
    lines.push(
      `Pushed: ${result.push.pushed ? "yes" : "no"}`,
    );

    if (result.push.target) {
      lines.push(`Push target: ${result.push.target}`);
    }
  }

  return lines.join("\n");
}

function statusWarnings(data: RepositoryStatus): Warning[] {
  const warnings: Warning[] = [];

  if (data.detached) {
    warnings.push({
      code: "DETACHED_HEAD",
      message:
        "HEAD is detached. Checkpoint creation is disabled until a branch is checked out.",
    });
  }

  if (data.inProgress.length > 0) {
    warnings.push({
      code: "GIT_OPERATION_IN_PROGRESS",
      message:
        `Git operation in progress: ${data.inProgress.join(", ")}.`,
    });
  }

  if (!data.identity.configured) {
    warnings.push({
      code: "GIT_IDENTITY_MISSING",
      message:
        "Git user.name or user.email is not configured.",
    });
  }

  if (!data.upstream) {
    warnings.push({
      code: "GIT_UPSTREAM_MISSING",
      message:
        "The current branch has no upstream. A safe origin upstream will be created when possible.",
    });
  }

  return warnings;
}
