import { build } from "esbuild";
import { dirname, extname } from "node:path";

const LOADER: Record<string, "dataurl" | "text" | "json"> = {
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

export interface BundleJavaScriptOptions {
  minify?: boolean;
  module?: boolean;
  loader?: "js" | "ts" | "tsx" | "jsx" | "json" | "text" | "css" | "base64" | "dataurl" | "file" | "binary" | "default" | "empty";
}

export interface JavaScriptBundleResult {
  code: string;
  css: string[];
  module: boolean;
}

export async function bundleJavaScriptFile(
  path: string,
  options: BundleJavaScriptOptions = {},
): Promise<JavaScriptBundleResult> {
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
  source: string,
  baseFile: string,
  options: BundleJavaScriptOptions = {},
): Promise<JavaScriptBundleResult> {
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

async function buildJavaScript(options: {
  entryPoints?: string[];
  stdin?: {
    contents: string;
    resolveDir: string;
    sourcefile: string;
    loader: "js" | "ts" | "tsx" | "jsx" | "json" | "text" | "css" | "base64" | "dataurl" | "file" | "binary" | "default" | "empty";
  };
  moduleScript: boolean;
  options: BundleJavaScriptOptions;
}): Promise<JavaScriptBundleResult> {
  let result: { outputFiles?: { path: string; text: string }[] };
  try {
    result = await build({
      ...(options.entryPoints ? { entryPoints: options.entryPoints } : {}),
      ...(options.stdin ? { stdin: options.stdin } : {}),
      bundle: true,
      write: false,
      platform: "browser",
      format: options.moduleScript ? "esm" : "iife",
      target: ["es2022"],
      minify: options.options.minify ?? false,
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
    ) as Error & { code: string };
    wrapped.code = "JAVASCRIPT_BUNDLE_FAILED";
    throw wrapped;
  }

  let code = "";
  const css: string[] = [];

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
    module: options.moduleScript,
  };
}

export function escapeScriptText(value: string): string {
  return String(value)
    .replace(/<\/script/gi, "<\\/script")
    .replace(/<!--/g, "<\\!--");
}

function formatBuildError(error: unknown): string {
  if (Array.isArray((error as { errors?: { text?: string }[] })?.errors) && (error as { errors?: { text?: string }[] }).errors!.length > 0) {
    return (error as { errors: { text?: string }[] }).errors
      .map((entry) => entry.text)
      .join("; ");
  }

  return error instanceof Error ? error.message : String(error);
}