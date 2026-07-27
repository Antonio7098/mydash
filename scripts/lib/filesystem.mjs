import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, relative } from "node:path";

export async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function ensureDirectory(path) {
  await mkdir(path, { recursive: true });
}

export async function readJson(path) {
  const content = await readFile(path, "utf8");
  return JSON.parse(content);
}

export async function writeTextAtomic(path, content) {
  await ensureDirectory(dirname(path));
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;

  try {
    await writeFile(temporaryPath, content, "utf8");
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
}

export async function writeJsonAtomic(path, value) {
  await writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function relativePath(root, path) {
  return relative(root, path).replaceAll("\\", "/");
}
