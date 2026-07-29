import { loadDataset, type DatasetWarning } from "./load.js";

export interface ProfileColumnOptions {
  topValues?: number;
}

export interface ProfileTopValue {
  value: unknown;
  count: number;
}

export interface ProfileColumn {
  name: string;
  type: string;
  nullCount: number;
  nonNullCount: number;
  uniqueCount: number;
  uniqueRatio: number;
  possibleIdentifier: boolean;
  minimum: number | null;
  maximum: number | null;
  mean: number | null;
  earliest: string | null;
  latest: string | null;
  topValues: ProfileTopValue[];
}

export interface ProfileDatasetOptions extends ProfileColumnOptions {
  maxRows?: number;
}

export interface ProfileDatasetResult {
  source: string;
  displayPath: string;
  format: string;
  rowCount: number;
  analysedRows: number;
  sampled: boolean;
  columnCount: number;
  duplicateRowCount: number;
  columns: ProfileColumn[];
  warnings: DatasetWarning[];
}

export async function profileDataset(
  path: string,
  options: ProfileDatasetOptions = {},
): Promise<ProfileDatasetResult> {
  const dataset = await loadDataset(path, {
    ...options,
    maxRows: options.maxRows ?? 10000,
  });
  const columns = dataset.columns.map((name) =>
    profileColumn(name, dataset.records, options),
  );
  const warnings = [...dataset.warnings];

  for (const column of columns) {
    if (column.type === "mixed") {
      warnings.push({
        code: "MIXED_COLUMN_TYPE",
        message: `Column ${column.name} contains mixed value types.`,
      });
    }
  }

  return {
    source: dataset.source,
    displayPath: dataset.displayPath,
    format: dataset.format,
    rowCount: dataset.rowCount,
    analysedRows: dataset.records.length,
    sampled: dataset.sampled,
    columnCount: columns.length,
    duplicateRowCount: countDuplicateRows(dataset.records),
    columns,
    warnings,
  };
}

function profileColumn(
  name: string,
  records: readonly Record<string, unknown>[],
  options: ProfileColumnOptions,
): ProfileColumn {
  const values = records.map((record) => record[name]);
  const nonNull = values.filter((value) => !isNullLike(value));
  const classifications = nonNull.map(classifyValue);
  const distinctTypes = [...new Set(classifications)];
  const type =
    nonNull.length === 0
      ? "empty"
      : distinctTypes.length === 1
        ? (distinctTypes[0] as string)
        : mergeCompatibleTypes(distinctTypes);
  const frequencies = new Map<string, number>();

  for (const value of nonNull) {
    const key = stableValue(value);
    frequencies.set(key, (frequencies.get(key) ?? 0) + 1);
  }

  const topValues: ProfileTopValue[] = [...frequencies.entries()]
    .sort(
      (left, right) =>
        right[1] - left[1] || left[0].localeCompare(right[0], "en"),
    )
    .slice(0, options.topValues ?? 5)
    .map(([value, count]) => ({
      value: parseStableValue(value),
      count,
    }));

  const numeric = nonNull
    .map(toFiniteNumber)
    .filter((value): value is number => value !== null);
  const dates = nonNull
    .map(toDateTimestamp)
    .filter((value): value is number => value !== null);

  return {
    name,
    type,
    nullCount: values.length - nonNull.length,
    nonNullCount: nonNull.length,
    uniqueCount: frequencies.size,
    uniqueRatio:
      nonNull.length === 0
        ? 0
        : Math.round((frequencies.size / nonNull.length) * 10000) / 10000,
    possibleIdentifier:
      nonNull.length > 0 &&
      frequencies.size === nonNull.length &&
      values.length === nonNull.length,
    minimum:
      numeric.length === nonNull.length && numeric.length > 0
        ? Math.min(...numeric)
        : null,
    maximum:
      numeric.length === nonNull.length && numeric.length > 0
        ? Math.max(...numeric)
        : null,
    mean:
      numeric.length === nonNull.length && numeric.length > 0
        ? round(numeric.reduce((sum, value) => sum + value, 0) / numeric.length)
        : null,
    earliest:
      dates.length === nonNull.length && dates.length > 0
        ? new Date(Math.min(...dates)).toISOString()
        : null,
    latest:
      dates.length === nonNull.length && dates.length > 0
        ? new Date(Math.max(...dates)).toISOString()
        : null,
    topValues,
  };
}

function classifyValue(value: unknown): string {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "number";
  }
  if (value instanceof Date) return "date";

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (/^(true|false)$/i.test(trimmed)) return "boolean";
    if (/^[+-]?\d+$/.test(trimmed)) return "integer";
    if (
      /^[+-]?(?:\d+\.\d*|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)
    ) {
      return "number";
    }
    if (looksLikeDate(trimmed)) return "date";
    return "string";
  }

  if (Array.isArray(value)) return "array";
  if (value !== null && typeof value === "object") return "object";
  return typeof value;
}

function mergeCompatibleTypes(types: readonly string[]): string {
  const set = new Set(types);

  if (
    [...set].every((value) => value === "integer" || value === "number")
  ) {
    return "number";
  }

  return "mixed";
}

function looksLikeDate(value: string): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/.test(value) &&
    !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)
  ) {
    return false;
  }

  return !Number.isNaN(Date.parse(value));
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (
    typeof value === "string" &&
    /^[+-]?(?:\d+|\d+\.\d*|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(
      value.trim(),
    )
  ) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toDateTimestamp(value: unknown): number | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getTime();
  }

  if (typeof value === "string" && looksLikeDate(value.trim())) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function countDuplicateRows(
  records: readonly Record<string, unknown>[],
): number {
  const seen = new Set<string>();
  let duplicates = 0;

  for (const record of records) {
    const key = stableValue(record);
    if (seen.has(key)) {
      duplicates += 1;
    } else {
      seen.add(key);
    }
  }

  return duplicates;
}

function isNullLike(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

function stableValue(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function parseStableValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortValue((value as Record<string, unknown>)[key])]),
    );
  }

  return value;
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}