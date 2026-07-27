import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  join,
  resolve,
} from "node:path";
import test from "node:test";
import {
  RevisionCache,
} from "../../server/services/revision-cache.mjs";
import {
  fingerprintWorkspace,
} from "../../src/files/workspace-fingerprint.mjs";

test("revision cache coalesces concurrent loads", async () => {
  const cache = new RevisionCache(
    "test",
    { maxEntries: 2 },
  );
  let loads = 0;
  let release;
  const gate = new Promise(
    (resolvePromise) => {
      release = resolvePromise;
    },
  );

  const first = cache.get(
    "scan",
    "revision-1",
    async () => {
      loads += 1;
      await gate;
      return { value: 1 };
    },
  );
  const second = cache.get(
    "scan",
    "revision-1",
    async () => {
      loads += 1;
      return { value: 2 };
    },
  );

  release();

  assert.deepEqual(
    await Promise.all([first, second]),
    [
      { value: 1 },
      { value: 1 },
    ],
  );
  assert.equal(loads, 1);
  assert.equal(
    cache.snapshot().metrics.hits,
    1,
  );
});

test("revision cache reloads after the revision changes", async () => {
  const cache = new RevisionCache(
    "test",
  );
  let loads = 0;

  await cache.get(
    "entry",
    "revision-1",
    async () => ++loads,
  );
  await cache.get(
    "entry",
    "revision-2",
    async () => ++loads,
  );

  assert.equal(loads, 2);
  assert.equal(
    cache.snapshot().metrics.misses,
    2,
  );
});

test("workspace fingerprint changes after a source edit", async () => {
  const root = await mkdtemp(
    resolve(
      process.cwd(),
      ".my-dashboards-fingerprint-",
    ),
  );

  try {
    await mkdir(
      join(root, "config"),
      { recursive: true },
    );
    await mkdir(
      join(root, "library"),
      { recursive: true },
    );
    await writeFile(
      join(
        root,
        "config",
        "workspace.json",
      ),
      "{}\n",
    );
    const sourcePath = join(
      root,
      "library",
      "source.js",
    );
    await writeFile(
      sourcePath,
      "export const value = 1;\n",
    );

    const first =
      await fingerprintWorkspace(root);
    await writeFile(
      sourcePath,
      "export const value = 200;\n",
    );
    const second =
      await fingerprintWorkspace(root);

    assert.notEqual(
      first.id,
      second.id,
    );
  } finally {
    await rm(root, {
      recursive: true,
      force: true,
    });
  }
});
