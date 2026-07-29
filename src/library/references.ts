import { REFERENCEABLE_KINDS } from "./conventions.js";
import type {
  LibraryEntry,
  LibraryReference,
  LibraryScan,
} from "./types.js";

export interface CollectedReference extends LibraryReference {
  sourceManifestPath: string;
  sourceId: string;
  sourceKind: string;
  sourceCategory: string;
}

export interface ReferenceResolutionIssue {
  severity: "error";
  code: string;
  message: string;
  manifestPath: string;
  targetKind: string;
  reference: string;
  field: string;
  candidateManifestPaths?: string[];
}

export function collectReferences(
  entry: LibraryEntry,
): Omit<CollectedReference, "sourceManifestPath" | "sourceId" | "sourceKind" | "sourceCategory">[] {
  const manifest = entry.manifest as Record<string, unknown>;
  const references: Omit<CollectedReference, "sourceManifestPath" | "sourceId" | "sourceKind" | "sourceCategory">[] = [];

  if (entry.category === "artifact") {
    add(references, "theme", get(manifest, "appearance", "theme"), "appearance.theme");
    add(references, "preset", get(manifest, "appearance", "preset"), "appearance.preset");
    add(
      references,
      "layout",
      get(get(manifest, "appearance"), "overrides", "layout"),
      "appearance.overrides.layout",
    );
    addMap(
      references,
      "component",
      get(get(manifest, "appearance"), "overrides", "components"),
      "appearance.overrides.components",
    );
    addMap(
      references,
      "primitive",
      get(get(manifest, "appearance"), "overrides", "primitives"),
      "appearance.overrides.primitives",
    );
    addMap(
      references,
      "asset",
      get(get(manifest, "appearance"), "overrides", "assets"),
      "appearance.overrides.assets",
    );
  }

  if (entry.kind === "preset") {
    add(
      references,
      "layout",
      get(manifest, "mappings", "layout"),
      "mappings.layout",
    );
    addMap(
      references,
      "component",
      get(manifest, "mappings", "components"),
      "mappings.components",
    );
    addMap(
      references,
      "primitive",
      get(manifest, "mappings", "primitives"),
      "mappings.primitives",
    );
    addMap(
      references,
      "asset",
      get(manifest, "mappings", "assets"),
      "mappings.assets",
    );
    addArray(
      references,
      "theme",
      manifest.supportedThemes as string[] | undefined,
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
      get(manifest, "dependencies", "primitives"),
      "dependencies.primitives",
    );
    addMap(
      references,
      "component",
      get(manifest, "dependencies", "components"),
      "dependencies.components",
    );
    addMap(
      references,
      "asset",
      get(manifest, "dependencies", "assets"),
      "dependencies.assets",
    );
    addArray(
      references,
      "theme",
      manifest.supportedThemes as string[] | undefined,
      "supportedThemes",
    );
  }

  if (entry.kind === "theme") {
    addMap(references, "asset", manifest.assets as Record<string, unknown> | undefined, "assets");
  }

  return references;
}

export function resolveReferences(
  entries: LibraryEntry[],
  references: CollectedReference[],
  issues: ReferenceResolutionIssue[],
): void {
  const entryByManifest = new Map(
    entries.map((entry) => [entry.manifestPath, entry]),
  );

  for (const reference of references) {
    const typedRef = reference as unknown as { targetKind: string; value: string; field: string };
    if (!REFERENCEABLE_KINDS.has(typedRef.targetKind ?? "")) continue;

    const sourceEntry = entryByManifest.get(reference.sourceManifestPath);
    const candidates = findReferenceCandidates(
      entries,
      typedRef.targetKind,
      typedRef.value,
      {
        sourceEntry,
      },
    );

    const typedReference = reference as unknown as CollectedReference & { targetKind: string; value: string; field: string };

    if (candidates.length === 0) {
      issues.push({
        severity: "error",
        code: "UNRESOLVED_LIBRARY_REFERENCE",
        message: `${typedReference.sourceKind}:${typedReference.sourceId} references missing ${typedReference.targetKind}:${typedReference.value} via ${typedReference.field}.`,
        manifestPath: typedReference.sourceManifestPath,
        targetKind: typedReference.targetKind,
        reference: typedReference.value,
        field: typedReference.field,
      });
      continue;
    }

    if (candidates.length > 1) {
      issues.push({
        severity: "error",
        code: "AMBIGUOUS_LIBRARY_REFERENCE",
        message: `${typedReference.sourceKind}:${typedReference.sourceId} references ambiguous ${typedReference.targetKind}:${typedReference.value} via ${typedReference.field}.`,
        manifestPath: typedReference.sourceManifestPath,
        targetKind: typedReference.targetKind,
        reference: typedReference.value,
        field: typedReference.field,
        candidateManifestPaths: candidates.map((candidate) => candidate.manifestPath),
      });
      continue;
    }

    (reference as CollectedReference & { targetManifestPath?: string; targetId?: string }).targetManifestPath = candidates[0]?.manifestPath;
    (reference as CollectedReference & { targetId?: string }).targetId = candidates[0]?.id;
  }
}

export function findReferenceCandidates(
  entries: LibraryEntry[],
  targetKind: string,
  value: string,
  options: { sourceEntry?: LibraryEntry | null } = {},
): LibraryEntry[] {
  const parts = String(value).split("/").filter(Boolean);
  const id = parts.at(-1);
  const qualifier = parts.length > 1 ? parts[0] : null;
  const sourceEntry = options.sourceEntry ?? null;
  const ownerArtifact = sourceOwnerArtifact(sourceEntry);

  if (!id) return [];

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

export function sourceOwnerArtifact(entry: LibraryEntry | null | undefined): string | null {
  if (!entry) return null;
  if (entry.category === "artifact") return entry.id;
  if (entry.level === "local") return entry.ownerArtifact ?? null;
  return null;
}

function get(record: unknown, ...keys: string[]): unknown {
  let current: unknown = record;
  for (const key of keys) {
    if (current && typeof current === "object") {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return current;
}

function add(
  references: Omit<CollectedReference, "sourceManifestPath" | "sourceId" | "sourceKind" | "sourceCategory">[],
  targetKind: string,
  value: unknown,
  field: string,
): void {
  if (typeof value !== "string" || !value) return;

  references.push({
    targetKind,
    value,
    field,
  } as never);
}

function addArray(
  references: Omit<CollectedReference, "sourceManifestPath" | "sourceId" | "sourceKind" | "sourceCategory">[],
  targetKind: string,
  values: readonly unknown[] | undefined,
  field: string,
): void {
  if (!Array.isArray(values)) return;

  values.forEach((value, index) =>
    add(references, targetKind, value, `${field}[${index}]`),
  );
}

function addMap(
  references: Omit<CollectedReference, "sourceManifestPath" | "sourceId" | "sourceKind" | "sourceCategory">[],
  targetKind: string,
  values: unknown,
  field: string,
): void {
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return;
  }

  for (const [slot, value] of Object.entries(values as Record<string, unknown>)) {
    add(references, targetKind, value, `${field}.${slot}`);
  }
}