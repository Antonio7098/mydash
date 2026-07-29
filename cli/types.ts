export type Warning = {
  code: string;
  message: string;
};

export type CommandData<T = unknown> = T;

export interface CommandResult<T = unknown> {
  ok: boolean;
  command: string;
  data: CommandData<T>;
  warnings?: Warning[];
  exitCode?: number;
  text?: string;
}

export interface CommandInvocation {
  args: string[];
  options: Record<string, string | boolean | undefined>;
  json?: boolean;
}

export interface CommandContext {
  cwd: string;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  env: NodeJS.ProcessEnv;
  now: () => Date;
}

export interface CommandDefinition<T = unknown> {
  name: string;
  summary: string;
  usage: string;
  options?: string[];
  run(
    invocation: CommandInvocation,
    context: CommandContext,
  ): Promise<CommandResult<T>> | CommandResult<T>;
}

export interface CommandRegistry {
  get(name: string): CommandDefinition | null;
  list(): CommandDefinition[];
  names(): string[];
}

export interface CliInvocation {
  commandName: string | null;
  args: string[];
  options: Record<string, string | boolean | undefined>;
  json: boolean;
  helpRequested: boolean;
  versionRequested: boolean;
}

export type CliOutputSink = NodeJS.WritableStream;

export interface CliOutputOptions {
  json: boolean;
  stdout: CliOutputSink;
  stderr?: CliOutputSink;
}

export interface CliErrorOptions {
  exitCode?: number;
  details?: unknown;
  hint?: string | null;
  cause?: unknown;
}

export interface CliErrorShape {
  code: string;
  message: string;
  exitCode?: number;
  details?: unknown;
  hint?: string | null;
}

export interface ErrorEnvelope {
  ok: false;
  error: {
    code: string;
    message: string;
    details: unknown;
    hint: string | null;
  };
}

export interface ResultEnvelope<T = unknown> {
  ok: boolean;
  command: string | null;
  data: T | null;
  warnings: Warning[];
}