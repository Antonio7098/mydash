import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { identifyFile } from "../../src/files/identify.js";
import { hashFile } from "../../src/files/hash.js";
import { buildTree } from "../../src/files/tree.js";
import { findFiles, globToRegExp } from "../../src/files/find.js";
import { createSafeName } from "../../src/files/safe-name.js";
import { writeFileAtomic } from "../../src/files/output.js";

test("safe-name preserves and normalises an extension", () => {
  const result = createSafeName("Quarterly Review (Final).xlsx");

  assert.equal(result.safeName, "quarterly-review-final.xlsx");
});

test("safe-name supports an explicit extension", () => {
  const result = createSafeName("Agent Hub Overview", {
    extension: "HTML",
  });

  assert.equal(result.safeName, "agent-hub-overview.html");
});

test("file identification recognises JSON", async () => {
  const path = resolve(process.cwd(), "tests/fixtures/files/sample.json");
  const result = await identifyFile(path);

  assert.equal(result.type, "json");
  assert.equal(result.mediaType, "application/json");
});

test("hashing produces the expected SHA-256 digest", async () => {
  const path = resolve(process.cwd(), "tests/fixtures/files/sample.csv");
  const content = await readFile(path);
  const expected = createHash("sha256").update(content).digest("hex");
  const result = await hashFile(path);

  assert.equal(result.hash, expected);
});

test("glob patterns support recursive matching", () => {
  const expression = globToRegExp("**/*.json");

  assert.equal(expression.test("sample.json"), true);
  assert.equal(expression.test("nested/sample.json"), true);
  assert.equal(expression.test("nested/sample.csv"), false);
});

test("tree and find are deterministic", async () => {
  const root = await mkdtemp(join(tmpdir(), "mydash-files-"));

  try {
    await writeFile(join(root, "b.txt"), "b");
    await writeFile(join(root, "a.txt"), "a");

    const tree = await buildTree(root, { maxDepth: 2 });
    assert.deepEqual(
      tree.entries.map((entry) => entry.name),
      ["a.txt", "b.txt"],
    );

    const found = await findFiles(root, "*.txt");
    assert.deepEqual(
      found.matches.map((entry) => entry.path),
      ["a.txt", "b.txt"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("atomic output refuses accidental overwrite", async () => {
  const root = await mkdtemp(join(tmpdir(), "mydash-output-"));

  try {
    const path = join(root, "result.txt");

    await writeFileAtomic(path, "first", {
      workspaceRoot: root,
    });

    await assert.rejects(
      () =>
        writeFileAtomic(path, "second", {
          workspaceRoot: root,
        }),
      (error) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "OUTPUT_EXISTS",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
