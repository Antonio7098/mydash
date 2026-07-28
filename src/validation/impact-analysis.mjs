import {
  buildConsumerGraph,
} from "../library/consumers.mjs";
import {
  CliError,
  EXIT_USAGE,
} from "../../cli/errors.mjs";

export function findImpactTarget(
  entries,
  reference,
  kind = null,
) {
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

  return matches[0];
}

function parseTargetReference(reference) {
  const parts = String(reference).split("/").filter(Boolean);

  if (parts.length === 1) {
    return {
      scope: null,
      id: parts[0],
    };
  }

  if (parts.length === 2 && parts[0] === "core") {
    return {
      scope: "core",
      id: parts[1],
    };
  }

  if (
    parts.length === 3 &&
    parts[0] === "local"
  ) {
    return {
      scope: "local",
      ownerArtifact: parts[1],
      id: parts[2],
    };
  }

  if (parts.length === 2) {
    return {
      scope: "collection",
      collection: parts[0],
      id: parts[1],
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

export function analyseLibraryImpact(
  scan,
  target,
  options = {},
) {
  const graph = buildConsumerGraph(scan);
  const entryByPath = new Map(
    scan.entries.map((entry) => [
      entry.manifestPath,
      entry,
    ]),
  );
  const queue = [target.manifestPath];
  const visitedTargets = new Set(queue);
  const edgeKeys = new Set();
  const edges = [];
  const consumers = new Map();

  while (queue.length > 0) {
    const current = queue.shift();
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
        edge.source.manifestPath,
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
    .sort(compareEntries);
  const affectedResources = allConsumers
    .filter((entry) => entry.category !== "artifact")
    .map(publicEntry)
    .sort(compareEntries);
  const directEdges =
    graph.incoming.get(target.manifestPath) ?? [];
  const changeType =
    options.changeType ?? "implementation";
  const scope = target.level ?? "shared";
  const risk = assessRisk({
    target,
    changeType,
    affectedArtifactCount:
      affectedArtifacts.length,
    transitiveConsumerCount:
      allConsumers.length,
  });
  const recommendations =
    buildRecommendations({
      target,
      changeType,
      affectedArtifacts,
      risk,
    });

  return {
    target: publicEntry(target),
    changeType,
    directConsumers: directEdges.map(publicEdge),
    transitiveConsumers: allConsumers
      .map(publicEntry)
      .sort(compareEntries),
    affectedArtifacts,
    affectedResources,
    edges: edges.map(publicEdge).sort(compareEdges),
    recommendations,
    summary: {
      scope,
      risk,
      directConsumerCount: directEdges.length,
      transitiveConsumerCount:
        allConsumers.length,
      affectedArtifactCount:
        affectedArtifacts.length,
      affectedResourceCount:
        affectedResources.length,
    },
  };
}

function assessRisk(options) {
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

function buildRecommendations(options) {
  const commands = [];

  if (options.target.level === "core") {
    commands.push("mydash validate");
  } else if (
    options.target.level === "collection"
  ) {
    for (const artifact of options.affectedArtifacts) {
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
    const owner = options.affectedArtifacts.find(
      (artifact) =>
        artifact.id === options.target.ownerArtifact,
    );
    commands.push(
      owner
        ? `mydash validate --artifact ${owner.id} --kind ${owner.kind}`
        : `mydash validate --artifact ${options.target.ownerArtifact}`,
    );
  }

  if (
    options.changeType === "contract" &&
    !commands.includes("mydash validate")
  ) {
    commands.push("mydash validate");
  }

  return [...new Set(commands)];
}

function publicEntry(entry) {
  return {
    id: entry.id,
    kind: entry.kind,
    category: entry.category,
    title: entry.title,
    level: entry.level,
    collection: entry.collection,
    ownerArtifact: entry.ownerArtifact,
    user: entry.user,
    displayPath: entry.displayPath,
    manifestPath: entry.manifestPath,
  };
}

function publicEdge(edge) {
  return {
    source: edge.source,
    target: edge.target,
    field: edge.field,
    reference: edge.reference,
    resolved: edge.resolved,
  };
}

function compareEntries(left, right) {
  return (
    left.kind.localeCompare(right.kind, "en") ||
    left.id.localeCompare(right.id, "en") ||
    left.displayPath.localeCompare(
      right.displayPath,
      "en",
    )
  );
}

function compareEdges(left, right) {
  return (
    left.source.kind.localeCompare(
      right.source.kind,
      "en",
    ) ||
    left.source.id.localeCompare(
      right.source.id,
      "en",
    ) ||
    left.field.localeCompare(right.field, "en")
  );
}
