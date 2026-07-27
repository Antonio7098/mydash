import {
  lstat,
  readFile,
  readdir,
  realpath,
  stat,
} from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import {
  mediaTypeForPath,
  toDataUri,
} from "./mime.mjs";
import {
  resolveExportSourcePath,
  workspaceDisplayPath,
} from "./paths.mjs";

const DEFAULT_SINGLE_FILE_LIMIT = 20 * 1024 * 1024;
const DEFAULT_TOTAL_LIMIT = 40 * 1024 * 1024;

export async function collectArtifactEmbeddedFiles(options) {
  const files = {};
  const seenPaths = new Set();
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

  async function walk(directory, artifactRelativeDirectory) {
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
        artifactRelativeDirectory.split("/", 1)[0],
      );
    }
  }

  async function addFile(
    path,
    artifactRelativePath,
    category,
  ) {
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
    const value = {
      mediaType: mediaTypeForPath(canonical),
      base64: content.toString("base64"),
      sizeBytes: metadata.size,
      source: workspaceDisplayPath(
        canonical,
        options.workspaceRoot,
      ),
    };

    for (const alias of aliasesFor(
      artifactRelativePath,
      options.entryPath,
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

export async function resolveAssetSlots(options) {
  const assetSlots = {};
  const files = {};
  const seen = new Set();

  for (const [slot, selection] of Object.entries(
    options.resolution.selections.assets,
  )) {
    const manifestPath = selection?.entry?.manifestPath;
    if (!manifestPath) continue;

    const entry = options.scan.entries.find(
      (candidate) =>
        candidate.manifestPath === manifestPath,
    );
    const file = entry?.manifest.file;

    if (!entry || !file) continue;

    const resolved = await resolveExportSourcePath(
      entry.manifestPath,
      file,
      options.workspaceRoot,
    );

    if (resolved.kind !== "file") {
      throw resourceError(
        "ASSET_FILE_INVALID",
        `Asset ${entry.id} does not point to a local file.`,
      );
    }

    const canonical = resolved.path;
    const metadata = await stat(canonical);
    const content = await readFile(canonical);
    const mediaType =
      entry.manifest.mediaType ?? mediaTypeForPath(canonical);
    const dataUri = toDataUri(content, mediaType);

    assetSlots[slot] = {
      id: entry.id,
      mediaType,
      dataUri,
      sizeBytes: metadata.size,
    };

    const registryValue = {
      mediaType,
      base64: content.toString("base64"),
      sizeBytes: metadata.size,
      source: workspaceDisplayPath(
        canonical,
        options.workspaceRoot,
      ),
    };

    for (const alias of [
      `assets/${entry.id}/${basename(canonical)}`,
      `asset:${slot}`,
      `asset:${entry.id}`,
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
  artifactRelativePath,
  entryPath,
  artifactDirectory,
) {
  const entryDirectory = dirname(entryPath);
  const absolute = resolve(
    artifactDirectory,
    artifactRelativePath,
  );
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

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function resourceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
