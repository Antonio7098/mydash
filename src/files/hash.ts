import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { relative } from "node:path";

export type HashAlgorithm = "sha256" | "sha512";

export interface HashFileOptions {
  algorithm?: HashAlgorithm;
  workspaceRoot?: string;
}

export interface HashFileResult {
  path: string;
  displayPath: string;
  algorithm: HashAlgorithm;
  hash: string;
}

export async function hashFile(
  path: string,
  options: HashFileOptions = {},
): Promise<HashFileResult> {
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

function displayPath(path: string, workspaceRoot?: string): string {
  if (!workspaceRoot) return path;

  const value = relative(workspaceRoot, path).replaceAll("\\", "/");
  return value.startsWith("..") ? path : value || ".";
}