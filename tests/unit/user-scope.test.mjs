import assert from "node:assert/strict";
import test from "node:test";
import {
  artifactBelongsToUser,
  artifactsForUser,
  availableUsers,
  entriesForUser,
  scopedLibraryView,
} from "../../src/users/scope.mjs";
import {
  validateDocument,
} from "../../src/validation/contracts.mjs";

const entries = [
  artifact("alpha", "antonio"),
  artifact("beta", "bob"),
  {
    id: "metric-card",
    kind: "component",
    category: "ui",
    manifestPath: "/component.json",
  },
];

test("artifact scope filters artifacts but keeps components global", () => {
  assert.equal(
    artifactBelongsToUser(entries[0], "antonio"),
    true,
  );
  assert.deepEqual(
    artifactsForUser(entries, "antonio").map((entry) => entry.id),
    ["alpha"],
  );
  assert.deepEqual(
    entriesForUser(entries, "antonio").map((entry) => entry.id),
    ["alpha", "metric-card"],
  );
});

test("available users include the configured user without artifacts", () => {
  assert.deepEqual(
    availableUsers(entries, "charlie"),
    ["antonio", "bob", "charlie"],
  );
});

test("scoped library views retain global resource diagnostics", () => {
  const scan = {
    config: { user: "antonio" },
    entries,
    issues: [
      {
        severity: "warning",
        code: "SHARED",
        manifestPath: "/component.json",
      },
      {
        severity: "error",
        code: "BOB_ONLY",
        manifestPath: "/beta.json",
      },
    ],
    summary: {},
  };
  const view = scopedLibraryView(scan);

  assert.deepEqual(
    view.entries.map((entry) => entry.id),
    ["alpha", "metric-card"],
  );
  assert.deepEqual(
    view.issues.map((issue) => issue.code),
    ["SHARED"],
  );
});

test("workspace and artifact contracts require users", () => {
  const workspace = validateDocument("workspace", {
    schemaVersion: 2,
    id: "workspace",
    name: "Workspace",
    libraryRoots: {},
    defaults: {},
    preview: {},
    export: {},
  });
  const artifactResult = validateDocument("artifact", {
    schemaVersion: 2,
    kind: "dashboard",
    id: "dashboard",
    title: "Dashboard",
    entry: "src/index.html",
    appearance: {
      theme: null,
      preset: null,
      overrides: {},
    },
  });

  assert.equal(
    workspace.errors.some((error) => error.path === "$.user"),
    true,
  );
  assert.equal(
    artifactResult.errors.some((error) => error.path === "$.user"),
    true,
  );
});

function artifact(id, user) {
  return {
    id,
    user,
    kind: "dashboard",
    category: "artifact",
    manifestPath: `/${id}.json`,
  };
}
