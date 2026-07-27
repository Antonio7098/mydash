import {
  parseCommandArguments,
  requirePositionals,
} from "../command-options.mjs";
import { CliError, EXIT_USAGE, EXIT_VALIDATION } from "../errors.mjs";
import { findWorkspaceRoot } from "../../src/workspace/find-root.mjs";
import {
  findLibraryEntries,
  scanWorkspaceLibrary,
} from "../../src/library/scan.mjs";
import {
  buildConsumerGraph,
  consumersForEntry,
} from "../../src/library/consumers.mjs";

const SUBCOMMANDS = new Set([
  "scan",
  "list",
  "inspect",
  "diagnostics",
  "consumers",
]);

export const libraryCommand = {
  name: "library",
  summary: "Discover and diagnose artefacts and reusable library resources.",
  usage: "mydash library <subcommand> [arguments] [options]",
  options: [
    "scan                          Scan all configured library roots.",
    "list                          List discovered entries.",
    "inspect <id>                  Inspect one manifest and its consumers.",
    "diagnostics                   Show validation and reference problems.",
    "consumers <id>                Show reverse consumers of a resource.",
    "--kind <kind>                 Filter or disambiguate by kind.",
    "--level <level>               Filter by local, collection or core.",
    "--collection <id>             Filter by collection.",
    "--workspace <path>            Scan a specific workspace.",
    "--json                        Return structured JSON.",
  ],

  async run(invocation, context) {
    const [subcommand, ...rest] = invocation.args;

    if (!SUBCOMMANDS.has(subcommand)) {
      throw new CliError(
        "UNKNOWN_LIBRARY_SUBCOMMAND",
        subcommand
          ? `Unknown library subcommand: ${subcommand}`
          : "A library subcommand is required.",
        {
          exitCode: EXIT_USAGE,
          details: {
            availableSubcommands: [...SUBCOMMANDS],
          },
          hint:
            "Run mydash help library to see available library operations.",
        },
      );
    }

    const workspaceRoot = await findWorkspaceRoot(
      invocation.options.workspace ?? context.cwd,
    );

    if (!workspaceRoot) {
      throw new CliError(
        "WORKSPACE_NOT_FOUND",
        "No My Dashboards workspace was found.",
        { exitCode: EXIT_USAGE },
      );
    }

    switch (subcommand) {
      case "scan":
        return runScan(rest, workspaceRoot);
      case "list":
        return runList(rest, workspaceRoot);
      case "inspect":
        return runInspect(rest, workspaceRoot);
      case "diagnostics":
        return runDiagnostics(rest, workspaceRoot);
      case "consumers":
        return runConsumers(rest, workspaceRoot);
      default:
        throw new Error("Unreachable library subcommand.");
    }
  },
};

async function runScan(args, workspaceRoot) {
  const parsed = parseCommandArguments(args);
  rejectPositionals(parsed.positionals, "mydash library scan");
  const scan = await scanWorkspaceLibrary(workspaceRoot);

  return {
    ok: scan.summary.errorCount === 0,
    command: "library scan",
    data: serialiseScan(scan),
    warnings: issuesAsWarnings(scan.issues),
    exitCode:
      scan.summary.errorCount === 0 ? 0 : EXIT_VALIDATION,
    text: renderSummary(scan),
  };
}

async function runList(args, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    values: ["kind", "level", "collection"],
  });
  rejectPositionals(parsed.positionals, "mydash library list");

  const scan = await scanWorkspaceLibrary(workspaceRoot);
  const entries = findLibraryEntries(scan.entries, {
    kind: parsed.options.kind,
    level: parsed.options.level,
    collection: parsed.options.collection,
  });

  return {
    ok: true,
    command: "library list",
    data: {
      filters: parsed.options,
      entries: entries.map(publicEntry),
      issueSummary: scan.summary,
    },
    warnings: issuesAsWarnings(scan.issues),
    text:
      entries.length > 0
        ? entries
            .map(
              (entry) =>
                `${entry.kind.padEnd(12)} ${entry.id.padEnd(28)} ${entry.displayPath}`,
            )
            .join("\n")
        : "No matching library entries found.",
  };
}

async function runInspect(args, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    values: ["kind"],
  });
  requirePositionals(
    parsed.positionals,
    1,
    "mydash library inspect <id> [--kind <kind>]",
  );

  const scan = await scanWorkspaceLibrary(workspaceRoot);
  const entry = requireUniqueEntry(
    scan.entries,
    parsed.positionals[0],
    parsed.options.kind,
  );
  const graph = buildConsumerGraph(scan);
  const consumers = consumersForEntry(entry, graph);

  return {
    ok: true,
    command: "library inspect",
    data: {
      entry: publicEntry(entry, true),
      consumers,
      relatedIssues: scan.issues.filter(
        (issue) =>
          issue.manifestPath === entry.manifestPath ||
          issue.targetManifestPath === entry.manifestPath,
      ),
    },
    warnings: issuesAsWarnings(scan.issues),
    text: renderInspection(entry, consumers),
  };
}

async function runDiagnostics(args, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    values: ["severity", "code"],
  });
  rejectPositionals(
    parsed.positionals,
    "mydash library diagnostics",
  );

  const scan = await scanWorkspaceLibrary(workspaceRoot);
  const issues = scan.issues.filter((issue) => {
    if (
      parsed.options.severity &&
      issue.severity !== parsed.options.severity
    ) {
      return false;
    }

    if (
      parsed.options.code &&
      issue.code !== parsed.options.code
    ) {
      return false;
    }

    return true;
  });

  return {
    ok: scan.summary.errorCount === 0,
    command: "library diagnostics",
    data: {
      summary: scan.summary,
      issues,
    },
    exitCode:
      scan.summary.errorCount === 0 ? 0 : EXIT_VALIDATION,
    text:
      issues.length > 0
        ? issues
            .map(
              (issue) =>
                `${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`,
            )
            .join("\n")
        : "No library diagnostics found.",
  };
}

async function runConsumers(args, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    values: ["kind"],
  });
  requirePositionals(
    parsed.positionals,
    1,
    "mydash library consumers <id> [--kind <kind>]",
  );

  const scan = await scanWorkspaceLibrary(workspaceRoot);
  const entry = requireUniqueEntry(
    scan.entries,
    parsed.positionals[0],
    parsed.options.kind,
  );
  const graph = buildConsumerGraph(scan);
  const consumers = consumersForEntry(entry, graph);

  return {
    ok: true,
    command: "library consumers",
    data: {
      target: publicEntry(entry),
      consumers,
    },
    warnings: issuesAsWarnings(scan.issues),
    text:
      consumers.length > 0
        ? consumers
            .map(
              (consumer) =>
                `${consumer.source.kind}:${consumer.source.id} via ${consumer.field}`,
            )
            .join("\n")
        : `No consumers found for ${entry.kind}:${entry.id}.`,
  };
}

function requireUniqueEntry(entries, id, kind) {
  const matches = entries.filter(
    (entry) =>
      entry.id === id &&
      (!kind || entry.kind === kind || entry.category === kind),
  );

  if (matches.length === 0) {
    throw new CliError(
      "LIBRARY_ENTRY_NOT_FOUND",
      `No library entry found for ${kind ? `${kind}:` : ""}${id}.`,
      { exitCode: EXIT_USAGE },
    );
  }

  if (matches.length > 1) {
    throw new CliError(
      "AMBIGUOUS_LIBRARY_ENTRY",
      `Multiple library entries use the identifier ${id}.`,
      {
        exitCode: EXIT_USAGE,
        details: {
          matches: matches.map((entry) => ({
            kind: entry.kind,
            path: entry.displayPath,
          })),
        },
        hint: "Use --kind to disambiguate the entry.",
      },
    );
  }

  return matches[0];
}

function serialiseScan(scan) {
  return {
    workspaceRoot: scan.workspaceRoot,
    summary: scan.summary,
    entries: scan.entries.map(publicEntry),
    issues: scan.issues,
  };
}

function publicEntry(entry, includeManifest = false) {
  return {
    id: entry.id,
    kind: entry.kind,
    category: entry.category,
    title: entry.title,
    level: entry.level,
    collection: entry.collection,
    displayPath: entry.displayPath,
    manifestPath: entry.manifestPath,
    ...(includeManifest ? { manifest: entry.manifest } : {}),
  };
}

function renderSummary(scan) {
  const lines = [
    `Library entries: ${scan.summary.entryCount}`,
    `Artefacts: ${scan.summary.artifactCount}`,
    `Reusable resources: ${scan.summary.resourceCount}`,
    `Errors: ${scan.summary.errorCount}`,
    `Warnings: ${scan.summary.warningCount}`,
  ];

  for (const [kind, count] of Object.entries(scan.summary.byKind)) {
    lines.push(`  ${kind}: ${count}`);
  }

  return lines.join("\n");
}

function renderInspection(entry, consumers) {
  const lines = [
    `${entry.kind}:${entry.id}`,
    `Name: ${entry.title}`,
    `Manifest: ${entry.displayPath}`,
  ];

  if (entry.level) lines.push(`Level: ${entry.level}`);
  if (entry.collection) {
    lines.push(`Collection: ${entry.collection}`);
  }

  lines.push(`Consumers: ${consumers.length}`);

  return lines.join("\n");
}

function issuesAsWarnings(issues) {
  return issues
    .filter((issue) => issue.severity === "warning")
    .map((issue) => ({
      code: issue.code,
      message: issue.message,
    }));
}

function rejectPositionals(positionals, usage) {
  if (positionals.length > 0) {
    throw new CliError(
      "INVALID_USAGE",
      `Unexpected argument: ${positionals[0]}. Usage: ${usage}`,
      { exitCode: EXIT_USAGE },
    );
  }
}
