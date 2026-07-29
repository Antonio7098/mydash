import { isAbsolute, relative, resolve } from "node:path";
import { analyseLibraryImpact } from "../validation/impact-analysis.js";
import type { LibraryScan, LibraryEntry, LibrarySummaryEntry } from "../library/types.js";
import type { ImpactReport } from "../validation/types.js";

type LibraryEntrySummary = LibrarySummaryEntry;
type LibrarySummaryEntryLike = LibrarySummaryEntry;

const SHARED_PATH_PATTERN =
  /^library\/(?:ui\/(?:primitives|components|layouts)|themes|presets|assets)\/(?:core|collections)\//;

export interface CheckpointImpactReport {
  reports: ImpactReport[];
  manualReviewPaths: string[];
  requiringAcknowledgement: ImpactReport[];
  summary: {
    sharedResourceCount: number;
    localResourceCount: number;
    affectedArtifactCount: number;
    requiresAcknowledgement: boolean;
    manualReviewPathCount: number;
  };
  affectedArtifacts: LibraryEntrySummary[];
}

export function analyseCheckpointImpact(
  scan: LibraryScan,
  changedPaths: readonly string[],
): CheckpointImpactReport {
  const entryPaths = new Map<string, string[]>();

  for (const path of changedPaths) {
    const entry = deepestContainingEntry(scan, path);

    if (!entry) continue;

    const paths = entryPaths.get(entry.manifestPath) ?? [];
    paths.push(path);
    entryPaths.set(entry.manifestPath, paths);
  }

  const reports: ImpactReport[] = [];

  for (const [manifestPath, paths] of entryPaths) {
    const entry = scan.entries.find(
      (candidate) => candidate.manifestPath === manifestPath,
    );

    if (!entry || entry.category === "artifact") {
      continue;
    }

    reports.push(
      analyseLibraryImpact(scan, entry, {
        changeType: inferChangeType(entry, paths),
      }),
    );
  }

  const mappedDirectories = reports
    .map((report) =>
      scan.entries.find(
        (entry) =>
          entry.manifestPath === (report.target as { manifestPath: string }).manifestPath,
      )?.directory,
    )
    .filter((value): value is string => Boolean(value));
  const manualReviewPaths = changedPaths.filter(
    (path) =>
      SHARED_PATH_PATTERN.test(path) &&
      !mappedDirectories.some((directory) =>
        isContained(directory, resolve(scanHasWorkspaceRoot(scan), path)),
      ),
  );
  const requiringAcknowledgement = reports.filter(
    (report) =>
      ["core", "collection"].includes(report.target.level) &&
      report.summary.transitiveConsumerCount > 0,
  );
  const affectedArtifacts: LibrarySummaryEntry[] = uniqueEntries(
    reports.flatMap((report) => report.affectedArtifacts as LibrarySummaryEntry[]),
  );

  return {
    reports,
    manualReviewPaths,
    requiringAcknowledgement,
    summary: {
      sharedResourceCount: reports.filter((report) =>
        ["core", "collection"].includes((report.target as { level: string }).level),
      ).length,
      localResourceCount: reports.filter(
        (report) => (report.target as { level: string }).level === "local",
      ).length,
      affectedArtifactCount: affectedArtifacts.length,
      requiresAcknowledgement:
        requiringAcknowledgement.length > 0 ||
        manualReviewPaths.length > 0,
      manualReviewPathCount: manualReviewPaths.length,
    },
    affectedArtifacts,
  };
}

function deepestContainingEntry(
  scan: LibraryScan,
  path: string,
): LibraryEntry | null {
  const absolutePath = resolve(scan.workspaceRoot, path);
  const candidates = scan.entries.filter((entry) =>
    isContained(entry.directory, absolutePath),
  );

  candidates.sort(
    (left, right) =>
      right.directory.length - left.directory.length,
  );

  return candidates[0] ?? null;
}

function scanHasWorkspaceRoot(scan: LibraryScan | { workspaceRoot: string }): string {
  return scan.workspaceRoot;
}


function inferChangeType(
  entry: LibraryEntry,
  paths: readonly string[],
): "contract" | "asset" | "appearance" | "implementation" {
  const manifestName = entry.manifestPath.split(/[\\/]/).at(-1);

  if (
    paths.some((path) => path.split("/").at(-1) === manifestName)
  ) {
    return "contract";
  }

  if (entry.kind === "asset") {
    return "asset";
  }

  if (
    entry.kind === "theme" ||
    paths.some((path) => /\.(?:css|scss|sass|less)$/i.test(path))
  ) {
    return "appearance";
  }

  return "implementation";
}

function isContained(parent: string, candidate: string): boolean {
  const relationship = relative(parent, candidate);

  return (
    relationship === "" ||
    (!relationship.startsWith("..") && !isAbsolute(relationship))
  );
}

function uniqueEntries<T extends { manifestPath: string }>(
  entries: readonly T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const entry of entries) {
    if (seen.has(entry.manifestPath)) continue;
    seen.add(entry.manifestPath);
    out.push(entry);
  }
  return out;
}