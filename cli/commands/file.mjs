import {
  parseCommandArguments,
  parseIntegerOption,
  requirePositionals,
} from "../command-options.mjs";
import { CliError, EXIT_USAGE } from "../errors.mjs";
import { identifyFile } from "../../src/files/identify.mjs";
import { hashFile } from "../../src/files/hash.mjs";
import { buildTree } from "../../src/files/tree.mjs";
import { findFiles } from "../../src/files/find.mjs";
import { createSafeName } from "../../src/files/safe-name.mjs";
import { resolveCommandPath } from "../../src/files/paths.mjs";
import { findWorkspaceRoot } from "../../src/workspace/find-root.mjs";

const SUBCOMMANDS = new Set([
  "identify",
  "hash",
  "tree",
  "find",
  "safe-name",
]);

export const fileCommand = {
  name: "file",
  summary: "Run safe deterministic filesystem utilities.",
  usage: "mydash file <subcommand> [arguments] [options]",
  options: [
    "identify <path>              Detect a file's type and media format.",
    "hash <path>                  Calculate a SHA-256 or SHA-512 hash.",
    "tree <directory>             Show a deterministic directory tree.",
    "find <pattern>               Find files using *, ** and ? wildcards.",
    "safe-name <text>             Produce a safe lower-case file name.",
    "--allow-outside              Permit read-only access outside the workspace.",
    "--json                       Return structured JSON.",
  ],

  async run(invocation, context) {
    const [subcommand, ...rest] = invocation.args;

    if (!SUBCOMMANDS.has(subcommand)) {
      throw new CliError(
        "UNKNOWN_FILE_SUBCOMMAND",
        subcommand
          ? `Unknown file subcommand: ${subcommand}`
          : "A file subcommand is required.",
        {
          exitCode: EXIT_USAGE,
          details: {
            availableSubcommands: [...SUBCOMMANDS],
          },
          hint: "Run mydash help file to see available file operations.",
        },
      );
    }

    const workspaceRoot = await findWorkspaceRoot(
      invocation.options.workspace ?? context.cwd,
    );

    switch (subcommand) {
      case "identify":
        return runIdentify(rest, context, workspaceRoot);
      case "hash":
        return runHash(rest, context, workspaceRoot);
      case "tree":
        return runTree(rest, context, workspaceRoot);
      case "find":
        return runFind(rest, context, workspaceRoot);
      case "safe-name":
        return runSafeName(rest);
      default:
        throw new Error("Unreachable file subcommand.");
    }
  },
};

async function runIdentify(args, context, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    booleans: ["allow-outside"],
  });

  requirePositionals(
    parsed.positionals,
    1,
    "mydash file identify <path> [--allow-outside]",
  );

  const path = await resolveCommandPath(parsed.positionals[0], {
    cwd: context.cwd,
    workspaceRoot,
    allowOutside: parsed.options.allowOutside ?? false,
    mustExist: true,
    requireFile: true,
  });

  const data = await identifyFile(path, { workspaceRoot });

  return {
    ok: true,
    command: "file identify",
    data,
    text: [
      `Path: ${data.displayPath}`,
      `Type: ${data.type}`,
      `Media type: ${data.mediaType}`,
      `Confidence: ${data.confidence}`,
    ].join("\n"),
  };
}

async function runHash(args, context, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    booleans: ["allow-outside"],
    values: ["algorithm"],
  });

  requirePositionals(
    parsed.positionals,
    1,
    "mydash file hash <path> [--algorithm sha256|sha512]",
  );

  const path = await resolveCommandPath(parsed.positionals[0], {
    cwd: context.cwd,
    workspaceRoot,
    allowOutside: parsed.options.allowOutside ?? false,
    mustExist: true,
    requireFile: true,
  });

  const algorithm = parsed.options.algorithm ?? "sha256";

  if (!["sha256", "sha512"].includes(algorithm)) {
    throw new CliError(
      "UNSUPPORTED_HASH_ALGORITHM",
      "Hash algorithm must be sha256 or sha512.",
      { exitCode: EXIT_USAGE },
    );
  }

  const data = await hashFile(path, {
    algorithm,
    workspaceRoot,
  });

  return {
    ok: true,
    command: "file hash",
    data,
    text: `${data.algorithm}  ${data.hash}  ${data.displayPath}`,
  };
}

async function runTree(args, context, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    booleans: ["allow-outside", "hidden"],
    values: ["depth"],
  });

  requirePositionals(
    parsed.positionals,
    1,
    "mydash file tree <directory> [--depth 3] [--hidden]",
  );

  const path = await resolveCommandPath(parsed.positionals[0], {
    cwd: context.cwd,
    workspaceRoot,
    allowOutside: parsed.options.allowOutside ?? false,
    mustExist: true,
    requireDirectory: true,
  });

  const maxDepth = parseIntegerOption(parsed.options.depth, {
    label: "Depth",
    minimum: 0,
    maximum: 20,
    defaultValue: 3,
  });

  const data = await buildTree(path, {
    workspaceRoot,
    maxDepth,
    includeHidden: parsed.options.hidden ?? false,
  });

  return {
    ok: true,
    command: "file tree",
    data,
    text: data.text,
  };
}

async function runFind(args, context, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    booleans: ["allow-outside", "hidden"],
    values: ["root", "max-results"],
  });

  requirePositionals(
    parsed.positionals,
    1,
    "mydash file find <pattern> [--root <directory>]",
  );

  const rootInput =
    parsed.options.root ??
    (workspaceRoot ? "." : context.cwd);

  const root = await resolveCommandPath(rootInput, {
    cwd: workspaceRoot ?? context.cwd,
    workspaceRoot,
    allowOutside: parsed.options.allowOutside ?? false,
    mustExist: true,
    requireDirectory: true,
  });

  const maxResults = parseIntegerOption(parsed.options.maxResults, {
    label: "Maximum results",
    minimum: 1,
    maximum: 10000,
    defaultValue: 200,
  });

  const data = await findFiles(root, parsed.positionals[0], {
    workspaceRoot,
    includeHidden: parsed.options.hidden ?? false,
    maxResults,
  });

  return {
    ok: true,
    command: "file find",
    data,
    text:
      data.matches.length > 0
        ? data.matches.map((match) => match.path).join("\n")
        : "No matching files found.",
    warnings: data.truncated
      ? [
          {
            code: "RESULTS_TRUNCATED",
            message:
              `Results were limited to ${maxResults}. Refine the pattern or increase --max-results.`,
          },
        ]
      : [],
  };
}

async function runSafeName(args) {
  const parsed = parseCommandArguments(args, {
    values: ["extension"],
  });

  requirePositionals(
    parsed.positionals,
    1,
    "mydash file safe-name <text> [--extension html]",
  );

  const input = parsed.positionals.join(" ");
  const data = createSafeName(input, {
    extension: parsed.options.extension,
  });

  return {
    ok: true,
    command: "file safe-name",
    data,
    text: data.safeName,
  };
}
