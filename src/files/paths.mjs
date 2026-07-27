import {
  access,
  lstat,
  mkdir,
  realpath,
  stat,
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { CliError, EXIT_UNSAFE_OPERATION } from "../../cli/errors.mjs";

export async function resolveCommandPath(input, options = {}) {
  if (typeof input !== "string" || input.trim() === "") {
    throw new CliError("INVALID_PATH", "A non-empty path is required.", {
      exitCode: 2,
    });
  }

  const cwd = resolve(options.cwd ?? process.cwd());
  const candidate = resolve(cwd, input);

  if (options.mustExist) {
    await assertExists(candidate);
  }

  if (!options.allowOutside) {
    if (!options.workspaceRoot) {
      throw new CliError(
        "WORKSPACE_NOT_FOUND",
        "No My Dashboards workspace was found. Use --workspace or --allow-outside for read-only inspection.",
        {
          exitCode: EXIT_UNSAFE_OPERATION,
        },
      );
    }

    await assertPathInsideWorkspace(candidate, options.workspaceRoot, {
      mustExist: options.mustExist ?? false,
    });
  }

  if (options.requireFile || options.requireDirectory) {
    const metadata = await stat(candidate);

    if (options.requireFile && !metadata.isFile()) {
      throw new CliError("EXPECTED_FILE", `Expected a file: ${candidate}`, {
        exitCode: 2,
      });
    }

    if (options.requireDirectory && !metadata.isDirectory()) {
      throw new CliError(
        "EXPECTED_DIRECTORY",
        `Expected a directory: ${candidate}`,
        { exitCode: 2 },
      );
    }
  }

  return candidate;
}

export async function assertPathInsideWorkspace(
  candidate,
  workspaceRoot,
  options = {},
) {
  const canonicalRoot = await realpath(resolve(workspaceRoot));
  let canonicalCandidate;

  if (options.mustExist) {
    canonicalCandidate = await realpath(resolve(candidate));
  } else {
    const parent = await nearestExistingParent(dirname(resolve(candidate)));
    const canonicalParent = await realpath(parent);
    canonicalCandidate = join(
      canonicalParent,
      relative(parent, resolve(candidate)),
    );
  }

  if (!isPathInside(canonicalRoot, canonicalCandidate)) {
    throw new CliError(
      "PATH_OUTSIDE_WORKSPACE",
      `Path is outside the workspace: ${candidate}`,
      {
        exitCode: EXIT_UNSAFE_OPERATION,
        hint:
          "Use --allow-outside only for deliberate read-only inspection. Writes must remain workspace-bound.",
      },
    );
  }
}

export function isPathInside(root, candidate) {
  const relationship = relative(resolve(root), resolve(candidate));

  return (
    relationship === "" ||
    (!relationship.startsWith("..") && !isAbsolute(relationship))
  );
}

export async function ensureWorkingDirectories(workspaceRoot) {
  const root = join(workspaceRoot, ".my-dashboards");
  const directories = {
    root,
    cache: join(root, "cache"),
    temp: join(root, "temp"),
    extracts: join(root, "extracts"),
    logs: join(root, "logs"),
  };

  for (const path of Object.values(directories)) {
    await mkdir(path, { recursive: true });
    await access(path, fsConstants.W_OK);
  }

  return directories;
}

async function nearestExistingParent(start) {
  let current = resolve(start);

  while (true) {
    try {
      await lstat(current);
      return current;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;

      const parent = dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}

async function assertExists(path) {
  try {
    await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new CliError("PATH_NOT_FOUND", `Path does not exist: ${path}`, {
        exitCode: 2,
      });
    }

    throw error;
  }
}
