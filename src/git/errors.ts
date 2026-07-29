export interface GitSafetyErrorOptions {
  exitCode?: number;
  details?: unknown;
  hint?: string | null;
}

export class GitSafetyError extends Error {
  public readonly code: string;
  public readonly exitCode: number;
  public readonly details: unknown;
  public readonly hint: string | null;

  constructor(code: string, message: string, options: GitSafetyErrorOptions = {}) {
    super(message);
    this.name = "GitSafetyError";
    this.code = code;
    this.exitCode = options.exitCode ?? 1;
    this.details = options.details ?? null;
    this.hint = options.hint ?? null;
  }
}