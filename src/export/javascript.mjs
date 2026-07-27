import { build } from "esbuild";
import { dirname, extname } from "node:path";

const LOADER = {
  ".avif": "dataurl",
  ".bmp": "dataurl",
  ".csv": "text",
  ".gif": "dataurl",
  ".html": "text",
  ".ico": "dataurl",
  ".jpeg": "dataurl",
  ".jpg": "dataurl",
  ".json": "json",
  ".png": "dataurl",
  ".svg": "dataurl",
  ".txt": "text",
  ".webp": "dataurl",
  ".woff": "dataurl",
  ".woff2": "dataurl",
};

export async function bundleJavaScriptFile(path, options = {}) {
  const moduleScript =
    options.module ??
    [".mjs", ".mts"].includes(extname(path).toLowerCase());

  return buildJavaScript({
    entryPoints: [path],
    moduleScript,
    options,
  });
}

export async function bundleInlineJavaScript(
  source,
  baseFile,
  options = {},
) {
  return buildJavaScript({
    stdin: {
      contents: String(source),
      resolveDir: dirname(baseFile),
      sourcefile: `${baseFile}#inline-script`,
      loader: options.loader ?? "js",
    },
    moduleScript: options.module ?? false,
    options,
  });
}

async function buildJavaScript({
  entryPoints,
  stdin,
  moduleScript,
  options,
}) {
  let result;

  try {
    result = await build({
      ...(entryPoints ? { entryPoints } : {}),
      ...(stdin ? { stdin } : {}),
      bundle: true,
      write: false,
      platform: "browser",
      format: moduleScript ? "esm" : "iife",
      target: ["es2020"],
      minify: options.minify ?? false,
      sourcemap: false,
      legalComments: "none",
      treeShaking: true,
      charset: "utf8",
      loader: LOADER,
      logLevel: "silent",
      define: {
        "process.env.NODE_ENV": '"production"',
      },
    });
  } catch (error) {
    const wrapped = new Error(
      `JavaScript bundling failed: ${formatBuildError(error)}`,
    );
    wrapped.code = "JAVASCRIPT_BUNDLE_FAILED";
    throw wrapped;
  }

  let code = "";
  const css = [];

  for (const output of result.outputFiles ?? []) {
    if (output.path.endsWith(".css")) {
      css.push(output.text);
    } else {
      code += output.text;
    }
  }

  return {
    code: escapeScriptText(code),
    css,
    module: moduleScript,
  };
}

export function escapeScriptText(value) {
  return String(value)
    .replace(/<\/script/gi, "<\\/script")
    .replace(/<!--/g, "<\\!--");
}

function formatBuildError(error) {
  if (Array.isArray(error?.errors) && error.errors.length > 0) {
    return error.errors
      .map((entry) => entry.text)
      .join("; ");
  }

  return error instanceof Error ? error.message : String(error);
}
