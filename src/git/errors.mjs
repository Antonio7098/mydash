export class GitSafetyError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = "GitSafetyError";
    this.code = code;
    this.exitCode = options.exitCode ?? 1;
    this.details = options.details ?? null;
    this.hint = options.hint ?? null;
  }
}
