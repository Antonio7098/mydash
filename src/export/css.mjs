import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { transform } from "esbuild";
import {
  resolveExportSourcePath,
} from "./paths.mjs";
import {
  mediaTypeForPath,
  toDataUri,
} from "./mime.mjs";

const IMPORT_PATTERN =
  /@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)')\s*\)?\s*([^;]*);/gi;
const URL_PATTERN =
  /url\(\s*(?:"([^"]+)"|'([^']+)'|([^)"']+))\s*\)/gi;

export async function bundleCssFile(
  path,
  options,
  state = createCssState(),
) {
  if (state.stack.has(path)) {
    throw cssError(
      "CSS_IMPORT_CYCLE",
      `CSS import cycle detected at ${path}.`,
    );
  }

  if (state.cache.has(path)) {
    return state.cache.get(path);
  }

  state.stack.add(path);
  let source = await readFile(path, "utf8");
  source = await expandImports(source, path, options, state);
  source = await inlineUrls(source, path, options);

  if (options.minify) {
    const result = await transform(source, {
      loader: "css",
      minify: true,
      legalComments: "none",
    });
    source = result.code;
  }

  state.stack.delete(path);
  state.cache.set(path, source);
  return source;
}

export async function bundleInlineCss(
  source,
  baseFile,
  options,
  state = createCssState(),
) {
  let output = await expandImports(
    String(source),
    baseFile,
    options,
    state,
  );
  output = await inlineUrls(output, baseFile, options);

  if (options.minify) {
    const result = await transform(output, {
      loader: "css",
      minify: true,
      legalComments: "none",
    });
    output = result.code;
  }

  return output;
}

export async function bundleStyleAttribute(
  source,
  baseFile,
  options,
) {
  return inlineUrls(String(source), baseFile, options);
}

export function createCssState() {
  return {
    cache: new Map(),
    stack: new Set(),
  };
}

async function expandImports(
  source,
  baseFile,
  options,
  state,
) {
  const matches = [...source.matchAll(IMPORT_PATTERN)];
  let output = source;

  for (const match of matches.reverse()) {
    const reference = match[1] ?? match[2];
    const media = match[3]?.trim() ?? "";
    const resolved = await resolveExportSourcePath(
      baseFile,
      reference,
      options.workspaceRoot,
    );

    if (resolved.kind !== "file") {
      throw cssError(
        "CSS_IMPORT_NOT_FILE",
        `CSS @import must reference a local file: ${reference}`,
      );
    }

    const imported = await bundleCssFile(
      resolved.path,
      options,
      state,
    );
    const replacement = media
      ? `@media ${media}{${imported}}`
      : imported;

    output =
      output.slice(0, match.index) +
      replacement +
      output.slice(match.index + match[0].length);
  }

  return output;
}

async function inlineUrls(source, baseFile, options) {
  const matches = [...source.matchAll(URL_PATTERN)];
  let output = source;

  for (const match of matches.reverse()) {
    const reference = (
      match[1] ??
      match[2] ??
      match[3] ??
      ""
    ).trim();

    if (
      !reference ||
      reference.startsWith("data:") ||
      reference.startsWith("#")
    ) {
      continue;
    }

    const resolved = await resolveExportSourcePath(
      baseFile,
      reference,
      options.workspaceRoot,
    );

    if (resolved.kind !== "file") continue;

    const content = await readFile(resolved.path);
    options.onAsset?.(resolved.path);
    const dataUri =
      toDataUri(content, mediaTypeForPath(resolved.path)) +
      resolved.suffix;
    const replacement = `url("${dataUri}")`;

    output =
      output.slice(0, match.index) +
      replacement +
      output.slice(match.index + match[0].length);
  }

  return output;
}

function cssError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
