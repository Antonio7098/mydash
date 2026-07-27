import { currentBranch, remotes, stagedFiles, upstreamBranch } from "./git.mjs";
import { runCommand } from "./process.mjs";

export async function createCheckpoint({
  cwd,
  message,
  paths,
  push = true,
}) {
  if (!message?.trim()) {
    throw new Error("A focused commit message is required.");
  }

  if (!Array.isArray(paths) || paths.length === 0) {
    return {
      committed: false,
      pushed: false,
      reason: "No task-owned paths were supplied.",
    };
  }

  await runCommand("git", ["add", "--", ...paths], { cwd });

  const staged = await stagedFiles(cwd);
  if (staged.length === 0) {
    return {
      committed: false,
      pushed: false,
      reason: "No task-owned changes remained after validation.",
    };
  }

  await runCommand("git", ["commit", "-m", message], { cwd });

  const hash = (
    await runCommand("git", ["rev-parse", "--short", "HEAD"], { cwd })
  ).stdout;

  if (!push) {
    return { committed: true, commit: hash, pushed: false };
  }

  const upstream = await upstreamBranch(cwd);

  if (upstream) {
    const result = await runCommand("git", ["push"], {
      cwd,
      allowFailure: true,
    });

    return {
      committed: true,
      commit: hash,
      pushed: result.code === 0,
      pushError: result.code === 0 ? null : result.stderr || result.stdout,
    };
  }

  const availableRemotes = await remotes(cwd);
  const branch = await currentBranch(cwd);

  if (!availableRemotes.includes("origin") || !branch) {
    return {
      committed: true,
      commit: hash,
      pushed: false,
      pushError: "No upstream branch is configured and origin is unavailable.",
    };
  }

  const result = await runCommand(
    "git",
    ["push", "-u", "origin", branch],
    { cwd, allowFailure: true },
  );

  return {
    committed: true,
    commit: hash,
    pushed: result.code === 0,
    pushError: result.code === 0 ? null : result.stderr || result.stdout,
  };
}
