export function buildConsumerGraph(scan) {
  const entryByManifestPath = new Map(
    scan.entries.map((entry) => [entry.manifestPath, entry]),
  );
  const incoming = new Map();
  const outgoing = new Map();

  for (const reference of scan.references) {
    const source = entryByManifestPath.get(
      reference.sourceManifestPath,
    );

    if (!source) continue;

    const edge = {
      source: publicTarget(source),
      target: reference.targetManifestPath
        ? publicTarget(
            entryByManifestPath.get(reference.targetManifestPath),
          )
        : {
            id: reference.value,
            kind: reference.targetKind,
            manifestPath: null,
          },
      field: reference.field,
      reference: reference.value,
      resolved: Boolean(reference.targetManifestPath),
    };

    const sourceEdges =
      outgoing.get(source.manifestPath) ?? [];
    sourceEdges.push(edge);
    outgoing.set(source.manifestPath, sourceEdges);

    if (reference.targetManifestPath) {
      const targetEdges =
        incoming.get(reference.targetManifestPath) ?? [];
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

export function consumersForEntry(entry, graph) {
  return graph.incoming.get(entry.manifestPath) ?? [];
}

export function dependenciesForEntry(entry, graph) {
  return graph.outgoing.get(entry.manifestPath) ?? [];
}

function publicTarget(entry) {
  if (!entry) return null;

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

function sortEdges(edges) {
  edges.sort(
    (left, right) =>
      left.source.kind.localeCompare(right.source.kind, "en") ||
      left.source.id.localeCompare(right.source.id, "en") ||
      left.field.localeCompare(right.field, "en"),
  );
}
