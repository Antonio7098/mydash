import { lstat, readFile } from "node:fs/promises";
import { basename, relative } from "node:path";
import { identifyFile, type IdentifyFileResult } from "./identify.js";

export interface InspectPathOptions {
  workspaceRoot?: string;
}

export interface InspectPathResult extends IdentifyFileResult {
  name: string;
  isSymbolicLink: boolean;
  recommendedCommands: string[];
  details: Record<string, unknown>;
}

export async function inspectPath(
  path: string,
  options: InspectPathOptions = {},
): Promise<InspectPathResult> {
  const metadata = await lstat(path);
  const displayPathValue = formatPath(path, options.workspaceRoot);

  if (metadata.isDirectory()) {
    return {
      path,
      displayPath: displayPathValue,
      name: basename(path),
      type: "directory",
      mediaType: "",
      extension: "",
      confidence: "high",
      sizeBytes: 0,
      modifiedAt: metadata.mtime.toISOString(),
      magic: null,
      isSymbolicLink: false,
      recommendedCommands: [
        `mydash file tree "${displayPathValue}"`,
        `mydash file find "**/*" --root "${displayPathValue}"`,
      ],
      details: {},
    };
  }

  const identity = await identifyFile(path, options);
  const details = await inspectKnownTextType(path, identity.type);

  return {
    ...identity,
    name: basename(path),
    isSymbolicLink: metadata.isSymbolicLink(),
    recommendedCommands: recommendedCommands(identity, displayPathValue),
    details,
  };
}

async function inspectKnownTextType(
  path: string,
  type: string,
): Promise<Record<string, unknown>> {
  if (type !== "json") return {};

  try {
    const source = await readFile(path, "utf8");
    const value: unknown = JSON.parse(source);

    if (Array.isArray(value)) {
      return {
        jsonShape: "array",
        itemCount: value.length,
      };
    }

    if (value !== null && typeof value === "object") {
      return {
        jsonShape: "object",
        keys: Object.keys(value).slice(0, 50),
      };
    }

    return {
      jsonShape: typeof value,
    };
  } catch (error) {
    return {
      jsonShape: "invalid",
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

function recommendedCommands(
  identity: IdentifyFileResult,
  displayPathValue: string,
): string[] {
  const quoted = `"${displayPathValue}"`;

  switch (identity.type) {
    case "excel":
      return [
        `mydash excel inspect ${quoted}`,
        `mydash excel preview ${quoted} --sheet <name>`,
      ];
    case "powerpoint":
      return [
        `mydash powerpoint inspect ${quoted}`,
        `mydash powerpoint outline ${quoted}`,
      ];
    case "csv":
    case "json":
    case "ndjson":
      return [
        `mydash data inspect ${quoted}`,
        `mydash data profile ${quoted}`,
      ];
    case "html":
      return [
        `mydash html inspect ${quoted}`,
        `mydash html external-resources ${quoted}`,
      ];
    default:
      return [
        `mydash file identify ${quoted}`,
        `mydash file hash ${quoted}`,
      ];
  }
}

function formatPath(path: string, workspaceRoot?: string): string {
  if (!workspaceRoot) return path;

  const value = relative(workspaceRoot, path).replaceAll("\\", "/");
  return value.startsWith("..") ? path : value || ".";
}