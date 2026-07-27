export function artifactBelongsToUser(entry, userId) {
  return (
    entry?.category === "artifact" &&
    entry.userId === userId
  );
}

export function artifactsForUser(entries, userId) {
  return entries.filter((entry) =>
    artifactBelongsToUser(entry, userId),
  );
}

export function entriesForUser(entries, userId) {
  return entries.filter(
    (entry) =>
      entry.category !== "artifact" ||
      artifactBelongsToUser(entry, userId),
  );
}

export function availableUserIds(entries, configuredUserId) {
  return [
    ...new Set([
      configuredUserId,
      ...entries
        .filter((entry) => entry.category === "artifact")
        .map((entry) => entry.userId)
        .filter(Boolean),
    ]),
  ].sort((left, right) => left.localeCompare(right, "en"));
}

export function scopedLibraryView(scan, options = {}) {
  if (options.allUsers) {
    return {
      entries: scan.entries,
      issues: scan.issues,
      summary: scan.summary,
    };
  }

  const entries = entriesForUser(
    scan.entries,
    options.userId ?? scan.config.userId,
  );
  const visiblePaths = new Set(
    entries.map((entry) => entry.manifestPath),
  );
  const knownPaths = new Set(
    scan.entries.map((entry) => entry.manifestPath),
  );
  const unscopedDiagnosticPaths = new Set(
    scan.entries
      .filter(
        (entry) =>
          entry.category === "artifact" &&
          !isUserId(entry.userId),
      )
      .map((entry) => entry.manifestPath),
  );
  const issues = scan.issues.filter((issue) => {
    for (const path of [
      issue.manifestPath,
      issue.sourceManifestPath,
      issue.targetManifestPath,
    ]) {
      if (
        path &&
        knownPaths.has(path) &&
        !visiblePaths.has(path) &&
        !unscopedDiagnosticPaths.has(path)
      ) {
        return false;
      }
    }
    return true;
  });

  return {
    entries,
    issues,
    summary: summarise(entries, issues),
  };
}

function isUserId(value) {
  return (
    typeof value === "string" &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  );
}

function summarise(entries, issues) {
  const byKind = {};

  for (const entry of entries) {
    byKind[entry.kind] = (byKind[entry.kind] ?? 0) + 1;
  }

  return {
    entryCount: entries.length,
    artifactCount: entries.filter(
      (entry) => entry.category === "artifact",
    ).length,
    resourceCount: entries.filter(
      (entry) => entry.category !== "artifact",
    ).length,
    errorCount: issues.filter(
      (issue) => issue.severity === "error",
    ).length,
    warningCount: issues.filter(
      (issue) => issue.severity === "warning",
    ).length,
    byKind: Object.fromEntries(
      Object.entries(byKind).sort(([left], [right]) =>
        left.localeCompare(right, "en"),
      ),
    ),
  };
}
