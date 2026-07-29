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

test("deep viewer routes serve the navigator shell", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/view/dashboard/use-case-pipeline`,
    );
    const html = await response.text();

    assert.equal(
      response.status,
      200,
    );
    assert.match(
      response.headers.get("content-security-policy") ?? "",
      /frame-src 'self'/,
    );
    assert.match(
      html,
      /id="navigator-nav"/,
    );
  });
});

test("artefact listings expose gallery metadata", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/artifacts`,
    );
    const body =
      await response.json();
    const artifact =
      body.data.artifacts[0];

    assert.equal(
      response.status,
      200,
    );
    assert.equal(
      artifact.id,
      "use-case-pipeline",
    );
    assert.equal(
      artifact.exportFileName,
      "use-case-pipeline.html",
    );
    assert.equal(
      Array.isArray(artifact.tags),
      true,
    );
  });
});

test("download route returns the cached standalone HTML as an attachment", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/artifacts/dashboard/use-case-pipeline/download`,
    );
    const html = await response.text();

    assert.equal(
      response.status,
      200,
    );
    assert.match(
      response.headers.get("content-disposition") ?? "",
      /^attachment; filename="use-case-pipeline\.html"$/,
    );
    assert.match(
      response.headers.get("x-mydash-sha256") ?? "",
      /^[a-f0-9]{64}$/,
    );
    assert.match(
      html,
      /data-mydash-standalone/,
    );
    assert.match(
      html,
      /Use Case Pipeline/,
    );
  });
});

test("gallery browser modules are served", async () => {
  await withServer(async (baseUrl) => {
    for (const path of [
      "/navigator/gallery-model.js",
      "/navigator/gallery.js",
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
        /artifact/i,
      );
      assert.doesNotMatch(
        source,
        /https?:\/\//,
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
