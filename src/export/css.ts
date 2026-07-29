import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { transform } from "esbuild";
import { resolveExportSourcePath } from "./paths.js";
import { mediaTypeForPath, toDataUri } from "./mime.js";

const IMPORT_PATTERN =
  /@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)')\s*\)?\s*([^;]*);/gi;
const URL_PATTERN =
  /url\(\s*(?:"([^"]+)"|'([^']+)'|([^)"']+))\s*\)/gi;

export interface BundleCssOptions {
  workspaceRoot?: string;
  minify?: boolean;
  onAsset?: (path: string) => void;
}

export interface CssState {
  cache: Map<string, string>;
  stack: Set<string>;
}

export function createCssState(): CssState {
  return {
    cache: new Map(),
    stack: new Set(),
  };
}

export async function bundleCssFile(
  path: string,
  options: BundleCssOptions,
  state: CssState = createCssState(),
): Promise<string> {
  if (state.stack.has(path)) {
    throw cssError(
      "CSS_IMPORT_CYCLE",
      `CSS import cycle detected at ${path}.`,
    );
  }

  if (state.cache.has(path)) {
    return state.cache.get(path) as string;
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
  source: string,
  baseFile: string,
  options: BundleCssOptions,
  state: CssState = createCssState(),
): Promise<string> {
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
  source: string,
  baseFile: string,
  options: BundleCssOptions,
): Promise<string> {
  return inlineUrls(String(source), baseFile, options);
}

async function expandImports(
  source: string,
  baseFile: string,
  options: BundleCssOptions,
  state: CssState,
): Promise<string> {
  const matches = [...source.matchAll(IMPORT_PATTERN)];
  let output = source;

  for (const match of matches.reverse()) {
    const reference = match[1] ?? match[2];
    const media = match[3]?.trim() ?? "";
    if (!reference) continue;

    const resolved = await resolveExportSourcePath(
      baseFile,
      reference,
      options.workspaceRoot ?? "",
    );

    if (resolved.kind !== "file" || !resolved.path) {
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

    const matchIndex = match.index ?? 0;
    output =
      output.slice(0, matchIndex) +
      replacement +
      output.slice(matchIndex + match[0].length);
  }

  return output;
}

async function inlineUrls(
  source: string,
  baseFile: string,
  options: BundleCssOptions,
): Promise<string> {
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
      options.workspaceRoot ?? "",
    );

    if (resolved.kind !== "file" || !resolved.path) continue;

    const content = await readFile(resolved.path);
    options.onAsset?.(resolved.path);
    const dataUri =
      toDataUri(content, mediaTypeForPath(resolved.path)) +
      resolved.suffix;
    const replacement = `url("${dataUri}")`;

    const matchIndex = match.index ?? 0;
    output =
      output.slice(0, matchIndex) +
      replacement +
      output.slice(matchIndex + match[0].length);
  }

  return output;
}

function cssError(code: string, message: string): Error {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}