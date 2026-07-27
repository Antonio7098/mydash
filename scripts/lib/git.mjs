import { runCommand } from "./process.mjs";

export async function repositoryRoot(cwd) {
  const result = await runCommand(
    "git",
    ["rev-parse", "--show-toplevel"],
    { cwd, allowFailure: true },
  );

  return result.code === 0 ? result.stdout : null;
}

export async function currentBranch(cwd) {
  const result = await runCommand(
    "git",
    ["branch", "--show-current"],
    { cwd, allowFailure: true },
  );

  return result.code === 0 ? result.stdout : null;
}

export async function upstreamBranch(cwd) {
  const result = await runCommand(
    "git",
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    { cwd, allowFailure: true },
  );

  return result.code === 0 ? result.stdout : null;
}

export async function remotes(cwd) {
  const result = await runCommand("git", ["remote"], {
    cwd,
    allowFailure: true,
  });

  return result.code === 0
    ? result.stdout.split("\n").map((value) => value.trim()).filter(Boolean)
    : [];
}

export async function stagedFiles(cwd) {
  const result = await runCommand(
    "git",
    ["diff", "--cached", "--name-only"],
    { cwd },
  );

  return result.stdout
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
}
