import { lstat, readFile } from "node:fs/promises";
import { basename, relative } from "node:path";
import { identifyFile } from "./identify.mjs";

export async function inspectPath(path, options = {}) {
  const metadata = await lstat(path);
  const displayPath = formatPath(path, options.workspaceRoot);

  if (metadata.isDirectory()) {
    return {
      path,
      displayPath,
      name: basename(path),
      type: "directory",
      mediaType: null,
      sizeBytes: null,
      modifiedAt: metadata.mtime.toISOString(),
      isSymbolicLink: false,
      recommendedCommands: [
        `mydash file tree "${displayPath}"`,
        `mydash file find "**/*" --root "${displayPath}"`,
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
    recommendedCommands: recommendedCommands(identity, displayPath),
    details,
  };
}

async function inspectKnownTextType(path, type) {
  if (type !== "json") return {};

  try {
    const source = await readFile(path, "utf8");
    const value = JSON.parse(source);

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
      parseError: error.message,
    };
  }
}

function recommendedCommands(identity, displayPath) {
  const quoted = `"${displayPath}"`;

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

function formatPath(path, workspaceRoot) {
  if (!workspaceRoot) return path;

  const value = relative(workspaceRoot, path).replaceAll("\\", "/");
  return value.startsWith("..") ? path : value || ".";
}
