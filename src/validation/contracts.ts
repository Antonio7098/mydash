import { readFile } from "node:fs/promises";

export type ContractName =
  | "workspace"
  | "artifact"
  | "uiItem"
  | "theme"
  | "preset"
  | "asset"
  | "userPreferences"
  | "dataRecipe"
  | "provenance";

export interface ContractIssue {
  path: string;
  message: string;
}

export interface ContractValidationResult {
  ok: boolean;
  errors: ContractIssue[];
}

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REFERENCE_PATTERN = /^[a-z0-9]+(?:[/-][a-z0-9]+)*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const LIFECYCLE = new Set(["local", "collection", "core"]);
const ARTIFACT_KINDS = new Set(["dashboard", "presentation", "concept"]);
const UI_KINDS = new Set(["primitive", "component", "layout"]);
const DATA_SOURCE_TYPES = new Set(["excel", "csv", "json", "powerpoint"]);
const DATA_OUTPUT_TYPES = new Set(["csv", "json", "ndjson"]);

export async function readJson(path: string): Promise<unknown> {
  const source = await readFile(path, "utf8");
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(
      `Invalid JSON in ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function validateDocument(
  contract: ContractName,
  value: unknown,
): ContractValidationResult {
  const errors: ContractIssue[] = [];
  const add: ContractIssueAdder = (path, message) => errors.push({ path, message });

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
      add("$", `unknown contract: ${String(contract)}`);
  }

  return result(errors);
}

type ContractIssueAdder = (path: string, message: string) => void;

function result(errors: ContractIssue[]): ContractValidationResult {
  return {
    ok: errors.length === 0,
    errors,
  };
}

function validateBase(
  value: Record<string, unknown>,
  add: ContractIssueAdder,
  expectedVersion = 1,
): void {
  if (value.schemaVersion !== expectedVersion) {
    add("$.schemaVersion", `must equal ${expectedVersion}`);
  }
}

function validateWorkspace(
  value: Record<string, unknown>,
  add: ContractIssueAdder,
): void {
  validateBase(value, add, 2);
  requireId(value.id, "$.id", add);
  requireString(value.name, "$.name", add);
  requireId(value.user, "$.user", add);

  const requiredRoots = [
    "dashboards",
    "presentations",
    "concepts",
    "primitives",
    "components",
    "layouts",
    "themes",
    "presets",
    "assets",
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
      (value.preview.port as number) < 1024 ||
      (value.preview.port as number) > 65535
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

function validateArtifact(
  value: Record<string, unknown>,
  add: ContractIssueAdder,
): void {
  validateBase(value, add, 2);

  if (!ARTIFACT_KINDS.has(value.kind as string)) {
    add("$.kind", "must be dashboard, presentation or concept");
  }

  requireId(value.id, "$.id", add);
  requireString(value.title, "$.title", add);
  requireId(value.user, "$.user", add);
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

function validateUiItem(
  value: Record<string, unknown>,
  add: ContractIssueAdder,
): void {
  validateBase(value, add);

  if (!UI_KINDS.has(value.kind as string)) {
    add("$.kind", "must be primitive, component or layout");
  }

  requireId(value.id, "$.id", add);
  requireString(value.name, "$.name", add);
  validateLifecycle(value, add);
  requireId(value.slot, "$.slot", add);

  if (!Number.isInteger(value.contractVersion) || (value.contractVersion as number) < 1) {
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

function validateTheme(
  value: Record<string, unknown>,
  add: ContractIssueAdder,
): void {
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

function validatePreset(
  value: Record<string, unknown>,
  add: ContractIssueAdder,
): void {
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

function validateAsset(
  value: Record<string, unknown>,
  add: ContractIssueAdder,
): void {
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

function validateUserPreferences(
  value: Record<string, unknown>,
  add: ContractIssueAdder,
): void {
  validateBase(value, add);
  requireId(value.user, "$.user", add);
  validateReferenceArray(value.favourites, "$.favourites", add, true);
  validateReferenceArray(value.recent, "$.recent", add, true);

  if (!isPlainObject(value.appearance)) {
    add("$.appearance", "must be an object");
  } else {
    optionalReference(value.appearance.theme, "$.appearance.theme", add);
    optionalReference(value.appearance.preset, "$.appearance.preset", add);
  }
}

function validateDataRecipe(
  value: Record<string, unknown>,
  add: ContractIssueAdder,
): void {
  validateBase(value, add);
  requireId(value.id, "$.id", add);

  if (!isPlainObject(value.source)) {
    add("$.source", "must be an object");
  } else {
    if (!DATA_SOURCE_TYPES.has(value.source.type as string)) {
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

    if (!DATA_OUTPUT_TYPES.has(value.output.format as string)) {
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

function validateProvenance(
  value: Record<string, unknown>,
  add: ContractIssueAdder,
): void {
  if (![1, 2].includes(value.schemaVersion as number)) {
    add("$.schemaVersion", "must equal 1 or 2");
  }
  requireRelativePath(value.source, "$.source", add);

  if (!isNonEmptyString(value.sourceHash) || !SHA256_PATTERN.test(value.sourceHash as string)) {
    add("$.sourceHash", "must be a lower-case SHA-256 hash");
  }

  if (
    !isNonEmptyString(value.generatedAt) ||
    Number.isNaN(Date.parse(value.generatedAt as string))
  ) {
    add("$.generatedAt", "must be an ISO date-time");
  }

  requireString(value.command, "$.command", add);
  requireString(value.toolVersion, "$.toolVersion", add);

  if (value.schemaVersion === 2) {
    requireId(value.sourceId, "$.sourceId", add);
    requireRelativePath(value.recipe, "$.recipe", add);
    requireRelativePath(value.output, "$.output", add);
    for (const [field, path] of [
      [value.recipeHash, "$.recipeHash"],
      [value.outputHash, "$.outputHash"],
    ] as const) {
      if (!isNonEmptyString(field) || !SHA256_PATTERN.test(field as string)) {
        add(path, "must be a lower-case SHA-256 hash");
      }
    }
    if (!Number.isInteger(value.rowCount) || (value.rowCount as number) < 0) {
      add("$.rowCount", "must be a non-negative integer");
    }
    requireString(value.acquisitionMode, "$.acquisitionMode", add);
    requireString(value.originalFilename, "$.originalFilename", add);
  }
}

function validateLifecycle(
  value: Record<string, unknown>,
  add: ContractIssueAdder,
): void {
  if (!LIFECYCLE.has(value.level as string)) {
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

function validateReferenceArray(
  value: unknown,
  path: string,
  add: ContractIssueAdder,
  required: boolean,
): void {
  if (value === undefined && !required) return;

  if (!Array.isArray(value)) {
    add(path, "must be an array");
    return;
  }

  const seen = new Set<string>();

  for (let index = 0; index < value.length; index += 1) {
    const itemPath = `${path}[${index}]`;
    requireReference(value[index], itemPath, add);

    if (seen.has(value[index] as string)) {
      add(itemPath, "must not duplicate another entry");
    }

    seen.add(value[index] as string);
  }
}

function validateUniqueStringArray(
  value: unknown,
  path: string,
  add: ContractIssueAdder,
  validator: (value: unknown, path: string, add: ContractIssueAdder) => void,
): void {
  if (!Array.isArray(value)) {
    add(path, "must be an array");
    return;
  }

  const seen = new Set<string>();

  for (let index = 0; index < value.length; index += 1) {
    const itemPath = `${path}[${index}]`;
    validator(value[index], itemPath, add);

    if (seen.has(value[index] as string)) {
      add(itemPath, "must not duplicate another entry");
    }

    seen.add(value[index] as string);
  }
}

function validateOptionalStringMap(
  value: unknown,
  path: string,
  add: ContractIssueAdder,
): void {
  if (value === undefined) return;
  validateStringMap(value, path, add, false);
}

function validateStringMap(
  value: unknown,
  path: string,
  add: ContractIssueAdder,
  required: boolean,
): void {
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

function optionalReference(
  value: unknown,
  path: string,
  add: ContractIssueAdder,
): void {
  if (value === undefined || value === null) return;
  requireReference(value, path, add);
}

function requireReference(
  value: unknown,
  path: string,
  add: ContractIssueAdder,
): void {
  if (!isNonEmptyString(value) || !REFERENCE_PATTERN.test(value as string)) {
    add(path, "must be a safe lower-case reference");
  }
}

function requireId(
  value: unknown,
  path: string,
  add: ContractIssueAdder,
): void {
  if (!isNonEmptyString(value) || !ID_PATTERN.test(value as string)) {
    add(path, "must use lower-case kebab case");
  }
}

function requireRelativePath(
  value: unknown,
  path: string,
  add: ContractIssueAdder,
): void {
  if (!isNonEmptyString(value)) {
    add(path, "must be a non-empty relative path");
    return;
  }

  const normalised = (value as string).replaceAll("\\", "/");

  if (
    normalised.startsWith("/") ||
    /^[A-Za-z]:/.test(normalised) ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(normalised) ||
    normalised.split("/").includes("..")
  ) {
    add(path, "must be a safe workspace-relative path");
  }
}

function requireString(
  value: unknown,
  path: string,
  add: ContractIssueAdder,
): void {
  if (!isNonEmptyString(value)) {
    add(path, "must be a non-empty string");
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}