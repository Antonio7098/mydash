import { readFile, stat } from "node:fs/promises";
import { extname, relative } from "node:path";
import { csvToRecords } from "./csv.mjs";

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const SUPPORTED_FORMATS = new Set(["csv", "json", "ndjson"]);

export async function loadDataset(path, options = {}) {
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

export function detectFormat(path) {
  const extension = extname(path).toLowerCase();

  if (extension === ".csv") return "csv";
  if (extension === ".json") return "json";
  if (extension === ".ndjson" || extension === ".jsonl") return "ndjson";

  throw new Error(
    `Unsupported data format ${extension || "(none)"}. Use CSV, JSON or NDJSON.`,
  );
}

function parseByFormat(source, format) {
  if (!SUPPORTED_FORMATS.has(format)) {
    throw new Error(`Unsupported data format: ${format}`);
  }

  if (format === "csv") {
    const parsed = csvToRecords(stripByteOrderMark(source));
    return {
      records: parsed.records,
      shape: "records",
      warnings: [],
    };
  }

  if (format === "ndjson") {
    const records = [];
    const warnings = [];

    for (const [index, line] of source.split(/\r?\n/).entries()) {
      if (!line.trim()) continue;

      try {
        records.push(JSON.parse(line));
      } catch (error) {
        throw new Error(
          `Invalid NDJSON on line ${index + 1}: ${error.message}`,
        );
      }
    }

    return {
      records,
      shape: "records",
      warnings,
    };
  }

  let value;
  try {
    value = JSON.parse(stripByteOrderMark(source));
  } catch (error) {
    throw new Error(`Invalid JSON: ${error.message}`);
  }

  if (Array.isArray(value)) {
    if (value.every(isPlainObject)) {
      return {
        records: value,
        shape: "records",
        warnings: [],
      };
    }

    if (value.every(Array.isArray)) {
      return {
        records: matrixToRecords(value),
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
      records: value.map((item, index) => ({
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
          message:
            "A single JSON object was treated as one record.",
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

function normaliseRecords(records) {
  return records.map((record, index) => {
    if (isPlainObject(record)) return record;

    return {
      index,
      value: record,
    };
  });
}

function matrixToRecords(matrix) {
  if (matrix.length === 0) return [];
  const headers = uniqueHeaders(matrix[0]);

  return matrix.slice(1).map((row) =>
    Object.fromEntries(
      headers.map((header, index) => [header, row[index] ?? null]),
    ),
  );
}

function uniqueHeaders(row) {
  const counts = new Map();

  return row.map((value, index) => {
    const base = String(value ?? "").trim() || `column-${index + 1}`;
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  });
}

function collectColumns(records) {
  const columns = [];
  const seen = new Set();

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

function stripByteOrderMark(value) {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function displayPath(path, workspaceRoot) {
  if (!workspaceRoot) return path;

  const value = relative(workspaceRoot, path).replaceAll("\\", "/");
  return value.startsWith("..") ? path : value || ".";
}
