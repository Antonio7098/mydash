import {
  isAbsolute,
  relative,
  resolve,
} from "node:path";
import {
  analyseLibraryImpact,
} from "../validation/impact-analysis.mjs";

const SHARED_PATH_PATTERN =
  /^library\/(?:ui\/(?:primitives|components|layouts)|themes|presets|assets)\/(?:core|collections)\//;

export function analyseCheckpointImpact(
  scan,
  changedPaths,
) {
  const entryPaths = new Map();

  for (const path of changedPaths) {
    const entry = deepestContainingEntry(
      scan,
      path,
    );

    if (!entry) continue;

    const paths =
      entryPaths.get(entry.manifestPath) ?? [];
    paths.push(path);
    entryPaths.set(
      entry.manifestPath,
      paths,
    );
  }

  const reports = [];

  for (const [
    manifestPath,
    paths,
  ] of entryPaths) {
    const entry = scan.entries.find(
      (candidate) =>
        candidate.manifestPath === manifestPath,
    );

    if (!entry || entry.category === "artifact") {
      continue;
    }

    reports.push(
      analyseLibraryImpact(
        scan,
        entry,
        {
          changeType:
            inferChangeType(entry, paths),
        },
      ),
    );
  }

  const mappedDirectories = reports.map(
    (report) =>
      scan.entries.find(
        (entry) =>
          entry.manifestPath ===
          report.target.manifestPath,
      )?.directory,
  ).filter(Boolean);
  const manualReviewPaths = changedPaths.filter(
    (path) =>
      SHARED_PATH_PATTERN.test(path) &&
      !mappedDirectories.some(
        (directory) =>
          isContained(
            directory,
            resolve(scan.workspaceRoot, path),
          ),
      ),
  );
  const requiringAcknowledgement =
    reports.filter(
      (report) =>
        ["core", "collection"].includes(
          report.target.level,
        ) &&
        report.summary.transitiveConsumerCount > 0,
    );
  const affectedArtifacts = uniqueEntries(
    reports.flatMap(
      (report) => report.affectedArtifacts,
    ),
  );

  return {
    reports,
    manualReviewPaths,
    requiringAcknowledgement:
      requiringAcknowledgement.map(
        (report) => ({
          target: report.target,
          summary: report.summary,
          affectedArtifacts:
            report.affectedArtifacts,
        }),
      ),
    summary: {
      sharedResourceCount:
        reports.filter(
          (report) =>
            ["core", "collection"].includes(
              report.target.level,
            ),
        ).length,
      localResourceCount:
        reports.filter(
          (report) =>
            report.target.level === "local",
        ).length,
      affectedArtifactCount:
        affectedArtifacts.length,
      requiresAcknowledgement:
        requiringAcknowledgement.length > 0 ||
        manualReviewPaths.length > 0,
      manualReviewPathCount:
        manualReviewPaths.length,
    },
    affectedArtifacts,
  };
}

function deepestContainingEntry(scan, path) {
  const absolutePath = resolve(
    scan.workspaceRoot,
    path,
  );
  const candidates = scan.entries.filter(
    (entry) =>
      isContained(
        entry.directory,
        absolutePath,
      ),
  );

  candidates.sort(
    (left, right) =>
      right.directory.length -
      left.directory.length,
  );

  return candidates[0] ?? null;
}

function inferChangeType(entry, paths) {
  const manifestName =
    entry.manifestPath
      .split(/[\\/]/)
      .at(-1);

  if (
    paths.some(
      (path) =>
        path.split("/").at(-1) ===
        manifestName,
    )
  ) {
    return "contract";
  }

  if (entry.kind === "asset") {
    return "asset";
  }

  if (
    entry.kind === "theme" ||
    paths.some((path) =>
      /\.(?:css|scss|sass|less)$/i.test(path),
    )
  ) {
    return "appearance";
  }

  return "implementation";
}

function isContained(parent, candidate) {
  const relationship = relative(
    parent,
    candidate,
  );

  return (
    relationship === "" ||
    (!relationship.startsWith("..") &&
      !isAbsolute(relationship))
  );
}

function uniqueEntries(entries) {
  const values = new Map();

  for (const entry of entries) {
    values.set(
      entry.manifestPath,
      entry,
    );
  }

  return [...values.values()].sort(
    (left, right) =>
      left.kind.localeCompare(
        right.kind,
        "en",
      ) ||
      left.id.localeCompare(
        right.id,
        "en",
      ),
  );
}
