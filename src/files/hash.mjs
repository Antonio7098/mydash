import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { relative } from "node:path";

export async function hashFile(path, options = {}) {
  const algorithm = options.algorithm ?? "sha256";
  const hash = createHash(algorithm);
  const stream = createReadStream(path);

  for await (const chunk of stream) {
    hash.update(chunk);
  }

  return {
    path,
    displayPath: displayPath(path, options.workspaceRoot),
    algorithm,
    hash: hash.digest("hex"),
  };
}

function displayPath(path, workspaceRoot) {
  if (!workspaceRoot) return path;

  const value = relative(workspaceRoot, path).replaceAll("\\", "/");
  return value.startsWith("..") ? path : value || ".";
}
