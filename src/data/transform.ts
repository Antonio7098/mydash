export interface ColumnList {
  readonly columns: string[];
}

export function parseColumnList(value: unknown): string[] {
  if (typeof value !== "string") {
    throw new Error("Column list must be a comma-separated string.");
  }

  const columns = value
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean);

  if (columns.length === 0) {
    throw new Error("At least one column is required.");
  }

  return [...new Set(columns)];
}

export function selectColumns(
  records: readonly Record<string, unknown>[],
  columns: readonly string[],
): Record<string, unknown>[] {
  assertColumnsExist(records, columns);

  return records.map((record) =>
    Object.fromEntries(
      columns.map((column) => [column, record[column] ?? null]),
    ),
  );
}

export type FilterOperator =
  | "is-null"
  | "not-null"
  | "contains"
  | "starts-with"
  | "ends-with"
  | "="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<=";

export interface FilterExpression {
  column: string;
  operator: FilterOperator;
  value: string | number | boolean | null;
}

export interface FilterRecordsResult {
  expression: FilterExpression;
  records: Record<string, unknown>[];
}

export function filterRecords(
  records: readonly Record<string, unknown>[],
  expressionSource: string,
): FilterRecordsResult {
  const expression = parseFilterExpression(expressionSource);
  assertColumnsExist(records, [expression.column]);

  return {
    expression,
    records: records.filter((record) =>
      matchesExpression(record[expression.column], expression),
    ),
  };
}

export interface DeduplicateRecordsResult {
  records: Record<string, unknown>[];
  removedRows: number;
}

export function deduplicateRecords(
  records: readonly Record<string, unknown>[],
  keys: readonly string[],
): DeduplicateRecordsResult {
  assertColumnsExist(records, keys);

  const seen = new Set<string>();
  const output: Record<string, unknown>[] = [];
  let removedRows = 0;

  for (const record of records) {
    const identity = JSON.stringify(
      keys.map((key) => normaliseComparable(record[key])),
    );

    if (seen.has(identity)) {
      removedRows += 1;
      continue;
    }

    seen.add(identity);
    output.push(record);
  }

  return {
    records: output,
    removedRows,
  };
}

export function parseFilterExpression(source: unknown): FilterExpression {
  if (typeof source !== "string" || !source.trim()) {
    throw new Error("A non-empty filter expression is required.");
  }

  const value = source.trim();
  const unary = value.match(/^(.+?)\s+(is-null|not-null)$/i);

  if (unary) {
    return {
      column: (unary[1] ?? "").trim(),
      operator: ((unary[2] ?? "").toLowerCase()) as FilterOperator,
      value: null,
    };
  }

  const wordOperator = value.match(
    /^(.+?)\s+(contains|starts-with|ends-with)\s+(.+)$/i,
  );

  if (wordOperator) {
    return {
      column: (wordOperator[1] ?? "").trim(),
      operator: ((wordOperator[2] ?? "").toLowerCase()) as FilterOperator,
      value: unquote((wordOperator[3] ?? "").trim()),
    };
  }

  const symbolic = value.match(/^(.+?)\s*(>=|<=|!=|=|>|<)\s*(.+)$/);

  if (!symbolic) {
    throw new Error(
      "Invalid filter expression. Use column=value, column>=value, column contains value, column is-null or column not-null.",
    );
  }

  return {
    column: (symbolic[1] ?? "").trim(),
    operator: symbolic[2] as FilterOperator,
    value: unquote((symbolic[3] ?? "").trim()),
  };
}

function matchesExpression(actual: unknown, expression: FilterExpression): boolean {
  if (expression.operator === "is-null") return isNullLike(actual);
  if (expression.operator === "not-null") return !isNullLike(actual);

  if (
    ["contains", "starts-with", "ends-with"].includes(expression.operator)
  ) {
    const actualText = String(actual ?? "").toLowerCase();
    const expectedText = String(expression.value ?? "").toLowerCase();

    if (expression.operator === "contains") {
      return actualText.includes(expectedText);
    }
    if (expression.operator === "starts-with") {
      return actualText.startsWith(expectedText);
    }
    return actualText.endsWith(expectedText);
  }

  const comparison = compare(actual, expression.value);

  switch (expression.operator) {
    case "=":
      return comparison === 0;
    case "!=":
      return comparison !== 0;
    case ">":
      return comparison > 0;
    case ">=":
      return comparison >= 0;
    case "<":
      return comparison < 0;
    case "<=":
      return comparison <= 0;
    default:
      return false;
  }
}

function compare(left: unknown, right: unknown): number {
  const leftNumber = toNumber(left);
  const rightNumber = toNumber(right);

  if (leftNumber !== null && rightNumber !== null) {
    return Math.sign(leftNumber - rightNumber);
  }

  const leftDate = toDate(left);
  const rightDate = toDate(right);

  if (leftDate !== null && rightDate !== null) {
    return Math.sign(leftDate - rightDate);
  }

  return String(left ?? "")
    .localeCompare(String(right ?? ""), "en", {
      sensitivity: "base",
      numeric: true,
    });
}

function assertColumnsExist(
  records: readonly Record<string, unknown>[],
  columns: readonly string[],
): void {
  const available = new Set(
    records.flatMap((record) => Object.keys(record)),
  );
  const missing = columns.filter((column) => !available.has(column));

  if (missing.length > 0) {
    throw new Error(
      `Unknown columns: ${missing.join(", ")}. Available columns: ${[...available].join(", ")}`,
    );
  }
}

function toNumber(value: unknown): number | null {
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

function toDate(value: unknown): number | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getTime();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function normaliseComparable(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function isNullLike(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}