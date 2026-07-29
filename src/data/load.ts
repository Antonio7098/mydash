import { readFile, stat } from "node:fs/promises";
import { extname, relative } from "node:path";
import { csvToRecords } from "./csv.js";

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const SUPPORTED_FORMATS = new Set(["csv", "json", "ndjson"]);

export type DataFormat = "csv" | "json" | "ndjson";

export interface LoadDatasetOptions {
  maxBytes?: number;
  maxRows?: number;
  format?: DataFormat;
  workspaceRoot?: string;
}

export interface DatasetWarning {
  code: string;
  message: string;
}

export interface Dataset {
  source: string;
  displayPath: string;
  format: DataFormat;
  shape: "records" | "matrix" | "values" | "object" | "scalar";
  records: Record<string, unknown>[];
  rowCount: number;
  sampled: boolean;
  columns: string[];
  sizeBytes: number;
  warnings: DatasetWarning[];
}

export async function loadDataset(
  path: string,
  options: LoadDatasetOptions = {},
): Promise<Dataset> {
  const metadata = await stat(path);

  if (!metadata.isFile()) {
    throw new Error(`Data source is not a file: ${path}`);
  }

  if (metadata.size > (options.maxBytes ?? MAX_FILE_BYTES)) {
    throw new Error(
      `Data source exceeds the ${options.maxBytes ?? MAX_FILE_BYTES} byte safety limit.`,
    );
  }

  const format = options.format ?? detectFormat(path);
  const source = await readFile(path, "utf8");
  const parsed = parseByFormat(source, format);
  const records = normaliseRecords(parsed.records);
  const maxRows = options.maxRows ?? Number.MAX_SAFE_INTEGER;
  const limited = records.slice(0, maxRows);

  return {
    source: path,
    displayPath: displayPath(path, options.workspaceRoot),
    format,
    shape: parsed.shape,
    records: limited,
    rowCount: records.length,
    sampled: limited.length < records.length,
    columns: collectColumns(limited),
    sizeBytes: metadata.size,
    warnings: parsed.warnings,
  };
}

export function detectFormat(path: string): DataFormat {
  const extension = extname(path).toLowerCase();

  if (extension === ".csv") return "csv";
  if (extension === ".json") return "json";
  if (extension === ".ndjson" || extension === ".jsonl") return "ndjson";

  throw new Error(
    `Unsupported data format ${extension || "(none)"}. Use CSV, JSON or NDJSON.`,
  );
}

function parseByFormat(
  source: string,
  format: DataFormat,
): {
  records: Record<string, unknown>[];
  shape: Dataset["shape"];
  warnings: DatasetWarning[];
} {
  if (!SUPPORTED_FORMATS.has(format)) {
    throw new Error(`Unsupported data format: ${format}`);
  }

  if (format === "csv") {
    const parsed = csvToRecords(stripByteOrderMark(source));
    return {
      records: parsed.records as Record<string, unknown>[],
      shape: "records",
      warnings: [],
    };
  }

  if (format === "ndjson") {
    const records: Record<string, unknown>[] = [];
    const warnings: DatasetWarning[] = [];

    for (const [index, line] of source.split(/\r?\n/).entries()) {
      if (!line.trim()) continue;

      try {
        const value = JSON.parse(line) as unknown;
        records.push(
          value !== null && typeof value === "object" && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : { value },
        );
      } catch (error) {
        throw new Error(
          `Invalid NDJSON on line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return {
      records,
      shape: "records",
      warnings,
    };
  }

  let value: unknown;
  try {
    value = JSON.parse(stripByteOrderMark(source));
  } catch (error) {
    throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (Array.isArray(value)) {
    if (value.every(isPlainObject)) {
      return {
        records: value as Record<string, unknown>[],
        shape: "records",
        warnings: [],
      };
    }

    if (value.every(Array.isArray)) {
      return {
        records: matrixToRecords(value as unknown[][]),
        shape: "matrix",
        warnings: [
          {
            code: "JSON_MATRIX_NORMALISED",
            message:
              "The JSON array-of-arrays was normalised using its first row as column names.",
          },
        ],
      };
    }

    return {
      records: (value as unknown[]).map((item, index) => ({
        index,
        value: item,
      })),
      shape: "values",
      warnings: [
        {
          code: "JSON_VALUES_NORMALISED",
          message:
            "The JSON array contained scalar or mixed values and was normalised into index/value records.",
        },
      ],
    };
  }

  if (isPlainObject(value)) {
    return {
      records: [value],
      shape: "object",
      warnings: [
        {
          code: "JSON_OBJECT_NORMALISED",
          message: "A single JSON object was treated as one record.",
        },
      ],
    };
  }

  return {
    records: [{ value }],
    shape: "scalar",
    warnings: [
      {
        code: "JSON_SCALAR_NORMALISED",
        message: "A scalar JSON value was treated as one record.",
      },
    ],
  };
}

function normaliseRecords(
  records: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  return records.map((record, index) => {
    if (isPlainObject(record)) return record;
    return {
      index,
      value: record,
    };
  });
}

function matrixToRecords(matrix: unknown[][]): Record<string, unknown>[] {
  if (matrix.length === 0) return [];
  const headers = uniqueHeaders((matrix[0] ?? []) as unknown[]);

  return matrix.slice(1).map((row) => {
    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      record[header] = (row as unknown[])[index] ?? null;
    });
    return record;
  });
}

function uniqueHeaders(row: readonly unknown[]): string[] {
  const counts = new Map<string, number>();

  return row.map((value, index) => {
    const base = String(value ?? "").trim() || `column-${index + 1}`;
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  });
}

function collectColumns(records: readonly Record<string, unknown>[]): string[] {
  const columns: string[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }

  return columns;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function displayPath(path: string, workspaceRoot?: string): string {
  if (!workspaceRoot) return path;
  const value = relative(workspaceRoot, path).replaceAll("\\", "/");
  return value.startsWith("..") ? path : value || ".";
}

function stripByteOrderMark(source: string): string {
  return source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
}