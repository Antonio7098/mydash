import assert from "node:assert/strict";
import {
  createServer,
} from "node:http";
import {
  dirname,
  resolve,
} from "node:path";
import {
  fileURLToPath,
} from "node:url";
import test from "node:test";
import {
  createApplication,
} from "../../server/app.mjs";

const testDirectory = dirname(
  fileURLToPath(import.meta.url),
);
const projectRoot = resolve(
  testDirectory,
  "../..",
);
const workspaceRoot = resolve(
  projectRoot,
  "tests",
  "fixtures",
  "export-workspace",
);

test("navigator root serves the application shell instead of redirecting", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/`,
      {
        redirect: "manual",
      },
    );
    const html = await response.text();

    assert.equal(
      response.status,
      200,
    );
    assert.match(
      response.headers.get(
        "content-type",
      ),
      /^text\/html/,
    );
    assert.match(
      response.headers.get(
        "content-security-policy",
      ),
      /default-src 'self'/,
    );
    assert.match(
      html,
      /<title>My Dashboards<\/title>/,
    );
    assert.match(
      html,
      /id="navigator-nav"/,
    );
    assert.match(
      html,
      /src="\/navigator\/main\.js"/,
    );
    assert.doesNotMatch(
      html,
      /<script(?![^>]+src=)/i,
    );
  });
});

test("supported category routes return the same navigator document", async () => {
  await withServer(async (baseUrl) => {
    for (const path of [
      "/dashboards",
      "/presentations",
      "/concepts",
      "/components",
      "/settings",
    ]) {
      const response = await fetch(
        `${baseUrl}${path}`,
      );
      const html =
        await response.text();

      assert.equal(
        response.status,
        200,
        path,
      );
      assert.match(
        html,
        /id="category-selector"/,
      );
    }
  });
});

test("browser modules are served with revalidation and no external dependencies", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/navigator/main.js`,
    );
    const source =
      await response.text();

    assert.equal(
      response.status,
      200,
    );
    assert.match(
      response.headers.get(
        "content-type",
      ),
      /javascript/,
    );
    assert.match(
      response.headers.get(
        "cache-control",
      ),
      /no-cache/,
    );
    assert.match(
      source,
      /EventSource\("\/api\/events"\)/,
    );
    assert.doesNotMatch(
      source,
      /https?:\/\//,
    );
  });
});

test("API routes remain available beside the navigator", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/health`,
    );
    const body = await response.json();

    assert.equal(
      response.status,
      200,
    );
    assert.equal(body.ok, true);
    assert.equal(
      body.data.status,
      "ok",
    );
  });
});

test("unknown browser paths keep the structured 404 envelope", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/not-a-route`,
    );
    const body = await response.json();

    assert.equal(
      response.status,
      404,
    );
    assert.equal(
      body.error.code,
      "ROUTE_NOT_FOUND",
    );
  });
});

async function withServer(callback) {
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

  await new Promise(
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
  const baseUrl =
    `http://127.0.0.1:${address.port}`;

  try {
    await callback(baseUrl);
  } finally {
    server.closeAllConnections?.();
    await new Promise(
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
