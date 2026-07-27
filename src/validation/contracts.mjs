import { readFile } from "node:fs/promises";

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REFERENCE_PATTERN = /^[a-z0-9]+(?:[/-][a-z0-9]+)*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const LIFECYCLE = new Set(["local", "collection", "core"]);
const ARTIFACT_KINDS = new Set(["dashboard", "presentation", "concept"]);
const UI_KINDS = new Set(["primitive", "component", "layout"]);
const DATA_SOURCE_TYPES = new Set(["excel", "csv", "json", "powerpoint"]);
const DATA_OUTPUT_TYPES = new Set(["csv", "json", "ndjson"]);

export async function readJson(path) {
  const source = await readFile(path, "utf8");

  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(
      `Invalid JSON in ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function validateDocument(contract, value) {
  const errors = [];
  const add = (path, message) => errors.push({ path, message });

  if (!isPlainObject(value)) {
    add("$", "must be a JSON object");
    return result(errors);
  }

  switch (contract) {
    case "workspace":
      validateWorkspace(value, add);
      break;
    case "artifact":
      validateArtifact(value, add);
      break;
    case "uiItem":
      validateUiItem(value, add);
      break;
    case "theme":
      validateTheme(value, add);
      break;
    case "preset":
      validatePreset(value, add);
      break;
    case "asset":
      validateAsset(value, add);
      break;
    case "userPreferences":
      validateUserPreferences(value, add);
      break;
    case "dataRecipe":
      validateDataRecipe(value, add);
      break;
    case "provenance":
      validateProvenance(value, add);
      break;
    default:
      add("$", `unknown contract: ${contract}`);
  }

  return result(errors);
}

function result(errors) {
  return {
    ok: errors.length === 0,
    errors
  };
}

function validateBase(value, add) {
  if (value.schemaVersion !== 1) {
    add("$.schemaVersion", "must equal 1");
  }
}

function validateWorkspace(value, add) {
  validateBase(value, add);
  requireId(value.id, "$.id", add);
  requireString(value.name, "$.name", add);

  const requiredRoots = [
    "dashboards",
    "presentations",
    "concepts",
    "primitives",
    "components",
    "layouts",
    "themes",
    "presets",
    "assets"
  ];

  if (!isPlainObject(value.libraryRoots)) {
    add("$.libraryRoots", "must be an object");
  } else {
    for (const key of requiredRoots) {
      requireRelativePath(value.libraryRoots[key], `$.libraryRoots.${key}`, add);
    }
  }

  if (!isPlainObject(value.defaults)) {
    add("$.defaults", "must be an object");
  } else {
    optionalReference(value.defaults.theme, "$.defaults.theme", add);
    optionalReference(value.defaults.preset, "$.defaults.preset", add);
  }

  if (!isPlainObject(value.preview)) {
    add("$.preview", "must be an object");
  } else {
    requireString(value.preview.host, "$.preview.host", add);
    if (
      !Number.isInteger(value.preview.port) ||
      value.preview.port < 1024 ||
      value.preview.port > 65535
    ) {
      add("$.preview.port", "must be an integer between 1024 and 65535");
    }
  }

  if (!isPlainObject(value.export)) {
    add("$.export", "must be an object");
  } else {
    requireRelativePath(
      value.export.outputDirectory,
      "$.export.outputDirectory",
      add,
    );
  }
}

function validateArtifact(value, add) {
  validateBase(value, add);

  if (!ARTIFACT_KINDS.has(value.kind)) {
    add("$.kind", "must be dashboard, presentation or concept");
  }

  requireId(value.id, "$.id", add);
  requireString(value.title, "$.title", add);
  requireRelativePath(value.entry, "$.entry", add);

  if (value.data !== undefined) {
    validateUniqueStringArray(value.data, "$.data", add, requireRelativePath);
  }

  if (value.tags !== undefined) {
    validateUniqueStringArray(value.tags, "$.tags", add, requireString);
  }

  if (!isPlainObject(value.appearance)) {
    add("$.appearance", "must be an object");
  } else {
    optionalReference(value.appearance.theme, "$.appearance.theme", add);
    optionalReference(value.appearance.preset, "$.appearance.preset", add);

    if (!isPlainObject(value.appearance.overrides)) {
      add("$.appearance.overrides", "must be an object");
    } else {
      optionalReference(
        value.appearance.overrides.layout,
        "$.appearance.overrides.layout",
        add,
      );
      validateOptionalStringMap(
        value.appearance.overrides.components,
        "$.appearance.overrides.components",
        add,
      );
      validateOptionalStringMap(
        value.appearance.overrides.primitives,
        "$.appearance.overrides.primitives",
        add,
      );
      validateOptionalStringMap(
        value.appearance.overrides.assets,
        "$.appearance.overrides.assets",
        add,
      );
    }
  }

  if (value.export !== undefined) {
    if (!isPlainObject(value.export)) {
      add("$.export", "must be an object");
    } else if (
      value.export.fileName !== undefined &&
      (!isNonEmptyString(value.export.fileName) ||
        /[/\\]/.test(value.export.fileName) ||
        !value.export.fileName.endsWith(".html"))
    ) {
      add("$.export.fileName", "must be a file name ending in .html");
    }
  }
}

function validateUiItem(value, add) {
  validateBase(value, add);

  if (!UI_KINDS.has(value.kind)) {
    add("$.kind", "must be primitive, component or layout");
  }

  requireId(value.id, "$.id", add);
  requireString(value.name, "$.name", add);
  validateLifecycle(value, add);
  requireId(value.slot, "$.slot", add);

  if (!Number.isInteger(value.contractVersion) || value.contractVersion < 1) {
    add("$.contractVersion", "must be a positive integer");
  }

  requireRelativePath(value.entry, "$.entry", add);

  if (value.preview !== undefined) {
    requireRelativePath(value.preview, "$.preview", add);
  }

  if (value.props !== undefined) {
    if (!isPlainObject(value.props)) {
      add("$.props", "must be an object");
    } else {
      for (const [name, definition] of Object.entries(value.props)) {
        if (!ID_PATTERN.test(name)) {
          add(`$.props.${name}`, "property names must use kebab case");
        }

        if (!isPlainObject(definition)) {
          add(`$.props.${name}`, "must be an object");
          continue;
        }

        requireString(definition.type, `$.props.${name}.type`, add);

        if (typeof definition.required !== "boolean") {
          add(`$.props.${name}.required`, "must be boolean");
        }
      }
    }
  }

  if (value.variants !== undefined) {
    if (!isPlainObject(value.variants)) {
      add("$.variants", "must be an object");
    } else {
      for (const [name, options] of Object.entries(value.variants)) {
        requireId(name, `$.variants.${name}`, add);
        validateUniqueStringArray(
          options,
          `$.variants.${name}`,
          add,
          requireString,
        );
      }
    }
  }

  if (value.dependencies !== undefined) {
    if (!isPlainObject(value.dependencies)) {
      add("$.dependencies", "must be an object");
    } else {
      validateOptionalStringMap(
        value.dependencies.primitives,
        "$.dependencies.primitives",
        add,
      );
      validateOptionalStringMap(
        value.dependencies.components,
        "$.dependencies.components",
        add,
      );
      validateOptionalStringMap(
        value.dependencies.assets,
        "$.dependencies.assets",
        add,
      );
    }
  }

  validateReferenceArray(
    value.supportedThemes,
    "$.supportedThemes",
    add,
    true,
  );
}

function validateTheme(value, add) {
  validateBase(value, add);

  if (value.kind !== "theme") {
    add("$.kind", "must equal theme");
  }

  requireId(value.id, "$.id", add);
  requireString(value.name, "$.name", add);
  validateLifecycle(value, add);

  if (!isPlainObject(value.tokens) || Object.keys(value.tokens).length === 0) {
    add("$.tokens", "must be a non-empty object");
  } else {
    for (const [key, token] of Object.entries(value.tokens)) {
      if (!isNonEmptyString(key)) {
        add("$.tokens", "token names must be non-empty");
      }

      if (!["string", "number", "boolean"].includes(typeof token)) {
        add(`$.tokens.${key}`, "must be string, number or boolean");
      }
    }
  }

  validateOptionalStringMap(value.assets, "$.assets", add);
}

function validatePreset(value, add) {
  validateBase(value, add);

  if (value.kind !== "preset") {
    add("$.kind", "must equal preset");
  }

  requireId(value.id, "$.id", add);
  requireString(value.name, "$.name", add);
  validateLifecycle(value, add);

  if (!isPlainObject(value.mappings)) {
    add("$.mappings", "must be an object");
  } else {
    optionalReference(value.mappings.layout, "$.mappings.layout", add);
    validateStringMap(
      value.mappings.components,
      "$.mappings.components",
      add,
      true,
    );
    validateStringMap(
      value.mappings.primitives,
      "$.mappings.primitives",
      add,
      true,
    );
    validateOptionalStringMap(
      value.mappings.assets,
      "$.mappings.assets",
      add,
    );
  }

  validateReferenceArray(
    value.supportedThemes,
    "$.supportedThemes",
    add,
    true,
  );
}

function validateAsset(value, add) {
  validateBase(value, add);

  if (value.kind !== "asset") {
    add("$.kind", "must equal asset");
  }

  requireId(value.id, "$.id", add);
  requireString(value.name, "$.name", add);
  validateLifecycle(value, add);
  requireRelativePath(value.file, "$.file", add);
  requireString(value.mediaType, "$.mediaType", add);
  requireString(value.usage, "$.usage", add);

  if (value.approved !== undefined && typeof value.approved !== "boolean") {
    add("$.approved", "must be boolean");
  }
}

function validateUserPreferences(value, add) {
  validateBase(value, add);
  requireId(value.userId, "$.userId", add);
  validateReferenceArray(value.favourites, "$.favourites", add, true);
  validateReferenceArray(value.recent, "$.recent", add, true);

  if (!isPlainObject(value.appearance)) {
    add("$.appearance", "must be an object");
  } else {
    optionalReference(value.appearance.theme, "$.appearance.theme", add);
    optionalReference(value.appearance.preset, "$.appearance.preset", add);
  }
}

function validateDataRecipe(value, add) {
  validateBase(value, add);
  requireId(value.id, "$.id", add);

  if (!isPlainObject(value.source)) {
    add("$.source", "must be an object");
  } else {
    if (!DATA_SOURCE_TYPES.has(value.source.type)) {
      add("$.source.type", "must be excel, csv, json or powerpoint");
    }

    requireRelativePath(value.source.file, "$.source.file", add);

    for (const key of ["sheet", "table", "range"]) {
      if (value.source[key] !== undefined) {
        requireString(value.source[key], `$.source.${key}`, add);
      }
    }
  }

  if (!isPlainObject(value.output)) {
    add("$.output", "must be an object");
  } else {
    requireRelativePath(value.output.file, "$.output.file", add);

    if (!DATA_OUTPUT_TYPES.has(value.output.format)) {
      add("$.output.format", "must be csv, json or ndjson");
    }

    if (
      value.output.overwrite !== undefined &&
      typeof value.output.overwrite !== "boolean"
    ) {
      add("$.output.overwrite", "must be boolean");
    }
  }
}

function validateProvenance(value, add) {
  validateBase(value, add);
  requireRelativePath(value.source, "$.source", add);

  if (!isNonEmptyString(value.sourceHash) || !SHA256_PATTERN.test(value.sourceHash)) {
    add("$.sourceHash", "must be a lower-case SHA-256 hash");
  }

  if (
    !isNonEmptyString(value.generatedAt) ||
    Number.isNaN(Date.parse(value.generatedAt))
  ) {
    add("$.generatedAt", "must be an ISO date-time");
  }

  requireString(value.command, "$.command", add);
  requireString(value.toolVersion, "$.toolVersion", add);
}

function validateLifecycle(value, add) {
  if (!LIFECYCLE.has(value.level)) {
    add("$.level", "must be local, collection or core");
    return;
  }

  if (value.level === "local") {
    requireReference(value.ownerArtifact, "$.ownerArtifact", add);

    if (value.collection !== undefined && value.collection !== null) {
      add("$.collection", "must not be set for a local item");
    }
  }

  if (value.level === "collection") {
    requireReference(value.collection, "$.collection", add);

    if (value.ownerArtifact !== undefined && value.ownerArtifact !== null) {
      add("$.ownerArtifact", "must not be set for a collection item");
    }
  }

  if (value.level === "core") {
    if (value.collection !== undefined && value.collection !== null) {
      add("$.collection", "must not be set for a Core item");
    }

    if (value.ownerArtifact !== undefined && value.ownerArtifact !== null) {
      add("$.ownerArtifact", "must not be set for a Core item");
    }
  }
}

function validateReferenceArray(value, path, add, required) {
  if (value === undefined && !required) return;

  if (!Array.isArray(value)) {
    add(path, "must be an array");
    return;
  }

  const seen = new Set();

  for (let index = 0; index < value.length; index += 1) {
    const itemPath = `${path}[${index}]`;
    requireReference(value[index], itemPath, add);

    if (seen.has(value[index])) {
      add(itemPath, "must not duplicate another entry");
    }

    seen.add(value[index]);
  }
}

function validateUniqueStringArray(value, path, add, validator) {
  if (!Array.isArray(value)) {
    add(path, "must be an array");
    return;
  }

  const seen = new Set();

  for (let index = 0; index < value.length; index += 1) {
    const itemPath = `${path}[${index}]`;
    validator(value[index], itemPath, add);

    if (seen.has(value[index])) {
      add(itemPath, "must not duplicate another entry");
    }

    seen.add(value[index]);
  }
}

function validateOptionalStringMap(value, path, add) {
  if (value === undefined) return;
  validateStringMap(value, path, add, false);
}

function validateStringMap(value, path, add, required) {
  if (value === undefined && !required) return;

  if (!isPlainObject(value)) {
    add(path, "must be an object");
    return;
  }

  for (const [key, reference] of Object.entries(value)) {
    requireId(key, `${path}.${key}`, add);
    requireReference(reference, `${path}.${key}`, add);
  }
}

function optionalReference(value, path, add) {
  if (value === undefined || value === null) return;
  requireReference(value, path, add);
}

function requireReference(value, path, add) {
  if (!isNonEmptyString(value) || !REFERENCE_PATTERN.test(value)) {
    add(path, "must be a safe lower-case reference");
  }
}

function requireId(value, path, add) {
  if (!isNonEmptyString(value) || !ID_PATTERN.test(value)) {
    add(path, "must use lower-case kebab case");
  }
}

function requireRelativePath(value, path, add) {
  if (!isNonEmptyString(value)) {
    add(path, "must be a non-empty relative path");
    return;
  }

  const normalised = value.replaceAll("\\", "/");

  if (
    normalised.startsWith("/") ||
    /^[A-Za-z]:/.test(normalised) ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(normalised) ||
    normalised.split("/").includes("..")
  ) {
    add(path, "must be a safe workspace-relative path");
  }
}

function requireString(value, path, add) {
  if (!isNonEmptyString(value)) {
    add(path, "must be a non-empty string");
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}
