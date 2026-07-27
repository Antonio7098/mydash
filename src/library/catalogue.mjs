export const LIBRARY_RESOURCE_KINDS = Object.freeze([
  "theme",
  "preset",
  "layout",
  "component",
  "primitive",
  "asset",
]);

export function publicLibraryEntry(entry) {
  const manifest = entry.manifest ?? {};

  return {
    id: entry.id,
    kind: entry.kind,
    category: entry.category,
    title: entry.title,
    name: manifest.name ?? entry.title,
    description: manifest.description ?? null,
    reference: libraryReference(entry),
    level: entry.level,
    collection: entry.collection,
    ownerArtifact: entry.ownerArtifact,
    slot: manifest.slot ?? null,
    contractVersion: manifest.contractVersion ?? null,
    entryFile: manifest.entry ?? manifest.file ?? null,
    variants: manifest.variants ?? {},
    supportedThemes: manifest.supportedThemes ?? [],
    displayPath: entry.displayPath,
    manifestPath: entry.manifestPath,
    visual: visualSummary(entry),
  };
}

export function libraryReference(entry) {
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

export function visualSummary(entry) {
  const manifest = entry.manifest ?? {};

  if (entry.kind === "theme") {
    const swatches = Object.entries(manifest.tokens ?? {})
      .filter(([name, value]) =>
        name.startsWith("colour-") &&
        typeof value === "string" &&
        /^#[a-f0-9]{6}$/i.test(value),
      )
      .slice(0, 8)
      .map(([name, value]) => ({ name, value }));

    return {
      mode: "theme",
      swatches,
      tokenCount: Object.keys(manifest.tokens ?? {}).length,
    };
  }

  if (entry.kind === "preset") {
    const mappings = manifest.mappings ?? {};
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
    return {
      mode: "ui",
      propCount: Object.keys(manifest.props ?? {}).length,
      variantCount: Object.values(manifest.variants ?? {}).reduce(
        (sum, values) => sum + (Array.isArray(values) ? values.length : 0),
        0,
      ),
      dependencyCount:
        Object.keys(manifest.dependencies?.components ?? {}).length +
        Object.keys(manifest.dependencies?.primitives ?? {}).length +
        Object.keys(manifest.dependencies?.assets ?? {}).length,
    };
  }

  if (entry.kind === "asset") {
    return {
      mode: "asset",
      mediaType: manifest.mediaType ?? null,
      assetCategory: manifest.category ?? "other",
      approved: manifest.approved === true,
    };
  }

  return { mode: "resource" };
}
