import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAppearanceInput,
  buildAppearanceOptions,
  normaliseAppearanceInput,
  parseAppearanceQuery,
  referenceForEntry,
} from "../../src/appearance/controls.mjs";

test("appearance input is complete and deterministic", () => {
  assert.deepEqual(
    normaliseAppearanceInput({
      theme: "core/hsbc-light",
      preset: "core/default",
      overrides: {
        components: {
          zeta: "core/z",
          alpha: "local/a",
          empty: "",
        },
      },
    }),
    {
      theme: "core/hsbc-light",
      preset: "core/default",
      overrides: {
        layout: null,
        components: {
          alpha: "local/a",
          zeta: "core/z",
        },
        primitives: {},
        assets: {},
      },
    },
  );
});

test("invalid properties and references are rejected", () => {
  assert.throws(
    () =>
      normaliseAppearanceInput({
        theme: "Bad Reference",
        preset: null,
        overrides: {},
      }),
    /lowercase resource reference/,
  );
  assert.throws(
    () =>
      normaliseAppearanceInput({
        theme: null,
        preset: null,
        overrides: {},
        surprise: true,
      }),
    /unknown properties/,
  );
});

test("appearance query parsing validates JSON and size", () => {
  const source = JSON.stringify({
    theme: "core/hsbc-light",
    preset: "core/default",
    overrides: {},
  });

  assert.equal(parseAppearanceQuery(source).theme, "core/hsbc-light");
  assert.throws(() => parseAppearanceQuery("{bad"), /valid JSON/);
  assert.throws(() => parseAppearanceQuery(source, 5), /exceeds 5 bytes/);
});

test("references are qualified by lifecycle scope", () => {
  assert.equal(
    referenceForEntry({
      id: "button",
      level: "core",
    }),
    "core/button",
  );
  assert.equal(
    referenceForEntry({
      id: "chart",
      level: "collection",
      collection: "analytics",
    }),
    "analytics/chart",
  );
  assert.equal(
    referenceForEntry({
      id: "pipeline",
      level: "local",
      ownerArtifact: "governance",
    }),
    "local/pipeline",
  );
});

test("applying appearance does not mutate the original manifest", () => {
  const artifact = {
    manifest: {
      appearance: {
        theme: "old",
        preset: "old",
        overrides: {},
      },
    },
  };
  const next = applyAppearanceInput(artifact, {
    theme: "core/hsbc-light",
    preset: "core/default",
    overrides: {},
  });

  assert.equal(artifact.manifest.appearance.theme, "old");
  assert.equal(next.manifest.appearance.theme, "core/hsbc-light");
  assert.notEqual(next.manifest, artifact.manifest);
});


test("appearance options canonicalise current references for select controls", () => {
  const artifact = {
    id: "example",
    category: "artifact",
    kind: "dashboard",
    manifest: {
      appearance: {
        theme: "hsbc-light",
        preset: "default",
        overrides: {
          components: {
            summary: "metric-card",
          },
        },
      },
    },
  };
  const scan = {
    entries: [
      artifact,
      {
        id: "hsbc-light",
        kind: "theme",
        category: "workspace",
        level: "core",
        manifest: {
          name: "HSBC Light",
          assets: {},
        },
      },
      {
        id: "default",
        kind: "preset",
        category: "workspace",
        level: "core",
        manifest: {
          name: "Default",
          mappings: {},
        },
      },
      {
        id: "metric-card",
        kind: "component",
        category: "workspace",
        level: "core",
        manifest: {
          name: "Metric Card",
          slot: "summary",
        },
      },
      {
        id: "metric-card",
        kind: "component",
        category: "workspace",
        level: "local",
        ownerArtifact: "example",
        manifest: {
          name: "Local Metric Card",
          slot: "summary",
        },
      },
    ],
  };
  const result = buildAppearanceOptions(scan, artifact);

  assert.equal(result.current.theme, "core/hsbc-light");
  assert.equal(result.current.preset, "core/default");
  assert.equal(
    result.current.overrides.components.summary,
    "local/metric-card",
  );
  assert.deepEqual(
    result.options.components.summary.map((item) => item.reference),
    ["local/metric-card", "core/metric-card"],
  );
});
