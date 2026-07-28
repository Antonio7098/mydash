import {
  lstat,
  readFile,
  readdir,
  realpath,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { validateDocument } from "../validation/contracts.mjs";
import { loadWorkspaceConfig } from "../workspace/load-config.mjs";
import {
  MANIFEST_SPECS,
  expectedPlacement,
} from "./conventions.mjs";
import {
  collectReferences,
  resolveReferences,
} from "./references.mjs";
import { scanArtifactLocalResources } from "./local-resources.mjs";

const MAX_MANIFEST_BYTES = 1024 * 1024;
const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  ".my-dashboards",
]);

export async function scanWorkspaceLibrary(workspaceRoot) {
  const canonicalWorkspaceRoot = await realpath(resolve(workspaceRoot));
  const config = await loadWorkspaceConfig(canonicalWorkspaceRoot);
  const entries = [];
  const issues = [];

  for (const spec of MANIFEST_SPECS) {
    const configuredRoot = config.libraryRoots[spec.rootKey];

    if (!configuredRoot) {
      issues.push(
        issue(
          "error",
          "LIBRARY_ROOT_NOT_CONFIGURED",
          `Workspace library root ${spec.rootKey} is not configured.`,
          { rootKey: spec.rootKey },
        ),
      );
      continue;
    }

    const rootPath = resolve(canonicalWorkspaceRoot, configuredRoot);

    if (!isInside(canonicalWorkspaceRoot, rootPath)) {
      issues.push(
        issue(
          "error",
          "LIBRARY_ROOT_OUTSIDE_WORKSPACE",
          `Configured library root escapes the workspace: ${configuredRoot}`,
          {
            rootKey: spec.rootKey,
            rootPath,
          },
        ),
      );
      continue;
    }

    const rootMetadata = await safeLstat(rootPath);

    if (!rootMetadata?.isDirectory()) {
      issues.push(
        issue(
          "error",
          "LIBRARY_ROOT_MISSING",
          `Configured library root does not exist: ${configuredRoot}`,
          {
            rootKey: spec.rootKey,
            rootPath,
          },
        ),
      );
      continue;
    }

    await scanRoot({
      workspaceRoot: canonicalWorkspaceRoot,
      rootPath,
      configuredRoot,
      spec,
      entries,
      issues,
    });
  }

  await scanArtifactLocalResources({
    workspaceRoot: canonicalWorkspaceRoot,
    artifacts: entries.filter((entry) => entry.category === "artifact"),
    entries,
    issues,
  });

  diagnoseDuplicates(entries, issues);
  diagnosePlacement(entries, issues);

  const references = entries.flatMap((entry) =>
    collectReferences(entry).map((reference) => ({
      ...reference,
      sourceManifestPath: entry.manifestPath,
    })),
  );

  resolveReferences(entries, references, issues);

  return {
    workspaceRoot: canonicalWorkspaceRoot,
    config,
    entries: entries.sort(compareEntries),
    references,
    issues: issues.sort(compareIssues),
    summary: summarise(entries, issues),
  };
}

export function findLibraryEntries(entries, filters = {}) {
  return entries.filter((entry) => {
    if (
      filters.kind &&
      entry.kind !== filters.kind &&
      entry.category !== filters.kind
    ) {
      return false;
    }

    if (filters.level && entry.level !== filters.level) {
      return false;
    }

    if (
      filters.collection &&
      entry.collection !== filters.collection
    ) {
      return false;
    }

    return true;
  });
}

async function scanRoot(context) {
  const manifestPaths = [];
  await walk(context.rootPath, "");

  for (const manifestPath of manifestPaths) {
    const entry = await readManifestEntry({
      ...context,
      manifestPath,
    });

    if (entry) {
      context.entries.push(entry);
    }
  }

  async function walk(directory, relativeDirectory) {
    const directoryEntries = await readdir(directory, {
      withFileTypes: true,
    });

    directoryEntries.sort((left, right) =>
      left.name.localeCompare(right.name, "en"),
    );

    for (const directoryEntry of directoryEntries) {
      if (directoryEntry.name.startsWith(".")) continue;
      if (IGNORED_DIRECTORIES.has(directoryEntry.name)) continue;

      const absolutePath = join(directory, directoryEntry.name);
      const childRelative = relativeDirectory
        ? `${relativeDirectory}/${directoryEntry.name}`
        : directoryEntry.name;
      const metadata = await lstat(absolutePath);

      if (metadata.isSymbolicLink()) {
        context.issues.push(
          issue(
            "warning",
            "SYMLINK_SKIPPED",
            `Library scanning skipped symbolic link: ${displayPath(
              absolutePath,
              context.workspaceRoot,
            )}`,
            {
              rootKey: context.spec.rootKey,
              path: absolutePath,
            },
          ),
        );
        continue;
      }

      if (metadata.isDirectory()) {
        await walk(absolutePath, childRelative);
        continue;
      }

      if (
        metadata.isFile() &&
        directoryEntry.name === context.spec.manifestFile
      ) {
        manifestPaths.push(absolutePath);
      }
    }
  }
}

async function readManifestEntry(context) {
  const metadata = await lstat(context.manifestPath);

  if (metadata.size > MAX_MANIFEST_BYTES) {
    context.issues.push(
      issue(
        "error",
        "MANIFEST_TOO_LARGE",
        `Manifest exceeds ${MAX_MANIFEST_BYTES} bytes: ${displayPath(
          context.manifestPath,
          context.workspaceRoot,
        )}`,
        {
          manifestPath: context.manifestPath,
          rootKey: context.spec.rootKey,
        },
      ),
    );
    return null;
  }

  const source = await readFile(context.manifestPath, "utf8");
  let manifest;

  try {
    manifest = JSON.parse(source);
  } catch (error) {
    context.issues.push(
      issue(
        "error",
        "MANIFEST_INVALID_JSON",
        `Manifest is not valid JSON: ${displayPath(
          context.manifestPath,
          context.workspaceRoot,
        )}: ${error.message}`,
        {
          manifestPath: context.manifestPath,
          rootKey: context.spec.rootKey,
        },
      ),
    );
    return null;
  }

  const validation = validateDocument(
    context.spec.contract,
    manifest,
  );

  for (const validationError of validation.errors) {
    context.issues.push(
      issue(
        "error",
        "MANIFEST_CONTRACT_INVALID",
        `${displayPath(
          context.manifestPath,
          context.workspaceRoot,
        )} ${validationError.path}: ${validationError.message}`,
        {
          manifestPath: context.manifestPath,
          rootKey: context.spec.rootKey,
          contract: context.spec.contract,
          validationPath: validationError.path,
        },
      ),
    );
  }

  if (
    manifest.kind &&
    !context.spec.expectedKinds.includes(manifest.kind)
  ) {
    context.issues.push(
      issue(
        "error",
        "MANIFEST_KIND_MISMATCH",
        `Manifest kind ${manifest.kind} does not belong under ${context.spec.rootKey}.`,
        {
          manifestPath: context.manifestPath,
          rootKey: context.spec.rootKey,
          actualKind: manifest.kind,
          expectedKinds: context.spec.expectedKinds,
        },
      ),
    );
  }

  const relativeDirectory = relative(
    context.rootPath,
    dirname(context.manifestPath),
  ).replaceAll("\\", "/");

  const id =
    typeof manifest.id === "string" && manifest.id
      ? manifest.id
      : `invalid-${context.entries.length + 1}`;

  return {
    id,
    kind:
      typeof manifest.kind === "string"
        ? manifest.kind
        : context.spec.expectedKinds[0],
    category: context.spec.category,
    title:
      manifest.title ??
      manifest.name ??
      id,
    level: manifest.level ?? null,
    collection: manifest.collection ?? null,
    ownerArtifact: manifest.ownerArtifact ?? null,
    user:
      context.spec.category === "artifact"
        ? manifest.user ?? null
        : null,
    rootKey: context.spec.rootKey,
    rootPath: context.rootPath,
    directory: dirname(context.manifestPath),
    relativeDirectory,
    manifestPath: context.manifestPath,
    displayPath: displayPath(
      context.manifestPath,
      context.workspaceRoot,
    ),
    manifest,
    contractValid: validation.ok,
  };
}

function diagnoseDuplicates(entries, issues) {
  const groups = new Map();

  for (const entry of entries) {
    const namespace =
      entry.category === "artifact"
        ? "artifact"
        : entry.kind;
    const scope =
      entry.level === "local"
        ? `local:${entry.ownerArtifact ?? "(missing-owner)"}`
        : "shared";
    const key = `${namespace}:${scope}:${entry.id}`;
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }

  for (const [key, group] of groups) {
    if (group.length < 2) continue;

    for (const entry of group) {
      issues.push(
        issue(
          "error",
          "DUPLICATE_LIBRARY_ID",
          `Duplicate library identifier ${key}: ${group
            .map((candidate) => candidate.displayPath)
            .join(", ")}`,
          {
            manifestPath: entry.manifestPath,
            duplicateKey: key,
            duplicates: group.map(
              (candidate) => candidate.manifestPath,
            ),
          },
        ),
      );
    }
  }
}

function diagnosePlacement(entries, issues) {
  for (const entry of entries) {
    const directoryName = basename(entry.directory);

    if (directoryName !== entry.id) {
      issues.push(
        issue(
          "warning",
          "ID_DIRECTORY_MISMATCH",
          `Manifest id ${entry.id} does not match its directory ${directoryName}.`,
          {
            manifestPath: entry.manifestPath,
            id: entry.id,
            directoryName,
          },
        ),
      );
    }

    const placement = expectedPlacement(entry);

    if (
      placement.expectedLevel &&
      entry.level !== placement.expectedLevel
    ) {
      issues.push(
        issue(
          "error",
          "LIFECYCLE_PLACEMENT_MISMATCH",
          `${entry.kind}:${entry.id} declares level ${entry.level ?? "(none)"} but is stored under ${placement.expectedLevel}.`,
          {
            manifestPath: entry.manifestPath,
            expectedLevel: placement.expectedLevel,
            actualLevel: entry.level,
          },
        ),
      );
    }

    if (
      placement.expectedCollection &&
      entry.collection !== placement.expectedCollection
    ) {
      issues.push(
        issue(
          "error",
          "COLLECTION_PLACEMENT_MISMATCH",
          `${entry.kind}:${entry.id} declares collection ${entry.collection ?? "(none)"} but is stored under ${placement.expectedCollection}.`,
          {
            manifestPath: entry.manifestPath,
            expectedCollection: placement.expectedCollection,
            actualCollection: entry.collection,
          },
        ),
      );
    }

    if (
      entry.category !== "artifact" &&
      !placement.expectedLevel
    ) {
      issues.push(
        issue(
          "warning",
          "NONSTANDARD_LIBRARY_PLACEMENT",
          `${entry.kind}:${entry.id} is outside the expected core/ or collections/<id>/ structure.`,
          {
            manifestPath: entry.manifestPath,
          },
        ),
      );
    }
  }
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
      (entry) => entry.severity === "error",
    ).length,
    warningCount: issues.filter(
      (entry) => entry.severity === "warning",
    ).length,
    byKind: Object.fromEntries(
      Object.entries(byKind).sort(([left], [right]) =>
        left.localeCompare(right, "en"),
      ),
    ),
  };
}

function issue(severity, code, message, details = {}) {
  return {
    severity,
    code,
    message,
    ...details,
  };
}

function compareEntries(left, right) {
  return (
    left.kind.localeCompare(right.kind, "en") ||
    left.id.localeCompare(right.id, "en") ||
    left.displayPath.localeCompare(right.displayPath, "en")
  );
}

function compareIssues(left, right) {
  const severityOrder = { error: 0, warning: 1 };

  return (
    (severityOrder[left.severity] ?? 9) -
      (severityOrder[right.severity] ?? 9) ||
    left.code.localeCompare(right.code, "en") ||
    String(left.message).localeCompare(String(right.message), "en")
  );
}

function displayPath(path, workspaceRoot) {
  const value = relative(workspaceRoot, path).replaceAll("\\", "/");
  return value.startsWith("..") ? path : value || ".";
}

function isInside(root, candidate) {
  const relationship = relative(root, candidate);

  return (
    relationship === "" ||
    (!relationship.startsWith("..") && !isAbsolute(relationship))
  );
}

async function safeLstat(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}
