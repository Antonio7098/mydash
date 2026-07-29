import { createHash } from "node:crypto";
import { lstat, readFile, readlink } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { runGit } from "./run.js";
import { parsePorcelainV1Z, type ChangeStatus } from "./status.js";
import { GitSafetyError } from "./errors.js";

const PATHSPEC_MAGIC = /^:\(/;
const WILDCARDS = /[*?[]/;

export async function normaliseCheckpointPaths(
  repositoryRoot: string,
  inputs: readonly string[],
): Promise<string[]> {
  const paths: string[] = [];

  for (const input of inputs) {
    const raw = String(input);

    if (!raw || raw.includes("\0") || raw.includes("\n") || raw.includes("\r")) {
      throw unsafePath(
        raw,
        "Checkpoint paths must be non-empty single-line paths.",
      );
    }

    if (isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw)) {
      throw unsafePath(
        raw,
        "Checkpoint paths must be repository-relative.",
      );
    }

    if (PATHSPEC_MAGIC.test(raw) || WILDCARDS.test(raw)) {
      throw unsafePath(
        raw,
        "Git pathspec magic and wildcards are not allowed. Name an explicit file or directory.",
      );
    }

    const absolutePath = resolve(repositoryRoot, raw);
    const relationship = relative(repositoryRoot, absolutePath);

    if (
      !relationship ||
      relationship === "." ||
      relationship.startsWith("..") ||
      isAbsolute(relationship)
    ) {
      throw unsafePath(
        raw,
        "Checkpoint paths must identify content below the repository root.",
      );
    }

    const path = relationship.replaceAll("\\", "/");

    if (path === ".git" || path.startsWith(".git/")) {
      throw unsafePath(
        raw,
        "The Git metadata directory cannot be checkpointed.",
      );
    }

    if (!(await pathExistsOrTracked(repositoryRoot, path))) {
      throw new GitSafetyError(
        "CHECKPOINT_PATH_NOT_FOUND",
        `Checkpoint path does not exist and is not tracked: ${path}`,
        {
          exitCode: 2,
          details: { path },
        },
      );
    }

    paths.push(path);
  }

  return removeRedundantPaths([...new Set(paths)].sort());
}

export function changesForPaths(
  repositoryRoot: string,
  paths: readonly string[],
): ChangeStatus[] {
  return parsePorcelainV1Z(
    runGit(
      [
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
        "--",
        ...paths,
      ],
      { cwd: repositoryRoot },
    ).stdout,
  );
}

export function assertNoPartialStaging(changes: ChangeStatus[]): void {
  const partial = changes.filter(
    (change) =>
      !change.untracked && change.staged && change.unstaged,
  );

  if (partial.length > 0) {
    throw new GitSafetyError(
      "PARTIALLY_STAGED_PATHS",
      "Checkpoint paths contain both staged and unstaged changes.",
      {
        exitCode: 5,
        details: {
          paths: partial.map((change) => change.path),
        },
        hint:
          "Commit or unstage the partial changes first so the checkpoint has one unambiguous file version.",
      },
    );
  }
}

export async function fingerprintChanges(
  repositoryRoot: string,
  changes: ChangeStatus[],
): Promise<string> {
  const hash = createHash("sha256");
  const ordered = [...changes].sort(
    (left, right) =>
      left.path.localeCompare(right.path, "en"),
  );

  for (const change of ordered) {
    hash.update(
      JSON.stringify({
        status: change.status,
        path: change.path,
        originalPath: change.originalPath,
      }),
    );

    const absolutePath = resolve(repositoryRoot, change.path);

    try {
      const metadata = await lstat(absolutePath);

      if (metadata.isSymbolicLink()) {
        hash.update("symlink:");
        hash.update(await readlink(absolutePath));
      } else if (metadata.isFile()) {
        hash.update("file:");
        hash.update(await readFile(absolutePath));
      } else {
        hash.update(`other:${metadata.mode}:${metadata.size}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
        hash.update("missing");
      } else {
        throw error;
      }
    }
  }

  return hash.digest("hex");
}

async function pathExistsOrTracked(
  repositoryRoot: string,
  path: string,
): Promise<boolean> {
  try {
    await lstat(resolve(repositoryRoot, path));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code !== "ENOENT") throw error;
  }

  const tracked = runGit(
    ["ls-files", "-z", "--", path],
    {
      cwd: repositoryRoot,
      allowFailure: true,
    },
  );

  return Boolean(tracked.stdout);
}

function removeRedundantPaths(paths: string[]): string[] {
  const result: string[] = [];

  for (const path of paths) {
    const covered = result.some(
      (parent) =>
        path === parent ||
        path.startsWith(`${parent}/`),
    );

    if (!covered) result.push(path);
  }

  return result;
}

function unsafePath(path: string, message: string): GitSafetyError {
  return new GitSafetyError(
    "UNSAFE_CHECKPOINT_PATH",
    `${message} Received: ${path || "(empty)"}`,
    { exitCode: 5 },
  );
}