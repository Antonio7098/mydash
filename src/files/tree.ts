import { lstat, readdir } from "node:fs/promises";
import { basename, join, relative } from "node:path";

export type TreeNodeType = "directory" | "file" | "symlink" | "other";

export interface TreeEntry {
  name: string;
  path: string;
  type: TreeNodeType;
  depth: number;
  sizeBytes: number | null;
}

export interface BuildTreeOptions {
  maxDepth?: number;
  includeHidden?: boolean;
  workspaceRoot?: string;
}

export interface BuildTreeResult {
  root: string;
  displayRoot: string;
  maxDepth: number;
  includeHidden: boolean;
  entries: TreeEntry[];
  text: string;
}

const DEFAULT_IGNORES = new Set([
  ".git",
  "node_modules",
  ".my-dashboards",
]);

export async function buildTree(
  root: string,
  options: BuildTreeOptions = {},
): Promise<BuildTreeResult> {
  const maxDepth = options.maxDepth ?? 3;
  const includeHidden = options.includeHidden ?? false;
  const entries: TreeEntry[] = [];

  await walk(root, "", 0);

  const rootName = basename(root) || root;
  const textLines = [rootName];

  for (const entry of entries) {
    textLines.push(
      `${"  ".repeat(entry.depth)}${entry.type === "directory" ? "▸ " : "  "}${entry.name}${entry.type === "symlink" ? " →" : ""}`,
    );
  }

  return {
    root,
    displayRoot: displayPath(root, options.workspaceRoot),
    maxDepth,
    includeHidden,
    entries,
    text: textLines.join("\n"),
  };

  async function walk(directory: string, parentRelative: string, depth: number): Promise<void> {
    if (depth >= maxDepth) return;

    const directoryEntries = await readdir(directory, {
      withFileTypes: true,
    });

    directoryEntries.sort((left, right) =>
      left.name.localeCompare(right.name, "en"),
    );

    for (const entry of directoryEntries) {
      if (!includeHidden && entry.name.startsWith(".")) continue;
      if (DEFAULT_IGNORES.has(entry.name)) continue;

      const absolutePath = join(directory, entry.name);
      const itemRelative = parentRelative
        ? `${parentRelative}/${entry.name}`
        : entry.name;
      const metadata = await lstat(absolutePath);
      const type: TreeNodeType = metadata.isSymbolicLink()
        ? "symlink"
        : metadata.isDirectory()
          ? "directory"
          : metadata.isFile()
            ? "file"
            : "other";

      entries.push({
        name: entry.name,
        path: itemRelative,
        type,
        depth: depth + 1,
        sizeBytes: metadata.isFile() ? metadata.size : null,
      });

      if (type === "directory") {
        await walk(absolutePath, itemRelative, depth + 1);
      }
    }
  }
}

function displayPath(path: string, workspaceRoot?: string): string {
  if (!workspaceRoot) return path;

  const value = relative(workspaceRoot, path).replaceAll("\\", "/");
  return value.startsWith("..") ? path : value || ".";
}