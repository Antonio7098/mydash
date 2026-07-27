import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { findWorkspaceRoot } from "./find-root.mjs";

export async function loadPackageMetadata(startPath) {
  const workspaceRoot = await findWorkspaceRoot(startPath);

  if (!workspaceRoot) {
    return {
      name: "mydash",
      version: "unknown",
    };
  }

  const source = await readFile(
    join(workspaceRoot, "package.json"),
    "utf8",
  );

  const metadata = JSON.parse(source);

  return {
    name: metadata.name ?? "mydash",
    version: metadata.version ?? "unknown",
  };
}
