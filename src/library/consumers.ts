import type { ConsumerLink, LibraryEntry, LibraryScan } from "./types.js";

export interface ConsumerEdge {
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

export interface ConsumerGraph {
  incoming: Map<string, ConsumerEdge[]>;
  outgoing: Map<string, ConsumerEdge[]>;
}

export function buildConsumerGraph(scan: LibraryScan): ConsumerGraph {
  const entryByManifestPath = new Map(
    scan.entries.map((entry) => [entry.manifestPath, entry]),
  );
  const incoming = new Map<string, ConsumerEdge[]>();
  const outgoing = new Map<string, ConsumerEdge[]>();

  for (const reference of scan.references) {
    const source = entryByManifestPath.get(reference.sourceManifestPath);

    if (!source) continue;

    const referenceWithFields = reference as unknown as { value: string; targetKind: string; field: string; targetManifestPath?: string };

    const edge: ConsumerEdge = {
      source: publicTarget(source),
      target: referenceWithFields.targetManifestPath
        ? publicTarget(
            entryByManifestPath.get(referenceWithFields.targetManifestPath),
          )
        : {
            id: referenceWithFields.value,
            kind: referenceWithFields.targetKind,
            manifestPath: null,
          },
      field: referenceWithFields.field,
      reference: referenceWithFields.value,
      resolved: Boolean(referenceWithFields.targetManifestPath),
    };

    const sourceEdges = outgoing.get(source.manifestPath) ?? [];
    sourceEdges.push(edge);
    outgoing.set(source.manifestPath, sourceEdges);

    if (reference.targetManifestPath) {
      const targetEdges = incoming.get(reference.targetManifestPath) ?? [];
      targetEdges.push(edge);
      incoming.set(reference.targetManifestPath, targetEdges);
    }
  }

  for (const edges of incoming.values()) sortEdges(edges);
  for (const edges of outgoing.values()) sortEdges(edges);

  return {
    incoming,
    outgoing,
  };
}

export function consumersForEntry(
  entry: { manifestPath: string },
  graph: ConsumerGraph,
): ConsumerEdge[] {
  return graph.incoming.get(entry.manifestPath) ?? [];
}

export function dependenciesForEntry(
  entry: { manifestPath: string },
  graph: ConsumerGraph,
): ConsumerEdge[] {
  return graph.outgoing.get(entry.manifestPath) ?? [];
}

function publicTarget(entry: PublicConsumerTarget | null | undefined): PublicConsumerTarget {
  if (!entry) {
    return {
      id: "",
      kind: "",
      category: "",
      title: null,
      level: null,
      collection: null,
      ownerArtifact: null,
      user: null,
      displayPath: null,
      manifestPath: null,
    };
  }

  const source = entry as unknown as LibraryEntry;
  return {
    id: entry.id,
    kind: entry.kind,
    category: entry.category,
    title: entry.title,
    level: source.level ?? null,
    collection: source.collection ?? null,
    ownerArtifact: source.ownerArtifact ?? null,
    user: source.user ?? null,
    displayPath: entry.displayPath,
    manifestPath: entry.manifestPath,
  } as PublicConsumerTarget;
}

function sortEdges(edges: ConsumerEdge[]): void {
  edges.sort(
    (left, right) =>
      left.source.kind.localeCompare(right.source.kind, "en") ||
      left.source.id.localeCompare(right.source.id, "en") ||
      left.field.localeCompare(right.field, "en"),
  );
}