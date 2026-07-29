import { findReferenceCandidates, sourceOwnerArtifact } from "../library/references.js";
import type { LibraryEntry, LibraryScan } from "../library/types.js";

const UI_KINDS = new Set(["primitive", "component", "layout"]);

export interface AppearanceResolutionIssue {
  severity: "error";
  code: string;
  message: string;
  artifactId?: string;
  field?: string;
  targetKind?: string;
  reference?: string;
  manifestPath?: string;
  themeId?: string;
  presetId?: string;
  slot?: string;
  declaredSlot?: string;
  candidateManifestPaths?: string[];
}

export interface ResolvedSelection {
  reference: string | null;
  source: string;
  field: string;
  resolved: boolean;
  entry: PublicResolutionEntry | null;
}

export interface PublicResolutionEntry {
  id: string;
  kind: string;
  category: string;
  title: string | null;
  level: string | null;
  collection: string | null;
  ownerArtifact: string | null;
  user: string | null;
  contractVersion: number | null;
  slot: string | null;
  displayPath: string;
  manifestPath: string;
  manifest?: Record<string, unknown> | null;
}

export interface ArtifactAppearanceResolution {
  artifact: PublicResolutionEntry;
  selections: {
    theme: ResolvedSelection | null;
    preset: ResolvedSelection | null;
    layout: ResolvedSelection | null;
    components: Record<string, ResolvedSelection | null>;
    primitives: Record<string, ResolvedSelection | null>;
    assets: Record<string, ResolvedSelection | null>;
  };
  dependencyClosure: PublicResolutionEntry[];
  edges: { source: PublicResolutionEntry; target: PublicResolutionEntry; field: string; reference: string }[];
  issues: AppearanceResolutionIssue[];
  summary: {
    valid: boolean;
    errorCount: number;
    warningCount: number;
    dependencyCount: number;
  };
}

export interface ArtifactAppearanceResolutionOptions {
  user?: string;
}

export function resolveArtifactAppearance(
  scan: LibraryScan,
  artifact: LibraryEntry,
): ArtifactAppearanceResolution {
  const configDefaults = (scan.config as { defaults?: { theme?: string; preset?: string } } | undefined)?.defaults ?? {};
  const issues: AppearanceResolutionIssue[] = [];
  const selections = {
    theme: null as ResolvedSelection | null,
    preset: null as ResolvedSelection | null,
    layout: null as ResolvedSelection | null,
    components: {} as Record<string, ResolvedSelection | null>,
    primitives: {} as Record<string, ResolvedSelection | null>,
    assets: {} as Record<string, ResolvedSelection | null>,
  };
  const edges: ArtifactAppearanceResolution["edges"] = [];
  const selectedEntries = new Map<string, LibraryEntry>();

  const themeChoice = chooseTopLevelReference(
    artifact,
    configDefaults.theme,
    getAppearanceString(artifact.manifest, "theme"),
    "theme",
    "appearance.theme",
  );
  selections.theme = resolveSelection(scan, artifact, themeChoice, issues);

  const presetChoice = chooseTopLevelReference(
    artifact,
    configDefaults.preset,
    getAppearanceString(artifact.manifest, "preset"),
    "preset",
    "appearance.preset",
  );
  selections.preset = resolveSelection(scan, artifact, presetChoice, issues);

  if (selections.theme?.entry) {
    selectedEntries.set(selections.theme.entry.manifestPath, scan.entries.find((e) => e.manifestPath === selections.theme?.entry?.manifestPath) ?? selections.theme.entry as unknown as LibraryEntry);
  }

  if (selections.preset?.entry) {
    selectedEntries.set(selections.preset.entry.manifestPath, scan.entries.find((e) => e.manifestPath === selections.preset?.entry?.manifestPath) ?? selections.preset.entry as unknown as LibraryEntry);
  }

  validatePresetTheme(
    scan,
    selections.preset?.entry ? scan.entries.find((e) => e.manifestPath === selections.preset?.entry?.manifestPath) ?? null : null,
    selections.theme?.entry ? scan.entries.find((e) => e.manifestPath === selections.theme?.entry?.manifestPath) ?? null : null,
    issues,
  );

  const presetManifest = (selections.preset?.entry?.manifest ?? {}) as Record<string, unknown>;
  const appearance = (artifact.manifest.appearance ?? {}) as Record<string, unknown>;
  const overrides = (appearance.overrides ?? {}) as Record<string, unknown>;

  const layoutChoice = chooseMappingReference({
    presetEntry: selections.preset?.entry ? scan.entries.find((e) => e.manifestPath === selections.preset?.entry?.manifestPath) ?? null : null,
    presetValue: getMappingString(presetManifest, "layout"),
    artifact,
    artifactValue: getMappingString(overrides, "layout"),
    targetKind: "layout",
    field: "appearance.overrides.layout",
    presetField: "mappings.layout",
  });

  selections.layout = resolveSelection(scan, artifact, layoutChoice, issues);

  selections.components = resolveMappingSet({
    scan,
    artifact,
    presetEntry: selections.preset?.entry ? scan.entries.find((e) => e.manifestPath === selections.preset?.entry?.manifestPath) ?? null : null,
    presetValues: (presetManifest.mappings as Record<string, unknown> | undefined)?.components as Record<string, unknown> | undefined,
    artifactValues: overrides.components as Record<string, unknown> | undefined,
    targetKind: "component",
    presetField: "mappings.components",
    artifactField: "appearance.overrides.components",
    issues,
  });

  selections.primitives = resolveMappingSet({
    scan,
    artifact,
    presetEntry: selections.preset?.entry ? scan.entries.find((e) => e.manifestPath === selections.preset?.entry?.manifestPath) ?? null : null,
    presetValues: (presetManifest.mappings as Record<string, unknown> | undefined)?.primitives as Record<string, unknown> | undefined,
    artifactValues: overrides.primitives as Record<string, unknown> | undefined,
    targetKind: "primitive",
    presetField: "mappings.primitives",
    artifactField: "appearance.overrides.primitives",
    issues,
  });

  selections.assets = resolveAssetMappings({
    scan,
    artifact,
    themeEntry: selections.theme?.entry ? scan.entries.find((e) => e.manifestPath === selections.theme?.entry?.manifestPath) ?? null : null,
    presetEntry: selections.preset?.entry ? scan.entries.find((e) => e.manifestPath === selections.preset?.entry?.manifestPath) ?? null : null,
    artifactValues: overrides.assets as Record<string, unknown> | undefined,
    issues,
  });

  const roots = [
    selections.layout,
    ...Object.values(selections.components),
    ...Object.values(selections.primitives),
    ...Object.values(selections.assets),
  ].filter((selection): selection is ResolvedSelection => Boolean(selection));

  for (const selection of roots) {
    if (selection.entry) {
      const entry = scan.entries.find((e) => e.manifestPath === selection.entry?.manifestPath);
      if (entry) selectedEntries.set(entry.manifestPath, entry);
    }
  }

  const dependencyState = {
    scan,
    artifact,
    selectedTheme: selections.theme?.entry ? scan.entries.find((e) => e.manifestPath === selections.theme?.entry?.manifestPath) ?? null : null,
    issues,
    edges,
    selectedEntries,
    visiting: new Set<string>(),
    visited: new Set<string>(),
  };

  for (const selection of roots) {
    const entry = selection.entry ? scan.entries.find((e) => e.manifestPath === selection.entry?.manifestPath) : null;
    if (entry && UI_KINDS.has(entry.kind)) {
      visitDependencies(entry, dependencyState);
    }
  }

  return {
    artifact: publicEntry(artifact),
    selections: {
      theme: publicSelection(selections.theme),
      preset: publicSelection(selections.preset),
      layout: publicSelection(selections.layout),
      components: publicSelectionMap(selections.components),
      primitives: publicSelectionMap(selections.primitives),
      assets: publicSelectionMap(selections.assets),
    },
    dependencyClosure: [...selectedEntries.values()]
      .map(publicEntry)
      .sort(comparePublicEntries),
    edges: edges.sort(compareEdges),
    issues: issues.sort(compareIssues),
    summary: {
      valid: !issues.some((issue) => (issue.severity as string) === "error"),
      errorCount: issues.filter((issue) => (issue.severity as string) === "error").length,
      warningCount: issues.filter((issue) => (issue.severity as string) === "warning").length,
      dependencyCount: selectedEntries.size,
    },
  };
}

export function resolveAllArtifactAppearances(
  scan: LibraryScan,
  options: ArtifactAppearanceResolutionOptions = {},
): { results: ArtifactAppearanceResolution[]; summary: { artifactCount: number; validArtifactCount: number; invalidArtifactCount: number; errorCount: number; warningCount: number } } {
  const artifacts = scan.entries.filter(
    (entry) =>
      entry.category === "artifact" &&
      (!options.user || entry.user === options.user),
  );
  const results = artifacts.map((artifact) =>
    resolveArtifactAppearance(scan, artifact),
  );

  return {
    results,
    summary: {
      artifactCount: results.length,
      validArtifactCount: results.filter((result) => result.summary.valid).length,
      invalidArtifactCount: results.filter((result) => !result.summary.valid).length,
      errorCount: results.reduce((total, result) => total + result.summary.errorCount, 0),
      warningCount: results.reduce((total, result) => total + result.summary.warningCount, 0),
    },
  };
}

interface Choice {
  value: string;
  targetKind: string;
  sourceEntry: LibraryEntry | null;
  source: string;
  field: string;
  allowLocal: boolean;
}

function chooseTopLevelReference(
  artifact: LibraryEntry,
  workspaceValue: string | undefined,
  artifactValue: string | undefined,
  targetKind: string,
  artifactField: string,
): Choice | null {
  if (artifactValue) {
    return {
      value: artifactValue,
      targetKind,
      sourceEntry: artifact,
      source: "artifact",
      field: artifactField,
      allowLocal: true,
    };
  }

  if (workspaceValue) {
    return {
      value: workspaceValue,
      targetKind,
      sourceEntry: null,
      source: "workspace-default",
      field: `defaults.${targetKind}`,
      allowLocal: false,
    };
  }

  return null;
}

function chooseMappingReference(options: {
  presetEntry: LibraryEntry | null;
  presetValue: string | undefined;
  artifact: LibraryEntry;
  artifactValue: string | undefined;
  targetKind: string;
  field: string;
  presetField: string;
}): Choice | null {
  if (options.artifactValue) {
    return {
      value: options.artifactValue,
      targetKind: options.targetKind,
      sourceEntry: options.artifact,
      source: "artifact-override",
      field: options.field,
      allowLocal: true,
    };
  }

  if (options.presetValue && options.presetEntry) {
    return {
      value: options.presetValue,
      targetKind: options.targetKind,
      sourceEntry: options.presetEntry,
      source: "preset",
      field: options.presetField,
      allowLocal: false,
    };
  }

  return null;
}

function resolveMappingSet(options: {
  scan: LibraryScan;
  artifact: LibraryEntry;
  presetEntry: LibraryEntry | null;
  presetValues: Record<string, unknown> | undefined;
  artifactValues: Record<string, unknown> | undefined;
  targetKind: string;
  presetField: string;
  artifactField: string;
  issues: AppearanceResolutionIssue[];
}): Record<string, ResolvedSelection | null> {
  const selections: Record<string, ResolvedSelection | null> = {};
  const presetValues = options.presetValues ?? {};
  const artifactValues = options.artifactValues ?? {};
  const slots = new Set([
    ...Object.keys(presetValues),
    ...Object.keys(artifactValues),
  ]);

  for (const slot of slots) {
    const choice = chooseMappingReference({
      presetEntry: options.presetEntry,
      presetValue: presetValues[slot] as string | undefined,
      artifact: options.artifact,
      artifactValue: artifactValues[slot] as string | undefined,
      targetKind: options.targetKind,
      field: `${options.artifactField}.${slot}`,
      presetField: `${options.presetField}.${slot}`,
    });

    const selection = resolveSelection(options.scan, options.artifact, choice, options.issues);

    if (selection) {
      validateSlot(slot, selection.entry, options.issues, choice);
      selections[slot] = selection;
    }
  }

  return selections;
}

function resolveAssetMappings(options: {
  scan: LibraryScan;
  artifact: LibraryEntry;
  themeEntry: LibraryEntry | null;
  presetEntry: LibraryEntry | null;
  artifactValues: Record<string, unknown> | undefined;
  issues: AppearanceResolutionIssue[];
}): Record<string, ResolvedSelection | null> {
  const selections: Record<string, ResolvedSelection | null> = {};
  const sources = [
    {
      values: (options.themeEntry?.manifest.assets ?? {}) as Record<string, unknown>,
      sourceEntry: options.themeEntry,
      source: "theme",
      field: "assets",
      allowLocal: false,
    },
    {
      values:
        ((options.presetEntry?.manifest.mappings as Record<string, unknown> | undefined)?.assets ?? {}) as Record<string, unknown>,
      sourceEntry: options.presetEntry,
      source: "preset",
      field: "mappings.assets",
      allowLocal: false,
    },
    {
      values: options.artifactValues ?? {},
      sourceEntry: options.artifact,
      source: "artifact-override",
      field: "appearance.overrides.assets",
      allowLocal: true,
    },
  ];

  for (const source of sources) {
    for (const [slot, value] of Object.entries(source.values)) {
      selections[slot] = resolveSelection(
        options.scan,
        options.artifact,
        {
          value: value as string,
          targetKind: "asset",
          sourceEntry: source.sourceEntry,
          source: source.source,
          field: `${source.field}.${slot}`,
          allowLocal: source.allowLocal,
        },
        options.issues,
      );
    }
  }

  return selections;
}

function resolveSelection(
  scan: LibraryScan,
  artifact: LibraryEntry,
  choice: Choice | null,
  issues: AppearanceResolutionIssue[],
): ResolvedSelection | null {
  if (!choice?.value) return null;

  const sourceEntry =
    choice.allowLocal === false
      ? withoutArtifactLocalContext(choice.sourceEntry)
      : choice.sourceEntry;
  const candidates = findReferenceCandidates(
    scan.entries,
    choice.targetKind,
    choice.value,
    {
      sourceEntry,
    },
  );

  if (candidates.length === 0) {
    issues.push({
      severity: "error",
      code: "APPEARANCE_REFERENCE_UNRESOLVED",
      message: `${choice.field} references missing ${choice.targetKind}:${choice.value}.`,
      artifactId: artifact.id,
      field: choice.field,
      targetKind: choice.targetKind,
      reference: choice.value,
    });
    return {
      reference: choice.value,
      source: choice.source,
      field: choice.field,
      resolved: false,
      entry: null,
    };
  }

  if (candidates.length > 1) {
    issues.push({
      severity: "error",
      code: "APPEARANCE_REFERENCE_AMBIGUOUS",
      message: `${choice.field} references ambiguous ${choice.targetKind}:${choice.value}.`,
      artifactId: artifact.id,
      field: choice.field,
      targetKind: choice.targetKind,
      reference: choice.value,
      candidateManifestPaths: candidates.map((candidate) => candidate.manifestPath),
    });
    return {
      reference: choice.value,
      source: choice.source,
      field: choice.field,
      resolved: false,
      entry: null,
    };
  }

  const candidate = candidates[0];
  if (!candidate) return null;

  return {
    reference: choice.value,
    source: choice.source,
    field: choice.field,
    resolved: true,
    entry: publicEntry(candidate),
  };
}

function withoutArtifactLocalContext(entry: LibraryEntry | null): LibraryEntry | null {
  if (!entry || entry.category !== "artifact") return entry;

  return {
    ...entry,
    category: "workspace",
  };
}

interface DependencyState {
  scan: LibraryScan;
  artifact: LibraryEntry;
  selectedTheme: LibraryEntry | null;
  issues: AppearanceResolutionIssue[];
  edges: ArtifactAppearanceResolution["edges"];
  selectedEntries: Map<string, LibraryEntry>;
  visiting: Set<string>;
  visited: Set<string>;
}

function visitDependencies(entry: LibraryEntry, state: DependencyState): void {
  if (state.visited.has(entry.manifestPath)) return;

  if (state.visiting.has(entry.manifestPath)) {
    state.issues.push({
      severity: "error",
      code: "DEPENDENCY_CYCLE",
      message: `Dependency cycle detected at ${entry.kind}:${entry.id}.`,
      artifactId: state.artifact.id,
      manifestPath: entry.manifestPath,
    });
    return;
  }

  state.visiting.add(entry.manifestPath);
  validateThemeCompatibility(state.scan, entry, state.selectedTheme, state.issues);

  const manifest = entry.manifest as Record<string, unknown>;
  const dependencyGroups: Array<[string, Record<string, unknown>]> = [
    ["primitive", (manifest.dependencies as Record<string, unknown> | undefined)?.primitives as Record<string, unknown> ?? {}],
    ["component", (manifest.dependencies as Record<string, unknown> | undefined)?.components as Record<string, unknown> ?? {}],
    ["asset", (manifest.dependencies as Record<string, unknown> | undefined)?.assets as Record<string, unknown> ?? {}],
  ];

  for (const [targetKind, mappings] of dependencyGroups) {
    for (const [slot, value] of Object.entries(mappings)) {
      const choice: Choice = {
        value: value as string,
        targetKind,
        sourceEntry: entry,
        source: "dependency",
        field: `dependencies.${targetKind}s.${slot}`,
        allowLocal: entry.level === "local",
      };
      const selection = resolveSelection(state.scan, state.artifact, choice, state.issues);

      if (!selection?.entry) continue;

      const targetEntry = state.scan.entries.find((candidate) => candidate.manifestPath === selection.entry?.manifestPath);
      if (!targetEntry) continue;

      validateSlot(slot, selection.entry, state.issues, choice);
      state.selectedEntries.set(targetEntry.manifestPath, targetEntry);
      state.edges.push({
        source: publicEntry(entry),
        target: publicEntry(targetEntry),
        field: choice.field,
        reference: value as string,
      });

      if (UI_KINDS.has(targetEntry.kind)) {
        visitDependencies(targetEntry, state);
      }
    }
  }

  state.visiting.delete(entry.manifestPath);
  state.visited.add(entry.manifestPath);
}

function validatePresetTheme(
  scan: LibraryScan,
  preset: LibraryEntry | null,
  theme: LibraryEntry | null,
  issues: AppearanceResolutionIssue[],
): void {
  if (!preset || !theme) return;

  const supported = (preset.manifest.supportedThemes ?? []) as string[];
  if (supported.length === 0) return;

  if (!referencesEntry(scan, preset, "theme", supported, theme)) {
    issues.push({
      severity: "error",
      code: "PRESET_THEME_INCOMPATIBLE",
      message: `Preset ${preset.id} does not support theme ${theme.id}.`,
      presetId: preset.id,
      themeId: theme.id,
    });
  }
}

function validateThemeCompatibility(
  scan: LibraryScan,
  entry: LibraryEntry,
  theme: LibraryEntry | null,
  issues: AppearanceResolutionIssue[],
): void {
  if (!theme) return;

  const supported = (entry.manifest.supportedThemes ?? []) as string[];
  if (supported.length === 0) return;

  if (!referencesEntry(scan, entry, "theme", supported, theme)) {
    issues.push({
      severity: "error",
      code: "UI_THEME_INCOMPATIBLE",
      message: `${entry.kind}:${entry.id} does not support theme ${theme.id}.`,
      manifestPath: entry.manifestPath,
      themeId: theme.id,
    });
  }
}

function referencesEntry(
  scan: LibraryScan,
  sourceEntry: LibraryEntry,
  targetKind: string,
  references: readonly string[],
  expectedEntry: LibraryEntry,
): boolean {
  return references.some((value) => {
    const candidates = findReferenceCandidates(
      scan.entries,
      targetKind,
      value,
      { sourceEntry },
    );

    return candidates.some(
      (candidate) => candidate.manifestPath === expectedEntry.manifestPath,
    );
  });
}

function validateSlot(
  slot: string,
  entry: PublicResolutionEntry | null,
  issues: AppearanceResolutionIssue[],
  choice: Choice | null,
): void {
  if (!entry || !choice) return;
  const declared = entry.slot;
  if (declared && declared !== slot) {
    issues.push({
      severity: "error",
      code: "UI_SLOT_MISMATCH",
      message: `${choice.field} maps slot ${slot} to ${entry.kind}:${entry.id}, which declares slot ${declared}.`,
      field: choice.field,
      slot,
      declaredSlot: declared,
    });
  }
}

function publicSelection(selection: ResolvedSelection | null): ResolvedSelection | null {
  if (!selection) return null;
  return selection;
}

function publicSelectionMap(
  values: Record<string, ResolvedSelection | null>,
): Record<string, ResolvedSelection | null> {
  return Object.fromEntries(
    Object.entries(values).map(([slot, selection]) => [slot, publicSelection(selection)]),
  );
}

function publicEntry(entry: LibraryEntry | PublicResolutionEntry): PublicResolutionEntry {
  if ("contractVersion" in entry) return entry as PublicResolutionEntry;
  const libraryEntry = entry as LibraryEntry;
  return {
    id: libraryEntry.id,
    kind: libraryEntry.kind,
    category: libraryEntry.category,
    title: libraryEntry.title,
    level: libraryEntry.level,
    collection: libraryEntry.collection,
    ownerArtifact: libraryEntry.ownerArtifact,
    user: libraryEntry.user,
    contractVersion: (libraryEntry.manifest.contractVersion as number | undefined) ?? null,
    slot: (libraryEntry.manifest.slot as string | undefined) ?? null,
    displayPath: libraryEntry.displayPath,
    manifestPath: libraryEntry.manifestPath,
    manifest: libraryEntry.manifest,
  };
}

function comparePublicEntries(left: PublicResolutionEntry, right: PublicResolutionEntry): number {
  return (
    left.kind.localeCompare(right.kind, "en") ||
    left.id.localeCompare(right.id, "en") ||
    left.displayPath.localeCompare(right.displayPath, "en")
  );
}

function compareEdges(
  left: ArtifactAppearanceResolution["edges"][number],
  right: ArtifactAppearanceResolution["edges"][number],
): number {
  return (
    left.source.kind.localeCompare(right.source.kind, "en") ||
    left.source.id.localeCompare(right.source.id, "en") ||
    left.field.localeCompare(right.field, "en")
  );
}

function compareIssues(left: AppearanceResolutionIssue, right: AppearanceResolutionIssue): number {
  const order = { error: 0, warning: 1 };

  return (
    (order[left.severity] ?? 9) - (order[right.severity] ?? 9) ||
    left.code.localeCompare(right.code, "en") ||
    left.message.localeCompare(right.message, "en")
  );
}

function getAppearanceString(manifest: Record<string, unknown>, field: string): string | undefined {
  const appearance = manifest.appearance as Record<string, unknown> | undefined;
  return appearance?.[field] as string | undefined;
}

function getMappingString(record: Record<string, unknown> | undefined, field: string): string | undefined {
  const mappings = record?.mappings as Record<string, unknown> | undefined;
  return mappings?.[field] as string | undefined;
}