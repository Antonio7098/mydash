import { access, realpath } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { gitOutput, runGit, type GitCommandResult } from "./run.js";
import { GitSafetyError } from "./errors.js";

export interface IdentityInfo {
  name: string | null;
  email: string | null;
  configured: boolean;
}

export interface ChangeStatus {
  status: string;
  path: string;
  originalPath: string | null;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  conflicted: boolean;
}

export interface ChangeSummary {
  total: number;
  staged: number;
  unstaged: number;
  untracked: number;
  conflicted: number;
}

export interface RemoteInfo {
  name: string;
  url: string;
  direction: string;
}

export interface RepositoryStatus {
  root: string;
  branch: string | null;
  detached: boolean;
  head: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  clean: boolean;
  changes: ChangeStatus[];
  summary: ChangeSummary;
  inProgress: string[];
  identity: IdentityInfo;
  remotes: RemoteInfo[];
}

export async function getRepositoryStatus(
  workspaceRoot: string,
): Promise<RepositoryStatus> {
  const root = await requireRepositoryRoot(workspaceRoot);
  const branch = gitOutput(["branch", "--show-current"], { cwd: root });
  const detached = !branch;
  const headResult = runGit(["rev-parse", "--short", "HEAD"], {
    cwd: root,
    allowFailure: true,
  });
  const head = headResult.status === 0 ? headResult.stdout.trim() : null;
  const upstreamResult = runGit(
    [
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{upstream}",
    ],
    {
      cwd: root,
      allowFailure: true,
    },
  );
  const upstream =
    upstreamResult.status === 0 ? upstreamResult.stdout.trim() : null;
  const divergence = upstream
    ? parseDivergence(
        gitOutput(
          [
            "rev-list",
            "--left-right",
            "--count",
            "HEAD...@{upstream}",
          ],
          { cwd: root },
        ),
      )
    : { ahead: 0, behind: 0 };
  const changes = parsePorcelainV1Z(
    runGit(
      [
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
      ],
      { cwd: root },
    ).stdout,
  );
  const gitDirectory = await resolveGitDirectory(root);
  const inProgress = await detectInProgressOperations(gitDirectory);
  const userName = gitOutput(["config", "--get", "user.name"], {
    cwd: root,
    allowFailure: true,
  });
  const userEmail = gitOutput(["config", "--get", "user.email"], {
    cwd: root,
    allowFailure: true,
  });
  const remotes = parseRemotes(
    runGit(["remote", "-v"], { cwd: root, allowFailure: true }).stdout,
  );
  const summary = summariseChanges(changes);

  return {
    root,
    branch: branch || null,
    detached,
    head,
    upstream,
    ahead: divergence.ahead,
    behind: divergence.behind,
    clean: changes.length === 0,
    changes,
    summary,
    inProgress,
    identity: {
      name: userName || null,
      email: userEmail || null,
      configured: Boolean(userName && userEmail),
    },
    remotes,
  };
}

export async function requireRepositoryRoot(
  workspaceRoot: string,
): Promise<string> {
  const result: GitCommandResult = runGit(
    ["rev-parse", "--show-toplevel"],
    {
      cwd: workspaceRoot,
      allowFailure: true,
    },
  );

  if (result.status !== 0) {
    throw new GitSafetyError(
      "GIT_REPOSITORY_NOT_FOUND",
      "The workspace is not inside a Git repository.",
      { exitCode: 5 },
    );
  }

  const root = await realpath(result.stdout.trim());
  const workspace = await realpath(resolve(workspaceRoot));

  if (root !== workspace) {
    throw new GitSafetyError(
      "WORKSPACE_NOT_REPOSITORY_ROOT",
      "The My Dashboards workspace must be the Git repository root.",
      {
        exitCode: 5,
        details: {
          workspaceRoot: workspace,
          repositoryRoot: root,
        },
      },
    );
  }

  return root;
}

export function parsePorcelainV1Z(output: string): ChangeStatus[] {
  if (!output) return [];

  const fields = output.split("\0");
  const changes: ChangeStatus[] = [];

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (!field) continue;
    if (field.length < 4) continue;

    const status = field.slice(0, 2);
    const path = normalisePath(field.slice(3));
    let originalPath: string | null = null;

    if (status.includes("R") || status.includes("C")) {
      originalPath = normalisePath(fields[index + 1] ?? "");
      index += 1;
    }

    const untracked = status === "??";
    const indexStatus = status[0];
    const worktreeStatus = status[1];

    changes.push({
      status,
      path,
      originalPath: originalPath || null,
      staged: !untracked && indexStatus !== " ",
      unstaged: !untracked && worktreeStatus !== " ",
      untracked,
      conflicted: ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(status),
    });
  }

  return changes;
}

export function summariseChanges(changes: ChangeStatus[]): ChangeSummary {
  return {
    total: changes.length,
    staged: changes.filter((change) => change.staged).length,
    unstaged: changes.filter((change) => change.unstaged).length,
    untracked: changes.filter((change) => change.untracked).length,
    conflicted: changes.filter((change) => change.conflicted).length,
  };
}

async function resolveGitDirectory(root: string): Promise<string> {
  const value = gitOutput(["rev-parse", "--git-dir"], { cwd: root });
  const path = isAbsolute(value) ? value : resolve(root, value);

  return realpath(path);
}

async function detectInProgressOperations(
  gitDirectory: string,
): Promise<string[]> {
  const checks: ReadonlyArray<readonly [string, string]> = [
    ["merge", "MERGE_HEAD"],
    ["cherry-pick", "CHERRY_PICK_HEAD"],
    ["revert", "REVERT_HEAD"],
    ["bisect", "BISECT_LOG"],
    ["rebase", "rebase-merge"],
    ["rebase", "rebase-apply"],
  ];
  const found = new Set<string>();

  for (const [operation, path] of checks) {
    try {
      await access(resolve(gitDirectory, path), fsConstants.F_OK);
      found.add(operation);
    } catch {
      // Missing markers are expected.
    }
  }

  return [...found].sort();
}

function parseDivergence(value: string): { ahead: number; behind: number } {
  const [aheadRaw, behindRaw] = value
    .trim()
    .split(/\s+/)
    .map((part) => Number.parseInt(part, 10));
  const ahead = aheadRaw ?? 0;
  const behind = behindRaw ?? 0;

  return {
    ahead: Number.isInteger(ahead) ? ahead : 0,
    behind: Number.isInteger(behind) ? behind : 0,
  };
}

function parseRemotes(output: string): RemoteInfo[] {
  const remotes: RemoteInfo[] = [];

  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;

    const match = line.match(/^(\S+)\s+(.+)\s+\((fetch|push)\)$/);

    if (!match) continue;

    remotes.push({
      name: match[1] as string,
      url: match[2] as string,
      direction: match[3] as string,
    });
  }

  return remotes;
}

function normalisePath(value: string): string {
  return String(value).replaceAll("\\", "/");
}