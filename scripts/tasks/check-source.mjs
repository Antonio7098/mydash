#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ignored = new Set([".git", "node_modules", ".my-dashboards", "exports", "dist", "build-test"]);
const files = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const path = resolve(directory, entry.name);

    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile()) files.push(path);
  }
}

await walk(root);
const fileSet = new Set(files);
let failures = 0;
let tsCount = 0;
let jsCount = 0;
let jsonCount = 0;
let importCount = 0;

for (const path of files) {
  const extension = extname(path);
  const sourcePath = relative(root, path).replaceAll("\\", "/");

  if ([".js", ".mjs", ".cjs"].includes(extension)) {
    jsCount += 1;
  } else if (extension === ".ts" || extension === ".d.ts") {
    tsCount += 1;
  }

  if (extension === ".json") {
    jsonCount += 1;
    try {
      JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      failures += 1;
      process.stderr.write(`${path}: ${error.message}\n`);
    }
    continue;
  }

  if (![".js", ".mjs", ".cjs", ".ts"].includes(extension)) {
    continue;
  }

  if (/^scripts\/\d{2}-/.test(sourcePath)) continue;
  if (/^scripts\/tasks\//.test(sourcePath)) continue;
  if (/^bin\//.test(sourcePath)) continue;
  void sourcePath;

  const source = await readFile(path, "utf8");
  const pattern = /(?:import\s+(?:[^"']+?\s+from\s+)?|export\s+[^"']+?\s+from\s+|import\s*\()(["'])(\.[^"']+)\1/g;
  const isTypeScriptSource = extension === ".ts";

  for (const match of source.matchAll(pattern)) {
    importCount += 1;
    const target = resolve(dirname(path), match[2]);
    const withoutJs = target.endsWith(".js") ? target.slice(0, -3) : target;
    const tsCandidate = `${withoutJs}.ts`;
    const jsCandidate = `${withoutJs}.js`;

    if (isTypeScriptSource) {
      if (!fileSet.has(target) && !fileSet.has(tsCandidate) && !fileSet.has(jsCandidate)) {
        failures += 1;
        process.stderr.write(`${path}: missing relative import ${match[2]}\n`);
      }
    } else if (!fileSet.has(target) && !fileSet.has(jsCandidate)) {
      failures += 1;
      process.stderr.write(`${path}: missing relative import ${match[2]}\n`);
    }
  }
}

for (const required of [
  "README.md",
  "package.json",
  "tsconfig.json",
  "tsconfig.build.json",
  "tsconfig.test.json",
  "config/workspace.json",
  "bin/mydash.mjs",
  "ui/index.html",
  "library/dashboards/ai-use-case-governance/artifact.json",
]) {
  if (!fileSet.has(resolve(root, required))) {
    failures += 1;
    process.stderr.write(`Missing required source file: ${required}\n`);
  }
}

process.stdout.write(
  `Source check: ${jsCount} JavaScript modules, ${tsCount} TypeScript modules, ${jsonCount} JSON documents, ${importCount} relative imports.\n`,
);

if (failures > 0) {
  process.stderr.write(`Source check failed with ${failures} issue(s).\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Source check passed.\n");
}
