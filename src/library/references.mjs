import { REFERENCEABLE_KINDS } from "./conventions.mjs";

export function collectReferences(entry) {
  const manifest = entry.manifest;
  const references = [];

  if (entry.category === "artifact") {
    add(references, "theme", manifest.appearance?.theme, "appearance.theme");
    add(references, "preset", manifest.appearance?.preset, "appearance.preset");
    add(
      references,
      "layout",
      manifest.appearance?.overrides?.layout,
      "appearance.overrides.layout",
    );
    addMap(
      references,
      "component",
      manifest.appearance?.overrides?.components,
      "appearance.overrides.components",
    );
    addMap(
      references,
      "primitive",
      manifest.appearance?.overrides?.primitives,
      "appearance.overrides.primitives",
    );
    addMap(
      references,
      "asset",
      manifest.appearance?.overrides?.assets,
      "appearance.overrides.assets",
    );
  }

  if (entry.kind === "preset") {
    add(
      references,
      "layout",
      manifest.mappings?.layout,
      "mappings.layout",
    );
    addMap(
      references,
      "component",
      manifest.mappings?.components,
      "mappings.components",
    );
    addMap(
      references,
      "primitive",
      manifest.mappings?.primitives,
      "mappings.primitives",
    );
    addMap(
      references,
      "asset",
      manifest.mappings?.assets,
      "mappings.assets",
    );
    addArray(
      references,
      "theme",
      manifest.supportedThemes,
      "supportedThemes",
    );
  }

  if (
    entry.kind === "primitive" ||
    entry.kind === "component" ||
    entry.kind === "layout"
  ) {
    addMap(
      references,
      "primitive",
      manifest.dependencies?.primitives,
      "dependencies.primitives",
    );
    addMap(
      references,
      "component",
      manifest.dependencies?.components,
      "dependencies.components",
    );
    addMap(
      references,
      "asset",
      manifest.dependencies?.assets,
      "dependencies.assets",
    );
    addArray(
      references,
      "theme",
      manifest.supportedThemes,
      "supportedThemes",
    );
  }

  if (entry.kind === "theme") {
    addMap(references, "asset", manifest.assets, "assets");
  }

  return references.map((reference) => ({
    ...reference,
    sourceId: entry.id,
    sourceKind: entry.kind,
    sourceCategory: entry.category,
  }));
}

export function resolveReferences(entries, references, issues) {
  const entryByManifest = new Map(
    entries.map((entry) => [entry.manifestPath, entry]),
  );

  for (const reference of references) {
    if (!REFERENCEABLE_KINDS.has(reference.targetKind)) continue;

    const sourceEntry = entryByManifest.get(
      reference.sourceManifestPath,
    );
    const candidates = findReferenceCandidates(
      entries,
      reference.targetKind,
      reference.value,
      {
        sourceEntry,
      },
    );

    if (candidates.length === 0) {
      issues.push({
        severity: "error",
        code: "UNRESOLVED_LIBRARY_REFERENCE",
        message: `${reference.sourceKind}:${reference.sourceId} references missing ${reference.targetKind}:${reference.value} via ${reference.field}.`,
        manifestPath: reference.sourceManifestPath,
        targetKind: reference.targetKind,
        reference: reference.value,
        field: reference.field,
      });
      continue;
    }

    if (candidates.length > 1) {
      issues.push({
        severity: "error",
        code: "AMBIGUOUS_LIBRARY_REFERENCE",
        message: `${reference.sourceKind}:${reference.sourceId} references ambiguous ${reference.targetKind}:${reference.value} via ${reference.field}.`,
        manifestPath: reference.sourceManifestPath,
        targetKind: reference.targetKind,
        reference: reference.value,
        field: reference.field,
        candidateManifestPaths: candidates.map(
          (candidate) => candidate.manifestPath,
        ),
      });
      continue;
    }

    reference.targetManifestPath = candidates[0].manifestPath;
    reference.targetId = candidates[0].id;
  }
}

export function findReferenceCandidates(
  entries,
  targetKind,
  value,
  options = {},
) {
  const parts = String(value).split("/").filter(Boolean);
  const id = parts.at(-1);
  const qualifier = parts.length > 1 ? parts[0] : null;
  const sourceEntry = options.sourceEntry ?? null;
  const ownerArtifact = sourceOwnerArtifact(sourceEntry);

  const matching = entries.filter(
    (entry) => entry.kind === targetKind && entry.id === id,
  );

  if (qualifier) {
    if (qualifier === "core") {
      return matching.filter((entry) => entry.level === "core");
    }

    if (qualifier === "local") {
      if (!ownerArtifact) return [];

      return matching.filter(
        (entry) =>
          entry.level === "local" &&
          entry.ownerArtifact === ownerArtifact,
      );
    }

    return matching.filter(
      (entry) =>
        entry.level === "collection" &&
        entry.collection === qualifier,
    );
  }

  if (ownerArtifact) {
    const local = matching.filter(
      (entry) =>
        entry.level === "local" &&
        entry.ownerArtifact === ownerArtifact,
    );

    if (local.length > 0) return local;
  }

  const core = matching.filter((entry) => entry.level === "core");
  if (core.length > 0) return core;

  if (sourceEntry?.level === "collection" && sourceEntry.collection) {
    const sameCollection = matching.filter(
      (entry) =>
        entry.level === "collection" &&
        entry.collection === sourceEntry.collection,
    );

    if (sameCollection.length > 0) return sameCollection;
  }

  return matching.filter((entry) => entry.level === "collection");
}

export function sourceOwnerArtifact(entry) {
  if (!entry) return null;
  if (entry.category === "artifact") return entry.id;
  if (entry.level === "local") return entry.ownerArtifact ?? null;
  return null;
}

function add(references, targetKind, value, field) {
  if (typeof value !== "string" || !value) return;

  references.push({
    targetKind,
    value,
    field,
  });
}

function addArray(references, targetKind, values, field) {
  if (!Array.isArray(values)) return;

  values.forEach((value, index) =>
    add(references, targetKind, value, `${field}[${index}]`),
  );
}

function addMap(references, targetKind, values, field) {
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return;
  }

  for (const [slot, value] of Object.entries(values)) {
    add(references, targetKind, value, `${field}.${slot}`);
  }
}
