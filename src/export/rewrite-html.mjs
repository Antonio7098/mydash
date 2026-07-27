import {
  readFile,
} from "node:fs/promises";
import {
  extname,
} from "node:path";
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
} from "./html-tree.mjs";
import {
  bundleCssFile,
  bundleInlineCss,
  bundleStyleAttribute,
  createCssState,
} from "./css.mjs";
import {
  bundleInlineJavaScript,
  bundleJavaScriptFile,
  escapeScriptText,
} from "./javascript.mjs";
import {
  mediaTypeForPath,
  toDataUri,
} from "./mime.mjs";
import {
  resolveExportSourcePath,
  workspaceDisplayPath,
} from "./paths.mjs";
import {
  collectArtifactEmbeddedFiles,
  resolveAssetSlots,
} from "./resources.mjs";
import {
  createStandaloneRuntime,
} from "./runtime.mjs";

const CSP =
  "default-src 'none'; img-src data:; media-src data:; font-src data:; " +
  "style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; " +
  "object-src 'none'; frame-src data:; base-uri 'none'; form-action 'none'";

const RESOURCE_ATTRIBUTES = new Map([
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

export async function buildStandaloneArtifactDocument(options) {
  const document = parseHtmlDocument(options.source);
  const head = findElement(document, "head");
  const body = findElement(document, "body");

  if (!head || !body) {
    const error = new Error(
      "Artefact HTML must contain head and body elements.",
    );
    error.code = "ARTIFACT_HTML_STRUCTURE_INVALID";
    throw error;
  }

  const counters = {
    stylesheets: 0,
    scripts: 0,
    dataFiles: 0,
    assets: 0,
    uiResources: 0,
  };
  const warnings = [];
  const consumedAssets = new Set();
  const cssState = createCssState();
  const sharedStyles = [];
  const sharedScripts = [];
  const templates = [];

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

  await processArtifactDocument(document, {
    ...options,
    cssState,
    counters,
    warnings,
    consumedAssets,
    assetSlots: assetResult.assetSlots,
    sharedStyles,
    onAsset(path) {
      consumedAssets.add(path);
      counters.assets = consumedAssets.size;
    },
  });

  await collectResolvedUiResources({
    ...options,
    cssState,
    counters,
    warnings,
    consumedAssets,
    sharedStyles,
    sharedScripts,
    templates,
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

async function processArtifactDocument(document, context) {
  const nodes = [];
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

async function processLink(node, context) {
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

    if (resolved.kind !== "file") {
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

    if (resolved.kind === "file") {
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
      context.counters.assets =
        context.consumedAssets.size;
    }
  }
}

async function processScript(node, context) {
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
  let bundled;

  if (sourceReference) {
    const resolved = await resolveExportSourcePath(
      context.entryPath,
      sourceReference,
      context.workspaceRoot,
    );

    if (resolved.kind !== "file") {
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

async function applyAssetSlot(node, context) {
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

async function inlineElementResources(node, context) {
  const attributes =
    RESOURCE_ATTRIBUTES.get(node.tagName) ?? [];

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

    if (resolved.kind !== "file") continue;

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
    context.counters.assets =
      context.consumedAssets.size;
  }
}

async function inlineSrcset(value, context) {
  const candidates = value
    .split(",")
    .map((candidate) => candidate.trim())
    .filter(Boolean);
  const output = [];

  for (const candidate of candidates) {
    const [reference, ...descriptor] =
      candidate.split(/\s+/);

    if (reference.startsWith("data:")) {
      output.push(candidate);
      continue;
    }

    const resolved = await resolveExportSourcePath(
      context.entryPath,
      reference,
      context.workspaceRoot,
    );
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

  context.counters.assets =
    context.consumedAssets.size;
  return output.join(", ");
}

async function collectResolvedUiResources(context) {
  const seen = new Set();

  for (const publicEntry of context.resolution.dependencyClosure) {
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

    const sourcePath = await resolveUiEntry(
      entry,
      context.workspaceRoot,
    );
    const extension = extname(sourcePath).toLowerCase();
    const id = `${entry.kind}:${entry.id}`;

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
            entry.manifest.module === true,
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

async function resolveUiEntry(entry, workspaceRoot) {
  const reference = entry.manifest.entry;

  if (!reference) {
    throw exportError(
      "UI_ENTRY_MISSING",
      `${entry.kind}:${entry.id} has no entry file.`,
    );
  }

  const resolved = await resolveExportSourcePath(
    entry.manifestPath,
    reference,
    workspaceRoot,
  );

  if (resolved.kind !== "file") {
    throw exportError(
      "UI_ENTRY_INVALID",
      `${entry.kind}:${entry.id} entry is not a local file.`,
    );
  }

  return resolved.path;
}

function themeStyle(options) {
  const selection = options.resolution.selections.theme;
  if (!selection?.entry?.manifestPath) return "";

  const entry = options.scan.entries.find(
    (candidate) =>
      candidate.manifestPath ===
      selection.entry.manifestPath,
  );
  const tokens = flattenTokens(entry?.manifest.tokens ?? {});
  const declarations = Object.entries(tokens)
    .map(([key, value]) => {
      const name = key.startsWith("--")
        ? key
        : `--${normaliseTokenName(key)}`;

      return `${name}:${escapeCssValue(value)};`;
    })
    .join("");

  return declarations
    ? `<style data-mydash-theme="true">:root{${declarations}}</style>`
    : "";
}

function flattenTokens(value, prefix = "", output = {}) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}-${key}` : key;

    if (
      child !== null &&
      typeof child === "object" &&
      !Array.isArray(child)
    ) {
      flattenTokens(child, path, output);
    } else {
      output[path] = child;
    }
  }

  return output;
}

function normaliseTokenName(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeCssValue(value) {
  return String(value)
    .replace(/[{};]/g, "")
    .trim();
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

function escapeStyleText(value) {
  return String(value).replace(/<\/style/gi, "<\\/style");
}

function exportError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
