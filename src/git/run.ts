import { spawnSync } from "node:child_process";

export interface RunGitOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  maxBuffer?: number;
  allowFailure?: boolean;
}

export interface GitCommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

export function runGit(
  args: readonly string[],
  options: RunGitOptions = {},
): GitCommandResult {
  const result = spawnSync(
    "git",
    [...args],
    {
      cwd: options.cwd,
      encoding: "utf8",
      stdio: "pipe",
      shell: false,
      env: {
        ...process.env,
        ...(options.env ?? {}),
      },
      maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
    },
  );

  if (result.error) throw result.error;

  const response: GitCommandResult = {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };

  if (response.status !== 0 && !options.allowFailure) {
    const detail = [response.stderr.trim(), response.stdout.trim()]
      .filter(Boolean)
      .join("\n");

    const error = new Error(
      `git ${args.join(" ")} failed with exit code ${response.status}` +
        (detail ? `:\n${detail}` : "."),
    ) as Error & {
      code?: string;
      command?: string[];
      status?: number;
      stdout?: string;
      stderr?: string;
    };
    error.code = "GIT_COMMAND_FAILED";
    error.command = ["git", ...args];
    error.status = response.status;
    error.stdout = response.stdout;
    error.stderr = response.stderr;
    throw error;
  }

  return response;
}

export function gitOutput(
  args: readonly string[],
  options: RunGitOptions = {},
): string {
  return runGit(args, options).stdout.trim();
}