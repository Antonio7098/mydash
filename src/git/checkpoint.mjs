import {
  runGit,
} from "./run.mjs";
import {
  getRepositoryStatus,
} from "./status.mjs";
import {
  assertNoPartialStaging,
  changesForPaths,
  fingerprintChanges,
  normaliseCheckpointPaths,
} from "./paths.mjs";
import {
  GitSafetyError,
} from "./errors.mjs";
import {
  validateWorkspace,
} from "../validation/workspace-validation.mjs";
import {
  scanWorkspaceLibrary,
} from "../library/scan.mjs";
import {
  analyseCheckpointImpact,
} from "./impact.mjs";

const DEFAULT_MAX_EXPORT_BYTES =
  50 * 1024 * 1024;

export async function checkpointWorkspace(
  options,
) {
  validateMessage(options.message);

  const statusBefore =
    await getRepositoryStatus(
      options.workspaceRoot,
    );
  assertCheckpointable(statusBefore);

  const paths =
    await normaliseCheckpointPaths(
      statusBefore.root,
      options.paths,
    );
  const selectedChanges = changesForPaths(
    statusBefore.root,
    paths,
  );

  if (selectedChanges.length === 0) {
    throw new GitSafetyError(
      "NO_SELECTED_CHANGES",
      "None of the selected paths contain changes.",
      {
        exitCode: 2,
        details: { paths },
      },
    );
  }

  if (
    selectedChanges.some(
      (change) => change.conflicted,
    )
  ) {
    throw new GitSafetyError(
      "SELECTED_PATH_CONFLICT",
      "Checkpoint paths contain unresolved merge conflicts.",
      {
        exitCode: 5,
        details: {
          paths: selectedChanges
            .filter(
              (change) => change.conflicted,
            )
            .map((change) => change.path),
        },
      },
    );
  }

  assertNoPartialStaging(selectedChanges);

  const fingerprintBefore =
    await fingerprintChanges(
      statusBefore.root,
      selectedChanges,
    );
  const validation = await validateWorkspace({
    workspaceRoot: statusBefore.root,
    validateExports: true,
    validateRecipes: true,
    minify: false,
    maxBytes:
      options.maxBytes ??
      DEFAULT_MAX_EXPORT_BYTES,
    failOnWarning:
      options.failOnWarning ?? false,
    allUsers: options.allUsers ?? false,
    now: options.now,
  });

  if (!validation.summary.valid) {
    throw new GitSafetyError(
      "CHECKPOINT_VALIDATION_FAILED",
      "The repository failed consolidated validation. No files were staged or committed.",
      {
        exitCode: 3,
        details: {
          summary: validation.summary,
          issues: validation.issues.slice(
            0,
            50,
          ),
        },
        hint:
          "Run mydash validate for the complete report, fix the errors, then retry the checkpoint.",
      },
    );
  }

  const scan = await scanWorkspaceLibrary(
    statusBefore.root,
  );
  const changedPaths = uniqueChangedPaths(
    selectedChanges,
  );
  const impact = analyseCheckpointImpact(
    scan,
    changedPaths,
  );

  if (
    impact.summary.requiresAcknowledgement &&
    !options.acknowledgeImpact
  ) {
    throw new GitSafetyError(
      "SHARED_IMPACT_ACKNOWLEDGEMENT_REQUIRED",
      "The selected changes affect consumed shared resources. No files were staged or committed.",
      {
        exitCode: 5,
        details: {
          impact,
        },
        hint:
          "Review the affected artefacts with mydash impact, then retry with --acknowledge-impact.",
      },
    );
  }

  const changesAfterValidation =
    changesForPaths(
      statusBefore.root,
      paths,
    );
  const fingerprintAfter =
    await fingerprintChanges(
      statusBefore.root,
      changesAfterValidation,
    );

  if (
    fingerprintBefore !== fingerprintAfter ||
    !sameChangeSet(
      selectedChanges,
      changesAfterValidation,
    )
  ) {
    throw new GitSafetyError(
      "WORKTREE_CHANGED_DURING_VALIDATION",
      "Selected files changed while validation was running. No checkpoint was created.",
      {
        exitCode: 5,
        hint:
          "Review the latest changes and rerun the checkpoint.",
      },
    );
  }

  if (options.dryRun) {
    return {
      ok: true,
      exitCode: 0,
      dryRun: true,
      repository: statusBefore,
      paths,
      selectedChanges,
      validation,
      impact,
      commit: null,
      push: {
        requested: false,
        pushed: false,
        target: null,
      },
      warnings: [],
    };
  }

  runGit(
    ["add", "-A", "--", ...paths],
    { cwd: statusBefore.root },
  );

  const staged = runGit(
    [
      "diff",
      "--cached",
      "--name-status",
      "-z",
      "--",
      ...paths,
    ],
    { cwd: statusBefore.root },
  ).stdout;

  if (!staged) {
    throw new GitSafetyError(
      "NO_STAGED_CHECKPOINT_CHANGES",
      "The selected changes produced no staged content.",
      {
        exitCode: 2,
      },
    );
  }

  const commitResult = runGit(
    [
      "commit",
      "--only",
      "-m",
      options.message.trim(),
      "--",
      ...paths,
    ],
    {
      cwd: statusBefore.root,
      allowFailure: true,
    },
  );

  if (commitResult.status !== 0) {
    throw new GitSafetyError(
      "GIT_COMMIT_FAILED",
      "The focused Git commit failed. Selected paths may remain staged.",
      {
        exitCode: 1,
        details: {
          stdout:
            commitResult.stdout.trim(),
          stderr:
            commitResult.stderr.trim(),
          paths,
        },
        hint:
          "Inspect mydash git status before retrying.",
      },
    );
  }

  const commit = {
    hash: runGit(
      ["rev-parse", "--short", "HEAD"],
      { cwd: statusBefore.root },
    ).stdout.trim(),
    fullHash: runGit(
      ["rev-parse", "HEAD"],
      { cwd: statusBefore.root },
    ).stdout.trim(),
    message: options.message.trim(),
    paths: runGit(
      [
        "show",
        "--pretty=format:",
        "--name-only",
        "HEAD",
      ],
      { cwd: statusBefore.root },
    ).stdout
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean),
  };
  const push = options.push === false
    ? {
        requested: false,
        pushed: false,
        target: null,
        obstacle: null,
      }
    : pushCurrentBranch(
        statusBefore.root,
      );
  const warnings = [];

  if (push.obstacle) {
    warnings.push({
      code: push.code,
      message: push.obstacle,
    });
  }

  return {
    ok:
      !push.requested ||
      push.pushed ||
      push.code === "NO_PUSH_TARGET",
    exitCode:
      push.requested &&
      !push.pushed &&
      push.code !== "NO_PUSH_TARGET"
        ? 1
        : 0,
    dryRun: false,
    repository: statusBefore,
    paths,
    selectedChanges,
    validation,
    impact,
    commit,
    push,
    warnings,
  };
}

function pushCurrentBranch(root) {
  const branch = runGit(
    ["branch", "--show-current"],
    { cwd: root },
  ).stdout.trim();
  const upstream = runGit(
    [
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{upstream}",
    ],
    {
      cwd: root,
      allowFailure: true,
    },
  );

  if (upstream.status === 0) {
    const target =
      upstream.stdout.trim();
    const result = runGit(
      ["push"],
      {
        cwd: root,
        allowFailure: true,
      },
    );

    return result.status === 0
      ? {
          requested: true,
          pushed: true,
          target,
          obstacle: null,
          code: null,
        }
      : {
          requested: true,
          pushed: false,
          target,
          code: "PUSH_FAILED",
          obstacle:
            "The commit was created locally, but Git push failed safely. No force-push was attempted. " +
            (result.stderr.trim() ||
              result.stdout.trim()),
        };
  }

  const remotes = runGit(
    ["remote"],
    {
      cwd: root,
      allowFailure: true,
    },
  ).stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);

  if (!branch || !remotes.includes("origin")) {
    return {
      requested: true,
      pushed: false,
      target: null,
      code: "NO_PUSH_TARGET",
      obstacle:
        "The commit was created locally, but no upstream was configured and an origin remote was unavailable.",
    };
  }

  const result = runGit(
    [
      "push",
      "-u",
      "origin",
      branch,
    ],
    {
      cwd: root,
      allowFailure: true,
    },
  );
  const target = `origin/${branch}`;

  return result.status === 0
    ? {
        requested: true,
        pushed: true,
        target,
        obstacle: null,
        code: null,
      }
    : {
        requested: true,
        pushed: false,
        target,
        code: "PUSH_FAILED",
        obstacle:
          "The commit was created locally, but Git push failed safely. No force-push was attempted. " +
          (result.stderr.trim() ||
            result.stdout.trim()),
      };
}

function assertCheckpointable(status) {
  if (!status.head) {
    throw new GitSafetyError(
      "GIT_HISTORY_REQUIRED",
      "Checkpoint creation requires an existing Git commit.",
      { exitCode: 5 },
    );
  }

  if (status.detached) {
    throw new GitSafetyError(
      "DETACHED_HEAD",
      "Checkpoint creation is disabled on a detached HEAD.",
      {
        exitCode: 5,
        hint:
          "Check out a branch before creating a checkpoint.",
      },
    );
  }

  if (status.inProgress.length > 0) {
    throw new GitSafetyError(
      "GIT_OPERATION_IN_PROGRESS",
      `Checkpoint creation is disabled during: ${status.inProgress.join(", ")}.`,
      { exitCode: 5 },
    );
  }

  if (status.summary.conflicted > 0) {
    throw new GitSafetyError(
      "GIT_CONFLICTS_PRESENT",
      "Checkpoint creation is disabled while the repository contains unresolved conflicts.",
      { exitCode: 5 },
    );
  }

  if (!status.identity.configured) {
    throw new GitSafetyError(
      "GIT_IDENTITY_MISSING",
      "Git user.name and user.email must be configured before committing.",
      {
        exitCode: 4,
      },
    );
  }
}

function validateMessage(message) {
  const value = String(message ?? "").trim();

  if (
    value.length < 3 ||
    value.length > 200 ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    throw new GitSafetyError(
      "INVALID_COMMIT_MESSAGE",
      "Commit messages must be a single line between 3 and 200 characters.",
      { exitCode: 2 },
    );
  }
}

function uniqueChangedPaths(changes) {
  return [
    ...new Set(
      changes.flatMap((change) =>
        [
          change.path,
          change.originalPath,
        ].filter(Boolean),
      ),
    ),
  ].sort();
}

function sameChangeSet(left, right) {
  return (
    JSON.stringify(
      normaliseChanges(left),
    ) ===
    JSON.stringify(
      normaliseChanges(right),
    )
  );
}

function normaliseChanges(changes) {
  return changes
    .map((change) => ({
      status: change.status,
      path: change.path,
      originalPath:
        change.originalPath,
    }))
    .sort(
      (left, right) =>
        left.path.localeCompare(
          right.path,
          "en",
        ),
    );
}
