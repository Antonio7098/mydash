import { extname, relative } from "node:path";
import { writeFileAtomic } from "../files/output.mjs";
import { recordsToCsv } from "./csv.mjs";

const FORMATS = new Set(["json", "csv", "ndjson"]);

export async function writeDataset(records, options) {
  const format = normaliseFormat(options.format, options.outputPath);
  const content = serialise(records, format);
  const path = await writeFileAtomic(options.outputPath, content, {
    workspaceRoot: options.workspaceRoot,
    overwrite: options.overwrite ?? false,
    encoding: "utf8",
  });

  return {
    path,
    displayPath: displayPath(path, options.workspaceRoot),
    format,
    rowCount: records.length,
    bytes: Buffer.byteLength(content),
  };
}

function serialise(records, format) {
  if (format === "csv") {
    const csv = recordsToCsv(records);
    return csv ? `${csv}\n` : "";
  }

  if (format === "ndjson") {
    const content = records.map((record) => JSON.stringify(record)).join("\n");
    return content ? `${content}\n` : "";
  }

  return `${JSON.stringify(records, null, 2)}\n`;
}

function normaliseFormat(requested, outputPath) {
  const inferred = extname(outputPath).toLowerCase().replace(/^\./, "");
  const format = (requested || inferred || "json").toLowerCase();

  if (!FORMATS.has(format)) {
    throw new Error(
      `Unsupported output format ${format}. Use json, csv or ndjson.`,
    );
  }

  return format;
}

function displayPath(path, workspaceRoot) {
  if (!workspaceRoot) return path;

  const value = relative(workspaceRoot, path).replaceAll("\\", "/");
  return value.startsWith("..") ? path : value || ".";
}
