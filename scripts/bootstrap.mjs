#!/usr/bin/env node

import { readdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import process from "node:process";

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptsDirectory, "..");
const argumentsList = process.argv.slice(2);

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  const steps = await discoverSteps();

  if (argumentsList.includes("--list") || argumentsList.length === 0) {
    printSteps(steps);
    return;
  }

  const selected = selectSteps(steps, argumentsList);

  if (selected.length === 0) {
    throw new Error("No bootstrap scripts matched the requested selection.");
  }

  for (const step of selected) {
    console.log(`\n=== Running ${step.file} ===\n`);

    const result = spawnSync(process.execPath, [join(scriptsDirectory, step.file)], {
      cwd: projectRoot,
      stdio: "inherit",
      shell: false,
    });

    if (result.error) throw result.error;

    if (result.status !== 0) {
      throw new Error(
        `Bootstrap stopped because ${step.file} exited with code ${result.status}.`,
      );
    }
  }
}

async function discoverSteps() {
  const entries = await readdir(scriptsDirectory, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && /^\d{2}-.+\.mjs$/.test(entry.name))
    .map((entry) => ({
      number: Number.parseInt(entry.name.slice(0, 2), 10),
      file: entry.name,
      name: basename(entry.name, ".mjs"),
    }))
    .sort((left, right) => left.number - right.number);
}

function selectSteps(steps, argv) {
  const exact = argv.find((value) => /^\d{1,2}$/.test(value));
  const throughIndex = argv.indexOf("--through");
  const fromIndex = argv.indexOf("--from");

  if (argv.includes("--all")) {
    return steps;
  }

  if (exact) {
    const number = Number.parseInt(exact, 10);
    return steps.filter((step) => step.number === number);
  }

  if (throughIndex >= 0) {
    const raw = argv[throughIndex + 1];
    if (!raw || !/^\d{1,2}$/.test(raw)) {
      throw new Error("--through requires a numeric bootstrap step.");
    }

    const number = Number.parseInt(raw, 10);
    return steps.filter((step) => step.number <= number);
  }

  if (fromIndex >= 0) {
    const raw = argv[fromIndex + 1];
    if (!raw || !/^\d{1,2}$/.test(raw)) {
      throw new Error("--from requires a numeric bootstrap step.");
    }

    const number = Number.parseInt(raw, 10);
    return steps.filter((step) => step.number >= number);
  }

  throw new Error(
    "Use --list, --all, --through <number>, --from <number>, or a step number.",
  );
}

function printSteps(steps) {
  console.log("Available bootstrap scripts:");

  for (const step of steps) {
    console.log(`  ${String(step.number).padStart(2, "0")}  ${step.file}`);
  }

  console.log("\nExamples:");
  console.log("  node scripts/bootstrap.mjs 02");
  console.log("  node scripts/bootstrap.mjs --through 05");
  console.log("  node scripts/bootstrap.mjs --all");
}
