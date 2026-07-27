export const EXIT_SUCCESS = 0;
export const EXIT_OPERATION_FAILED = 1;
export const EXIT_USAGE = 2;
export const EXIT_VALIDATION = 3;
export const EXIT_DEPENDENCY_MISSING = 4;
export const EXIT_UNSAFE_OPERATION = 5;

export class CliError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "CliError";
    this.code = code;
    this.exitCode = options.exitCode ?? EXIT_OPERATION_FAILED;
    this.details = options.details ?? null;
    this.hint = options.hint ?? null;
  }
}

export function normaliseError(error) {
  if (error instanceof CliError) {
    return error;
  }

  return new CliError(
    "UNEXPECTED_ERROR",
    error instanceof Error ? error.message : String(error),
    {
      exitCode: EXIT_OPERATION_FAILED,
      cause: error instanceof Error ? error : undefined,
    },
  );
}
