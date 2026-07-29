export const EXIT_SUCCESS = 0;
export const EXIT_OPERATION_FAILED = 1;
export const EXIT_USAGE = 2;
export const EXIT_VALIDATION = 3;
export const EXIT_DEPENDENCY_MISSING = 4;
export const EXIT_UNSAFE_OPERATION = 5;

export type ExitCode =
  | typeof EXIT_SUCCESS
  | typeof EXIT_OPERATION_FAILED
  | typeof EXIT_USAGE
  | typeof EXIT_VALIDATION
  | typeof EXIT_DEPENDENCY_MISSING
  | typeof EXIT_UNSAFE_OPERATION;

export interface CliErrorOptions {
  exitCode?: number;
  details?: unknown;
  hint?: string | null;
  cause?: unknown;
}

export class CliError extends Error {
  public readonly code: string;
  public readonly exitCode: number;
  public readonly details: unknown;
  public readonly hint: string | null;

  constructor(code: string, message: string, options: CliErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "CliError";
    this.code = code;
    this.exitCode = options.exitCode ?? EXIT_OPERATION_FAILED;
    this.details = options.details ?? null;
    this.hint = options.hint ?? null;
  }
}

export function normaliseError(error: unknown): CliError {
  if (error instanceof CliError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  return new CliError("UNEXPECTED_ERROR", message, {
    exitCode: EXIT_OPERATION_FAILED,
    cause: error instanceof Error ? error : undefined,
  });
}