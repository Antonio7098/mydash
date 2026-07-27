import assert from "node:assert/strict";
import test from "node:test";
import {
  viewerShortcutAction,
} from "../../app/viewer-model.js";
import {
  appearanceEqual,
  clearPersonalAppearance,
  normaliseBrowserAppearance,
  personalAppearanceKey,
  readPersonalAppearance,
  withAppearanceQuery,
  writePersonalAppearance,
} from "../../app/appearance-model.js";

function storage() {
  const values = new Map();

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

const artifact = {
  kind: "dashboard",
  id: "governance",
};
const appearance = {
  theme: "core/hsbc-light",
  preset: "core/default",
  overrides: {
    components: {
      summary: "core/metric-card",
    },
  },
};

test("preview appearance is encoded as one JSON query parameter", () => {
  const path = withAppearanceQuery(
    "/api/artifacts/dashboard/governance/preview",
    appearance,
  );
  const query = new URL(path, "http://localhost").searchParams.get(
    "appearance",
  );

  assert.deepEqual(
    JSON.parse(query),
    normaliseBrowserAppearance(appearance),
  );
});

test("personal appearance is scoped to one artefact", () => {
  const local = storage();
  const saved = writePersonalAppearance(local, artifact, appearance);

  assert.match(personalAppearanceKey(artifact), /dashboard:governance$/);
  assert.deepEqual(readPersonalAppearance(local, artifact), saved);

  clearPersonalAppearance(local, artifact);
  assert.equal(readPersonalAppearance(local, artifact), null);
});

test("missing empty override maps compare equally", () => {
  assert.equal(
    appearanceEqual(
      {
        theme: null,
        preset: null,
        overrides: {},
      },
      {
        theme: null,
        preset: null,
        overrides: {
          components: {},
          primitives: {},
          assets: {},
        },
      },
    ),
    true,
  );
});


test("A opens the appearance controls outside editable fields", () => {
  assert.equal(
    viewerShortcutAction({
      key: "A",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      defaultPrevented: false,
      target: {
        tagName: "DIV",
        isContentEditable: false,
      },
    }),
    "appearance",
  );
});
