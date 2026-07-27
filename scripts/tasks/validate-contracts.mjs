#!/usr/bin/env node

import { readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { readJson, validateDocument } from "../../src/validation/contracts.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "../..");
const fixturesRoot = join(projectRoot, "tests", "fixtures", "contracts");
const schemasRoot = join(projectRoot, "config", "schemas");

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  const schemaFiles = (await readdir(schemasRoot))
    .filter((name) => name.endsWith(".schema.json"))
    .sort();

  if (schemaFiles.length === 0) {
    throw new Error("No contract schemas were found.");
  }

  for (const file of schemaFiles) {
    const value = await readJson(join(schemasRoot, file));

    if (
      value.$schema !== "https://json-schema.org/draft/2020-12/schema" ||
      typeof value.$id !== "string" ||
      !value.$id
    ) {
      throw new Error(`Schema metadata is incomplete: ${file}`);
    }
  }

  const cases = await readJson(join(fixturesRoot, "cases.json"));
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new Error("Contract fixture cases are missing or empty.");
  }

  let passed = 0;

  for (const testCase of cases) {
    const filePath = join(fixturesRoot, testCase.file);
    const fileStat = await stat(filePath);

    if (!fileStat.isFile()) {
      throw new Error(`Fixture is not a file: ${testCase.file}`);
    }

    const document = await readJson(filePath);
    const result = validateDocument(testCase.contract, document);

    if (result.ok !== testCase.valid) {
      const details = result.errors
        .map((error) => `${error.path}: ${error.message}`)
        .join("\n");

      throw new Error(
        [
          `Fixture result did not match expectation: ${testCase.file}`,
          `Expected valid: ${testCase.valid}`,
          `Actual valid: ${result.ok}`,
          details
        ].filter(Boolean).join("\n"),
      );
    }

    passed += 1;
  }

  console.log(
    `Contract validation passed: ${schemaFiles.length} schemas and ${passed} fixtures.`,
  );
}
