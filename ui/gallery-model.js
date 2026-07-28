const VARIANTS = Object.freeze([
  "standard",
  "wide",
  "tall",
]);

const CATEGORY_PATHS = Object.freeze({
  dashboard: "/dashboards",
  presentation: "/presentations",
  concept: "/concepts",
});

export function sortArtifacts(
  artifacts,
) {
  return [...artifacts].sort(
    (left, right) =>
      kindOrder(left.kind) -
        kindOrder(right.kind) ||
      String(left.title).localeCompare(
        String(right.title),
        "en-GB",
      ) ||
      String(left.id).localeCompare(
        String(right.id),
        "en-GB",
      ),
  );
}

export function galleryVariantForArtifact(
  artifact,
) {
  const seed =
    `${artifact.kind}:${artifact.id}`;
  let hash = 2166136261;

  for (const character of seed) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(
      hash,
      16777619,
    );
  }

  return VARIANTS[
    Math.abs(hash) %
      VARIANTS.length
  ];
}

export function artifactViewerPath(
  artifact,
) {
  return `/view/${encodeURIComponent(
    artifact.kind,
  )}/${encodeURIComponent(
    artifact.id,
  )}`;
}

export function artifactPreviewPath(
  artifact,
) {
  return withArtifactUser(`/api/artifacts/${encodeURIComponent(
    artifact.kind,
  )}/${encodeURIComponent(
    artifact.id,
  )}/preview`, artifact);
}

export function artifactDownloadPath(
  artifact,
) {
  return withArtifactUser(`/api/artifacts/${encodeURIComponent(
    artifact.kind,
  )}/${encodeURIComponent(
    artifact.id,
  )}/download`, artifact);
}

export function categoryPathForKind(
  kind,
) {
  return (
    CATEGORY_PATHS[kind] ??
    "/"
  );
}

export function kindLabel(kind) {
  return {
    dashboard: "Dashboard",
    presentation: "Presentation",
    concept: "Concept",
  }[kind] ?? titleCase(kind);
}

function kindOrder(kind) {
  return {
    dashboard: 0,
    presentation: 1,
    concept: 2,
  }[kind] ?? 9;
}

function titleCase(value) {
  return String(value)
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

function withArtifactUser(path, artifact) {
  if (!artifact.userId) return path;
  return `${path}${
    path.includes("?") ? "&" : "?"
  }userId=${encodeURIComponent(artifact.userId)}`;
}
