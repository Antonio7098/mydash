import { stat } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";

export async function findWorkspaceRoot(startPath: string): Promise<string | null> {
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

async function isWorkspaceRoot(path: string): Promise<boolean> {
  const packagePath = join(path, "package.json");
  const workspacePath = join(path, "config", "workspace.json");

  const packageStat = await safeStat(packagePath);
  const workspaceStat = await safeStat(workspacePath);

  return Boolean(packageStat?.isFile() && workspaceStat?.isFile());
}

async function safeStat(path: string) {
  try {
    return await stat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") return null;
    throw error;
  }
}