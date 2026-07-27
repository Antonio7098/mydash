export function writeResult(result, options) {
  if (options.json) {
    options.stdout.write(
      `${JSON.stringify(
        {
          ok: result?.ok ?? true,
          command: result?.command ?? null,
          data: result?.data ?? null,
          warnings: result?.warnings ?? [],
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const text = result?.text ?? "";

  if (text) {
    options.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
  }

  for (const warning of result?.warnings ?? []) {
    options.stdout.write(`! ${warning.message ?? warning}\n`);
  }
}

export function writeError(error, options) {
  if (options.json) {
    options.stderr.write(
      `${JSON.stringify(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
          },
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  options.stderr.write(`Error [${error.code}]: ${error.message}\n`);

  if (error.hint) {
    options.stderr.write(`Hint: ${error.hint}\n`);
  }
}
