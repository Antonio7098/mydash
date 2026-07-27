#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ignored = new Set([".git", "node_modules", ".my-dashboards", "exports"]);
const files = [];
await walk(root);
const fileSet = new Set(files);
let failures = 0;
let jsCount = 0;
let jsonCount = 0;
let importCount = 0;

for (const path of files) {
  const extension = extname(path);

  if ([".js", ".mjs"].includes(extension)) {
    jsCount += 1;
    const result = spawnSync(process.execPath, ["--check", path], {
      cwd: root,
      encoding: "utf8",
      shell: false,
    });

    if (result.status !== 0) {
      failures += 1;
      process.stderr.write(`${path}\n${result.stderr}\n`);
    }

    const source = await readFile(path, "utf8");
    const sourcePath = relative(root, path).replaceAll("\\", "/");
    if (/^scripts\/\d{2}-/.test(sourcePath)) continue;
    const pattern = /(?:import\s+(?:[^"']+?\s+from\s+)?|export\s+[^"']+?\s+from\s+|import\s*\()(["'])(\.[^"']+)\1/g;

    for (const match of source.matchAll(pattern)) {
      importCount += 1;
      const target = resolve(dirname(path), match[2]);

      if (!fileSet.has(target)) {
        failures += 1;
        process.stderr.write(`${path}: missing relative import ${match[2]}\n`);
      }
    }
  }

  if (extension === ".json") {
    jsonCount += 1;

    try {
      JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      failures += 1;
      process.stderr.write(`${path}: ${error.message}\n`);
    }
  }
}

for (const required of [
  "README.md",
  "package.json",
  "config/workspace.json",
  "server/start.mjs",
  "ui/index.html",
  "library/dashboards/ai-use-case-governance/artifact.json",
]) {
  if (!fileSet.has(resolve(root, required))) {
    failures += 1;
    process.stderr.write(`Missing required source file: ${required}\n`);
  }
}

process.stdout.write(
  `Source check: ${jsCount} JavaScript modules, ${jsonCount} JSON documents, ${importCount} relative imports.\n`,
);

if (failures > 0) {
  process.stderr.write(`Source check failed with ${failures} issue(s).\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Source check passed.\n");
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const path = resolve(directory, entry.name);

    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile()) files.push(path);
  }
}
