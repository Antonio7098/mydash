import { CliError, EXIT_USAGE } from "./errors.mjs";

export function parseCommandArguments(argv, specification = {}) {
  const booleans = new Set(specification.booleans ?? []);
  const values = new Set(specification.values ?? []);
  const aliases = new Map(Object.entries(specification.aliases ?? {}));
  const options = {};
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    if (!token.startsWith("-")) {
      positionals.push(token);
      continue;
    }

    const [rawName, inlineValue] = token.split("=", 2);
    const normalisedRaw = rawName.replace(/^-+/, "");
    const canonical = aliases.get(normalisedRaw) ?? normalisedRaw;

    if (booleans.has(canonical)) {
      if (inlineValue !== undefined) {
        throw usageError(
          `Boolean option --${canonical} does not accept a value.`,
        );
      }

      options[toCamelCase(canonical)] = true;
      continue;
    }

    if (values.has(canonical)) {
      const value = inlineValue ?? argv[index + 1];

      if (
        value === undefined ||
        (inlineValue === undefined && value.startsWith("-"))
      ) {
        throw usageError(`Option --${canonical} requires a value.`);
      }

      options[toCamelCase(canonical)] = value;

      if (inlineValue === undefined) {
        index += 1;
      }

      continue;
    }

    throw usageError(`Unknown option: ${rawName}`);
  }

  return { positionals, options };
}

export function requirePositionals(positionals, minimum, usage) {
  if (positionals.length < minimum) {
    throw usageError(
      `Missing required argument. Usage: ${usage}`,
    );
  }
}

export function parseIntegerOption(value, options = {}) {
  if (value === undefined) return options.defaultValue;

  const parsed = Number.parseInt(value, 10);

  if (
    !Number.isInteger(parsed) ||
    (options.minimum !== undefined && parsed < options.minimum) ||
    (options.maximum !== undefined && parsed > options.maximum)
  ) {
    const range =
      options.minimum !== undefined || options.maximum !== undefined
        ? ` between ${options.minimum ?? "-∞"} and ${options.maximum ?? "∞"}`
        : "";

    throw usageError(
      `${options.label ?? "Value"} must be an integer${range}.`,
    );
  }

  return parsed;
}

function usageError(message) {
  return new CliError("INVALID_USAGE", message, {
    exitCode: EXIT_USAGE,
  });
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}
