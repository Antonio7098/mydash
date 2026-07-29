import { lstat, readFile, readdir } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { validateDocument } from "../validation/contracts.js";
import type { LibraryDiagnostic, LibraryEntry, LibraryScan } from "./types.js";

const MAX_MANIFEST_BYTES = 1024 * 1024;

interface LocalSpec {
  relativeRoot: string;
  rootKey: string;
  category: string;
  manifestFile: string;
  contract: "uiItem" | "theme" | "asset";
  expectedKind: string;
}

const LOCAL_SPECS: readonly LocalSpec[] = [
  {
    relativeRoot: "ui/primitives",
    rootKey: "local-primitives",
    category: "ui",
    manifestFile: "ui.json",
    contract: "uiItem",
    expectedKind: "primitive",
  },
  {
    relativeRoot: "ui/components",
    rootKey: "local-components",
    category: "ui",
    manifestFile: "ui.json",
    contract: "uiItem",
    expectedKind: "component",
  },
  {
    relativeRoot: "ui/layouts",
    rootKey: "local-layouts",
    category: "ui",
    manifestFile: "ui.json",
    contract: "uiItem",
    expectedKind: "layout",
  },
  {
    relativeRoot: "theme",
    rootKey: "local-themes",
    category: "theme",
    manifestFile: "theme.json",
    contract: "theme",
    expectedKind: "theme",
  },
  {
    relativeRoot: "assets",
    rootKey: "local-assets",
    category: "asset",
    manifestFile: "asset.json",
    contract: "asset",
    expectedKind: "asset",
  },
];

export interface ScanArtifactLocalResourcesContext {
  workspaceRoot: string;
  artifacts: readonly LibraryEntry[];
  entries: LibraryEntry[];
  issues: LibraryDiagnostic[];
}

export async function scanArtifactLocalResources(
  context: ScanArtifactLocalResourcesContext,
): Promise<void> {
  for (const artifact of context.artifacts) {
    for (const spec of LOCAL_SPECS) {
      const rootPath = join(artifact.directory, spec.relativeRoot);
      const metadata = await safeLstat(rootPath);

      if (!metadata?.isDirectory()) continue;

      await scanLocalRoot({
        ...context,
        artifact,
        spec,
        rootPath,
      });
    }
  }
}

async function scanLocalRoot(
  context: ScanArtifactLocalResourcesContext & {
    artifact: LibraryEntry;
    spec: LocalSpec;
    rootPath: string;
  },
): Promise<void> {
  const manifestPaths: string[] = [];
  await walk(context.rootPath, "");

  for (const manifestPath of manifestPaths) {
    const entry = await readLocalManifest({
      ...context,
      manifestPath,
    });

    if (entry) context.entries.push(entry);
  }

  async function walk(directory: string, relativeDirectory: string): Promise<void> {
    const directoryEntries = await readdir(directory, {
      withFileTypes: true,
    });

    directoryEntries.sort((left, right) =>
      left.name.localeCompare(right.name, "en"),
    );

    for (const item of directoryEntries) {
      if (item.name.startsWith(".")) continue;

      const absolutePath = join(directory, item.name);
      const childRelative = relativeDirectory
        ? `${relativeDirectory}/${item.name}`
        : item.name;
      const metadata = await lstat(absolutePath);

      if (metadata.isSymbolicLink()) {
        context.issues.push({
          severity: "warning",
          code: "SYMLINK_SKIPPED",
          message: `Local resource scanning skipped symbolic link: ${displayPath(
            absolutePath,
            context.workspaceRoot,
          )}`,
          path: absolutePath,
          manifestPath: context.artifact.manifestPath,
        });
        continue;
      }

      if (metadata.isDirectory()) {
        await walk(absolutePath, childRelative);
      } else if (
        metadata.isFile() &&
        item.name === context.spec.manifestFile
      ) {
        manifestPaths.push(absolutePath);
      }
    }
  }
}

async function readLocalManifest(
  context: ScanArtifactLocalResourcesContext & {
    artifact: LibraryEntry;
    spec: LocalSpec;
    rootPath: string;
    manifestPath: string;
  },
): Promise<LibraryEntry | null> {
  const metadata = await lstat(context.manifestPath);

  if (metadata.size > MAX_MANIFEST_BYTES) {
    context.issues.push({
      severity: "error",
      code: "MANIFEST_TOO_LARGE",
      message: `Local manifest exceeds ${MAX_MANIFEST_BYTES} bytes: ${displayPath(
        context.manifestPath,
        context.workspaceRoot,
      )}`,
      manifestPath: context.manifestPath,
    });
    return null;
  }

  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(
      await readFile(context.manifestPath, "utf8"),
    ) as Record<string, unknown>;
  } catch (error) {
    context.issues.push({
      severity: "error",
      code: "MANIFEST_INVALID_JSON",
      message: `Local manifest is not valid JSON: ${displayPath(
        context.manifestPath,
        context.workspaceRoot,
      )}: ${error instanceof Error ? error.message : String(error)}`,
      manifestPath: context.manifestPath,
    });
    return null;
  }

  const validation = validateDocument(
    context.spec.contract,
    manifest,
  );

  for (const validationError of validation.errors) {
    context.issues.push({
      severity: "error",
      code: "MANIFEST_CONTRACT_INVALID",
      message: `${displayPath(
        context.manifestPath,
        context.workspaceRoot,
      )} ${validationError.path}: ${validationError.message}`,
      manifestPath: context.manifestPath,
      contract: context.spec.contract,
      validationPath: validationError.path,
    });
  }

  if (manifest.kind !== context.spec.expectedKind) {
    context.issues.push({
      severity: "error",
      code: "MANIFEST_KIND_MISMATCH",
      message: `Local manifest kind ${(manifest.kind as string | undefined) ?? "(missing)"} must be ${context.spec.expectedKind}.`,
      manifestPath: context.manifestPath,
      actualKind: manifest.kind,
      expectedKind: context.spec.expectedKind,
    });
  }

  if (manifest.level !== "local") {
    context.issues.push({
      severity: "error",
      code: "LOCAL_RESOURCE_LEVEL_INVALID",
      message: `Local ${context.spec.expectedKind}:${(manifest.id as string | undefined) ?? "(missing-id)"} must declare level local.`,
      manifestPath: context.manifestPath,
      actualLevel: manifest.level,
    });
  }

  if (manifest.ownerArtifact !== context.artifact.id) {
    context.issues.push({
      severity: "error",
      code: "LOCAL_RESOURCE_OWNER_MISMATCH",
      message: `Local ${context.spec.expectedKind}:${(manifest.id as string | undefined) ?? "(missing-id)"} must declare ownerArtifact ${context.artifact.id}.`,
      manifestPath: context.manifestPath,
      expectedOwnerArtifact: context.artifact.id,
      actualOwnerArtifact: manifest.ownerArtifact,
    });
  }

  const relativeDirectory = relative(
    context.rootPath,
    dirname(context.manifestPath),
  ).replaceAll("\\", "/");
  const id =
    typeof manifest.id === "string" && manifest.id
      ? manifest.id
      : `invalid-local-${context.entries.length + 1}`;

  return {
    id,
    kind:
      typeof manifest.kind === "string"
        ? manifest.kind
        : context.spec.expectedKind,
    category: context.spec.category,
    title: (manifest.name as string | undefined) ?? id,
    level: (manifest.level as string | null | undefined) ?? null,
    collection: null,
    ownerArtifact: (manifest.ownerArtifact as string | null | undefined) ?? null,
    user: null,
    rootKey: context.spec.rootKey,
    rootPath: context.rootPath,
    directory: dirname(context.manifestPath),
    relativeDirectory,
    manifestPath: context.manifestPath,
    displayPath: displayPath(
      context.manifestPath,
      context.workspaceRoot,
    ),
    manifest: manifest as Record<string, unknown>,
    contractValid: validation.ok,
    lifecycle: "Local",
    scope: "local",
    placement: relativeDirectory,
    path: context.manifestPath,
  };
}

function displayPath(path: string, workspaceRoot: string): string {
  const value = relative(workspaceRoot, path).replaceAll("\\", "/");
  return value.startsWith("..") ? path : value || ".";
}

async function safeLstat(path: string): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") return null;
    throw error;
  }
}