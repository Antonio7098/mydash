import { extname, relative } from "node:path";
import { writeFileAtomic } from "../files/output.js";

const FORMATS = new Set(["json", "csv", "ndjson"]);

export interface TabularData {
  records?: Record<string, unknown>[];
  matrix?: unknown[][];
  header?: boolean;
}

export interface WriteTabularOutputOptions {
  outputPath: string;
  format?: string;
  workspaceRoot?: string;
  overwrite?: boolean;
}

export interface WriteTabularOutputResult {
  path: string;
  displayPath: string;
  format: string;
  bytes: number;
}

export async function writeTabularOutput(
  data: TabularData,
  options: WriteTabularOutputOptions,
): Promise<WriteTabularOutputResult> {
  const format = normaliseFormat(options.format, options.outputPath);
  let content: string;

  if (format === "csv") {
    const matrix = data.matrix ?? [];
    content = `${toCsv(matrix as unknown[][])}\n`;
  } else if (format === "ndjson") {
    const rows = data.header ? (data.records ?? []) : (data.matrix ?? []);
    content = rows.map((row) => JSON.stringify(row)).join("\n");
    if (content) content += "\n";
  } else {
    const rows = data.header ? (data.records ?? []) : (data.matrix ?? []);
    content = `${JSON.stringify(rows, null, 2)}\n`;
  }

  const path = await writeFileAtomic(options.outputPath, content, {
    workspaceRoot: options.workspaceRoot,
    overwrite: options.overwrite ?? false,
    encoding: "utf8",
  });

  return {
    path,
    displayPath: displayPath(path, options.workspaceRoot),
    format,
    bytes: Buffer.byteLength(content),
  };
}

export function toCsv(matrix: readonly unknown[][]): string {
  return matrix
    .map((row) => row.map((value) => csvValue(value)).join(","))
    .join("\n");
}

function csvValue(value: unknown): string {
  if (value === null || value === undefined) return "";

  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);

  return /[",\r\n]/.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

function normaliseFormat(requested: string | undefined, outputPath: string): string {
  const extension = extname(outputPath).toLowerCase().replace(/^\./, "");
  const format = requested?.toLowerCase() || extension || "json";

  if (!FORMATS.has(format)) {
    throw new Error(
      `Unsupported extraction format: ${format}. Use json, csv or ndjson.`,
    );
  }

  return format;
}

function displayPath(path: string, workspaceRoot?: string): string {
  if (!workspaceRoot) return path;

  const value = relative(workspaceRoot, path).replaceAll("\\", "/");
  return value.startsWith("..") ? path : value || ".";
}