import {
  createHash,
} from "node:crypto";
import {
  lstat,
  readlink,
  readdir,
} from "node:fs/promises";
import {
  isAbsolute,
  relative,
  resolve,
} from "node:path";

const DEFAULT_PATHS = [
  "config",
  "library",
  "recipes",
  "package.json",
];

const DEFAULT_IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  ".my-dashboards",
  "exports",
]);

const DEFAULT_MAX_ENTRIES = 100_000;

export async function fingerprintWorkspace(
  workspaceRoot,
  options = {},
) {
  const root = resolve(workspaceRoot);
  const includePaths =
    options.includePaths ?? DEFAULT_PATHS;
  const ignoredDirectories =
    options.ignoredDirectories ??
    DEFAULT_IGNORED_DIRECTORIES;
  const maxEntries =
    options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const hash = createHash("sha256");
  const summary = {
    fileCount: 0,
    directoryCount: 0,
    symbolicLinkCount: 0,
    missingPathCount: 0,
    totalBytes: 0,
    entryCount: 0,
  };

  for (const input of [...includePaths].sort()) {
    const path = resolve(root, input);
    assertInside(root, path);
    await visit(path);
  }

  return {
    id: hash.digest("hex"),
    ...summary,
    computedAt: new Date().toISOString(),
  };

  async function visit(path) {
    if (summary.entryCount >= maxEntries) {
      const error = new Error(
        `Workspace fingerprint exceeded ${maxEntries} filesystem entries.`,
      );
      error.code =
        "WORKSPACE_FINGERPRINT_ENTRY_LIMIT";
      throw error;
    }

    let metadata;

    try {
      metadata = await lstat(path, {
        bigint: true,
      });
    } catch (error) {
      if (error?.code === "ENOENT") {
        const display = displayPath(
          path,
          root,
        );
        hash.update(`missing:${display}\0`);
        summary.missingPathCount += 1;
        summary.entryCount += 1;
        return;
      }

      throw error;
    }

    const display = displayPath(path, root);
    summary.entryCount += 1;

    if (metadata.isSymbolicLink()) {
      const target = await readlink(path);
      hash.update(
        `link:${display}:${target}:${metadata.mtimeNs}\0`,
      );
      summary.symbolicLinkCount += 1;
      return;
    }

    if (metadata.isDirectory()) {
      hash.update(
        `directory:${display}:${metadata.mtimeNs}:${metadata.mode}\0`,
      );
      summary.directoryCount += 1;

      const children = await readdir(path, {
        withFileTypes: true,
      });
      children.sort((left, right) =>
        left.name.localeCompare(
          right.name,
          "en",
        ),
      );

      for (const child of children) {
        if (
          child.isDirectory() &&
          ignoredDirectories.has(child.name)
        ) {
          continue;
        }

        await visit(resolve(path, child.name));
      }

      return;
    }

    if (metadata.isFile()) {
      hash.update(
        `file:${display}:${metadata.size}:${metadata.mtimeNs}:${metadata.mode}\0`,
      );
      summary.fileCount += 1;
      summary.totalBytes += Number(metadata.size);
      return;
    }

    hash.update(
      `other:${display}:${metadata.mode}:${metadata.mtimeNs}\0`,
    );
  }
}

function displayPath(path, root) {
  const value = relative(root, path)
    .replaceAll("\\", "/");

  return value || ".";
}

function assertInside(root, candidate) {
  const relationship = relative(
    root,
    candidate,
  );

  if (
    relationship.startsWith("..") ||
    isAbsolute(relationship)
  ) {
    const error = new Error(
      `Fingerprint path escapes the workspace: ${candidate}`,
    );
    error.code =
      "WORKSPACE_FINGERPRINT_UNSAFE_PATH";
    throw error;
  }
}
