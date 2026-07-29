import type { CliErrorShape, CliOutputOptions, CommandResult, ErrorEnvelope, ResultEnvelope, Warning } from "./types.js";

export function writeResult(
  result: Partial<CommandResult> | null | undefined,
  options: Pick<CliOutputOptions, "json" | "stdout">,
): void {
  if (options.json) {
    const envelope: ResultEnvelope = {
      ok: result?.ok ?? true,
      command: result?.command ?? null,
      data: (result?.data ?? null) as unknown,
      warnings: result?.warnings ?? [],
    };
    options.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
    return;
  }

  const text: string | undefined = result?.text;

  if (text) {
    options.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
  }

  const warnings: Warning[] = result?.warnings ?? [];
  for (const warning of warnings) {
    options.stdout.write(`! ${warning.message ?? warning}\n`);
  }
}

export function writeError(
  error: CliErrorShape,
  options: Pick<CliOutputOptions, "json" | "stderr"> & { stderr: NodeJS.WritableStream },
): void {
  if (options.json) {
    const envelope: ErrorEnvelope = {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint ?? null,
      },
    };
    options.stderr.write(`${JSON.stringify(envelope, null, 2)}\n`);
    return;
  }

  options.stderr.write(`Error [${error.code}]: ${error.message}\n`);

  if (error.hint) {
    options.stderr.write(`Hint: ${error.hint}\n`);
  }
}