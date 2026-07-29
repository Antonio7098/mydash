import { open, stat } from "node:fs/promises";
import { extname, relative } from "node:path";

export type IdentificationType =
  | "excel"
  | "powerpoint"
  | "csv"
  | "tabular-text"
  | "json"
  | "ndjson"
  | "html"
  | "css"
  | "javascript"
  | "text"
  | "markdown"
  | "pdf"
  | "svg"
  | "image"
  | "archive"
  | "office-binary"
  | "directory"
  | "other"
  | "unknown";

export type IdentificationConfidence = "high" | "medium" | "low";

export interface IdentifyFileOptions {
  workspaceRoot?: string;
}

export interface IdentifyFileResult {
  path: string;
  displayPath: string;
  type: IdentificationType;
  mediaType: string;
  extension: string;
  confidence: IdentificationConfidence;
  sizeBytes: number;
  modifiedAt: string;
  magic: string | null;
}

const EXTENSION_TYPES = new Map<string, [IdentificationType, string]>([
  [".xlsx", ["excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]],
  [".xlsm", ["excel", "application/vnd.ms-excel.sheet.macroEnabled.12"]],
  [".xls", ["excel", "application/vnd.ms-excel"]],
  [".pptx", ["powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"]],
  [".pptm", ["powerpoint", "application/vnd.ms-powerpoint.presentation.macroEnabled.12"]],
  [".ppt", ["powerpoint", "application/vnd.ms-powerpoint"]],
  [".csv", ["csv", "text/csv"]],
  [".tsv", ["tabular-text", "text/tab-separated-values"]],
  [".json", ["json", "application/json"]],
  [".ndjson", ["ndjson", "application/x-ndjson"]],
  [".html", ["html", "text/html"]],
  [".htm", ["html", "text/html"]],
  [".css", ["css", "text/css"]],
  [".js", ["javascript", "text/javascript"]],
  [".mjs", ["javascript", "text/javascript"]],
  [".txt", ["text", "text/plain"]],
  [".md", ["markdown", "text/markdown"]],
  [".pdf", ["pdf", "application/pdf"]],
  [".svg", ["svg", "image/svg+xml"]],
  [".png", ["image", "image/png"]],
  [".jpg", ["image", "image/jpeg"]],
  [".jpeg", ["image", "image/jpeg"]],
  [".gif", ["image", "image/gif"]],
  [".webp", ["image", "image/webp"]],
  [".zip", ["archive", "application/zip"]],
]);

export async function identifyFile(
  path: string,
  options: IdentifyFileOptions = {},
): Promise<IdentifyFileResult> {
  const metadata = await stat(path);

  if (!metadata.isFile()) {
    return {
      path,
      displayPath: displayPath(path, options.workspaceRoot),
      type: metadata.isDirectory() ? "directory" : "other",
      mediaType: "application/octet-stream",
      extension: extname(path).toLowerCase(),
      confidence: "high",
      sizeBytes: metadata.size,
      modifiedAt: metadata.mtime.toISOString(),
      magic: null,
    };
  }

  const extension = extname(path).toLowerCase();
  const sample = await readSample(path, 512);
  const magic = detectMagic(sample);
  const extensionType = EXTENSION_TYPES.get(extension);

  let type: IdentificationType = extensionType?.[0] ?? "unknown";
  let mediaType = extensionType?.[1] ?? "application/octet-stream";
  let confidence: IdentificationConfidence = extensionType ? "medium" : "low";

  if (magic) {
    type = magic.type;
    mediaType = magic.mediaType;
    confidence = "high";

    if (magic.type === "archive" && extensionType) {
      type = extensionType[0];
      mediaType = extensionType[1];
    }
  } else if (!extensionType && looksLikeText(sample)) {
    type = "text";
    mediaType = "text/plain";
    confidence = "medium";
  }

  return {
    path,
    displayPath: displayPath(path, options.workspaceRoot),
    type,
    mediaType,
    extension,
    confidence,
    sizeBytes: metadata.size,
    modifiedAt: metadata.mtime.toISOString(),
    magic: magic?.name ?? null,
  };
}

async function readSample(path: string, length: number): Promise<Buffer> {
  const handle = await open(path, "r");

  try {
    const buffer = Buffer.alloc(length);
    const result = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, result.bytesRead);
  } finally {
    await handle.close();
  }
}

interface MagicDetection {
  name: string;
  type: IdentificationType;
  mediaType: string;
}

function detectMagic(buffer: Buffer): MagicDetection | null {
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString() === "%PDF") {
    return { name: "PDF", type: "pdf", mediaType: "application/pdf" };
  }

  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    [0x03, 0x05, 0x07].includes(buffer[2] as number)
  ) {
    return { name: "ZIP", type: "archive", mediaType: "application/zip" };
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    )
  ) {
    return {
      name: "OLE Compound File",
      type: "office-binary",
      mediaType: "application/x-ole-storage",
    };
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return { name: "PNG", type: "image", mediaType: "image/png" };
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { name: "JPEG", type: "image", mediaType: "image/jpeg" };
  }

  if (
    buffer.length >= 6 &&
    ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString())
  ) {
    return { name: "GIF", type: "image", mediaType: "image/gif" };
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString() === "RIFF" &&
    buffer.subarray(8, 12).toString() === "WEBP"
  ) {
    return { name: "WebP", type: "image", mediaType: "image/webp" };
  }

  return null;
}

function looksLikeText(buffer: Buffer): boolean {
  if (buffer.length === 0) return true;

  let printable = 0;

  for (const byte of buffer) {
    if (
      byte === 0x09 ||
      byte === 0x0a ||
      byte === 0x0d ||
      (byte >= 0x20 && byte <= 0x7e) ||
      byte >= 0x80
    ) {
      printable += 1;
    }
  }

  return printable / buffer.length > 0.9;
}

function displayPath(path: string, workspaceRoot?: string): string {
  if (!workspaceRoot) return path;

  const value = relative(workspaceRoot, path).replaceAll("\\", "/");
  return value.startsWith("..") ? path : value || ".";
}