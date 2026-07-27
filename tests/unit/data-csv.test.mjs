import assert from "node:assert/strict";
import test from "node:test";
import {
  csvToRecords,
  parseCsv,
  recordsToCsv,
} from "../../src/data/csv.mjs";

test("CSV parser supports quoted delimiters and newlines", () => {
  const rows = parseCsv(
    'id,notes\n1,"hello, world"\n2,"two\nlines"\n',
  );

  assert.deepEqual(rows, [
    ["id", "notes"],
    ["1", "hello, world"],
    ["2", "two\nlines"],
  ]);
});

test("CSV records handle duplicate and missing headings", () => {
  const result = csvToRecords("id,id,\n1,2,3\n");

  assert.deepEqual(result.columns, ["id", "id-2", "column-3"]);
  assert.deepEqual(result.records, [
    {
      id: "1",
      "id-2": "2",
      "column-3": "3",
    },
  ]);
});

test("CSV writing escapes special values", () => {
  const output = recordsToCsv([
    {
      id: "1",
      notes: 'hello, "world"',
    },
  ]);

  assert.equal(
    output,
    'id,notes\n1,"hello, ""world"""',
  );
});
