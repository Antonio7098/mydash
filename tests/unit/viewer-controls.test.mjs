import assert from "node:assert/strict";
import test from "node:test";
import {
  dependencyGroups,
  exportReadiness,
  exportResourceRows,
  formatBytes,
  selectedAppearance,
  shortHash,
  viewerShortcutAction,
} from "../../app/viewer-model.js";

test("viewer shortcuts ignore modified and editable key events", () => {
  assert.equal(
    viewerShortcutAction({
      key: "r",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      defaultPrevented: false,
      target: {
        tagName: "DIV",
        isContentEditable: false,
      },
    }),
    "reload",
  );

  assert.equal(
    viewerShortcutAction({
      key: "f",
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      defaultPrevented: false,
      target: {
        tagName: "DIV",
        isContentEditable: false,
      },
    }),
    null,
  );

  assert.equal(
    viewerShortcutAction({
      key: "i",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      defaultPrevented: false,
      target: {
        tagName: "INPUT",
        isContentEditable: false,
      },
    }),
    null,
  );
});

test("byte and hash formatting is stable for en-GB", () => {
  assert.equal(
    formatBytes(512),
    "512 B",
  );
  assert.equal(
    formatBytes(12_345),
    "12.1 KB",
  );
  assert.equal(
    formatBytes(2_621_440),
    "2.5 MB",
  );
  assert.equal(
    shortHash(
      "0123456789abcdef",
      8,
    ),
    "01234567",
  );
});

test("selected appearance reads resolved entries", () => {
  assert.deepEqual(
    selectedAppearance({
      selections: {
        theme: {
          entry: {
            id: "hsbc-light",
          },
        },
        preset: {
          entry: {
            id: "default",
          },
        },
        layout: {
          entry: {
            id: "dashboard-shell",
          },
        },
      },
    }),
    {
      theme: "hsbc-light",
      preset: "default",
      layout: "dashboard-shell",
    },
  );
});

test("dependencies group in semantic order", () => {
  const groups =
    dependencyGroups({
      dependencyClosure: [
        {
          kind: "component",
          id: "metric-card",
        },
        {
          kind: "theme",
          id: "hsbc-light",
        },
        {
          kind: "primitive",
          id: "button",
        },
        {
          kind: "component",
          id: "section-heading",
        },
      ],
    });

  assert.deepEqual(
    groups.map(
      (group) => [
        group.kind,
        group.entries.map(
          (entry) => entry.id,
        ),
      ],
    ),
    [
      ["theme", ["hsbc-light"]],
      ["primitive", ["button"]],
      [
        "component",
        [
          "metric-card",
          "section-heading",
        ],
      ],
    ],
  );
});

test("export status summaries expose readiness and resources", () => {
  assert.deepEqual(
    exportReadiness({
      export: {
        ready: true,
        sizeBytes: 65_536,
      },
    }),
    {
      mode: "ready",
      label:
        "Export ready · 64 KB",
    },
  );

  assert.deepEqual(
    exportResourceRows({
      uiResources: 6,
      scripts: 2,
      stylesheets: 3,
      dataFiles: 1,
    }),
    [
      ["Stylesheets", "3"],
      ["Scripts", "2"],
      ["Data files", "1"],
      ["UI resources", "6"],
    ],
  );
});
