import process from "node:process";

export function createCommandContext(runtime = {}) {
  return {
    cwd: runtime.cwd ?? process.cwd(),
    stdout: runtime.stdout ?? process.stdout,
    stderr: runtime.stderr ?? process.stderr,
    env: runtime.env ?? process.env,
    now: runtime.now ?? (() => new Date()),
  };
}
