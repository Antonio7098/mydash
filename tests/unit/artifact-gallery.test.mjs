import assert from "node:assert/strict";
import test from "node:test";
import {
  artifactDownloadPath,
  artifactPreviewPath,
  artifactViewerPath,
  categoryPathForKind,
  galleryVariantForArtifact,
  kindLabel,
  sortArtifacts,
} from "../../ui/gallery-model.js";
import {
  isNavigatorPath,
  routeForPath,
} from "../../ui/router.js";

const artifact = {
  id: "ai-use-case-governance",
  kind: "dashboard",
  title: "AI Use Case Governance",
};

test("gallery URLs use the existing API and viewer contracts", () => {
  assert.equal(
    artifactViewerPath(artifact),
    "/view/dashboard/ai-use-case-governance",
  );
  assert.equal(
    artifactPreviewPath(artifact),
    "/api/artifacts/dashboard/ai-use-case-governance/preview",
  );
  assert.equal(
    artifactDownloadPath(artifact),
    "/api/artifacts/dashboard/ai-use-case-governance/download",
  );
});

test("artifact API URLs carry user scope while navigator URLs do not", () => {
  const scoped = {
    ...artifact,
    userId: "antonio",
  };

  assert.equal(
    artifactViewerPath(scoped),
    "/view/dashboard/ai-use-case-governance",
  );
  assert.equal(
    artifactPreviewPath(scoped),
    "/api/artifacts/dashboard/ai-use-case-governance/preview?userId=antonio",
  );
  assert.equal(
    artifactDownloadPath(scoped),
    "/api/artifacts/dashboard/ai-use-case-governance/download?userId=antonio",
  );
});

test("viewer routes are recognised and parsed", () => {
  const route = routeForPath(
    "/view/dashboard/ai-use-case-governance",
  );

  assert.equal(
    isNavigatorPath(route.path),
    true,
  );
  assert.equal(route.id, "viewer");
  assert.deepEqual(
    route.params,
    {
      kind: "dashboard",
      id: "ai-use-case-governance",
    },
  );
  assert.equal(
    isNavigatorPath(
      "/view/dashboard/../../unsafe",
    ),
    false,
  );
});

test("gallery variants are deterministic", () => {
  const first =
    galleryVariantForArtifact(
      artifact,
    );
  const second =
    galleryVariantForArtifact(
      { ...artifact },
    );

  assert.equal(first, second);
  assert.equal(
    ["standard", "wide", "tall"].includes(
      first,
    ),
    true,
  );
});

test("artefacts sort by kind then en-GB title", () => {
  const result =
    sortArtifacts([
      {
        id: "z",
        kind: "concept",
        title: "Zulu",
      },
      {
        id: "b",
        kind: "dashboard",
        title: "Beta",
      },
      {
        id: "a",
        kind: "dashboard",
        title: "Alpha",
      },
      {
        id: "p",
        kind: "presentation",
        title: "Planning",
      },
    ]);

  assert.deepEqual(
    result.map(
      (item) => item.id,
    ),
    ["a", "b", "p", "z"],
  );
});

test("kind labels and category paths are stable", () => {
  assert.equal(
    kindLabel("dashboard"),
    "Dashboard",
  );
  assert.equal(
    categoryPathForKind(
      "presentation",
    ),
    "/presentations",
  );
  assert.equal(
    categoryPathForKind(
      "unknown",
    ),
    "/",
  );
});
