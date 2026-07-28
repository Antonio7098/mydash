export function artifactBelongsToUser(entry, user) {
  return (
    entry?.category === "artifact" &&
    entry.user === user
  );
}

export function artifactsForUser(entries, user) {
  return entries.filter((entry) =>
    artifactBelongsToUser(entry, user),
  );
}

export function entriesForUser(entries, user) {
  return entries.filter(
    (entry) =>
      entry.category !== "artifact" ||
      artifactBelongsToUser(entry, user),
  );
}

export function availableUsers(entries, configuredUser) {
  return [
    ...new Set([
      configuredUser,
      ...entries
        .filter((entry) => entry.category === "artifact")
        .map((entry) => entry.user)
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
    options.user ?? scan.config.user,
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
          !isUser(entry.user),
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

function isUser(value) {
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
