import { stat } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";

export async function findWorkspaceRoot(startPath) {
  let current = resolve(startPath);
  const currentStat = await safeStat(current);

  if (currentStat?.isFile()) {
    current = dirname(current);
  }

  const filesystemRoot = parse(current).root;

  while (true) {
    if (await isWorkspaceRoot(current)) {
      return current;
    }

    if (current === filesystemRoot) {
      return null;
    }

    current = dirname(current);
  }
}

async function isWorkspaceRoot(path) {
  const packagePath = join(path, "package.json");
  const workspacePath = join(path, "config", "workspace.json");

  return Boolean(
    (await safeStat(packagePath))?.isFile() &&
      (await safeStat(workspacePath))?.isFile(),
  );
}

async function safeStat(path) {
  try {
    return await stat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}
