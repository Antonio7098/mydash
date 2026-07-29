import {
  parseCommandArguments,
  requirePositionals,
} from "../command-options.js";
import { CliError, EXIT_UNSAFE_OPERATION, EXIT_USAGE, EXIT_VALIDATION } from "../errors.js";
import { findWorkspaceRoot } from "../../src/workspace/find-root.js";
import {
  findLibraryEntries,
  scanWorkspaceLibrary,
} from "../../src/library/scan.js";
import {
  buildConsumerGraph,
  consumersForEntry,
} from "../../src/library/consumers.js";
import {
  scopedLibraryView,
} from "../../src/users/scope.js";
import type {
  LibraryDiagnostic,
  LibraryEntry,
  LibraryScan,
} from "../../src/library/types.js";
import type { CommandDefinition } from "../types.js";

const SUBCOMMANDS = new Set([
  "scan",
  "list",
  "inspect",
  "diagnostics",
  "consumers",
]);

export const libraryCommand: CommandDefinition = {
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
    "--all-users                   Include artifacts from every user.",
    "--workspace <path>            Scan a specific workspace.",
    "--json                        Return structured JSON.",
  ],

  async run(invocation, context) {
    const [subcommand, ...rest] = invocation.args;

    if (subcommand === undefined || !SUBCOMMANDS.has(subcommand)) {
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
      typeof invocation.options.workspace === "string"
        ? invocation.options.workspace
        : context.cwd,
    );

    if (!workspaceRoot) {
      throw new CliError(
        "WORKSPACE_NOT_FOUND",
        "No My Dashboards workspace was found.",
        { exitCode: EXIT_UNSAFE_OPERATION },
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

async function runScan(args: readonly string[], workspaceRoot: string) {
  const parsed = parseCommandArguments(args, {
    booleans: ["all-users"],
  });
  rejectPositionals(parsed.positionals, "mydash library scan");
  const scan = await scanWorkspaceLibrary(workspaceRoot);
  const view = createScopedView(scan, parsed.options.allUsers);

  return {
    ok: view.summary.errorCount === 0,
    command: "library scan",
    data: serialiseScan(scan, view),
    warnings: issuesAsWarnings(view.issues),
    exitCode:
      view.summary.errorCount === 0 ? 0 : EXIT_VALIDATION,
    text: renderSummary(view),
  };
}

async function runList(args: readonly string[], workspaceRoot: string) {
  const parsed = parseCommandArguments(args, {
    booleans: ["all-users"],
    values: ["kind", "level", "collection"],
  });
  rejectPositionals(parsed.positionals, "mydash library list");

  const scan = await scanWorkspaceLibrary(workspaceRoot);
  const view = createScopedView(scan, parsed.options.allUsers);
  const entries = findLibraryEntries(view.entries, {
    kind: parsed.options.kind,
    level: parsed.options.level,
    collection: parsed.options.collection,
  });

  return {
    ok: true,
    command: "library list",
    data: {
      filters: parsed.options,
      entries: entries.map((entry) => publicEntry(entry)),
      issueSummary: view.summary,
    },
    warnings: issuesAsWarnings(view.issues),
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

async function runInspect(args: readonly string[], workspaceRoot: string) {
  const parsed = parseCommandArguments(args, {
    booleans: ["all-users"],
    values: ["kind"],
  });
  requirePositionals(
    parsed.positionals,
    1,
    "mydash library inspect <id> [--kind <kind>]",
  );

  const scan = await scanWorkspaceLibrary(workspaceRoot);
  const view = createScopedView(scan, parsed.options.allUsers);
  const entry = requireUniqueEntry(
    view.entries,
    parsed.positionals[0],
    parsed.options.kind,
  );
  const graph = buildConsumerGraph(scan);
  const consumers = consumersForEntry(entry, graph).filter(
    (consumer) =>
      parsed.options.allUsers ||
      consumer.source.category !== "artifact" ||
      consumer.source.user === scan.config.user,
  );

  return {
    ok: true,
    command: "library inspect",
    data: {
      entry: publicEntry(entry, true),
      consumers,
      relatedIssues: view.issues.filter(
        (issue) =>
          issue.manifestPath === entry.manifestPath ||
          issue.targetManifestPath === entry.manifestPath,
      ),
    },
    warnings: issuesAsWarnings(view.issues),
    text: renderInspection(entry, consumers),
  };
}

async function runDiagnostics(args: readonly string[], workspaceRoot: string) {
  const parsed = parseCommandArguments(args, {
    booleans: ["all-users"],
    values: ["severity", "code"],
  });
  rejectPositionals(
    parsed.positionals,
    "mydash library diagnostics",
  );

  const scan = await scanWorkspaceLibrary(workspaceRoot);
  const view = createScopedView(scan, parsed.options.allUsers);
  const issues = view.issues.filter((issue) => {
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
    ok: view.summary.errorCount === 0,
    command: "library diagnostics",
    data: {
      summary: view.summary,
      issues,
    },
    exitCode:
      view.summary.errorCount === 0 ? 0 : EXIT_VALIDATION,
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

async function runConsumers(args: readonly string[], workspaceRoot: string) {
  const parsed = parseCommandArguments(args, {
    booleans: ["all-users"],
    values: ["kind"],
  });
  requirePositionals(
    parsed.positionals,
    1,
    "mydash library consumers <id> [--kind <kind>]",
  );

  const scan = await scanWorkspaceLibrary(workspaceRoot);
  const view = createScopedView(scan, parsed.options.allUsers);
  const entry = requireUniqueEntry(
    view.entries,
    parsed.positionals[0],
    parsed.options.kind,
  );
  const graph = buildConsumerGraph(scan);
  const consumers = consumersForEntry(entry, graph).filter(
    (consumer) =>
      parsed.options.allUsers ||
      consumer.source.category !== "artifact" ||
      consumer.source.user === scan.config.user,
  );

  return {
    ok: true,
    command: "library consumers",
    data: {
      target: publicEntry(entry),
      consumers,
    },
    warnings: issuesAsWarnings(view.issues),
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

function createScopedView(scan: LibraryScan, allUsers?: boolean) {
  return scopedLibraryView<LibraryEntry, LibraryDiagnostic>(
    { ...scan, issues: scan.issues ?? [] },
    { allUsers },
  );
}

function requireUniqueEntry(
  entries: readonly LibraryEntry[],
  id: string,
  kind: string | undefined,
): LibraryEntry {
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

  return matches[0] as LibraryEntry;
}

function serialiseScan(
  scan: LibraryScan,
  view: ReturnType<typeof createScopedView>,
) {
  return {
    workspaceRoot: scan.workspaceRoot,
    user: scan.config.user,
    allUsers:
      view.entries === scan.entries,
    summary: view.summary,
    entries: view.entries.map((entry) => publicEntry(entry)),
    issues: view.issues,
  };
}

function publicEntry(entry: LibraryEntry, includeManifest = false) {
  return {
    id: entry.id,
    kind: entry.kind,
    category: entry.category,
    title: entry.title,
    level: entry.level,
    collection: entry.collection,
    user: entry.user,
    displayPath: entry.displayPath,
    manifestPath: entry.manifestPath,
    ...(includeManifest ? { manifest: entry.manifest } : {}),
  };
}

function renderSummary(scan: ReturnType<typeof createScopedView>): string {
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

function renderInspection(
  entry: LibraryEntry,
  consumers: ReturnType<typeof consumersForEntry>,
): string {
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

function issuesAsWarnings(issues: readonly LibraryDiagnostic[]) {
  return issues
    .filter((issue) => issue.severity === "warning")
    .map((issue) => ({
      code: issue.code,
      message: issue.message,
    }));
}

function rejectPositionals(
  positionals: readonly string[],
  usage: string,
): void {
  if (positionals.length > 0) {
    throw new CliError(
      "INVALID_USAGE",
      `Unexpected argument: ${positionals[0]}. Usage: ${usage}`,
      { exitCode: EXIT_USAGE },
    );
  }
}
