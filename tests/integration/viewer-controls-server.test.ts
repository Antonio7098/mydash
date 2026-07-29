import assert from "node:assert/strict";
import {
  createServer,
} from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import {
  createApplication,
} from "../../server/app.js";

const projectRoot = resolve(process.cwd());
const workspaceRoot = resolve(
  projectRoot,
  "tests",
  "fixtures",
  "export-workspace",
);

test("export status returns build metadata without the HTML document", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/artifacts/dashboard/use-case-pipeline/export-status`,
    );
    const body =
      await response.json();

    assert.equal(
      response.status,
      200,
    );
    assert.equal(
      body.data.export.ready,
      true,
    );
    assert.equal(
      body.data.export.fileName,
      "use-case-pipeline.html",
    );
    assert.equal(
      body.data.export.validation.valid,
      true,
    );
    assert.equal(
      body.data.export.resources.uiResources,
      3,
    );
    assert.match(
      body.data.export.sha256,
      /^[a-f0-9]{64}$/,
    );
    assert.equal(
      Object.hasOwn(
        body.data.export,
        "html",
      ),
      false,
    );
    assert.match(
      response.headers.get("etag") ?? "",
      /^"/,
    );
  });
});

test("export status supports conditional requests", async () => {
  await withServer(async (baseUrl) => {
    const first = await fetch(
      `${baseUrl}/api/artifacts/dashboard/use-case-pipeline/export-status`,
    );
    const etag =
      first.headers.get("etag") ?? "" ?? "";

    const second = await fetch(
      `${baseUrl}/api/artifacts/dashboard/use-case-pipeline/export-status`,
      {
        headers: {
          "If-None-Match": etag,
        },
      },
    );

    assert.equal(
      second.status,
      304,
    );
    assert.equal(
      await second.text(),
      "",
    );
  });
});

test("artefact detail includes resolution revision metadata", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/artifacts/dashboard/use-case-pipeline`,
    );
    const body =
      await response.json();

    assert.equal(
      response.status,
      200,
    );
    assert.equal(
      body.data.resolution.summary.valid,
      true,
    );
    assert.match(
      body.data.revision.id,
      /^[a-f0-9]{64}$/,
    );
    assert.equal(
      body.data.artifact.manifest.entry,
      "src/index.html",
    );
  });
});

test("viewer browser modules are served without external dependencies", async () => {
  await withServer(async (baseUrl) => {
    for (const path of [
      "/navigator/viewer-model.js",
      "/navigator/viewer.js",
    ]) {
      const response = await fetch(
        `${baseUrl}${path}`,
      );
      const source =
        await response.text();

      assert.equal(
        response.status,
        200,
        path,
      );
      assert.match(
        source,
        /viewer/i,
      );
      assert.doesNotMatch(
        source,
        /https?:\/\//,
      );
      assert.doesNotMatch(
        source,
        /innerHTML/,
      );
    }
  });
});

async function withServer(callback: (baseUrl: string) => Promise<void>) {
  const created =
    await createApplication({
      workspaceRoot,
      logger() {},
      revisionPollIntervalMs: 50,
      minimumRevisionCheckIntervalMs: 0,
    });
  const server = createServer(
    created.app,
  );

  await new Promise<void>(
    (resolvePromise, reject) => {
      server.once("error", reject);
      server.listen(
        0,
        "127.0.0.1",
        () => {
          server.off("error", reject);
          resolvePromise();
        },
      );
    },
  );

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl =
    `http://127.0.0.1:${address.port}`;

  try {
    await callback(baseUrl);
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>(
      (resolvePromise, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolvePromise();
        });
      },
    );
    await created.close();
  }
}
