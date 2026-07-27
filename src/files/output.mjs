import {
  mkdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { CliError, EXIT_UNSAFE_OPERATION } from "../../cli/errors.mjs";
import { assertPathInsideWorkspace } from "./paths.mjs";

export async function prepareOutputPath(path, options = {}) {
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

export async function writeFileAtomic(path, content, options = {}) {
  const outputPath = await prepareOutputPath(path, options);
  const temporaryPath = `${outputPath}.tmp-${process.pid}-${Date.now()}`;

  try {
    await writeFile(temporaryPath, content, options.encoding ?? undefined);
    await rename(temporaryPath, outputPath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }

  return outputPath;
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}
