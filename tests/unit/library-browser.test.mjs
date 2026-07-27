import assert from "node:assert/strict";
import test from "node:test";
import {
  consumerTargetPath,
  dependencyTargetPath,
  filterLibraryEntries,
  libraryCounts,
  libraryEntryPath,
  lifecycleLabel,
  presetMappingRows,
  propRows,
  themeTokenRows,
} from "../../app/library-model.js";

const entries = [
  { id: "button", kind: "primitive", name: "Button", description: "Accessible action", reference: "core/button", level: "core", slot: "button", variants: { variant: ["primary", "quiet"] }, supportedThemes: ["hsbc-light"] },
  { id: "metric-card", kind: "component", name: "Metric Card", description: "Summary number", reference: "core/metric-card", level: "core", slot: "metric-summary", variants: {} },
  { id: "governance-pipeline", kind: "component", name: "Governance Pipeline", description: "Stage summary", reference: "local/governance-pipeline", level: "local", ownerArtifact: "ai-use-case-governance", slot: "governance-pipeline", variants: {} },
];

test("library filters search semantic metadata", () => {
  assert.deepEqual(filterLibraryEntries(entries, { query: "accessible" }).map((entry) => entry.id), ["button"]);
  assert.deepEqual(filterLibraryEntries(entries, { level: "local" }).map((entry) => entry.id), ["governance-pipeline"]);
  assert.deepEqual(filterLibraryEntries(entries, { slot: "metric-summary" }).map((entry) => entry.id), ["metric-card"]);
});

test("library sorting prefers Core before Local", () => {
  assert.deepEqual(filterLibraryEntries(entries).map((entry) => entry.id), ["metric-card", "button", "governance-pipeline"]);
});

test("library counts and paths are stable", () => {
  assert.deepEqual(libraryCounts(entries), { total: 3, byKind: { primitive: 1, component: 2 }, byLevel: { core: 2, local: 1 } });
  assert.equal(libraryEntryPath(entries[0]), "/components/primitive/button");
  assert.equal(lifecycleLabel(entries[2]), "Local · ai-use-case-governance");
});

test("consumer and dependency links distinguish artefacts from resources", () => {
  assert.equal(consumerTargetPath({ source: { category: "artifact", kind: "dashboard", id: "governance" } }), "/view/dashboard/governance");
  assert.equal(dependencyTargetPath({ resolved: true, target: { category: "resource", kind: "primitive", id: "button" } }), "/components/primitive/button");
  assert.equal(dependencyTargetPath({ resolved: false, target: null }), null);
});

test("contract helpers produce deterministic rows", () => {
  assert.deepEqual(propRows({ props: { value: { type: "string", required: true }, label: { type: "string", required: false } } }).map((row) => row.name), ["label", "value"]);
  assert.deepEqual(themeTokenRows({ tokens: { "space-1": "4px", "colour-primary": "#db0011" } }).map((row) => [row.name, row.colour]), [["colour-primary", true], ["space-1", false]]);
  assert.deepEqual(presetMappingRows({ mappings: { layout: "shell", components: { heading: "section-heading" }, primitives: {}, assets: {} } }), [
    { group: "components", slot: "heading", reference: "section-heading" },
    { group: "layout", slot: "page-layout", reference: "shell" },
  ]);
});
