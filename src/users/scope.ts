export function artifactBelongsToUser<T extends { category?: string; user?: string | null }>(
  entry: T | null | undefined,
  user: string,
): boolean {
  return Boolean(
    entry?.category === "artifact" &&
    entry.user === user,
  );
}

export function artifactsForUser<T extends { category?: string; user?: string | null }>(
  entries: readonly T[],
  user: string,
): T[] {
  return entries.filter((entry) => artifactBelongsToUser(entry, user));
}

export function entriesForUser<T extends { category?: string; user?: string | null }>(
  entries: readonly T[],
  user: string,
): T[] {
  return entries.filter(
    (entry) =>
      entry.category !== "artifact" ||
      artifactBelongsToUser(entry, user),
  );
}

export function availableUsers<T extends { category?: string; user?: string | null }>(
  entries: readonly T[],
  configuredUser: string,
): string[] {
  return [
    ...new Set([
      configuredUser,
      ...entries
        .filter((entry) => entry.category === "artifact")
        .map((entry) => entry.user)
        .filter((value): value is string => Boolean(value)),
    ]),
  ].sort((left, right) => left.localeCompare(right, "en"));
}

export interface ScopedLibraryViewOptions {
  allUsers?: boolean;
  user?: string;
}

export function scopedLibraryView<TEntry extends { manifestPath: string; category?: string; user?: string | null }, TIssue extends { manifestPath?: string; sourceManifestPath?: string; targetManifestPath?: string }>(
  scan: { entries: readonly TEntry[]; issues: readonly TIssue[]; summary: unknown },
  options: ScopedLibraryViewOptions = {},
): { entries: TEntry[]; issues: TIssue[]; summary: { entryCount: number; artifactCount: number; resourceCount: number; errorCount: number; warningCount: number; byKind: Record<string, number> } } {
  if (options.allUsers) {
    return {
      entries: [...scan.entries],
      issues: [...scan.issues],
      summary: scan.summary as { entryCount: number; artifactCount: number; resourceCount: number; errorCount: number; warningCount: number; byKind: Record<string, number> },
    };
  }

  const user = options.user ?? (scan as { config?: { user?: string } }).config?.user ?? null;
  if (!user) {
    return {
      entries: [...scan.entries],
      issues: [...scan.issues],
      summary: scan.summary as { entryCount: number; artifactCount: number; resourceCount: number; errorCount: number; warningCount: number; byKind: Record<string, number> },
    };
  }

  const entries = entriesForUser(scan.entries, user);
  const visiblePaths = new Set(entries.map((entry) => entry.manifestPath));
  const knownPaths = new Set(scan.entries.map((entry) => entry.manifestPath));
  const unscopedDiagnosticPaths = new Set(
    scan.entries
      .filter(
        (entry) => entry.category === "artifact" && !isUser(entry.user),
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

function isUser(value: string | null | undefined): boolean {
  return (
    typeof value === "string" &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  );
}

function summarise<TEntry extends { category?: string; kind?: string }, TIssue>(
  entries: readonly TEntry[],
  issues: readonly TIssue[],
): { entryCount: number; artifactCount: number; resourceCount: number; errorCount: number; warningCount: number; byKind: Record<string, number> } {
  const byKind: Record<string, number> = {};

  for (const entry of entries as readonly { category?: string; kind: string }[]) {
    byKind[entry.kind] = (byKind[entry.kind] ?? 0) + 1;
  }

  return {
    entryCount: entries.length,
    artifactCount: entries.filter((entry) => entry.category === "artifact").length,
    resourceCount: entries.filter((entry) => entry.category !== "artifact").length,
    errorCount: issues.filter((issue) => (issue as { severity?: string }).severity === "error").length,
    warningCount: issues.filter((issue) => (issue as { severity?: string }).severity === "warning").length,
    byKind: Object.fromEntries(
      Object.entries(byKind).sort(([left], [right]) =>
        left.localeCompare(right, "en"),
      ),
    ),
  };
}
