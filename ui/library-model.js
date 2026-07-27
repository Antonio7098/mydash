export const RESOURCE_KINDS = Object.freeze([
  "theme",
  "preset",
  "layout",
  "component",
  "primitive",
  "asset",
]);

export const RESOURCE_LEVELS = Object.freeze([
  "core",
  "collection",
  "local",
]);

export function libraryEntryPath(entry) {
  return `/components/${encodeURIComponent(entry.kind)}/${encodeURIComponent(entry.id)}`;
}

export function filterLibraryEntries(entries, filters = {}) {
  const query = String(filters.query ?? "").trim().toLocaleLowerCase("en-GB");

  return sortLibraryEntries(
    entries.filter((entry) => {
      if (!matchesFilter(entry.kind, filters.kind)) return false;
      if (!matchesFilter(entry.level, filters.level)) return false;
      if (!matchesFilter(entry.slot, filters.slot)) return false;
      if (!matchesFilter(entry.collection, filters.collection)) return false;

      if (!query) return true;

      return searchableText(entry).includes(query);
    }),
  );
}

function matchesFilter(value, filter) {
  if (
    filter === undefined ||
    filter === null ||
    filter === ""
  ) {
    return true;
  }
  if (Array.isArray(filter)) {
    return (
      filter.length === 0 ||
      filter.includes(value)
    );
  }
  return value === filter;
}

export function sortLibraryEntries(entries) {
  return [...entries].sort(
    (left, right) =>
      levelOrder(left.level) - levelOrder(right.level) ||
      kindOrder(left.kind) - kindOrder(right.kind) ||
      String(left.name ?? left.title).localeCompare(
        String(right.name ?? right.title),
        "en-GB",
      ) ||
      String(left.id).localeCompare(String(right.id), "en-GB"),
  );
}

export function libraryFacetValues(entries) {
  return {
    kinds: unique(entries.map((entry) => entry.kind)),
    levels: unique(entries.map((entry) => entry.level).filter(Boolean)),
    slots: unique(entries.map((entry) => entry.slot).filter(Boolean)),
    collections: unique(entries.map((entry) => entry.collection).filter(Boolean)),
  };
}

export function libraryCounts(entries) {
  const byKind = {};
  const byLevel = {};

  for (const entry of entries) {
    byKind[entry.kind] = (byKind[entry.kind] ?? 0) + 1;
    const level = entry.level ?? "unscoped";
    byLevel[level] = (byLevel[level] ?? 0) + 1;
  }

  return {
    total: entries.length,
    byKind,
    byLevel,
  };
}

export function resourceKindLabel(kind, count = 1) {
  const singular = {
    theme: "Theme",
    preset: "Preset",
    layout: "Layout",
    component: "Component",
    primitive: "Primitive",
    asset: "Asset",
  }[kind] ?? titleCase(kind);

  if (count === 1) return singular;
  return singular.endsWith("s") ? singular : `${singular}s`;
}

export function lifecycleLabel(entry) {
  if (entry.level === "collection") {
    return entry.collection ? `Collection · ${entry.collection}` : "Collection";
  }
  if (entry.level === "local") {
    return entry.ownerArtifact ? `Local · ${entry.ownerArtifact}` : "Local";
  }
  return entry.level === "core" ? "Core" : "Unscoped";
}

export function consumerTargetPath(edge) {
  const source = edge.source;
  if (!source) return null;

  if (source.category === "artifact") {
    return `/view/${encodeURIComponent(source.kind)}/${encodeURIComponent(source.id)}`;
  }

  if (RESOURCE_KINDS.includes(source.kind)) {
    return libraryEntryPath(source);
  }

  return null;
}

export function dependencyTargetPath(edge) {
  if (!edge.resolved || !edge.target) return null;
  if (edge.target.category === "artifact") {
    return `/view/${encodeURIComponent(edge.target.kind)}/${encodeURIComponent(edge.target.id)}`;
  }
  return libraryEntryPath(edge.target);
}

export function variantCount(entry) {
  return Object.values(entry.variants ?? {}).reduce(
    (sum, values) => sum + (Array.isArray(values) ? values.length : 0),
    0,
  );
}

export function propRows(manifest) {
  return Object.entries(manifest?.props ?? {})
    .sort(([left], [right]) => left.localeCompare(right, "en-GB"))
    .map(([name, value]) => ({
      name,
      type: value.type,
      required: value.required === true,
      description: value.description ?? null,
    }));
}

export function variantGroups(manifest) {
  return Object.entries(manifest?.variants ?? {})
    .sort(([left], [right]) => left.localeCompare(right, "en-GB"))
    .map(([name, values]) => ({ name, values }));
}

export function themeTokenRows(manifest) {
  return Object.entries(manifest?.tokens ?? {})
    .sort(([left], [right]) => left.localeCompare(right, "en-GB"))
    .map(([name, value]) => ({
      name,
      value: String(value),
      colour: typeof value === "string" && /^#[a-f0-9]{6}$/i.test(value),
    }));
}

export function presetMappingRows(manifest) {
  const mappings = manifest?.mappings ?? {};
  const rows = [];
  if (mappings.layout) rows.push({ group: "layout", slot: "page-layout", reference: mappings.layout });
  for (const group of ["components", "primitives", "assets"]) {
    for (const [slot, reference] of Object.entries(mappings[group] ?? {})) {
      rows.push({ group, slot, reference });
    }
  }
  return rows.sort(
    (left, right) =>
      left.group.localeCompare(right.group, "en-GB") ||
      left.slot.localeCompare(right.slot, "en-GB"),
  );
}

function searchableText(entry) {
  return [
    entry.id,
    entry.name,
    entry.title,
    entry.description,
    entry.reference,
    entry.kind,
    entry.level,
    entry.collection,
    entry.ownerArtifact,
    entry.slot,
    ...(entry.supportedThemes ?? []),
    ...Object.keys(entry.variants ?? {}),
    ...Object.values(entry.variants ?? {}).flat(),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("en-GB");
}

function unique(values) {
  return [...new Set(values)].sort((left, right) => String(left).localeCompare(String(right), "en-GB"));
}

function levelOrder(level) {
  return { core: 0, collection: 1, local: 2 }[level] ?? 9;
}

function kindOrder(kind) {
  return { theme: 0, preset: 1, layout: 2, component: 3, primitive: 4, asset: 5 }[kind] ?? 9;
}

function titleCase(value) {
  return String(value).replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
