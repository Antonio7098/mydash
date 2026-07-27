export const VIEWER_SHORTCUTS = Object.freeze([
  {
    key: "R",
    action: "reload",
    label: "Reload preview",
  },
  {
    key: "F",
    action: "fullscreen",
    label: "Enter or exit fullscreen",
  },
  {
    key: "I",
    action: "details",
    label: "Show or hide details",
  },
  {
    key: "A",
    action: "appearance",
    label: "Show or hide appearance controls",
  },
  {
    key: "?",
    action: "shortcuts",
    label: "Show keyboard shortcuts",
  },
  {
    key: "Escape",
    action: "escape",
    label: "Exit fullscreen or close help",
  },
]);

export function viewerShortcutAction(
  event,
) {
  if (
    event.defaultPrevented ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  ) {
    return null;
  }

  if (
    isEditableTarget(
      event.target,
    )
  ) {
    return null;
  }

  const key = String(
    event.key ?? "",
  ).toLowerCase();

  return {
    r: "reload",
    f: "fullscreen",
    i: "details",
    a: "appearance",
    "?": "shortcuts",
  }[key] ?? null;
}

export function formatBytes(
  value,
  locale = "en-GB",
) {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    return "Unavailable";
  }

  if (value < 1024) {
    return `${Math.round(value)} B`;
  }

  const units = [
    "KB",
    "MB",
    "GB",
  ];
  let amount = value / 1024;
  let unitIndex = 0;

  while (
    amount >= 1024 &&
    unitIndex <
      units.length - 1
  ) {
    amount /= 1024;
    unitIndex += 1;
  }

  return `${new Intl.NumberFormat(
    locale,
    {
      maximumFractionDigits:
        amount >= 10 ? 1 : 2,
    },
  ).format(amount)} ${
    units[unitIndex]
  }`;
}

export function shortHash(
  value,
  length = 12,
) {
  if (
    typeof value !== "string" ||
    !value
  ) {
    return "Unavailable";
  }

  return value.slice(
    0,
    Math.max(4, length),
  );
}

export function selectedAppearance(
  resolution,
) {
  return {
    theme:
      resolution?.selections
        ?.theme?.entry?.id ??
      "None",
    preset:
      resolution?.selections
        ?.preset?.entry?.id ??
      "None",
    layout:
      resolution?.selections
        ?.layout?.entry?.id ??
      "None",
  };
}

export function dependencyGroups(
  resolution,
) {
  const groups = new Map();

  for (
    const dependency of
      resolution
        ?.dependencyClosure ?? []
  ) {
    const kind =
      dependency.kind ??
      "other";

    if (!groups.has(kind)) {
      groups.set(kind, []);
    }

    groups.get(kind).push(
      dependency,
    );
  }

  return [...groups.entries()]
    .sort(
      ([left], [right]) =>
        dependencyKindOrder(left) -
          dependencyKindOrder(right) ||
        left.localeCompare(
          right,
          "en-GB",
        ),
    )
    .map(([kind, entries]) => ({
      kind,
      entries: entries.sort(
        (left, right) =>
          String(left.id).localeCompare(
            String(right.id),
            "en-GB",
          ),
      ),
    }));
}

export function exportResourceRows(
  resources,
) {
  const labels = {
    stylesheets: "Stylesheets",
    scripts: "Scripts",
    dataFiles: "Data files",
    uiResources: "UI resources",
    assets: "Assets",
    htmlFragments: "HTML fragments",
  };

  return Object.entries(
    resources ?? {},
  )
    .filter(
      ([, value]) =>
        Number.isFinite(value),
    )
    .sort(
      ([left], [right]) =>
        (resourceOrder(left) -
          resourceOrder(right)) ||
        left.localeCompare(
          right,
          "en-GB",
        ),
    )
    .map(([key, value]) => [
      labels[key] ??
        titleCase(key),
      String(value),
    ]);
}

export function exportReadiness(
  status,
) {
  if (!status) {
    return {
      mode: "loading",
      label:
        "Checking export",
    };
  }

  if (
    status.export?.ready ===
    true
  ) {
    return {
      mode: "ready",
      label:
        `Export ready · ${formatBytes(
          status.export.sizeBytes,
        )}`,
    };
  }

  return {
    mode: "error",
    label:
      "Export needs attention",
  };
}

function isEditableTarget(
  target,
) {
  const tagName =
    target?.tagName
      ?.toLowerCase?.();

  return (
    target?.isContentEditable ===
      true ||
    [
      "input",
      "select",
      "textarea",
      "button",
    ].includes(tagName)
  );
}

function dependencyKindOrder(
  kind,
) {
  return {
    theme: 0,
    preset: 1,
    layout: 2,
    primitive: 3,
    component: 4,
    asset: 5,
  }[kind] ?? 9;
}

function resourceOrder(key) {
  return {
    stylesheets: 0,
    scripts: 1,
    dataFiles: 2,
    uiResources: 3,
    assets: 4,
    htmlFragments: 5,
  }[key] ?? 9;
}

function titleCase(value) {
  return String(value)
    .replaceAll("-", " ")
    .replace(
      /([a-z])([A-Z])/g,
      "$1 $2",
    )
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}
