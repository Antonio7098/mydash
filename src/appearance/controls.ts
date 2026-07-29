import { findReferenceCandidates } from "../library/references.js";

const REF = /^[a-z0-9]+(?:[/-][a-z0-9]+)*$/;
const SLOT = /^[a-z0-9][a-z0-9-]{0,127}$/;
const TOP = new Set(["theme", "preset", "overrides"]);
const OVERRIDES = new Set(["layout", "components", "primitives", "assets"]);

export interface NormalisedAppearanceOverrides {
  layout: string | null;
  components: Record<string, string>;
  primitives: Record<string, string>;
  assets: Record<string, string>;
}

export interface NormalisedAppearanceInput {
  theme: string | null;
  preset: string | null;
  overrides: NormalisedAppearanceOverrides;
}

export function normaliseAppearanceInput(value: unknown): NormalisedAppearanceInput {
  object(value, "appearance");
  unknownKeys(value, TOP, "appearance");
  const overrides = getProperty(value, "overrides") ?? {};
  object(overrides, "appearance.overrides");
  unknownKeys(overrides, OVERRIDES, "appearance.overrides");

  return {
    theme: reference(getProperty(value, "theme"), "appearance.theme"),
    preset: reference(getProperty(value, "preset"), "appearance.preset"),
    overrides: {
      layout: reference(getProperty(overrides, "layout"), "appearance.overrides.layout"),
      components: referenceMap(
        getProperty(overrides, "components"),
        "appearance.overrides.components",
      ),
      primitives: referenceMap(
        getProperty(overrides, "primitives"),
        "appearance.overrides.primitives",
      ),
      assets: referenceMap(getProperty(overrides, "assets"), "appearance.overrides.assets"),
    },
  };
}

export interface ArtifactWithManifest {
  manifest: Record<string, unknown>;
}

export function applyAppearanceInput(
  artifact: ArtifactWithManifest,
  appearance: unknown,
): ArtifactWithManifest {
  const manifest = structuredClone(artifact.manifest);
  manifest.appearance = normaliseAppearanceInput(appearance);

  return {
    ...artifact,
    manifest,
  };
}

export function parseAppearanceQuery(
  value: unknown,
  maximumBytes: number = 16 * 1024,
): NormalisedAppearanceInput | null {
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
    if ((error as { code?: string }).code) throw error;

    throw failure(
      "APPEARANCE_QUERY_INVALID_JSON",
      "Query parameter appearance must contain valid JSON.",
    );
  }
}

export interface ReferenceableLibraryEntry {
  id: string;
  level: string | null;
  collection?: string | null;
  ownerArtifact?: string | null;
}

export function referenceForEntry(entry: ReferenceableLibraryEntry): string {
  if (entry.level === "core") return `core/${entry.id}`;

  if (entry.level === "collection" && entry.collection) {
    return `${entry.collection}/${entry.id}`;
  }

  if (entry.level === "local" && entry.ownerArtifact) {
    return `local/${entry.id}`;
  }

  return entry.id;
}

export interface AppearanceOption {
  reference: string;
  id: string;
  kind: string;
  name: string | null;
  description: string | null;
  level: string | null;
  collection: string | null;
  ownerArtifact: string | null;
  slot: string | null;
  supportedThemes: string[];
}

export interface AppearanceOptions {
  current: NormalisedAppearanceInput;
  options: {
    themes: AppearanceOption[];
    presets: AppearanceOption[];
    layouts: AppearanceOption[];
    components: Record<string, AppearanceOption[]>;
    primitives: Record<string, AppearanceOption[]>;
    assets: AppearanceOption[];
  };
  slots: {
    components: string[];
    primitives: string[];
    assets: string[];
  };
}

export interface AppearanceLibraryEntry extends ReferenceableLibraryEntry {
  category?: string;
  manifest: Record<string, unknown>;
  id: string;
  kind: string;
  level: string | null;
}

export function buildAppearanceOptions(
  scan: { entries: AppearanceLibraryEntry[]; config: { user?: string | null } },
  artifact: ArtifactWithManifest & { id: string },
): AppearanceOptions {
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

  const kind = (name: string): AppearanceOption[] =>
    visible
      .filter((entry) => entry.kind === name)
      .map(publicOption)
      .sort(compareOption);
  const components = groupSlots(visible, "component");
  const primitives = groupSlots(visible, "primitive");
  const assets = kind("asset");

  return {
    current: canonicalAppearance(scan, artifact, artifact.manifest.appearance),
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

export interface AppearanceValidation {
  appearance: NormalisedAppearanceInput;
  issues: AppearanceOptionIssue[];
  valid: boolean;
}

export interface AppearanceOptionIssue {
  severity: "error";
  code: "APPEARANCE_OPTION_NOT_FOUND" | "APPEARANCE_OPTION_AMBIGUOUS";
  message: string;
  field: string;
  kind: string;
  reference: string;
}

export function validateAppearanceReferences(
  scan: { entries: AppearanceLibraryEntry[]; config: { user?: string | null } },
  artifact: ArtifactWithManifest & { id: string },
  appearance: unknown,
): AppearanceValidation {
  const value = normaliseAppearanceInput(appearance);
  const references: Array<[string, string, string]> = [
    ["theme", value.theme ?? "", "appearance.theme"],
    ["preset", value.preset ?? "", "appearance.preset"],
    ["layout", value.overrides.layout ?? "", "appearance.overrides.layout"],
    ...mapped("component", value.overrides.components, "appearance.overrides.components"),
    ...mapped("primitive", value.overrides.primitives, "appearance.overrides.primitives"),
    ...mapped("asset", value.overrides.assets, "appearance.overrides.assets"),
  ];
  const issues: AppearanceOptionIssue[] = [];

  for (const [kind, ref, field] of references) {
    if (!ref) continue;

    const matches = findReferenceCandidates(scan.entries as never, kind, ref, {
      sourceEntry: artifact as never,
    });

    if (matches.length !== 1) {
      issues.push({
        severity: "error",
        code: matches.length === 0
          ? "APPEARANCE_OPTION_NOT_FOUND"
          : "APPEARANCE_OPTION_AMBIGUOUS",
        message: matches.length === 0
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

function canonicalAppearance(
  scan: { entries: AppearanceLibraryEntry[]; config: { user?: string | null } },
  artifact: ArtifactWithManifest & { id: string },
  appearance: unknown,
): NormalisedAppearanceInput {
  const value = normaliseAppearanceInput(appearance);

  return {
    theme: canonicalReference(scan, artifact, "theme", value.theme),
    preset: canonicalReference(scan, artifact, "preset", value.preset),
    overrides: {
      layout: canonicalReference(scan, artifact, "layout", value.overrides.layout),
      components: canonicalMap(scan, artifact, "component", value.overrides.components) as Record<string, string>,
      primitives: canonicalMap(scan, artifact, "primitive", value.overrides.primitives) as Record<string, string>,
      assets: canonicalMap(scan, artifact, "asset", value.overrides.assets) as Record<string, string>,
    },
  };
}

function canonicalMap(
  scan: { entries: AppearanceLibraryEntry[]; config: { user?: string | null } },
  artifact: ArtifactWithManifest & { id: string },
  kind: string,
  values: Record<string, string>,
): Record<string, string | null> {
  return Object.fromEntries(
    Object.entries(values).map(([slot, value]) => [
      slot,
      canonicalReference(scan, artifact, kind, value),
    ]),
  );
}

function canonicalReference(
  scan: { entries: AppearanceLibraryEntry[]; config: { user?: string | null } },
  artifact: ArtifactWithManifest & { id: string },
  kind: string,
  value: string | null,
): string | null {
  if (!value) return null;

  const matches = findReferenceCandidates(scan.entries as never, kind, value, {
    sourceEntry: artifact as never,
  });

  return matches.length === 1
    ? referenceForEntry(matches[0] as never)
    : value;
}

function groupSlots(
  entries: AppearanceLibraryEntry[],
  kind: string,
): Record<string, AppearanceOption[]> {
  const result: Record<string, AppearanceOption[]> = {};

  for (const entry of entries) {
    if (entry.kind !== kind || !(entry.manifest.slot as string | undefined)) continue;
    const slot = entry.manifest.slot as string;
    result[slot] ??= [];
    result[slot].push(publicOption(entry));
  }

  for (const options of Object.values(result)) {
    options.sort(compareOption);
  }

  return Object.fromEntries(
    Object.entries(result).sort(([a], [b]) => a.localeCompare(b, "en-GB")),
  );
}

function assetSlots(
  entries: AppearanceLibraryEntry[],
  artifact: ArtifactWithManifest,
  assets: AppearanceOption[],
): string[] {
  const slots = new Set(
    Object.keys(((artifact.manifest.appearance as Record<string, unknown> | undefined)?.overrides as Record<string, unknown> | undefined)?.assets as Record<string, unknown> | undefined ?? {}),
  );

  for (const entry of entries) {
    const maps =
      entry.kind === "theme"
        ? entry.manifest.assets
        : entry.kind === "preset"
          ? (entry.manifest.mappings as Record<string, unknown> | undefined)?.assets
          : null;

    for (const slot of Object.keys(maps ?? {})) slots.add(slot);
  }

  if (slots.size === 0 && assets.length > 0) slots.add("brand-logo");
  return [...slots].sort();
}

function publicOption(entry: AppearanceLibraryEntry): AppearanceOption {
  return {
    reference: referenceForEntry(entry),
    id: entry.id,
    kind: entry.kind,
    name: (entry.manifest.name as string | undefined) ?? null,
    description: (entry.manifest.description as string | undefined) ?? null,
    level: entry.level,
    collection: entry.collection ?? null,
    ownerArtifact: entry.ownerArtifact ?? null,
    slot: (entry.manifest.slot as string | undefined) ?? null,
    supportedThemes: (entry.manifest.supportedThemes as string[]) ?? [],
  };
}

function compareOption(left: AppearanceOption, right: AppearanceOption): number {
  const order: Record<string, number> = { local: 0, core: 1, collection: 2 };

  return (
    (order[left.level ?? ""] ?? 9) - (order[right.level ?? ""] ?? 9) ||
    (left.name ?? "").localeCompare(right.name ?? "", "en-GB") ||
    left.reference.localeCompare(right.reference, "en-GB")
  );
}

function mapped(
  kind: string,
  map: Record<string, string>,
  field: string,
): Array<[string, string, string]> {
  return Object.entries(map).map(([slot, ref]) => [
    kind,
    ref,
    `${field}.${slot}`,
  ]);
}

function object(value: unknown, field: string): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw failure("APPEARANCE_OBJECT_INVALID", `${field} must be an object.`);
  }
}

function unknownKeys(value: unknown, allowed: Set<string>, field: string): void {
  if (!value || typeof value !== "object") return;
  const keys = Object.keys(value as Record<string, unknown>).filter((key) => !allowed.has(key));

  if (keys.length > 0) {
    throw failure(
      "APPEARANCE_PROPERTY_UNKNOWN",
      `${field} contains unknown properties: ${keys.join(", ")}.`,
      { field, keys },
    );
  }
}

function getProperty(record: unknown, field: string): unknown {
  if (!record || typeof record !== "object") return undefined;
  return (record as Record<string, unknown>)[field];
}

function reference(value: unknown, field: string): string | null {
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

function referenceMap(value: unknown, field: string): Record<string, string> {
  if (value === undefined || value === null) return {};
  object(value, field);
  const result: Record<string, string> = {};

  for (const [slot, candidate] of Object.entries(value as Record<string, unknown>)) {
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

function failure(code: string, message: string, details: unknown = null): Error {
  const error = new TypeError(message) as Error & { code: string; details: unknown };
  error.code = code;
  error.details = details;
  return error;
}