import ExcelJS from "exceljs";
import { extname, relative } from "node:path";
import { readOoxmlPackage } from "./ooxml.js";

const MODERN_EXCEL_EXTENSIONS = new Set([".xlsx", ".xlsm"]);

export interface WorkbookWarning {
  code: string;
  message: string;
}

export interface WorksheetTable {
  name: string;
  ref: string;
  displayName: string;
  headerRow: boolean;
  totalsRow: boolean;
}

export interface WorksheetSummary {
  id: number;
  name: string;
  state: string;
  rowCount: number;
  actualRowCount: number;
  columnCount: number;
  actualColumnCount: number;
  mergedCellCount: number;
  hiddenRowCount: number;
  hiddenColumnCount: number;
  formulaCellCount: number;
  tables: WorksheetTable[];
}

export interface WorkbookFeatures {
  tableCount: number;
  chartCount: number;
  imageCount: number;
  externalLinkCount: number;
  hasMacros: boolean;
  hasConnections: boolean;
}

export interface WorkbookInspection {
  source: string;
  displayPath: string;
  sheetCount: number;
  sheets: WorksheetSummary[];
  formulaCellCount: number;
  calculationMode: string | null;
  creator: string | null;
  modified: string | null;
  features: WorkbookFeatures;
  warnings: WorkbookWarning[];
}

export interface WorksheetBounds {
  startRow: number;
  startColumn: number;
  endRow: number;
  endColumn: number;
}

export interface WorksheetMatrixResult {
  source: string;
  displayPath: string;
  sheet: string;
  range: string;
  matrix: unknown[][];
}

export interface WorksheetExtractResult extends WorksheetMatrixResult {
  records: Record<string, unknown>[];
  header: boolean;
}

export interface WorksheetTableExtractResult extends WorksheetExtractResult {
  table: string;
}

export interface WorkbookListSheetsResult {
  source: string;
  displayPath: string;
  sheets: WorksheetSummary[];
}

export interface FormulaListing {
  source: string;
  displayPath: string;
  formulas: { sheet: string; address: string; formula: string; result: unknown }[];
  truncated: boolean;
}

export async function inspectWorkbook(
  path: string,
  options: { workspaceRoot?: string } = {},
): Promise<WorkbookInspection> {
  assertSupportedWorkbook(path);
  const [workbook, features] = await Promise.all([
    loadWorkbook(path),
    inspectWorkbookPackage(path),
  ]);

  const sheets = workbook.worksheets.map(summariseWorksheet);
  const formulaCellCount = sheets.reduce(
    (total, sheet) => total + sheet.formulaCellCount,
    0,
  );
  const warnings: WorkbookWarning[] = [];

  if (features.hasMacros) {
    warnings.push({
      code: "MACROS_PRESENT",
      message:
        "The workbook contains a VBA project. My Dashboards will never execute workbook macros.",
    });
  }

  if (features.externalLinkCount > 0) {
    warnings.push({
      code: "EXTERNAL_LINKS_PRESENT",
      message:
        "The workbook contains external links. Extracted cached values may differ from values after Excel refreshes the links.",
    });
  }

  return {
    source: path,
    displayPath: displayPath(path, options.workspaceRoot),
    sheetCount: sheets.length,
    sheets,
    formulaCellCount,
    calculationMode: (workbook.calcProperties as { calcMode?: string } | undefined)?.calcMode ?? null,
    creator: workbook.creator || null,
    modified: workbook.modified
      ? new Date(workbook.modified).toISOString()
      : null,
    features,
    warnings,
  };
}

export async function listSheets(
  path: string,
  options: { workspaceRoot?: string } = {},
): Promise<WorkbookListSheetsResult> {
  assertSupportedWorkbook(path);
  const workbook = await loadWorkbook(path);

  return {
    source: path,
    displayPath: displayPath(path, options.workspaceRoot),
    sheets: workbook.worksheets.map(summariseWorksheet),
  };
}

export async function previewWorksheet(
  path: string,
  options: {
    sheet?: string | number;
    range?: string;
    rows?: number;
    columns?: number;
    includeFormulas?: boolean;
    workspaceRoot?: string;
  } = {},
): Promise<WorksheetMatrixResult> {
  assertSupportedWorkbook(path);
  const workbook = await loadWorkbook(path);
  const worksheet = selectWorksheet(workbook, options.sheet);
  const bounds = resolveBounds(worksheet, {
    range: options.range,
    maxRows: options.rows ?? 20,
    maxColumns: options.columns ?? 20,
  });
  const matrix = readMatrix(worksheet, bounds, {
    includeFormulas: options.includeFormulas ?? false,
  });

  return {
    source: path,
    displayPath: displayPath(path, options.workspaceRoot),
    sheet: worksheet.name,
    range: formatRange(bounds),
    matrix,
  };
}

export async function extractWorksheet(
  path: string,
  options: {
    sheet?: string | number;
    range?: string;
    includeFormulas?: boolean;
    header?: boolean;
    workspaceRoot?: string;
  } = {},
): Promise<WorksheetExtractResult> {
  assertSupportedWorkbook(path);
  const workbook = await loadWorkbook(path);
  const worksheet = selectWorksheet(workbook, options.sheet);
  const bounds = resolveBounds(worksheet, {
    range: options.range,
    maxRows: Number.MAX_SAFE_INTEGER,
    maxColumns: Number.MAX_SAFE_INTEGER,
  });
  const matrix = readMatrix(worksheet, bounds, {
    includeFormulas: options.includeFormulas ?? false,
  });

  return tabularResult({
    path,
    workspaceRoot: options.workspaceRoot,
    worksheet,
    bounds,
    matrix,
    header: options.header ?? true,
  });
}

export async function extractTable(
  path: string,
  tableName: string,
  options: {
    includeFormulas?: boolean;
    header?: boolean;
    workspaceRoot?: string;
  } = {},
): Promise<WorksheetTableExtractResult> {
  assertSupportedWorkbook(path);
  const workbook = await loadWorkbook(path);
  const located = findTable(workbook, tableName);

  if (!located) {
    const available = workbook.worksheets.flatMap((worksheet) =>
      listWorksheetTables(worksheet).map((table) => table.name),
    );

    const error = new Error(`Excel table not found: ${tableName}`) as Error & { code?: string; availableTables?: string[] };
    error.code = "TABLE_NOT_FOUND";
    error.availableTables = available;
    throw error;
  }

  const bounds = parseRange(located.table.ref);
  const matrix = readMatrix(located.worksheet, bounds, {
    includeFormulas: options.includeFormulas ?? false,
  });

  return {
    ...tabularResult({
      path,
      workspaceRoot: options.workspaceRoot,
      worksheet: located.worksheet,
      bounds,
      matrix,
      header: options.header ?? true,
    }),
    table: located.table.name,
  };
}

export async function listFormulas(
  path: string,
  options: {
    sheet?: string | number;
    maxResults?: number;
    workspaceRoot?: string;
  } = {},
): Promise<FormulaListing> {
  assertSupportedWorkbook(path);
  const workbook = await loadWorkbook(path);
  const worksheets = options.sheet
    ? [selectWorksheet(workbook, options.sheet)]
    : workbook.worksheets;
  const maxResults = options.maxResults ?? 500;
  const formulas: FormulaListing["formulas"] = [];
  let truncated = false;

  for (const worksheet of worksheets) {
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const formula = formulaFromValue(cell.value);
        if (!formula || truncated) return;

        formulas.push({
          sheet: worksheet.name,
          address: cell.address,
          formula: formula.formula,
          result: normaliseCellValue(formula.result, {
            includeFormulas: false,
          }),
        });

        if (formulas.length >= maxResults) {
          truncated = true;
        }
      });
    });

    if (truncated) break;
  }

  return {
    source: path,
    displayPath: displayPath(path, options.workspaceRoot),
    formulas,
    truncated,
  };
}

export async function loadWorkbook(path: string): Promise<ExcelJS.Workbook> {
  assertSupportedWorkbook(path);
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.readFile(path);
  } catch (error) {
    throw new Error(`Unable to read Excel workbook: ${error instanceof Error ? error.message : String(error)}`);
  }

  return workbook;
}

function summariseWorksheet(worksheet: ExcelJS.Worksheet): WorksheetSummary {
  const tables = listWorksheetTables(worksheet);
  let formulaCellCount = 0;
  let hiddenRowCount = 0;
  let hiddenColumnCount = 0;

  worksheet.eachRow({ includeEmpty: false }, (row) => {
    if (row.hidden) hiddenRowCount += 1;
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (formulaFromValue(cell.value)) formulaCellCount += 1;
    });
  });

  for (let index = 1; index <= worksheet.columnCount; index += 1) {
    if (worksheet.getColumn(index).hidden) hiddenColumnCount += 1;
  }

  return {
    id: worksheet.id,
    name: worksheet.name,
    state: worksheet.state ?? "visible",
    rowCount: worksheet.rowCount,
    actualRowCount: worksheet.actualRowCount ?? worksheet.rowCount,
    columnCount: worksheet.columnCount,
    actualColumnCount: worksheet.actualColumnCount ?? worksheet.columnCount,
    mergedCellCount: Object.keys((worksheet as { _merges?: Record<string, unknown> })._merges ?? {}).length,
    hiddenRowCount,
    hiddenColumnCount,
    formulaCellCount,
    tables,
  };
}

function listWorksheetTables(worksheet: ExcelJS.Worksheet): WorksheetTable[] {
  let values: unknown[] = [];

  const maybe = worksheet as ExcelJS.Worksheet & { getTables?: () => unknown[] };
  if (typeof maybe.getTables === "function") {
    try {
      values = maybe.getTables();
    } catch {
      values = [];
    }
  }

  if (!Array.isArray(values) || values.length === 0) {
    const model = (worksheet as { model?: { tables?: unknown[] }; _tables?: unknown }).model?.tables
      ?? (worksheet as { _tables?: unknown })._tables
      ?? [];
    values = Array.isArray(model) ? model : Object.values(model as Record<string, unknown>);
  }

  return values
    .map((value) => {
      const raw = value as Record<string, unknown> | undefined;
      const model = (raw?.model ?? raw?.table ?? raw) as Record<string, unknown> | undefined;
      const name =
        (raw?.name as string | undefined) ??
        (model?.name as string | undefined) ??
        (model?.displayName as string | undefined) ??
        null;
      const ref =
        (raw?.ref as string | undefined) ??
        (raw?.tableRef as string | undefined) ??
        (model?.ref as string | undefined) ??
        (model?.tableRef as string | undefined) ??
        null;

      return name && ref
        ? {
            name,
            ref,
            displayName: (model?.displayName as string | undefined) ?? name,
            headerRow: model?.headerRow !== false,
            totalsRow: model?.totalsRow === true,
          }
        : null;
    })
    .filter((value): value is WorksheetTable => Boolean(value))
    .sort((left, right) => left.name.localeCompare(right.name, "en"));
}

function findTable(
  workbook: ExcelJS.Workbook,
  tableName: string,
): { worksheet: ExcelJS.Worksheet; table: WorksheetTable } | null {
  const expected = tableName.toLowerCase();

  for (const worksheet of workbook.worksheets) {
    const table = listWorksheetTables(worksheet).find(
      (candidate) =>
        candidate.name.toLowerCase() === expected ||
        candidate.displayName.toLowerCase() === expected,
    );

    if (table) return { worksheet, table };
  }

  return null;
}

async function inspectWorkbookPackage(path: string): Promise<WorkbookFeatures> {
  const packageFile = await readOoxmlPackage(path);
  const names = packageFile.names();

  return {
    tableCount: names.filter(
      (name) => /^xl\/tables\/table\d+\.xml$/i.test(name),
    ).length,
    chartCount: names.filter(
      (name) => /^xl\/charts\/chart\d+\.xml$/i.test(name),
    ).length,
    imageCount: names.filter((name) => name.startsWith("xl/media/")).length,
    externalLinkCount: names.filter(
      (name) => /^xl\/externalLinks\/externalLink\d+\.xml$/i.test(name),
    ).length,
    hasMacros: names.some(
      (name) => name.toLowerCase() === "xl/vbaproject.bin",
    ),
    hasConnections: names.some(
      (name) => name.toLowerCase() === "xl/connections.xml",
    ),
  };
}

function selectWorksheet(
  workbook: ExcelJS.Workbook,
  selector: string | number | undefined,
): ExcelJS.Worksheet {
  if (selector === undefined || selector === null || selector === "") {
    const first = workbook.worksheets[0];
    if (!first) throw new Error("The workbook contains no worksheets.");
    return first;
  }

  const numeric = Number.parseInt(String(selector), 10);
  const worksheet = Number.isInteger(numeric) && String(numeric) === String(selector)
    ? workbook.getWorksheet(numeric)
    : workbook.getWorksheet(String(selector));

  if (!worksheet) {
    throw new Error(`Worksheet not found: ${selector}`);
  }

  return worksheet;
}

function resolveBounds(
  worksheet: ExcelJS.Worksheet,
  options: { range?: string; maxRows: number; maxColumns: number },
): WorksheetBounds {
  if (options.range) return parseRange(options.range);

  const lastRow = Math.max(1, worksheet.actualRowCount ?? worksheet.rowCount);
  const lastColumn = Math.max(
    1,
    worksheet.actualColumnCount ?? worksheet.columnCount,
  );

  return {
    startRow: 1,
    startColumn: 1,
    endRow: Math.min(lastRow, options.maxRows),
    endColumn: Math.min(lastColumn, options.maxColumns),
  };
}

function readMatrix(
  worksheet: ExcelJS.Worksheet,
  bounds: WorksheetBounds,
  options: { includeFormulas: boolean },
): unknown[][] {
  const matrix: unknown[][] = [];

  for (let rowNumber = bounds.startRow; rowNumber <= bounds.endRow; rowNumber += 1) {
    const row: unknown[] = [];

    for (
      let columnNumber = bounds.startColumn;
      columnNumber <= bounds.endColumn;
      columnNumber += 1
    ) {
      row.push(
        normaliseCellValue(
          worksheet.getCell(rowNumber, columnNumber).value,
          options,
        ),
      );
    }

    matrix.push(row);
  }

  return trimEmptyEdges(matrix);
}

function normaliseCellValue(
  value: unknown,
  options: { includeFormulas?: boolean } = {},
): unknown {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString("base64");

  if (typeof value !== "object") return value;

  const formula = formulaFromValue(value);
  if (formula) {
    return options.includeFormulas
      ? {
          formula: formula.formula,
          result: normaliseCellValue(formula.result, {
            includeFormulas: false,
          }),
        }
      : normaliseCellValue(formula.result, {
          includeFormulas: false,
        });
  }

  if (Array.isArray((value as { richText?: unknown[] }).richText)) {
    return (value as { richText: { text?: string }[] }).richText
      .map((item) => item.text ?? "")
      .join("");
  }

  if ((value as { hyperlink?: unknown }).hyperlink) {
    const v = value as { text?: string; hyperlink?: string };
    return v.text ?? v.hyperlink;
  }

  if ((value as { error?: unknown }).error) {
    return { error: (value as { error: unknown }).error };
  }

  if ((value as { text?: unknown }).text !== undefined) {
    return (value as { text: unknown }).text;
  }

  return JSON.parse(JSON.stringify(value));
}

function formulaFromValue(value: unknown): { formula: string; result: unknown } | null {
  if (
    value &&
    typeof value === "object" &&
    (typeof (value as { formula?: unknown }).formula === "string" ||
      typeof (value as { sharedFormula?: unknown }).sharedFormula === "string")
  ) {
    return {
      formula:
        ((value as { formula?: string }).formula) ??
        ((value as { sharedFormula?: string }).sharedFormula) ??
        "",
      result: (value as { result?: unknown }).result ?? null,
    };
  }

  return null;
}

function tabularResult(options: {
  path: string;
  workspaceRoot?: string;
  worksheet: ExcelJS.Worksheet;
  bounds: WorksheetBounds;
  matrix: unknown[][];
  header: boolean;
}): WorksheetExtractResult {
  return {
    source: options.path,
    displayPath: displayPath(options.path, options.workspaceRoot),
    sheet: options.worksheet.name,
    range: formatRange(options.bounds),
    matrix: options.matrix,
    records: options.header ? matrixToRecords(options.matrix) : (options.matrix as unknown as Record<string, unknown>[]),
    header: options.header,
  };
}

function matrixToRecords(matrix: readonly unknown[][]): Record<string, unknown>[] {
  if (matrix.length === 0) return [];

  const headers = uniqueHeaders(matrix[0] ?? []);
  return matrix.slice(1).map((row) => {
    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? null;
    });
    return record;
  });
}

function uniqueHeaders(row: readonly unknown[]): string[] {
  const counts = new Map<string, number>();

  return row.map((value, index) => {
    const base = String(value ?? "").trim() || `column-${index + 1}`;
    const safe = base.replace(/\s+/g, " ");
    const count = (counts.get(safe) ?? 0) + 1;
    counts.set(safe, count);
    return count === 1 ? safe : `${safe}-${count}`;
  });
}

function trimEmptyEdges(matrix: unknown[][]): unknown[][] {
  const copy = matrix.map((row) => [...row]);

  while (
    copy.length > 0 &&
    copy.at(-1)?.every((value) => value === null || value === "")
  ) {
    copy.pop();
  }

  let lastUsedColumn = -1;
  for (const row of copy) {
    for (let index = row.length - 1; index >= 0; index -= 1) {
      if (row[index] !== null && row[index] !== "") {
        lastUsedColumn = Math.max(lastUsedColumn, index);
        break;
      }
    }
  }

  return lastUsedColumn < 0
    ? []
    : copy.map((row) => row.slice(0, lastUsedColumn + 1));
}

export function parseRange(value: string): WorksheetBounds {
  const match = String(value)
    .trim()
    .match(/^([A-Za-z]+)(\d+)(?::([A-Za-z]+)(\d+))?$/);

  if (!match) {
    throw new Error(`Invalid Excel range: ${value}`);
  }

  const startColumn = columnLettersToNumber(match[1] as string);
  const startRow = Number.parseInt(match[2] as string, 10);
  const endColumn = match[3]
    ? columnLettersToNumber(match[3] as string)
    : startColumn;
  const endRow = match[4]
    ? Number.parseInt(match[4] as string, 10)
    : startRow;

  if (endRow < startRow || endColumn < startColumn) {
    throw new Error(`Excel range is reversed: ${value}`);
  }

  return {
    startRow,
    startColumn,
    endRow,
    endColumn,
  };
}

function formatRange(bounds: WorksheetBounds): string {
  return `${columnNumberToLetters(bounds.startColumn)}${bounds.startRow}:${columnNumberToLetters(bounds.endColumn)}${bounds.endRow}`;
}

function columnLettersToNumber(value: string): number {
  let result = 0;

  for (const character of value.toUpperCase()) {
    result = result * 26 + character.charCodeAt(0) - 64;
  }

  return result;
}

function columnNumberToLetters(value: number): string {
  let number = value;
  let result = "";

  while (number > 0) {
    number -= 1;
    result = String.fromCharCode(65 + (number % 26)) + result;
    number = Math.floor(number / 26);
  }

  return result;
}

function assertSupportedWorkbook(path: string): void {
  const extension = extname(path).toLowerCase();

  if (!MODERN_EXCEL_EXTENSIONS.has(extension)) {
    throw new Error(
      `Unsupported Excel format ${extension || "(none)"}. Convert legacy .xls files to .xlsx before analysis.`,
    );
  }
}

function displayPath(path: string, workspaceRoot?: string): string {
  if (!workspaceRoot) return path;

  const value = relative(workspaceRoot, path).replaceAll("\\", "/");
  return value.startsWith("..") ? path : value || ".";
}