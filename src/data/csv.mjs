export function parseCsv(source, options = {}) {
  if (typeof source !== "string") {
    throw new TypeError("CSV source must be a string.");
  }

  const delimiter = options.delimiter ?? ",";
  if (delimiter.length !== 1) {
    throw new Error("CSV delimiter must be one character.");
  }

  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

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
    rows.at(-1).every((value) => value === "")
  ) {
    rows.pop();
  }

  return rows;
}

export function csvToRecords(source, options = {}) {
  const rows = parseCsv(source, options);

  if (rows.length === 0) {
    return {
      records: [],
      columns: [],
      matrix: [],
    };
  }

  const columns = uniqueHeaders(rows[0]);
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

export function recordsToCsv(records) {
  if (!Array.isArray(records) || records.length === 0) return "";

  const columns = collectColumns(records);
  const rows = [
    columns,
    ...records.map((record) =>
      columns.map((column) => record[column] ?? null),
    ),
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value) {
  if (value === null || value === undefined) return "";

  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);

  return /[",\r\n]/.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
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
