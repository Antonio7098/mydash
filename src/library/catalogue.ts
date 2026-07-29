import type { LibraryEntry, LibrarySummaryEntry } from "./types.js";

export const LIBRARY_RESOURCE_KINDS: readonly string[] = Object.freeze([
  "theme",
  "preset",
  "layout",
  "component",
  "primitive",
  "asset",
]);

export interface PublicLibraryEntry extends LibrarySummaryEntry {
  name: string | null;
  description: string | null;
  reference: string;
  level: string | null;
  collection: string | null;
  ownerArtifact: string | null;
  user: string | null;
  slot: string | null;
  contractVersion: number | null;
  entryFile: string | null;
  variants: Record<string, unknown>;
  supportedThemes: string[];
  manifestPath: string;
  visual: LibraryVisualSummary;
  lifecycle: "Local" | "Collection" | "Core";
  scope: "local" | "collection" | "core";
  placement: string;
}

export type LibraryVisualSummary =
  | { mode: "theme"; swatches: { name: string; value: string }[]; tokenCount: number }
  | { mode: "preset"; mappingCount: number }
  | { mode: "ui"; propCount: number; variantCount: number; dependencyCount: number }
  | { mode: "asset"; mediaType: string | null; assetCategory: string; approved: boolean }
  | { mode: "resource" };

export function publicLibraryEntry(entry: LibraryEntry): PublicLibraryEntry {
  const manifest = (entry.manifest ?? {}) as Record<string, unknown>;

  return {
    id: entry.id,
    kind: entry.kind,
    category: entry.category,
    title: entry.title,
    name: (manifest.name as string | undefined) ?? entry.title,
    description: (manifest.description as string | undefined) ?? null,
    reference: libraryReference(entry as unknown as { level: string | null | undefined; id: string; collection?: string | null | undefined }),
    level: entry.level ?? null,
    collection: entry.collection ?? null,
    ownerArtifact: entry.ownerArtifact ?? null,
    user: entry.user ?? null,
    slot: (manifest.slot as string | undefined) ?? null,
    contractVersion: (manifest.contractVersion as number | undefined) ?? null,
    entryFile: (manifest.entry as string | undefined) ?? (manifest.file as string | undefined) ?? null,
    variants: (manifest.variants as Record<string, unknown>) ?? {},
    supportedThemes: (manifest.supportedThemes as string[]) ?? [],
    displayPath: entry.displayPath,
    manifestPath: entry.manifestPath,
    visual: visualSummary(entry),
    lifecycle: "Local",
    scope: "local",
    placement: entry.relativeDirectory ?? entry.directory,
  };
}

export function libraryReference(entry: { level: string | null | undefined; id: string; collection?: string | null | undefined }): string {
  if (entry.level === "core") {
    return `core/${entry.id}`;
  }

  if (entry.level === "collection" && entry.collection) {
    return `${entry.collection}/${entry.id}`;
  }

  if (entry.level === "local") {
    return `local/${entry.id}`;
  }

  return entry.id;
}

export function visualSummary(entry: LibraryEntry): LibraryVisualSummary {
  const manifest = (entry.manifest ?? {}) as Record<string, unknown>;

  if (entry.kind === "theme") {
    const tokens = (manifest.tokens as Record<string, unknown>) ?? {};
    const swatches = Object.entries(tokens)
      .filter(([name, value]) =>
        name.startsWith("colour-") &&
        typeof value === "string" &&
        /^#[a-f0-9]{6}$/i.test(value),
      )
      .slice(0, 8)
      .map(([name, value]) => ({ name, value: value as string }));

    return {
      mode: "theme",
      swatches,
      tokenCount: Object.keys(tokens).length,
    };
  }

  if (entry.kind === "preset") {
    const mappings = (manifest.mappings as Record<string, unknown>) ?? {};
    return {
      mode: "preset",
      mappingCount:
        Number(Boolean(mappings.layout)) +
        Object.keys(mappings.components ?? {}).length +
        Object.keys(mappings.primitives ?? {}).length +
        Object.keys(mappings.assets ?? {}).length,
    };
  }

  if (["layout", "component", "primitive"].includes(entry.kind)) {
    const props = (manifest.props as Record<string, unknown>) ?? {};
    const variants = (manifest.variants as Record<string, unknown>) ?? {};
    const dependencies = (manifest.dependencies as Record<string, unknown>) ?? {};
    return {
      mode: "ui",
      propCount: Object.keys(props).length,
      variantCount: Object.values(variants).reduce<number>(
        (sum, values) => sum + (Array.isArray(values) ? values.length : 0),
        0,
      ),
      dependencyCount:
        Object.keys((dependencies.components as Record<string, unknown>) ?? {}).length +
        Object.keys((dependencies.primitives as Record<string, unknown>) ?? {}).length +
        Object.keys((dependencies.assets as Record<string, unknown>) ?? {}).length,
    };
  }

  if (entry.kind === "asset") {
    return {
      mode: "asset",
      mediaType: (manifest.mediaType as string | undefined) ?? null,
      assetCategory: (manifest.category as string | undefined) ?? "other",
      approved: manifest.approved === true,
    };
  }

  return { mode: "resource" };
}