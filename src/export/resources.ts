import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { mediaTypeForPath, toDataUri } from "./mime.js";
import { resolveExportSourcePath, workspaceDisplayPath } from "./paths.js";

const DEFAULT_SINGLE_FILE_LIMIT = 20 * 1024 * 1024;
const DEFAULT_TOTAL_LIMIT = 40 * 1024 * 1024;

export interface EmbeddedFile {
  mediaType: string;
  base64: string;
  sizeBytes: number;
  source: string;
}

export interface CollectEmbeddedFilesOptions {
  workspaceRoot?: string;
  artifact: { directory: string };
  entryPath?: string;
  singleFileLimit?: number;
  totalLimit?: number;
  onFile?: (path: string, category: string) => void;
}

export interface CollectEmbeddedFilesResult {
  files: Record<string, EmbeddedFile>;
  count: number;
  dataCount: number;
  assetCount: number;
  totalBytes: number;
}

export async function collectArtifactEmbeddedFiles(
  options: CollectEmbeddedFilesOptions,
): Promise<CollectEmbeddedFilesResult> {
  const files: Record<string, EmbeddedFile> = {};
  const seenPaths = new Set<string>();
  let totalBytes = 0;
  let dataCount = 0;
  let assetCount = 0;

  for (const directoryName of ["data", "assets"]) {
    const directory = resolve(
      options.artifact.directory,
      directoryName,
    );

    if (!(await isDirectory(directory))) continue;

    await walk(directory, directoryName);
  }

  return {
    files,
    count: seenPaths.size,
    dataCount,
    assetCount,
    totalBytes,
  };

  async function walk(directory: string, artifactRelativeDirectory: string): Promise<void> {
    const entries = await readdir(directory, {
      withFileTypes: true,
    });
    entries.sort((left, right) =>
      left.name.localeCompare(right.name, "en"),
    );

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;

      const absolutePath = join(directory, entry.name);
      const relativePath =
        `${artifactRelativeDirectory}/${entry.name}`.replaceAll(
          "\\",
          "/",
        );
      const metadata = await lstat(absolutePath);

      if (metadata.isSymbolicLink()) {
        throw resourceError(
          "SYMLINK_RESOURCE_REFUSED",
          `Embedded resource is a symbolic link: ${absolutePath}`,
        );
      }

      if (metadata.isDirectory()) {
        await walk(absolutePath, relativePath);
        continue;
      }

      if (!metadata.isFile()) continue;
      await addFile(
        absolutePath,
        relativePath,
        artifactRelativeDirectory.split("/", 1)[0] as string,
      );
    }
  }

  async function addFile(
    path: string,
    artifactRelativePath: string,
    category: string,
  ): Promise<void> {
    const canonical = await realpath(path);
    if (seenPaths.has(canonical)) return;

    const metadata = await stat(canonical);
    const singleLimit =
      options.singleFileLimit ?? DEFAULT_SINGLE_FILE_LIMIT;
    const totalLimit =
      options.totalLimit ?? DEFAULT_TOTAL_LIMIT;

    if (metadata.size > singleLimit) {
      throw resourceError(
        "EMBEDDED_FILE_TOO_LARGE",
        `Embedded file exceeds ${singleLimit} bytes: ${path}`,
      );
    }

    totalBytes += metadata.size;
    if (totalBytes > totalLimit) {
      throw resourceError(
        "EMBEDDED_RESOURCES_TOO_LARGE",
        `Embedded artifact data and assets exceed ${totalLimit} bytes.`,
      );
    }

    const content = await readFile(canonical);
    const value: EmbeddedFile = {
      mediaType: mediaTypeForPath(canonical),
      base64: content.toString("base64"),
      sizeBytes: metadata.size,
      source: workspaceDisplayPath(
        canonical,
        options.workspaceRoot ?? "",
      ),
    };

    for (const alias of aliasesFor(
      artifactRelativePath,
      options.entryPath ?? "",
      options.artifact.directory,
    )) {
      files[alias] = value;
    }

    seenPaths.add(canonical);

    if (category === "data") {
      dataCount += 1;
    } else if (category === "assets") {
      assetCount += 1;
    }

    options.onFile?.(canonical, category);
  }
}

export interface ResolveAssetSlotsOptions {
  workspaceRoot?: string;
  scan: { entries: { manifestPath: string; manifest: Record<string, unknown> }[] };
  resolution: { selections: { assets: Record<string, { entry: { manifestPath: string } | null } | null> } };
  onAsset?: (path: string) => void;
}

export interface ResolveAssetSlotsResult {
  assetSlots: Record<string, AssetSlot>;
  files: Record<string, EmbeddedFile>;
  count: number;
}

export interface AssetSlot {
  id: string;
  mediaType: string;
  dataUri: string;
  sizeBytes: number;
}

export async function resolveAssetSlots(
  options: ResolveAssetSlotsOptions,
): Promise<ResolveAssetSlotsResult> {
  const assetSlots: Record<string, AssetSlot> = {};
  const files: Record<string, EmbeddedFile> = {};
  const seen = new Set<string>();

  for (const [slot, selection] of Object.entries(
    options.resolution.selections.assets,
  )) {
    const manifestPath = selection?.entry?.manifestPath;
    if (!manifestPath) continue;

    const entry = options.scan.entries.find(
      (candidate) => candidate.manifestPath === manifestPath,
    );
    const file = entry?.manifest.file as string | undefined;

    if (!entry || !file) continue;

    const resolved = await resolveExportSourcePath(
      entry.manifestPath,
      file,
      options.workspaceRoot ?? "",
    );

    if (resolved.kind !== "file" || !resolved.path) {
      throw resourceError(
        "ASSET_FILE_INVALID",
        `Asset ${entry.manifestPath} does not point to a local file.`,
      );
    }

    const canonical = resolved.path;
    const metadata = await stat(canonical);
    const content = await readFile(canonical);
    const mediaType =
      (entry.manifest.mediaType as string | undefined) ??
      mediaTypeForPath(canonical);
    const dataUri = toDataUri(content, mediaType);

    assetSlots[slot] = {
      id: entry.manifest.id as string,
      mediaType,
      dataUri,
      sizeBytes: metadata.size,
    };

    const registryValue: EmbeddedFile = {
      mediaType,
      base64: content.toString("base64"),
      sizeBytes: metadata.size,
      source: workspaceDisplayPath(
        canonical,
        options.workspaceRoot ?? "",
      ),
    };

    for (const alias of [
      `assets/${entry.manifestPath}/${basename(canonical)}`,
      `asset:${slot}`,
      `asset:${entry.manifestPath}`,
    ]) {
      files[alias] = registryValue;
    }

    if (!seen.has(canonical)) {
      seen.add(canonical);
      options.onAsset?.(canonical);
    }
  }

  return {
    assetSlots,
    files,
    count: seen.size,
  };
}

function aliasesFor(
  artifactRelativePath: string,
  entryPath: string,
  artifactDirectory: string,
): string[] {
  const entryDirectory = dirname(entryPath);
  const absolute = resolve(artifactDirectory, artifactRelativePath);
  const relativeFromEntry = relative(
    entryDirectory,
    absolute,
  ).replaceAll("\\", "/");
  const clean = artifactRelativePath.replace(/^\/+/, "");

  return [...new Set([
    clean,
    `./${clean}`,
    `/${clean}`,
    relativeFromEntry,
    relativeFromEntry.startsWith(".")
      ? relativeFromEntry
      : `./${relativeFromEntry}`,
  ])];
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") return false;
    throw error;
  }
}

function resourceError(code: string, message: string): Error {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}