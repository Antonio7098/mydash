import process from "node:process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { findWorkspaceRoot } from "./find-root.js";
import type { PackageMetadata } from "./types.js";

export async function loadPackageMetadata(startPath?: string): Promise<PackageMetadata> {
  const workspaceRoot = await findWorkspaceRoot(startPath ?? process.cwd());

  if (!workspaceRoot) {
    return {
      name: "mydash",
      version: "unknown",
    };
  }

  const source = await readFile(join(workspaceRoot, "package.json"), "utf8");
  const metadata = JSON.parse(source) as { name?: string; version?: string };

  return {
    name: metadata.name ?? "mydash",
    version: metadata.version ?? "unknown",
  };
}