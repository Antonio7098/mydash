const PREFIX = "mydash.appearance.personal.v1";
const REF = /^[a-z0-9]+(?:[/-][a-z0-9]+)*$/;

export function normaliseBrowserAppearance(value) {
  const overrides = value?.overrides ?? {};

  return {
    theme: ref(value?.theme),
    preset: ref(value?.preset),
    overrides: {
      layout: ref(overrides.layout),
      components: map(overrides.components),
      primitives: map(overrides.primitives),
      assets: map(overrides.assets),
    },
  };
}

export function withAppearanceQuery(path, appearance) {
  const url = new URL(path, "http://mydash.local");
  url.searchParams.set(
    "appearance",
    JSON.stringify(normaliseBrowserAppearance(appearance)),
  );
  return `${url.pathname}${url.search}`;
}

export function personalAppearanceKey(artifact) {
  return `${PREFIX}:${artifact.user ?? "global"}:${artifact.kind}:${artifact.id}`;
}

export function readPersonalAppearance(storage, artifact) {
  const source = storage.getItem(personalAppearanceKey(artifact));
  if (!source) return null;

  try {
    return normaliseBrowserAppearance(JSON.parse(source));
  } catch {
    storage.removeItem(personalAppearanceKey(artifact));
    return null;
  }
}

export function writePersonalAppearance(storage, artifact, appearance) {
  const value = normaliseBrowserAppearance(appearance);
  storage.setItem(personalAppearanceKey(artifact), JSON.stringify(value));
  return value;
}

export function clearPersonalAppearance(storage, artifact) {
  storage.removeItem(personalAppearanceKey(artifact));
}

export function appearanceEqual(left, right) {
  return (
    JSON.stringify(normaliseBrowserAppearance(left)) ===
    JSON.stringify(normaliseBrowserAppearance(right))
  );
}

export function collectAppearanceFromForm(form) {
  const data = new FormData(form);
  const value = {
    theme: data.get("theme"),
    preset: data.get("preset"),
    overrides: {
      layout: data.get("layout"),
      components: {},
      primitives: {},
      assets: {},
    },
  };

  for (const [name, candidate] of data.entries()) {
    const match = String(name).match(
      /^(components|primitives|assets)\.([a-z0-9][a-z0-9-]*)$/,
    );

    if (match && candidate) {
      value.overrides[match[1]][match[2]] = candidate;
    }
  }

  return normaliseBrowserAppearance(value);
}

function ref(value) {
  if (value === undefined || value === null || value === "") return null;
  const result = String(value);

  if (!REF.test(result)) {
    throw new TypeError(`Invalid appearance reference: ${result}`);
  }

  return result;
}

function map(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([slot, candidate]) =>
          /^[a-z0-9][a-z0-9-]*$/.test(slot) && candidate,
      )
      .map(([slot, candidate]) => [slot, ref(candidate)])
      .sort(([a], [b]) => a.localeCompare(b, "en-GB")),
  );
}
