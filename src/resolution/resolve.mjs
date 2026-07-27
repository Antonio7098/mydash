import {
  findReferenceCandidates,
} from "../library/references.mjs";

const UI_KINDS = new Set([
  "primitive",
  "component",
  "layout",
]);

export function resolveArtifactAppearance(scan, artifact) {
  const issues = [];
  const selections = {
    theme: null,
    preset: null,
    layout: null,
    components: {},
    primitives: {},
    assets: {},
  };
  const edges = [];
  const selectedEntries = new Map();

  const themeChoice = chooseTopLevelReference(
    artifact,
    scan.config.defaults.theme,
    artifact.manifest.appearance?.theme,
    "theme",
    "appearance.theme",
  );
  selections.theme = resolveSelection(
    scan,
    artifact,
    themeChoice,
    issues,
  );

  const presetChoice = chooseTopLevelReference(
    artifact,
    scan.config.defaults.preset,
    artifact.manifest.appearance?.preset,
    "preset",
    "appearance.preset",
  );
  selections.preset = resolveSelection(
    scan,
    artifact,
    presetChoice,
    issues,
  );

  if (selections.theme?.entry) {
    selectedEntries.set(
      selections.theme.entry.manifestPath,
      selections.theme.entry,
    );
  }

  if (selections.preset?.entry) {
    selectedEntries.set(
      selections.preset.entry.manifestPath,
      selections.preset.entry,
    );
  }

  validatePresetTheme(
    scan,
    selections.preset?.entry,
    selections.theme?.entry,
    issues,
  );

  const preset = selections.preset?.entry?.manifest ?? {};
  const appearance = artifact.manifest.appearance ?? {};
  const overrides = appearance.overrides ?? {};

  const layoutChoice = chooseMappingReference({
    presetEntry: selections.preset?.entry,
    presetValue: preset.mappings?.layout,
    artifact,
    artifactValue: overrides.layout,
    targetKind: "layout",
    field: "appearance.overrides.layout",
    presetField: "mappings.layout",
  });

  selections.layout = resolveSelection(
    scan,
    artifact,
    layoutChoice,
    issues,
  );

  selections.components = resolveMappingSet({
    scan,
    artifact,
    presetEntry: selections.preset?.entry,
    presetValues: preset.mappings?.components,
    artifactValues: overrides.components,
    targetKind: "component",
    presetField: "mappings.components",
    artifactField: "appearance.overrides.components",
    issues,
  });

  selections.primitives = resolveMappingSet({
    scan,
    artifact,
    presetEntry: selections.preset?.entry,
    presetValues: preset.mappings?.primitives,
    artifactValues: overrides.primitives,
    targetKind: "primitive",
    presetField: "mappings.primitives",
    artifactField: "appearance.overrides.primitives",
    issues,
  });

  selections.assets = resolveAssetMappings({
    scan,
    artifact,
    themeEntry: selections.theme?.entry,
    presetEntry: selections.preset?.entry,
    artifactValues: overrides.assets,
    issues,
  });

  const roots = [
    selections.layout,
    ...Object.values(selections.components),
    ...Object.values(selections.primitives),
    ...Object.values(selections.assets),
  ].filter(Boolean);

  for (const selection of roots) {
    if (selection.entry) {
      selectedEntries.set(
        selection.entry.manifestPath,
        selection.entry,
      );
    }
  }

  const dependencyState = {
    scan,
    artifact,
    selectedTheme: selections.theme?.entry ?? null,
    issues,
    edges,
    selectedEntries,
    visiting: new Set(),
    visited: new Set(),
  };

  for (const selection of roots) {
    if (selection.entry && UI_KINDS.has(selection.entry.kind)) {
      visitDependencies(selection.entry, dependencyState);
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
      valid: !issues.some((issue) => issue.severity === "error"),
      errorCount: issues.filter(
        (issue) => issue.severity === "error",
      ).length,
      warningCount: issues.filter(
        (issue) => issue.severity === "warning",
      ).length,
      dependencyCount: selectedEntries.size,
    },
  };
}

export function resolveAllArtifactAppearances(scan, options = {}) {
  const artifacts = scan.entries.filter(
    (entry) =>
      entry.category === "artifact" &&
      (!options.userId || entry.userId === options.userId),
  );
  const results = artifacts.map((artifact) =>
    resolveArtifactAppearance(scan, artifact),
  );

  return {
    results,
    summary: {
      artifactCount: results.length,
      validArtifactCount: results.filter(
        (result) => result.summary.valid,
      ).length,
      invalidArtifactCount: results.filter(
        (result) => !result.summary.valid,
      ).length,
      errorCount: results.reduce(
        (total, result) => total + result.summary.errorCount,
        0,
      ),
      warningCount: results.reduce(
        (total, result) => total + result.summary.warningCount,
        0,
      ),
    },
  };
}

function chooseTopLevelReference(
  artifact,
  workspaceValue,
  artifactValue,
  targetKind,
  artifactField,
) {
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

function chooseMappingReference(options) {
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

function resolveMappingSet(options) {
  const selections = {};
  const presetValues = options.presetValues ?? {};
  const artifactValues = options.artifactValues ?? {};
  const slots = new Set([
    ...Object.keys(presetValues),
    ...Object.keys(artifactValues),
  ]);

  for (const slot of slots) {
    const choice = chooseMappingReference({
      presetEntry: options.presetEntry,
      presetValue: presetValues[slot],
      artifact: options.artifact,
      artifactValue: artifactValues[slot],
      targetKind: options.targetKind,
      field: `${options.artifactField}.${slot}`,
      presetField: `${options.presetField}.${slot}`,
    });

    const selection = resolveSelection(
      options.scan,
      options.artifact,
      choice,
      options.issues,
    );

    if (selection) {
      validateSlot(slot, selection.entry, options.issues, choice);
      selections[slot] = selection;
    }
  }

  return selections;
}

function resolveAssetMappings(options) {
  const selections = {};
  const sources = [
    {
      values: options.themeEntry?.manifest.assets ?? {},
      sourceEntry: options.themeEntry,
      source: "theme",
      field: "assets",
      allowLocal: false,
    },
    {
      values:
        options.presetEntry?.manifest.mappings?.assets ?? {},
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
          value,
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

function resolveSelection(scan, artifact, choice, issues) {
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
      ...choice,
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
      candidateManifestPaths: candidates.map(
        (candidate) => candidate.manifestPath,
      ),
    });
    return {
      ...choice,
      entry: null,
    };
  }

  return {
    ...choice,
    entry: candidates[0],
  };
}

function withoutArtifactLocalContext(entry) {
  if (!entry || entry.category !== "artifact") return entry;

  return {
    ...entry,
    category: "workspace",
  };
}

function visitDependencies(entry, state) {
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
  validateThemeCompatibility(
    state.scan,
    entry,
    state.selectedTheme,
    state.issues,
  );

  const dependencyGroups = [
    ["primitive", entry.manifest.dependencies?.primitives ?? {}],
    ["component", entry.manifest.dependencies?.components ?? {}],
    ["asset", entry.manifest.dependencies?.assets ?? {}],
  ];

  for (const [targetKind, mappings] of dependencyGroups) {
    for (const [slot, value] of Object.entries(mappings)) {
      const choice = {
        value,
        targetKind,
        sourceEntry: entry,
        source: "dependency",
        field: `dependencies.${targetKind}s.${slot}`,
        allowLocal: entry.level === "local",
      };
      const selection = resolveSelection(
        state.scan,
        state.artifact,
        choice,
        state.issues,
      );

      if (!selection?.entry) continue;

      validateSlot(slot, selection.entry, state.issues, choice);
      state.selectedEntries.set(
        selection.entry.manifestPath,
        selection.entry,
      );
      state.edges.push({
        source: publicEntry(entry),
        target: publicEntry(selection.entry),
        field: choice.field,
        reference: value,
      });

      if (UI_KINDS.has(selection.entry.kind)) {
        visitDependencies(selection.entry, state);
      }
    }
  }

  state.visiting.delete(entry.manifestPath);
  state.visited.add(entry.manifestPath);
}

function validatePresetTheme(scan, preset, theme, issues) {
  if (!preset || !theme) return;

  const supported = preset.manifest.supportedThemes ?? [];
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

function validateThemeCompatibility(scan, entry, theme, issues) {
  if (!theme) return;

  const supported = entry.manifest.supportedThemes ?? [];
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
  scan,
  sourceEntry,
  targetKind,
  references,
  expectedEntry,
) {
  return references.some((value) => {
    const candidates = findReferenceCandidates(
      scan.entries,
      targetKind,
      value,
      { sourceEntry },
    );

    return candidates.some(
      (candidate) =>
        candidate.manifestPath === expectedEntry.manifestPath,
    );
  });
}

function validateSlot(slot, entry, issues, choice) {
  if (!entry || entry.kind === "asset") return;

  const declared = entry.manifest.slot;
  if (declared && declared !== slot) {
    issues.push({
      severity: "error",
      code: "UI_SLOT_MISMATCH",
      message: `${choice.field} maps slot ${slot} to ${entry.kind}:${entry.id}, which declares slot ${declared}.`,
      field: choice.field,
      slot,
      declaredSlot: declared,
      manifestPath: entry.manifestPath,
    });
  }
}

function publicSelection(selection) {
  if (!selection) return null;

  return {
    reference: selection.value,
    source: selection.source,
    field: selection.field,
    resolved: Boolean(selection.entry),
    entry: selection.entry
      ? publicEntry(selection.entry)
      : null,
  };
}

function publicSelectionMap(values) {
  return Object.fromEntries(
    Object.entries(values).map(([slot, selection]) => [
      slot,
      publicSelection(selection),
    ]),
  );
}

function publicEntry(entry) {
  return {
    id: entry.id,
    kind: entry.kind,
    category: entry.category,
    title: entry.title,
    level: entry.level,
    collection: entry.collection,
    ownerArtifact: entry.ownerArtifact,
    userId: entry.userId,
    contractVersion:
      entry.manifest.contractVersion ?? null,
    slot: entry.manifest.slot ?? null,
    displayPath: entry.displayPath,
    manifestPath: entry.manifestPath,
  };
}

function comparePublicEntries(left, right) {
  return (
    left.kind.localeCompare(right.kind, "en") ||
    left.id.localeCompare(right.id, "en") ||
    left.displayPath.localeCompare(right.displayPath, "en")
  );
}

function compareEdges(left, right) {
  return (
    left.source.kind.localeCompare(right.source.kind, "en") ||
    left.source.id.localeCompare(right.source.id, "en") ||
    left.field.localeCompare(right.field, "en")
  );
}

function compareIssues(left, right) {
  const order = { error: 0, warning: 1 };

  return (
    (order[left.severity] ?? 9) -
      (order[right.severity] ?? 9) ||
    left.code.localeCompare(right.code, "en") ||
    left.message.localeCompare(right.message, "en")
  );
}
