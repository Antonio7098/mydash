import { extname, relative } from "node:path";
import { writeFileAtomic } from "../files/output.mjs";

const FORMATS = new Set(["json", "csv", "ndjson"]);

export async function writeTabularOutput(data, options) {
  const format = normaliseFormat(options.format, options.outputPath);
  let content;

  if (format === "csv") {
    content = `${toCsv(data.matrix)}\n`;
  } else if (format === "ndjson") {
    const rows = data.header ? data.records : data.matrix;
    content = rows.map((row) => JSON.stringify(row)).join("\n");
    if (content) content += "\n";
  } else {
    const rows = data.header ? data.records : data.matrix;
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

export function toCsv(matrix) {
  return matrix
    .map((row) => row.map(csvValue).join(","))
    .join("\n");
}

function csvValue(value) {
  if (value === null || value === undefined) return "";

  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);

  return /[",\r\n]/.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

function normaliseFormat(requested, outputPath) {
  const extension = extname(outputPath).toLowerCase().replace(/^\./, "");
  const format = requested?.toLowerCase() || extension || "json";

  if (!FORMATS.has(format)) {
    throw new Error(
      `Unsupported extraction format: ${format}. Use json, csv or ndjson.`,
    );
  }

  return format;
}

function displayPath(path, workspaceRoot) {
  if (!workspaceRoot) return path;

  const value = relative(workspaceRoot, path).replaceAll("\\", "/");
  return value.startsWith("..") ? path : value || ".";
}
