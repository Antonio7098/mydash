import { findReferenceCandidates } from "../library/references.mjs";

const REF = /^[a-z0-9]+(?:[/-][a-z0-9]+)*$/;
const SLOT = /^[a-z0-9][a-z0-9-]{0,127}$/;
const TOP = new Set(["theme", "preset", "overrides"]);
const OVERRIDES = new Set(["layout", "components", "primitives", "assets"]);

export function normaliseAppearanceInput(value) {
  object(value, "appearance");
  unknown(value, TOP, "appearance");
  const overrides = value.overrides ?? {};
  object(overrides, "appearance.overrides");
  unknown(overrides, OVERRIDES, "appearance.overrides");

  return {
    theme: reference(value.theme, "appearance.theme"),
    preset: reference(value.preset, "appearance.preset"),
    overrides: {
      layout: reference(overrides.layout, "appearance.overrides.layout"),
      components: referenceMap(
        overrides.components,
        "appearance.overrides.components",
      ),
      primitives: referenceMap(
        overrides.primitives,
        "appearance.overrides.primitives",
      ),
      assets: referenceMap(overrides.assets, "appearance.overrides.assets"),
    },
  };
}

export function applyAppearanceInput(artifact, appearance) {
  const manifest = structuredClone(artifact.manifest);
  manifest.appearance = normaliseAppearanceInput(appearance);

  return {
    ...artifact,
    manifest,
  };
}

export function parseAppearanceQuery(value, maximumBytes = 16 * 1024) {
  if (value === undefined || value === null) return null;

  if (Array.isArray(value) || typeof value !== "string") {
    throw failure(
      "APPEARANCE_QUERY_INVALID",
      "Query parameter appearance must be one JSON string.",
    );
  }

  if (Buffer.byteLength(value, "utf8") > maximumBytes) {
    throw failure(
      "APPEARANCE_QUERY_TOO_LARGE",
      `Query parameter appearance exceeds ${maximumBytes} bytes.`,
    );
  }

  try {
    return normaliseAppearanceInput(JSON.parse(value));
  } catch (error) {
    if (error?.code) throw error;

    throw failure(
      "APPEARANCE_QUERY_INVALID_JSON",
      "Query parameter appearance must contain valid JSON.",
    );
  }
}

export function referenceForEntry(entry) {
  if (entry.level === "core") return `core/${entry.id}`;

  if (entry.level === "collection" && entry.collection) {
    return `${entry.collection}/${entry.id}`;
  }

  if (entry.level === "local" && entry.ownerArtifact) {
    return `local/${entry.id}`;
  }

  return entry.id;
}

export function buildAppearanceOptions(scan, artifact) {
  const visible = scan.entries.filter(
    (entry) =>
      entry.category !== "artifact" &&
      (
        entry.level === "core" ||
        entry.level === "collection" ||
        (
          entry.level === "local" &&
          entry.ownerArtifact === artifact.id
        )
      ),
  );
  const kind = (name) =>
    visible
      .filter((entry) => entry.kind === name)
      .map(publicOption)
      .sort(compareOption);
  const components = groupSlots(visible, "component");
  const primitives = groupSlots(visible, "primitive");
  const assets = kind("asset");

  return {
    current: canonicalAppearance(
      scan,
      artifact,
      artifact.manifest.appearance,
    ),
    options: {
      themes: kind("theme"),
      presets: kind("preset"),
      layouts: kind("layout"),
      components,
      primitives,
      assets,
    },
    slots: {
      components: Object.keys(components).sort(),
      primitives: Object.keys(primitives).sort(),
      assets: assetSlots(visible, artifact, assets),
    },
  };
}

export function validateAppearanceReferences(scan, artifact, appearance) {
  const value = normaliseAppearanceInput(appearance);
  const references = [
    ["theme", value.theme, "appearance.theme"],
    ["preset", value.preset, "appearance.preset"],
    ["layout", value.overrides.layout, "appearance.overrides.layout"],
    ...mapped("component", value.overrides.components, "appearance.overrides.components"),
    ...mapped("primitive", value.overrides.primitives, "appearance.overrides.primitives"),
    ...mapped("asset", value.overrides.assets, "appearance.overrides.assets"),
  ];
  const issues = [];

  for (const [kind, ref, field] of references) {
    if (!ref) continue;

    const matches = findReferenceCandidates(scan.entries, kind, ref, {
      sourceEntry: artifact,
    });

    if (matches.length !== 1) {
      issues.push({
        severity: "error",
        code:
          matches.length === 0
            ? "APPEARANCE_OPTION_NOT_FOUND"
            : "APPEARANCE_OPTION_AMBIGUOUS",
        message:
          matches.length === 0
            ? `${field} references unavailable ${kind}:${ref}.`
            : `${field} references ambiguous ${kind}:${ref}.`,
        field,
        kind,
        reference: ref,
      });
    }
  }

  return {
    appearance: value,
    issues,
    valid: issues.length === 0,
  };
}


function canonicalAppearance(scan, artifact, appearance) {
  const value = normaliseAppearanceInput(appearance);

  return {
    theme: canonicalReference(scan, artifact, "theme", value.theme),
    preset: canonicalReference(scan, artifact, "preset", value.preset),
    overrides: {
      layout: canonicalReference(
        scan,
        artifact,
        "layout",
        value.overrides.layout,
      ),
      components: canonicalMap(
        scan,
        artifact,
        "component",
        value.overrides.components,
      ),
      primitives: canonicalMap(
        scan,
        artifact,
        "primitive",
        value.overrides.primitives,
      ),
      assets: canonicalMap(
        scan,
        artifact,
        "asset",
        value.overrides.assets,
      ),
    },
  };
}

function canonicalMap(scan, artifact, kind, values) {
  return Object.fromEntries(
    Object.entries(values).map(([slot, value]) => [
      slot,
      canonicalReference(scan, artifact, kind, value),
    ]),
  );
}

function canonicalReference(scan, artifact, kind, value) {
  if (!value) return null;

  const matches = findReferenceCandidates(scan.entries, kind, value, {
    sourceEntry: artifact,
  });

  return matches.length === 1
    ? referenceForEntry(matches[0])
    : value;
}

function groupSlots(entries, kind) {
  const result = {};

  for (const entry of entries) {
    if (entry.kind !== kind || !entry.manifest.slot) continue;
    result[entry.manifest.slot] ??= [];
    result[entry.manifest.slot].push(publicOption(entry));
  }

  for (const options of Object.values(result)) {
    options.sort(compareOption);
  }

  return Object.fromEntries(
    Object.entries(result).sort(([a], [b]) => a.localeCompare(b, "en-GB")),
  );
}

function assetSlots(entries, artifact, assets) {
  const slots = new Set(
    Object.keys(artifact.manifest.appearance?.overrides?.assets ?? {}),
  );

  for (const entry of entries) {
    const maps =
      entry.kind === "theme"
        ? entry.manifest.assets
        : entry.kind === "preset"
          ? entry.manifest.mappings?.assets
          : null;

    for (const slot of Object.keys(maps ?? {})) slots.add(slot);
  }

  if (slots.size === 0 && assets.length > 0) slots.add("brand-logo");
  return [...slots].sort();
}

function publicOption(entry) {
  return {
    reference: referenceForEntry(entry),
    id: entry.id,
    kind: entry.kind,
    name: entry.manifest.name ?? entry.title,
    description: entry.manifest.description ?? null,
    level: entry.level,
    collection: entry.collection,
    ownerArtifact: entry.ownerArtifact,
    slot: entry.manifest.slot ?? null,
    supportedThemes: entry.manifest.supportedThemes ?? [],
  };
}

function compareOption(left, right) {
  const order = { local: 0, core: 1, collection: 2 };

  return (
    (order[left.level] ?? 9) - (order[right.level] ?? 9) ||
    left.name.localeCompare(right.name, "en-GB") ||
    left.reference.localeCompare(right.reference, "en-GB")
  );
}

function mapped(kind, map, field) {
  return Object.entries(map).map(([slot, ref]) => [
    kind,
    ref,
    `${field}.${slot}`,
  ]);
}

function object(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw failure("APPEARANCE_OBJECT_INVALID", `${field} must be an object.`);
  }
}

function unknown(value, allowed, field) {
  const keys = Object.keys(value).filter((key) => !allowed.has(key));

  if (keys.length > 0) {
    throw failure(
      "APPEARANCE_PROPERTY_UNKNOWN",
      `${field} contains unknown properties: ${keys.join(", ")}.`,
      { field, keys },
    );
  }
}

function reference(value, field) {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value !== "string" || !REF.test(value)) {
    throw failure(
      "APPEARANCE_REFERENCE_INVALID",
      `${field} must be null or a lowercase resource reference.`,
      { field, value },
    );
  }

  return value;
}

function referenceMap(value, field) {
  if (value === undefined || value === null) return {};
  object(value, field);
  const result = {};

  for (const [slot, candidate] of Object.entries(value)) {
    if (!SLOT.test(slot)) {
      throw failure(
        "APPEARANCE_SLOT_INVALID",
        `${field} contains invalid slot ${slot}.`,
      );
    }

    const ref = reference(candidate, `${field}.${slot}`);
    if (ref) result[slot] = ref;
  }

  return Object.fromEntries(
    Object.entries(result).sort(([a], [b]) => a.localeCompare(b, "en-GB")),
  );
}

function failure(code, message, details = null) {
  const error = new TypeError(message);
  error.code = code;
  error.details = details;
  return error;
}
