import { CliError, EXIT_USAGE } from "../../cli/errors.js";
import { buildConsumerGraph } from "../library/consumers.js";
import type { LibraryScan, LibraryEntry, LibrarySummaryEntry as LibraryEntrySummary } from "../library/types.js";

export type ImpactRisk = "low" | "medium" | "high";

export interface ImpactTarget extends LibraryEntrySummary {
  level: string;
  collection: string | null;
  ownerArtifact: string | null;
  user: string | null;
  contractVersion: number | null;
  slot: string | null;
  displayPath: string;
  manifestPath: string;
}

export interface ImpactEdge {
  source: PublicConsumerTarget;
  target: PublicConsumerTarget | { id: string; kind: string; manifestPath: null };
  field: string;
  reference: string;
  resolved: boolean;
}

export interface PublicConsumerTarget {
  id: string;
  kind: string;
  category: string;
  title: string | null;
  level: string | null;
  collection: string | null;
  ownerArtifact: string | null;
  user: string | null;
  displayPath: string | null;
  manifestPath: string | null;
}

export interface ImpactReport {
  target: ImpactTarget;
  changeType: string;
  directConsumers: ImpactEdge[];
  transitiveConsumers: PublicConsumerTarget[];
  affectedArtifacts: LibraryEntrySummary[];
  affectedResources: LibraryEntrySummary[];
  edges: ImpactEdge[];
  recommendations: string[];
  summary: {
    scope: string;
    risk: ImpactRisk;
    directConsumerCount: number;
    transitiveConsumerCount: number;
    affectedArtifactCount: number;
    affectedResourceCount: number;
  };
}

export function findImpactTarget(
  entries: readonly LibraryEntry[],
  reference: string,
  kind: string | null = null,
): LibraryEntry {
  const qualifier = parseTargetReference(reference);
  const matches = entries.filter((entry) => {
    if (
      entry.category === "artifact" ||
      entry.id !== qualifier.id
    ) {
      return false;
    }

    if (
      kind &&
      entry.kind !== kind &&
      entry.category !== kind
    ) {
      return false;
    }

    if (qualifier.scope === "core") {
      return entry.level === "core";
    }

    if (qualifier.scope === "collection") {
      return (
        entry.level === "collection" &&
        entry.collection === qualifier.collection
      );
    }

    if (qualifier.scope === "local") {
      return (
        entry.level === "local" &&
        entry.ownerArtifact === qualifier.ownerArtifact
      );
    }

    return true;
  });

  if (matches.length === 0) {
    throw new CliError(
      "IMPACT_TARGET_NOT_FOUND",
      `No reusable library resource found for ${kind ? `${kind}:` : ""}${reference}.`,
      { exitCode: EXIT_USAGE },
    );
  }

  if (matches.length > 1) {
    throw new CliError(
      "AMBIGUOUS_IMPACT_TARGET",
      `Multiple reusable resources match ${reference}.`,
      {
        exitCode: EXIT_USAGE,
        details: {
          matches: matches.map((entry) => ({
            kind: entry.kind,
            level: entry.level,
            collection: entry.collection,
            ownerArtifact: entry.ownerArtifact,
            displayPath: entry.displayPath,
          })),
        },
        hint:
          "Qualify the target as core/id, collection/id, or local/artefact/id.",
      },
    );
  }

  return matches[0] as LibraryEntry;
}

interface ParsedTargetReference {
  scope: "core" | "collection" | "local" | null;
  id: string;
  collection?: string;
  ownerArtifact?: string;
}

function parseTargetReference(reference: string): ParsedTargetReference {
  const parts = String(reference).split("/").filter(Boolean);

  if (parts.length === 1) {
    return {
      scope: null,
      id: parts[0] as string,
    };
  }

  if (parts.length === 2 && parts[0] === "core") {
    return {
      scope: "core",
      id: parts[1] as string,
    };
  }

  if (
    parts.length === 3 &&
    parts[0] === "local"
  ) {
    return {
      scope: "local",
      ownerArtifact: parts[1],
      id: parts[2] as string,
    };
  }

  if (parts.length === 2) {
    return {
      scope: "collection",
      collection: parts[0],
      id: parts[1] as string,
    };
  }

  throw new CliError(
    "INVALID_IMPACT_REFERENCE",
    `Invalid impact target reference: ${reference}.`,
    {
      exitCode: EXIT_USAGE,
      hint:
        "Use id, core/id, collection/id, or local/artefact/id.",
    },
  );
}

export interface AnalyseLibraryImpactOptions {
  changeType?: string;
}

export function analyseLibraryImpact(
  scan: LibraryScan,
  target: LibraryEntry,
  options: AnalyseLibraryImpactOptions = {},
): ImpactReport {
  const graph = buildConsumerGraph(scan);
  const entryByPath = new Map(
    scan.entries.map((entry) => [
      entry.manifestPath,
      entry,
    ]),
  );
  const queue = [target.manifestPath];
  const visitedTargets = new Set<string>(queue);
  const edgeKeys = new Set<string>();
  const edges: ImpactEdge[] = [];
  const consumers = new Map<string, LibraryEntry>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    const incoming = graph.incoming.get(current) ?? [];

    for (const edge of incoming) {
      const key = [
        edge.source.manifestPath,
        edge.target?.manifestPath,
        edge.field,
      ].join("|");

      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        edges.push(edge);
      }

      const source = entryByPath.get(
        edge.source.manifestPath ?? "",
      );

      if (!source) continue;

      consumers.set(source.manifestPath, source);

      if (!visitedTargets.has(source.manifestPath)) {
        visitedTargets.add(source.manifestPath);
        queue.push(source.manifestPath);
      }
    }
  }

  if (target.level === "local" && target.ownerArtifact) {
    const owner = scan.entries.find(
      (entry) =>
        entry.category === "artifact" &&
        entry.id === target.ownerArtifact,
    );

    if (owner) {
      consumers.set(owner.manifestPath, owner);
    }
  }

  const allConsumers = [...consumers.values()];
  const affectedArtifacts = allConsumers
    .filter((entry) => entry.category === "artifact")
    .map(publicEntry)
    .sort(compareEntries) as unknown as LibraryEntrySummary[];
  const affectedResources = allConsumers
    .filter((entry) => entry.category !== "artifact")
    .map(publicEntry)
    .sort(compareEntries) as unknown as LibraryEntrySummary[];
  const directEdges =
    graph.incoming.get(target.manifestPath) ?? [];
  const changeType =
    options.changeType ?? "implementation";
  const scope = target.level ?? "shared";
  const risk = assessRisk({
    target,
    changeType,
    affectedArtifactCount: affectedArtifacts.length,
    transitiveConsumerCount: allConsumers.length,
  });
  const recommendations = buildRecommendations({
    target,
    changeType,
    affectedArtifacts,
    risk,
  });
  const transitiveConsumers: PublicConsumerTarget[] = allConsumers
    .map((entry) => publicEntry(entry) as PublicConsumerTarget)
    .sort(compareEntries);

  return {
    target: publicTarget(target),
    changeType,
    directConsumers: directEdges.map(publicEdge),
    transitiveConsumers: transitiveConsumers,
    affectedArtifacts: affectedArtifacts as unknown as LibraryEntrySummary[],
    affectedResources: affectedResources as unknown as LibraryEntrySummary[],
    edges: edges.map(publicEdge).sort(compareEdges),
    recommendations,
    summary: {
      scope,
      risk,
      directConsumerCount: directEdges.length,
      transitiveConsumerCount: allConsumers.length,
      affectedArtifactCount: affectedArtifacts.length,
      affectedResourceCount: affectedResources.length,
    },
  };
}

function assessRisk(options: {
  target: LibraryEntry;
  changeType: string;
  affectedArtifactCount: number;
  transitiveConsumerCount: number;
}): ImpactRisk {
  if (options.transitiveConsumerCount === 0) {
    return "low";
  }

  if (
    options.changeType === "contract" ||
    options.target.level === "core"
  ) {
    return "high";
  }

  if (
    options.target.level === "collection" ||
    options.affectedArtifactCount > 1
  ) {
    return "medium";
  }

  return "low";
}

function buildRecommendations(options: {
  target: LibraryEntry;
  changeType: string;
  affectedArtifacts: PublicConsumerTarget[] | LibraryEntrySummary[];
  risk: ImpactRisk;
}): string[] {
  const commands: string[] = [];

  if (options.target.level === "core") {
    commands.push("mydash validate");
  } else if (
    options.target.level === "collection"
  ) {
    for (const artifact of options.affectedArtifacts as Array<{ id: string; kind: string }>) {
      commands.push(
        `mydash validate --artifact ${artifact.id} --kind ${artifact.kind}`,
      );
    }

    if (commands.length === 0) {
      commands.push(
        "mydash library scan",
        "mydash appearance validate",
      );
    }
  } else if (
    options.target.level === "local" &&
    options.target.ownerArtifact
  ) {
    const owner = (options.affectedArtifacts as Array<{ id: string; kind: string }>).find(
      (artifact) =>
        artifact.id === options.target.ownerArtifact,
    );
    commands.push(
      owner
        ? `mydash validate --artifact ${owner.id} --kind ${owner.kind}`
        : `mydash validate --artifact ${options.target.ownerArtifact}`,
    );
  } else {
    commands.push("mydash validate");
  }

                return commands;
}function publicEntry(entry: LibraryEntry | PublicConsumerTarget): PublicConsumerTarget {
  if ("manifestPath" in entry && "contractVersion" in entry) {
    return entry as PublicConsumerTarget;
  }
  const source = entry as LibraryEntry;
  return {
    id: source.id,
    kind: source.kind,
    category: source.category,
    title: source.title,
    level: source.level ?? null,
    collection: source.collection ?? null,
    ownerArtifact: source.ownerArtifact ?? null,
    user: source.user ?? null,
    displayPath: source.displayPath,
    manifestPath: source.manifestPath,
  };
}

function publicTarget(target: LibraryEntry): ImpactTarget {
  return {
    id: target.id,
    kind: target.kind,
    category: target.category,
    title: target.title,
    level: target.level ?? "shared",
    collection: target.collection,
    ownerArtifact: target.ownerArtifact,
    user: target.user,
    contractVersion: (target.manifest.contractVersion as number | undefined) ?? null,
    slot: (target.manifest.slot as string | undefined) ?? null,
    displayPath: target.displayPath,
    manifestPath: target.manifestPath,
    lifecycle: target.lifecycle,
    scope: target.scope,
    placement: target.placement,
  } as ImpactTarget;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars


function publicEdge(edge: { source: PublicConsumerTarget; target: PublicConsumerTarget | { id: string; kind: string; manifestPath: null }; field: string; reference: string; resolved: boolean }): ImpactEdge {
  return {
    source: edge.source,
    target: edge.target,
    field: edge.field,
    reference: edge.reference,
    resolved: edge.resolved,
  };
}

function compareEntries(left: LibraryEntry | PublicConsumerTarget, right: LibraryEntry | PublicConsumerTarget): number {
  return (
    left.kind.localeCompare(right.kind, "en") ||
    left.id.localeCompare(right.id, "en") ||
    (left.displayPath ?? "").localeCompare(right.displayPath ?? "", "en")
  );
}

function compareEdges(left: ImpactEdge, right: ImpactEdge): number {
  return (
    left.source.kind.localeCompare(right.source.kind, "en") ||
    left.source.id.localeCompare(right.source.id, "en") ||
    left.field.localeCompare(right.field, "en")
  );
}