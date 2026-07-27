export const MANIFEST_SPECS = [
  {
    rootKey: "dashboards",
    category: "artifact",
    manifestFile: "artifact.json",
    contract: "artifact",
    expectedKinds: ["dashboard"],
  },
  {
    rootKey: "presentations",
    category: "artifact",
    manifestFile: "artifact.json",
    contract: "artifact",
    expectedKinds: ["presentation"],
  },
  {
    rootKey: "concepts",
    category: "artifact",
    manifestFile: "artifact.json",
    contract: "artifact",
    expectedKinds: ["concept"],
  },
  {
    rootKey: "primitives",
    category: "ui",
    manifestFile: "ui.json",
    contract: "uiItem",
    expectedKinds: ["primitive"],
  },
  {
    rootKey: "components",
    category: "ui",
    manifestFile: "ui.json",
    contract: "uiItem",
    expectedKinds: ["component"],
  },
  {
    rootKey: "layouts",
    category: "ui",
    manifestFile: "ui.json",
    contract: "uiItem",
    expectedKinds: ["layout"],
  },
  {
    rootKey: "themes",
    category: "theme",
    manifestFile: "theme.json",
    contract: "theme",
    expectedKinds: ["theme"],
  },
  {
    rootKey: "presets",
    category: "preset",
    manifestFile: "preset.json",
    contract: "preset",
    expectedKinds: ["preset"],
  },
  {
    rootKey: "assets",
    category: "asset",
    manifestFile: "asset.json",
    contract: "asset",
    expectedKinds: ["asset"],
  },
];

export const REFERENCEABLE_KINDS = new Set([
  "primitive",
  "component",
  "layout",
  "theme",
  "preset",
  "asset",
]);

export function manifestSpecForRoot(rootKey) {
  return MANIFEST_SPECS.find((spec) => spec.rootKey === rootKey) ?? null;
}

export function expectedPlacement(entry) {
  if (entry.category === "artifact") {
    return {
      expectedLevel: null,
      expectedCollection: null,
    };
  }

  const segments = entry.relativeDirectory
    .split("/")
    .filter(Boolean);

  if (segments[0] === "core") {
    return {
      expectedLevel: "core",
      expectedCollection: null,
    };
  }

  if (segments[0] === "collections" && segments[1]) {
    return {
      expectedLevel: "collection",
      expectedCollection: segments[1],
    };
  }

  return {
    expectedLevel: null,
    expectedCollection: null,
  };
}
