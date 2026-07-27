import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { CliError, EXIT_UNSAFE_OPERATION } from "../../cli/errors.mjs";
import { assertPathInsideWorkspace } from "./paths.mjs";

export async function prepareOutputDirectory(path, options = {}) {
  const outputPath = resolve(path);

  if (!options.workspaceRoot) {
    throw new CliError(
      "WORKSPACE_REQUIRED_FOR_WRITE",
      "Directory outputs require a My Dashboards workspace.",
      { exitCode: EXIT_UNSAFE_OPERATION },
    );
  }

  await assertPathInsideWorkspace(outputPath, options.workspaceRoot, {
    mustExist: false,
  });

  const exists = await pathExists(outputPath);

  if (exists) {
    const metadata = await stat(outputPath);

    if (!metadata.isDirectory()) {
      throw new CliError(
        "OUTPUT_NOT_DIRECTORY",
        `Output path is not a directory: ${outputPath}`,
        { exitCode: EXIT_UNSAFE_OPERATION },
      );
    }

    const entries = await readdir(outputPath);

    if (entries.length > 0 && !options.overwrite) {
      throw new CliError(
        "OUTPUT_DIRECTORY_NOT_EMPTY",
        `Output directory is not empty: ${outputPath}`,
        {
          exitCode: EXIT_UNSAFE_OPERATION,
          hint:
            "Choose an empty directory or explicitly request overwrite.",
        },
      );
    }

    if (entries.length > 0 && options.overwrite) {
      await rm(outputPath, { recursive: true, force: true });
    }
  }

  await mkdir(outputPath, { recursive: true });
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
