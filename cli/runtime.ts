import process from "node:process";
import type { CommandContext } from "./types.js";

export interface CommandRuntimeOverrides {
  cwd?: string;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
}

export function createCommandContext(
  runtime: CommandRuntimeOverrides = {},
): CommandContext {
  return {
    cwd: runtime.cwd ?? process.cwd(),
    stdout: runtime.stdout ?? process.stdout,
    stderr: runtime.stderr ?? process.stderr,
    env: runtime.env ?? process.env,
    now: runtime.now ?? (() => new Date()),
  };
}