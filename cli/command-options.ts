import { CliError, EXIT_USAGE } from "./errors.js";

export interface CommandArgumentSpec<
  Booleans extends readonly string[] = readonly string[],
  Values extends readonly string[] = readonly string[],
> {
  booleans?: Booleans;
  values?: Values;
  aliases?: Record<string, string>;
}

export interface CommandArgumentSet {
  booleans: Set<string>;
  values: Set<string>;
  aliases: Map<string, string>;
}

type CamelCase<Value extends string> =
  Value extends `${infer Head}-${infer Next}${infer Rest}`
    ? `${Head}${Uppercase<Next>}${CamelCase<Rest>}`
    : Value;

export type ParsedCommandOptions<
  Booleans extends readonly string[] = readonly string[],
  Values extends readonly string[] = readonly string[],
> = Record<string, string | boolean | undefined> &
  { [Key in Booleans[number] as CamelCase<Key>]?: boolean } &
  { [Key in Values[number] as CamelCase<Key>]?: string };

export interface ParsedCommandArguments<
  Booleans extends readonly string[] = readonly string[],
  Values extends readonly string[] = readonly string[],
> {
  positionals: string[];
  options: ParsedCommandOptions<Booleans, Values>;
}

export interface IntegerOptionSpec {
  label?: string;
  minimum?: number;
  maximum?: number;
  defaultValue?: number;
}

export function parseCommandArguments<
  const Booleans extends readonly string[] = readonly [],
  const Values extends readonly string[] = readonly [],
>(
  argv: readonly string[],
  specification: CommandArgumentSpec<Booleans, Values> = {} as CommandArgumentSpec<Booleans, Values>,
): ParsedCommandArguments<Booleans, Values> {
  const booleans = new Set(specification.booleans ?? []);
  const values = new Set(specification.values ?? []);
  const aliases = new Map(Object.entries(specification.aliases ?? {}));
  const options: Record<string, string | boolean> = {};
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === undefined) {
      continue;
    }

    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    if (!token.startsWith("-")) {
      positionals.push(token);
      continue;
    }

    const [rawName, inlineValue] = token.split("=", 2);
    if (rawName === undefined) {
      continue;
    }
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

  return {
    positionals,
    options: options as unknown as ParsedCommandOptions<Booleans, Values>,
  };
}

export function requirePositionals(
  positionals: readonly string[],
  minimum: 1,
  usage: string,
): asserts positionals is readonly [string, ...string[]];
export function requirePositionals(
  positionals: readonly string[],
  minimum: number,
  usage: string,
): void;
export function requirePositionals(
  positionals: readonly string[],
  minimum: number,
  usage: string,
): void {
  if (positionals.length < minimum) {
    throw usageError(
      `Missing required argument. Usage: ${usage}`,
    );
  }
}

export function parseIntegerOption(
  value: string | undefined,
  options: IntegerOptionSpec = {},
): number | undefined {
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

function usageError(message: string): CliError {
  return new CliError("INVALID_USAGE", message, {
    exitCode: EXIT_USAGE,
  });
}

function toCamelCase(value: string): string {
  return value.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}