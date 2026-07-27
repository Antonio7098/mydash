import assert from "node:assert/strict";
import {
  cp,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import {
  dirname,
  join,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  createApplication,
} from "../../server/app.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(
  testDirectory,
  "../fixtures/export-workspace",
);

test("artifact APIs scope by user while library resources stay global", async () => {
  const root = await mkdtemp(
    join(tmpdir(), "mydash-user-server-"),
  );
  await cp(fixtureRoot, root, { recursive: true });
  await addOtherUserArtifact(root);

  try {
    await withServer(root, async (baseUrl) => {
      const navigator = await fetch(baseUrl);
      assert.match(
        await navigator.text(),
        /id="user-selector"/,
      );

      const users = await json(`${baseUrl}/api/users`);
      assert.equal(users.data.currentUserId, "test-user");
      assert.deepEqual(
        users.data.userIds,
        ["other-user", "test-user"],
      );

      const configured = await json(`${baseUrl}/api/artifacts`);
      assert.deepEqual(
        configured.data.artifacts.map((artifact) => artifact.id),
        ["use-case-pipeline"],
      );

      const other = await json(
        `${baseUrl}/api/artifacts?userId=other-user`,
      );
      assert.deepEqual(
        other.data.artifacts.map((artifact) => artifact.id),
        ["other-dashboard"],
      );
      assert.equal(
        other.data.artifacts[0].userId,
        "other-user",
      );

      const hidden = await fetch(
        `${baseUrl}/api/artifacts/dashboard/other-dashboard`,
      );
      assert.equal(hidden.status, 404);

      const visible = await fetch(
        `${baseUrl}/api/artifacts/dashboard/other-dashboard?userId=other-user`,
      );
      assert.equal(visible.status, 200);

      const defaultLibrary = await json(`${baseUrl}/api/library`);
      const otherLibrary = await json(
        `${baseUrl}/api/library?userId=other-user`,
      );
      assert.deepEqual(
        resourceIds(defaultLibrary),
        resourceIds(otherLibrary),
      );
    });
  } finally {
    await rm(root, {
      recursive: true,
      force: true,
    });
  }
});

async function addOtherUserArtifact(root) {
  const directory = resolve(
    root,
    "library/dashboards/other-dashboard",
  );
  await mkdir(resolve(directory, "src"), {
    recursive: true,
  });
  await writeFile(
    resolve(directory, "artifact.json"),
    `${JSON.stringify({
      schemaVersion: 2,
      kind: "dashboard",
      id: "other-dashboard",
      title: "Other Dashboard",
      userId: "other-user",
      entry: "src/index.html",
      appearance: {
        theme: "hsbc-light",
        preset: "default",
        overrides: {
          layout: null,
          components: {},
          primitives: {},
          assets: {},
        },
      },
    }, null, 2)}\n`,
  );
  await writeFile(
    resolve(directory, "src/index.html"),
    "<!doctype html><html><body>Other</body></html>\n",
  );
}

async function withServer(workspaceRoot, callback) {
  const created = await createApplication({
    workspaceRoot,
    logger() {},
    revisionPollIntervalMs: 50,
    minimumRevisionCheckIntervalMs: 0,
  });
  const server = createServer(created.app);
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolvePromise();
    });
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await callback(baseUrl);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolvePromise, reject) =>
      server.close((error) =>
        error ? reject(error) : resolvePromise(),
      ),
    );
    await created.close();
  }
}

async function json(url) {
  const response = await fetch(url);
  assert.equal(response.status, 200);
  return response.json();
}

function resourceIds(body) {
  return body.data.entries
    .filter((entry) => entry.category !== "artifact")
    .map((entry) => `${entry.kind}:${entry.id}`);
}
