import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { loadDataset } from "../../src/data/load.js";
import { profileDataset } from "../../src/data/profile.js";
import {
  deduplicateRecords,
  filterRecords,
  selectColumns,
} from "../../src/data/transform.js";

const csvFixture = resolve(process.cwd(), "tests/fixtures/data/sample.csv");

test("CSV loading produces records and columns", async () => {
  const result = await loadDataset(csvFixture);

  assert.equal(result.rowCount, 4);
  assert.deepEqual(result.columns, [
    "id",
    "status",
    "owner",
    "amount",
    "created",
  ]);
});

test("Profiling finds duplicates, nulls and numeric ranges", async () => {
  const result = await profileDataset(csvFixture);
  const amount = result.columns.find(
    (column) => column.name === "amount",
  );
  const status = result.columns.find(
    (column) => column.name === "status",
  );

  assert.equal(result.duplicateRowCount, 1);
  if (!amount) throw new Error("amount column not found");
  if (!status) throw new Error("status column not found");
  assert.equal(amount.type, "integer");
  assert.equal(amount.minimum, 100);
  assert.equal(amount.maximum, 1200);
  assert.equal(status.nullCount, 1);
});

test("Selection, filtering and deduplication compose safely", async () => {
  const dataset = await loadDataset(csvFixture);
  const filtered = filterRecords(
    dataset.records,
    "amount>=700",
  ).records;
  const deduplicated = deduplicateRecords(
    filtered,
    ["id"],
  ).records;
  const selected = selectColumns(
    deduplicated,
    ["id", "amount"],
  );

  assert.deepEqual(selected, [
    { id: "UC-001", amount: "1200" },
    { id: "UC-002", amount: "750" },
  ]);
});
