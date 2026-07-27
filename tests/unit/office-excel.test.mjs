import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  extractTable,
  inspectWorkbook,
  listFormulas,
  previewWorksheet,
} from "../../src/office/excel.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(
  testDirectory,
  "../fixtures/office/sample.xlsx",
);

test("Excel inspection reports sheets, tables and formulas", async () => {
  const result = await inspectWorkbook(fixture);

  assert.equal(result.sheetCount, 2);
  assert.equal(result.features.tableCount, 1);
  assert.equal(result.formulaCellCount, 1);
  assert.equal(result.sheets[1].state, "hidden");
});

test("Excel preview returns a bounded matrix", async () => {
  const result = await previewWorksheet(fixture, {
    sheet: "Summary",
    range: "A1:B3",
  });

  assert.deepEqual(result.matrix, [
    ["Status", "Count"],
    ["Approved", 12],
    ["Review", 3],
  ]);
});

test("Excel table extraction produces records", async () => {
  const result = await extractTable(fixture, "StatusTable");

  assert.equal(result.table, "StatusTable");
  assert.deepEqual(result.records, [
    { Status: "Approved", Count: 12 },
    { Status: "Review", Count: 3 },
  ]);
});

test("Formula listing never recalculates formulas", async () => {
  const result = await listFormulas(fixture);

  assert.equal(result.formulas.length, 1);
  assert.equal(result.formulas[0].formula, "SUM(B2:B3)");
  assert.equal(result.formulas[0].result, 15);
});
