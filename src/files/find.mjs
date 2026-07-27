import { lstat, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const DEFAULT_IGNORES = new Set([
  ".git",
  "node_modules",
  ".my-dashboards",
]);

export async function findFiles(root, pattern, options = {}) {
  const includeHidden = options.includeHidden ?? false;
  const maxResults = options.maxResults ?? 200;
  const expression = globToRegExp(pattern);
  const matches = [];
  let truncated = false;

  await walk(root, "");

  return {
    root,
    pattern,
    matches,
    truncated,
  };

  async function walk(directory, parentRelative) {
    if (truncated) return;

    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) =>
      left.name.localeCompare(right.name, "en"),
    );

    for (const entry of entries) {
      if (!includeHidden && entry.name.startsWith(".")) continue;
      if (DEFAULT_IGNORES.has(entry.name)) continue;

      const absolutePath = join(directory, entry.name);
      const relativePath = parentRelative
        ? `${parentRelative}/${entry.name}`
        : entry.name;
      const metadata = await lstat(absolutePath);

      if (
        (metadata.isFile() || metadata.isSymbolicLink()) &&
        expression.test(relativePath)
      ) {
        matches.push({
          path: relativePath,
          type: metadata.isSymbolicLink() ? "symlink" : "file",
          sizeBytes: metadata.isFile() ? metadata.size : null,
        });

        if (matches.length >= maxResults) {
          truncated = true;
          return;
        }
      }

      if (metadata.isDirectory() && !metadata.isSymbolicLink()) {
        await walk(absolutePath, relativePath);
      }
    }
  }
}

export function globToRegExp(pattern) {
  if (typeof pattern !== "string" || pattern.length === 0) {
    throw new Error("A non-empty file pattern is required.");
  }

  let source = "^";

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];

    if (character === "*") {
      if (pattern[index + 1] === "*") {
        const followedBySlash = pattern[index + 2] === "/";

        if (followedBySlash) {
          source += "(?:.*/)?";
          index += 2;
        } else {
          source += ".*";
          index += 1;
        }
      } else {
        source += "[^/]*";
      }

      continue;
    }

    if (character === "?") {
      source += "[^/]";
      continue;
    }

    if ("\\^$+?.()|{}[]".includes(character)) {
      source += `\\${character}`;
    } else {
      source += character;
    }
  }

  source += "$";
  return new RegExp(source, "i");
}
