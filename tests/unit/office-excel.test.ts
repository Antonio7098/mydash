import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import {
  extractTable,
  inspectWorkbook,
  listFormulas,
  previewWorksheet,
} from "../../src/office/excel.js";

const fixture = resolve(process.cwd(), "tests/fixtures/office/sample.xlsx");

test("Excel inspection reports sheets, tables and formulas", async () => {
  const result = await inspectWorkbook(fixture);

  assert.equal(result.sheetCount, 2);
  assert.equal(result.features.tableCount, 1);
  assert.equal(result.formulaCellCount, 1);

  const hiddenSheet = result.sheets[1];

  if (!hiddenSheet) throw new Error("Expected hidden worksheet.");

  assert.equal(hiddenSheet.state, "hidden");
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

  const formula = result.formulas[0];

  if (!formula) throw new Error("Expected formula.");

  assert.equal(formula.formula, "SUM(B2:B3)");
  assert.equal(formula.result, 15);
});
