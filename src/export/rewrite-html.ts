import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import {
  appendNodes,
  createNodes,
  findElement,
  getAttribute,
  hasAttribute,
  parseHtmlDocument,
  prependNodes,
  removeAttribute,
  removeNode,
  replaceNode,
  serialiseHtml,
  setAttribute,
  setTextContent,
  textContent,
  walkHtml,
  type HtmlNode,
} from "./html-tree.js";
import {
  bundleCssFile,
  bundleInlineCss,
  bundleStyleAttribute,
  createCssState,
  type BundleCssOptions,
} from "./css.js";
import {
  bundleInlineJavaScript,
  bundleJavaScriptFile,
  escapeScriptText,
} from "./javascript.js";
import { mediaTypeForPath, toDataUri } from "./mime.js";
import {
  resolveExportSourcePath,
  workspaceDisplayPath,
} from "./paths.js";
import {
  collectArtifactEmbeddedFiles,
  resolveAssetSlots,
} from "./resources.js";
import { createStandaloneRuntime } from "./runtime.js";

const CSP =
  "default-src 'none'; img-src data:; media-src data:; font-src data:; " +
  "style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; " +
  "object-src 'none'; frame-src data:; base-uri 'none'; form-action 'none'";

const RESOURCE_ATTRIBUTES = new Map<string, string[]>([
  ["audio", ["src"]],
  ["embed", ["src"]],
  ["iframe", ["src"]],
  ["img", ["src", "srcset"]],
  ["input", ["src"]],
  ["object", ["data"]],
  ["source", ["src", "srcset"]],
  ["track", ["src"]],
  ["video", ["src", "poster"]],
]);

export interface BuildStandaloneDocumentOptions {
  workspaceRoot: string;
  artifact: { id: string; kind: string; title: string | null; displayPath: string | null; directory: string; manifestPath: string; manifest: Record<string, unknown> };
  entryPath: string;
  source: string;
  scan: { entries: { manifestPath: string; manifest: Record<string, unknown> }[] };
  resolution: { selections: { theme: { entry: { manifestPath: string } | null } | null; assets: Record<string, { entry: { manifestPath: string } | null } | null> }; dependencyClosure: { manifestPath: string; kind: string; id: string }[] };
  minify?: boolean;
  maxBytes?: number;
  onAsset?: (path: string) => void;
}

export interface RewriteContext extends BundleCssOptions {
  entryPath: string;
  workspaceRoot: string;
  cssState: ReturnType<typeof createCssState>;
  counters: { stylesheets: number; scripts: number; dataFiles: number; assets: number; uiResources: number };
  warnings: { code: string; message: string }[];
  consumedAssets: Set<string>;
  assetSlots: Record<string, { id: string; dataUri: string }>;
  sharedStyles: string[];
  sharedScripts: { id: string; code: string; module: boolean }[];
  templates: { id: string; html: string }[];
  minify?: boolean;
  scan: { entries: { manifestPath: string; manifest: Record<string, unknown>; kind?: string; id?: string }[] };
  resolution: { selections: { theme: { entry: { manifestPath: string } | null } | null; assets: Record<string, { entry: { manifestPath: string } | null } | null> }; dependencyClosure: { manifestPath: string; kind: string; id: string }[] };
  onAsset?: (path: string) => void;
}

export async function buildStandaloneArtifactDocument(
  options: BuildStandaloneDocumentOptions,
): Promise<{ html: string; resources: RewriteContext["counters"]; warnings: RewriteContext["warnings"] }> {
  const document = parseHtmlDocument(options.source);
  const htmlElement = findElement(document, "html");
  const head = findElement(document, "head");
  const body = findElement(document, "body");

  if (!head || !body || !htmlElement) {
    const error = new Error(
      "Artefact HTML must contain head and body elements.",
    ) as Error & { code: string };
    error.code = "ARTIFACT_HTML_STRUCTURE_INVALID";
    throw error;
  }

  setAttribute(htmlElement, "data-mydash-standalone", "true");

  const counters = {
    stylesheets: 0,
    scripts: 0,
    dataFiles: 0,
    assets: 0,
    uiResources: 0,
  };
  const warnings: RewriteContext["warnings"] = [];
  const consumedAssets = new Set<string>();
  const cssState = createCssState();
  const sharedStyles: string[] = [];
  const sharedScripts: RewriteContext["sharedScripts"] = [];
  const templates: RewriteContext["templates"] = [];

  const embedded = await collectArtifactEmbeddedFiles({
    workspaceRoot: options.workspaceRoot,
    artifact: options.artifact,
    entryPath: options.entryPath,
    onFile(path, category) {
      if (category === "assets") {
        consumedAssets.add(path);
      }
    },
  });
  counters.dataFiles = embedded.dataCount;

  const assetResult = await resolveAssetSlots({
    workspaceRoot: options.workspaceRoot,
    scan: options.scan,
    resolution: options.resolution,
    onAsset(path) {
      consumedAssets.add(path);
    },
  });

  Object.assign(embedded.files, assetResult.files);
  counters.assets = consumedAssets.size;

  const rewriteContext: RewriteContext = {
    entryPath: options.entryPath,
    workspaceRoot: options.workspaceRoot,
    cssState,
    counters,
    warnings,
    consumedAssets,
    assetSlots: assetResult.assetSlots,
    sharedStyles,
    sharedScripts,
    templates,
    minify: options.minify,
    onAsset: options.onAsset ?? (() => undefined),
    scan: options.scan,
    resolution: options.resolution,
  };
  await processArtifactDocument(document, rewriteContext);

  await collectResolvedUiResources({
    ...options,
    cssState,
    counters,
    warnings,
    consumedAssets,
    assetSlots: assetResult.assetSlots,
    sharedStyles,
    sharedScripts,
    templates,
    onAsset: options.onAsset ?? (() => undefined),
  });

  const metadata = {
    schemaVersion: 1,
    artifact: {
      id: options.artifact.id,
      kind: options.artifact.kind,
      title: options.artifact.title,
    },
    generatedAt: new Date().toISOString(),
    sourceEntry: workspaceDisplayPath(
      options.entryPath,
      options.workspaceRoot,
    ),
    appearance: options.resolution.selections,
  };

  const runtime = createStandaloneRuntime({
    files: embedded.files,
    assetSlots: Object.fromEntries(
      Object.entries(assetResult.assetSlots).map(
        ([slot, value]) => [slot, value.dataUri],
      ),
    ),
    exportMetadata: metadata,
    resources: {
      dependencies: options.resolution.dependencyClosure,
    },
  });

  const headNodes = createNodes([
    `<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(CSP)}">`,
    `<meta name="mydash-export" content="standalone-v1">`,
    `<script data-mydash-runtime>${runtime}</script>`,
    themeStyle(options),
    sharedStyles.length > 0
      ? `<style data-mydash-shared>${escapeStyleText(
          sharedStyles.join("\n"),
        )}</style>`
      : "",
    ...sharedScripts.map(
      (script) =>
        `<script${script.module ? ' type="module"' : ""} data-mydash-shared-script="${escapeAttribute(script.id)}">${script.code}</script>`,
    ),
  ].join(""));

  prependNodes(head, headNodes);

  if (templates.length > 0) {
    appendNodes(
      body,
      createNodes(
        templates
          .map(
            (template) =>
              `<template data-mydash-resource="${escapeAttribute(
                template.id,
              )}">${template.html}</template>`,
          )
          .join(""),
      ),
    );
  }

  const html = serialiseHtml(document);

  return {
    html,
    resources: counters,
    warnings,
  };
}

async function processArtifactDocument(
  document: unknown,
  context: RewriteContext,
): Promise<void> {
  const nodes: HtmlNode[] = [];
  walkHtml(document, (node) => nodes.push(node));

  for (const node of nodes) {
    if (node.tagName === "base") {
      removeNode(node);
      context.warnings.push({
        code: "BASE_ELEMENT_REMOVED",
        message:
          "The HTML base element was removed so the standalone file uses stable embedded-resource resolution.",
      });
      continue;
    }

    if (node.tagName === "link") {
      await processLink(node, context);
      continue;
    }

    if (node.tagName === "style") {
      const css = await bundleInlineCss(
        textContent(node),
        context.entryPath,
        context,
        context.cssState,
      );
      setTextContent(node, escapeStyleText(css));
      continue;
    }

    if (node.tagName === "script") {
      await processScript(node, context);
      continue;
    }

    const inlineStyle = getAttribute(node, "style");
    if (inlineStyle) {
      setAttribute(
        node,
        "style",
        await bundleStyleAttribute(
          inlineStyle,
          context.entryPath,
          context,
        ),
      );
    }

    await applyAssetSlot(node, context);
    await inlineElementResources(node, context);
  }
}

async function processLink(node: HtmlNode, context: RewriteContext): Promise<void> {
  const relation = (
    getAttribute(node, "rel") ?? ""
  ).toLowerCase();
  const href = getAttribute(node, "href");

  if (!href) return;

  if (relation.includes("stylesheet")) {
    const resolved = await resolveExportSourcePath(
      context.entryPath,
      href,
      context.workspaceRoot,
    );

    if (resolved.kind !== "file" || !resolved.path) {
      throw exportError(
        "STYLESHEET_NOT_LOCAL",
        `Stylesheet must be a local file: ${href}`,
      );
    }

    const css = await bundleCssFile(
      resolved.path,
      context,
      context.cssState,
    );
    replaceNode(
      node,
      createNodes(
        `<style data-mydash-source="${escapeAttribute(
          workspaceDisplayPath(
            resolved.path,
            context.workspaceRoot,
          ),
        )}">${escapeStyleText(css)}</style>`,
      ),
    );
    context.counters.stylesheets += 1;
    return;
  }

  if (
    relation.includes("preload") ||
    relation.includes("prefetch") ||
    relation.includes("modulepreload")
  ) {
    removeNode(node);
    return;
  }

  if (
    relation.includes("icon") ||
    relation.includes("manifest")
  ) {
    const resolved = await resolveExportSourcePath(
      context.entryPath,
      href,
      context.workspaceRoot,
    );

    if (resolved.kind === "file" && resolved.path) {
      const content = await readFile(resolved.path);
      setAttribute(
        node,
        "href",
        toDataUri(
          content,
          mediaTypeForPath(resolved.path),
        ),
      );
      context.consumedAssets.add(resolved.path);
      context.counters.assets = context.consumedAssets.size;
    }
  }
}

async function processScript(node: HtmlNode, context: RewriteContext): Promise<void> {
  const type = (
    getAttribute(node, "type") ?? ""
  ).toLowerCase();

  if (
    type &&
    ![
      "module",
      "text/javascript",
      "application/javascript",
    ].includes(type)
  ) {
    return;
  }

  const sourceReference = getAttribute(node, "src");
  let bundled: { code: string; css: string[]; module: boolean };

  if (sourceReference) {
    const resolved = await resolveExportSourcePath(
      context.entryPath,
      sourceReference,
      context.workspaceRoot,
    );

    if (resolved.kind !== "file" || !resolved.path) {
      throw exportError(
        "SCRIPT_NOT_LOCAL",
        `Script must be a local file: ${sourceReference}`,
      );
    }

    bundled = await bundleJavaScriptFile(
      resolved.path,
      {
        minify: context.minify,
        module: type === "module",
      },
    );
    removeAttribute(node, "src");
    removeAttribute(node, "integrity");
    removeAttribute(node, "crossorigin");
  } else {
    const source = textContent(node);
    if (!source.trim()) return;

    bundled = await bundleInlineJavaScript(
      source,
      context.entryPath,
      {
        minify: context.minify,
        module: type === "module",
      },
    );
  }

  setTextContent(node, bundled.code);

  if (bundled.module) {
    setAttribute(node, "type", "module");
  } else {
    removeAttribute(node, "type");
  }

  if (bundled.css.length > 0) {
    context.sharedStyles.push(...bundled.css);
    context.warnings.push({
      code: "SCRIPT_CSS_EMITTED",
      message:
        "A JavaScript bundle emitted CSS; it was added to the shared export stylesheet.",
    });
  }

  removeAttribute(node, "async");
  removeAttribute(node, "defer");
  removeAttribute(node, "nomodule");
  context.counters.scripts += 1;
}

async function applyAssetSlot(node: HtmlNode, context: RewriteContext): Promise<void> {
  const slot = getAttribute(node, "data-mydash-asset");
  if (!slot) return;

  const asset = context.assetSlots[slot];
  if (!asset) {
    throw exportError(
      "ASSET_SLOT_UNRESOLVED",
      `HTML references unresolved asset slot ${slot}.`,
    );
  }

  const attribute =
    node.tagName === "object"
      ? "data"
      : node.tagName === "link"
        ? "href"
        : "src";

  setAttribute(node, attribute, asset.dataUri);
  setAttribute(node, "data-mydash-asset-id", asset.id);
}

async function inlineElementResources(
  node: HtmlNode,
  context: RewriteContext,
): Promise<void> {
  const attributes = RESOURCE_ATTRIBUTES.get(node.tagName ?? "") ?? [];

  for (const attribute of attributes) {
    const value = getAttribute(node, attribute);
    if (!value || value.startsWith("data:") || value.startsWith("#")) {
      continue;
    }

    if (attribute === "srcset") {
      setAttribute(
        node,
        attribute,
        await inlineSrcset(value, context),
      );
      continue;
    }

    if (node.tagName === "iframe") {
      throw exportError(
        "IFRAME_SOURCE_UNSUPPORTED",
        `Standalone export does not inline iframe source ${value}. Use srcdoc or remove the iframe.`,
      );
    }

    const resolved = await resolveExportSourcePath(
      context.entryPath,
      value,
      context.workspaceRoot,
    );

    if (resolved.kind !== "file" || !resolved.path) continue;

    const content = await readFile(resolved.path);
    setAttribute(
      node,
      attribute,
      toDataUri(
        content,
        mediaTypeForPath(resolved.path),
      ) + resolved.suffix,
    );
    context.consumedAssets.add(resolved.path);
    context.counters.assets = context.consumedAssets.size;
  }
}

async function inlineSrcset(value: string, context: RewriteContext): Promise<string> {
  const candidates = value
    .split(",")
    .map((candidate) => candidate.trim())
    .filter(Boolean);
  const output: string[] = [];

  for (const candidate of candidates) {
    const [reference, ...descriptor] =
      candidate.split(/\s+/);

    if (!reference) continue;

    if (reference.startsWith("data:")) {
      output.push(candidate);
      continue;
    }

    const resolved = await resolveExportSourcePath(
      context.entryPath,
      reference,
      context.workspaceRoot,
    );

    if (resolved.kind !== "file" || !resolved.path) continue;

    const content = await readFile(resolved.path);
    const dataUri = toDataUri(
      content,
      mediaTypeForPath(resolved.path),
    );
    output.push(
      [dataUri, ...descriptor].join(" "),
    );
    context.consumedAssets.add(resolved.path);
  }

  context.counters.assets = context.consumedAssets.size;
  return output.join(", ");
}

async function collectResolvedUiResources(context: RewriteContext): Promise<void> {
  const seen = new Set<string>();

  for (const publicEntry of context.resolution.dependencyClosure as { manifestPath: string; kind: string; id: string }[]) {
    if (
      !["layout", "component", "primitive"].includes(
        publicEntry.kind,
      )
    ) {
      continue;
    }

    const entry = context.scan.entries.find(
      (candidate) =>
        candidate.manifestPath === publicEntry.manifestPath,
    );

    if (!entry || seen.has(entry.manifestPath)) continue;
    seen.add(entry.manifestPath);
    const entryKind = (entry as { kind?: string }).kind ?? publicEntry.kind;
    const entryId = (entry as { id?: string }).id ?? publicEntry.id;

    const sourcePath = await resolveUiEntry(
      entry,
      context.workspaceRoot,
    );
    const extension = extname(sourcePath).toLowerCase();
    const id = entryKind + ":" + entryId;

    if (extension === ".css") {
      context.sharedStyles.push(
        await bundleCssFile(
          sourcePath,
          context,
          context.cssState,
        ),
      );
    } else if (
      [".js", ".mjs", ".jsx", ".ts", ".tsx"].includes(
        extension,
      )
    ) {
      const bundled = await bundleJavaScriptFile(
        sourcePath,
        {
          minify: context.minify,
          module:
            extension === ".mjs" ||
            (entry.manifest.module as boolean | undefined) === true,
        },
      );
      context.sharedScripts.push({
        id,
        code: bundled.code,
        module: bundled.module,
      });
      context.sharedStyles.push(...bundled.css);
    } else if (
      extension === ".html" ||
      extension === ".htm"
    ) {
      const html = await readFile(sourcePath, "utf8");
      context.templates.push({
        id,
        html,
      });
    } else {
      throw exportError(
        "UI_ENTRY_FORMAT_UNSUPPORTED",
        `Unsupported UI entry format for ${id}: ${extension}`,
      );
    }

    context.counters.uiResources += 1;
  }
}

async function resolveUiEntry(
  entry: { manifestPath: string; manifest: Record<string, unknown> },
  workspaceRoot: string,
): Promise<string> {
  const reference = entry.manifest.entry as string | undefined;

  if (!reference) {
    throw exportError(
      "UI_ENTRY_MISSING",
      `${entry.manifestPath} has no entry file.`,
    );
  }

  const resolved = await resolveExportSourcePath(
    entry.manifestPath,
    reference,
    workspaceRoot,
  );

  if (resolved.kind !== "file" || !resolved.path) {
    throw exportError(
      "UI_ENTRY_INVALID",
      `${entry.manifestPath} entry is not a local file.`,
    );
  }

  return resolved.path;
}

function themeStyle(options: BuildStandaloneDocumentOptions): string {
  const selection = options.resolution.selections.theme;
  if (!selection?.entry?.manifestPath) return "";

  const entry = options.scan.entries.find(
    (candidate) =>
      candidate.manifestPath ===
      selection.entry?.manifestPath,
  );
  const tokens = flattenTokens((entry?.manifest.tokens ?? {}) as Record<string, unknown>);
  const declarations = Object.entries(tokens)
    .map(([key, value]) => {
      const name = key.startsWith("--")
        ? key
        : `--${normaliseTokenName(key)}`;

      return `${name}:${escapeCssValue(value as string | number | boolean)};`;
    })
    .join("");

  return declarations
    ? `<style data-mydash-theme="true">:root{${declarations}}</style>`
    : "";
}

function flattenTokens(value: Record<string, unknown>, prefix = "", output: Record<string, unknown> = {}): Record<string, unknown> {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}-${key}` : key;

    if (
      child !== null &&
      typeof child === "object" &&
      !Array.isArray(child)
    ) {
      flattenTokens(child as Record<string, unknown>, path, output);
    } else {
      output[path] = child;
    }
  }

  return output;
}

function normaliseTokenName(value: string): string {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeCssValue(value: string | number | boolean): string {
  return String(value)
    .replace(/[{};]/g, "")
    .trim();
}

function escapeAttribute(value: string): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeStyleText(value: string): string {
  return value;
}

function exportError(code: string, message: string): Error {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}