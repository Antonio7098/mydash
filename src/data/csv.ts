export type CsvDelimiter = string;

export interface ParseCsvOptions {
  delimiter?: CsvDelimiter;
}

export interface ParseCsvResult {
  records: Record<string, string>[];
  columns: string[];
  matrix: string[][];
}

export function parseCsv(
  source: string,
  options: ParseCsvOptions = {},
): string[][] {
  if (typeof source !== "string") {
    throw new TypeError("CSV source must be a string.");
  }

  const delimiter = options.delimiter ?? ",";
  if (delimiter.length !== 1) {
    throw new Error("CSV delimiter must be one character.");
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (character === undefined) continue;

    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      if (field.length !== 0) {
        throw new Error(
          `Unexpected quote in CSV field at character ${index}.`,
        );
      }
      quoted = true;
      continue;
    }

    if (character === delimiter) {
      row.push(field);
      field = "";
      continue;
    }

    if (character === "\n" || character === "\r") {
      if (character === "\r" && source[index + 1] === "\n") {
        index += 1;
      }

      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += character;
  }

  if (quoted) {
    throw new Error("CSV input ended inside a quoted field.");
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  while (
    rows.length > 0 &&
    rows.at(-1)?.every((value) => value === "")
  ) {
    rows.pop();
  }

  return rows;
}

export function csvToRecords(
  source: string,
  options: ParseCsvOptions = {},
): ParseCsvResult {
  const rows = parseCsv(source, options);

  if (rows.length === 0) {
    return {
      records: [],
      columns: [],
      matrix: [],
    };
  }

  const columns = uniqueHeaders(rows[0] ?? []);
  const records = rows.slice(1).map((row) =>
    Object.fromEntries(
      columns.map((column, index) => [column, row[index] ?? ""]),
    ),
  );

  return {
    records,
    columns,
    matrix: rows,
  };
}

export function recordsToCsv(records: readonly Record<string, unknown>[]): string {
  if (!Array.isArray(records) || records.length === 0) return "";

  const columns = collectColumns(records);
  const rows = [
    columns,
    ...records.map((record) =>
      columns.map((column) => record[column] ?? null),
    ),
  ];

  return rows.map((row) => row.map((value) => csvCell(value)).join(",")).join("\n");
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);

  return /[",\r\n]/.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

function uniqueHeaders(row: readonly string[]): string[] {
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