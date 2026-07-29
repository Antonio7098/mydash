import { CliError, EXIT_USAGE } from "./errors.js";
import type { CliInvocation } from "./types.js";

const GLOBAL_OPTIONS_WITH_VALUES = new Set(["--workspace"]);
const GLOBAL_BOOLEAN_OPTIONS = new Set(["--json", "--help", "-h", "--version", "-v"]);

export function parseInvocation(argv: readonly string[]): CliInvocation {
  const invocation: CliInvocation = {
    commandName: null,
    args: [],
    options: {},
    json: false,
    helpRequested: false,
    versionRequested: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === undefined) {
      continue;
    }

    if (GLOBAL_BOOLEAN_OPTIONS.has(value)) {
      if (value === "--json") invocation.json = true;
      if (value === "--help" || value === "-h") {
        invocation.helpRequested = true;
      }
      if (value === "--version" || value === "-v") {
        invocation.versionRequested = true;
      }
      continue;
    }

    if (GLOBAL_OPTIONS_WITH_VALUES.has(value)) {
      const next = argv[index + 1];

      if (!next || next.startsWith("-")) {
        throw new CliError(
          "MISSING_OPTION_VALUE",
          `${value} requires a value.`,
          {
            exitCode: EXIT_USAGE,
          },
        );
      }

      invocation.options[normaliseOptionName(value)] = next;
      index += 1;
      continue;
    }

    if (!invocation.commandName && !value.startsWith("-")) {
      invocation.commandName = value;
      continue;
    }

    invocation.args.push(value);
  }

  return invocation;
}

function normaliseOptionName(value: string): string {
  return value
    .replace(/^--/, "")
    .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}