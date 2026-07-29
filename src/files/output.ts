import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { CliError, EXIT_UNSAFE_OPERATION } from "../../cli/errors.js";
import { assertPathInsideWorkspace } from "./paths.js";

export interface PrepareOutputOptions {
  workspaceRoot?: string;
  overwrite?: boolean;
}

export async function prepareOutputPath(
  path: string,
  options: PrepareOutputOptions = {},
): Promise<string> {
  const outputPath = resolve(path);

  if (!options.workspaceRoot) {
    throw new CliError(
      "WORKSPACE_REQUIRED_FOR_WRITE",
      "Writes require a My Dashboards workspace.",
      { exitCode: EXIT_UNSAFE_OPERATION },
    );
  }

  await assertPathInsideWorkspace(outputPath, options.workspaceRoot, {
    mustExist: false,
  });

  const exists = await pathExists(outputPath);

  if (exists && !options.overwrite) {
    throw new CliError(
      "OUTPUT_EXISTS",
      `Output already exists: ${outputPath}`,
      {
        exitCode: EXIT_UNSAFE_OPERATION,
        hint: "Choose another path or explicitly request overwrite.",
      },
    );
  }

  await mkdir(dirname(outputPath), { recursive: true });
  return outputPath;
}

export interface WriteAtomicOptions extends PrepareOutputOptions {
  encoding?: BufferEncoding;
}

export async function writeFileAtomic(
  path: string,
  content: string | Buffer,
  options: WriteAtomicOptions = {},
): Promise<string> {
  const outputPath = await prepareOutputPath(path, options);
  const temporaryPath = `${outputPath}.tmp-${process.pid}-${Date.now()}`;

  try {
    await writeFile(temporaryPath, content, options.encoding ?? undefined);
    await rename(temporaryPath, outputPath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }

  return outputPath;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") return false;
    throw error;
  }
}