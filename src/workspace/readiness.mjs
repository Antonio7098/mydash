export function buildReadinessReport(input) {
  const scan = input.scan;
  const validation = input.validation;
  const core = input.core;
  const git = input.git ?? unavailableGit("Git status was not checked.");
  const artifactCount = scan?.summary?.artifactCount ?? 0;
  const checks = [
    check(
      "workspace",
      "Workspace configuration",
      true,
      Boolean(input.config?.id && input.config?.name),
      "Workspace configuration loaded.",
      "Fix config/workspace.json before using the navigator.",
    ),
    check(
      "library",
      "Library discovery",
      true,
      (scan?.summary?.errorCount ?? 1) === 0,
      `${scan?.summary?.entryCount ?? 0} entries discovered without errors.`,
      `${scan?.summary?.errorCount ?? 0} library errors require attention.`,
    ),
    check(
      "core",
      "Minimal Core",
      true,
      core?.summary?.valid === true,
      `${core?.summary?.discoveredResourceCount ?? 0} required Core resources are present.`,
      "Restore or repair the minimal Core resources.",
    ),
    check(
      "artefacts",
      "Artefact library",
      false,
      artifactCount > 0,
      `${artifactCount} ${artifactCount === 1 ? "artefact is" : "artefacts are"} available.`,
      "Create a dashboard, presentation or concept to begin.",
      artifactCount === 0 ? "warning" : "passed",
    ),
    check(
      "appearance",
      "Appearance resolution",
      artifactCount > 0,
      artifactCount === 0 || validation?.stages?.appearance?.status === "passed",
      artifactCount === 0 ? "No artefacts require appearance resolution yet." : "All artefact appearances resolve.",
      "Resolve missing themes, presets or UI references.",
    ),
    check(
      "exports",
      "Standalone exports",
      artifactCount > 0,
      artifactCount === 0 || validation?.stages?.exports?.status === "passed",
      artifactCount === 0 ? "No artefacts require export validation yet." : `${validation?.summary?.exportValidatedCount ?? 0} exports validated.`,
      "Fix standalone export errors before sharing artefacts.",
    ),
    check(
      "git",
      "Git repository",
      false,
      git.available === true,
      git.available ? `Repository on ${git.branch ?? "detached HEAD"}.` : "Git is optional for browsing and exporting.",
      "Initialise Git to enable artefact-default checkpoints.",
      git.available ? "passed" : "warning",
    ),
    check(
      "git-conflicts",
      "Git conflicts",
      git.available === true,
      git.available !== true || (git.summary?.conflicted ?? 0) === 0,
      git.available === true ? "No conflicted files." : "Not checked without a Git repository.",
      "Resolve Git conflicts before saving artefact defaults.",
    ),
    check(
      "git-identity",
      "Git identity",
      false,
      git.available !== true || git.identity?.configured === true,
      git.available !== true ? "Not required until Git is initialised." : "Commit identity is configured.",
      "Configure git user.name and user.email to create checkpoints.",
      git.available === true && git.identity?.configured !== true ? "warning" : "passed",
    ),
    check(
      "remote",
      "Git remote",
      false,
      git.available !== true || (git.remotes?.length ?? 0) > 0,
      git.available !== true ? "Not required for local use." : "A Git remote is configured.",
      "Add a remote when you want backup and collaboration.",
      git.available === true && (git.remotes?.length ?? 0) === 0 ? "warning" : "passed",
    ),
  ];

  const requiredFailures = checks.filter((item) => item.required && item.state === "failed");
  const warningCount = checks.filter((item) => item.state === "warning").length;
  const passedCount = checks.filter((item) => item.state === "passed").length;
  const status = requiredFailures.length > 0
    ? "needs-attention"
    : artifactCount === 0
      ? "first-run"
      : "ready";

  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    status,
    ready: requiredFailures.length === 0,
    phase: artifactCount === 0 ? "authoring-not-started" : "operational",
    checks,
    nextActions: checks
      .filter((item) => item.state !== "passed")
      .sort((left, right) => Number(right.required) - Number(left.required))
      .map((item) => ({ id: item.id, required: item.required, action: item.action })),
    summary: {
      checkCount: checks.length,
      passedCount,
      warningCount,
      failedCount: checks.filter((item) => item.state === "failed").length,
      requiredFailureCount: requiredFailures.length,
      artifactCount,
      libraryEntryCount: scan?.summary?.entryCount ?? 0,
      libraryResourceCount: scan?.summary?.resourceCount ?? 0,
      validationErrorCount: validation?.summary?.errorCount ?? 0,
      validationWarningCount: validation?.summary?.warningCount ?? 0,
    },
  };
}

export function unavailableGit(message, error = null) {
  return {
    available: false,
    branch: null,
    head: null,
    upstream: null,
    clean: null,
    changes: [],
    summary: { total: 0, staged: 0, unstaged: 0, untracked: 0, conflicted: 0 },
    inProgress: [],
    identity: { name: null, email: null, configured: false },
    remotes: [],
    reason: message,
    error: error ? { code: error.code ?? "GIT_UNAVAILABLE", message: error.message ?? String(error) } : null,
  };
}

function check(id, title, required, passed, success, action, explicitState = null) {
  const state = explicitState ?? (passed ? "passed" : required ? "failed" : "warning");
  return {
    id,
    title,
    required,
    state,
    message: passed ? success : action,
    action,
  };
}
