import assert from "node:assert/strict";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  createServer,
} from "node:http";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  createApplication,
} from "../../server/app.js";

const projectRoot = resolve(process.cwd());
const fixtureWorkspace = resolve(
  projectRoot,
  "tests",
  "fixtures",
  "export-workspace",
);
const tempRoot = resolve(
  projectRoot,
  ".my-dashboards",
  "temp",
  "server-cache-tests",
);

test("health and capabilities expose live server state", async () => {
  await withServer(
    fixtureWorkspace,
    async (baseUrl: string) => {
      const health = await getJson(
        `${baseUrl}/api/health`,
      );
      const capabilities = await getJson(
        `${baseUrl}/api/capabilities`,
      );
      const state = await getJson(
        `${baseUrl}/api/state`,
      );

      assert.equal(
        health.response.status,
        200,
      );
      assert.equal(health.body.ok, true);
      assert.equal(
        health.body.data.status,
        "ok",
      );
      assert.match(
        health.body.data.revision.id,
        /^[a-f0-9]{64}$/,
      );
      assert.match(
        health.response.headers.get("x-request-id") ?? "",
        /^[A-Za-z0-9._-]+$/,
      );
      assert.equal(
        capabilities.body.data.runtime
          .readOnlyHttp,
        false,
      );
      assert.equal(
        capabilities.body.data.features.some(
          (feature: { id: string }) =>
            feature.id ===
            "navigator.live-state",
        ),
        true,
      );
      assert.equal(
        state.body.data.caches.library
          .name,
        "library",
      );
    },
  );
});

test("library and artefact routes reuse cached shared services", async () => {
  await withServer(
    fixtureWorkspace,
    async (baseUrl: string) => {
      const first = await fetch(
        `${baseUrl}/api/library?kind=component`,
      );
      const firstBody =
        await first.json();
      const etag =
        first.headers.get("etag") ?? "" ?? "";
      const second = await fetch(
        `${baseUrl}/api/library?kind=component`,
        {
          headers: {
            "if-none-match": etag,
          },
        },
      );
      const artifact = await getJson(
        `${baseUrl}/api/artifacts/dashboard/use-case-pipeline`,
      );
      const state = await getJson(
        `${baseUrl}/api/state`,
      );

      assert.equal(first.status, 200);
      assert.equal(
        firstBody.data.entries.length,
        2,
      );
      assert.match(
        etag,
        /^"sha256-[a-f0-9]{64}"$/,
      );
      assert.equal(second.status, 304);
      assert.equal(
        artifact.body.data.artifact.id,
        "use-case-pipeline",
      );
      assert.equal(
        artifact.body.data.resolution
          .selections.components[
            "metric-summary"
          ].entry.level,
        "local",
      );
      assert.equal(
        state.body.data.caches.library
          .metrics.hits > 0,
        true,
      );
    },
  );
});

test("preview route returns and conditionally reuses standalone HTML", async () => {
  await withServer(
    fixtureWorkspace,
    async (baseUrl: string) => {
      const response = await fetch(
        `${baseUrl}/api/artifacts/dashboard/use-case-pipeline/preview`,
      );
      const html = await response.text();
      const etag =
        response.headers.get("etag") ?? "" ?? "";
      const cached = await fetch(
        `${baseUrl}/api/artifacts/dashboard/use-case-pipeline/preview`,
        {
          headers: {
            "if-none-match": etag,
          },
        },
      );

      assert.equal(response.status, 200);
      assert.match(
        response.headers.get("content-type") ?? "",
        /^text\/html/,
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
      assert.equal(cached.status, 304);
    },
  );
});

test("filesystem edits advance the revision and invalidate previews", async () => {
  await rm(tempRoot, {
    recursive: true,
    force: true,
  });
  await mkdir(tempRoot, { recursive: true });
  const workspace = await mkdtemp(
    join(tempRoot, "workspace-"),
  );
  await cp(
    fixtureWorkspace,
    workspace,
    {
      recursive: true,
      filter(path) {
        return !path.includes(".tmp-");
      },
    },
  );

  try {
    await withServer(
      workspace,
      async (baseUrl: string) => {
        const beforeState = await getJson(
          `${baseUrl}/api/state`,
        );
        const beforePreview = await fetch(
          `${baseUrl}/api/artifacts/dashboard/use-case-pipeline/preview`,
        );
        const beforeEtag =
          beforePreview.headers.get("etag") ?? "" ?? "";
        const sourcePath = resolve(
          workspace,
          "library",
          "dashboards",
          "use-case-pipeline",
          "src",
          "index.html",
        );
        const source =
          await readFile(
            sourcePath,
            "utf8",
          );
        await writeFile(
          sourcePath,
          source.replace(
            "Use Case Pipeline",
            "Use Case Pipeline Updated",
          ),
        );

        const afterState =
          await waitForRevisionChange(
            baseUrl,
            beforeState.body.data
              .revision.id,
          );
        const afterPreview = await fetch(
          `${baseUrl}/api/artifacts/dashboard/use-case-pipeline/preview`,
        );
        const afterHtml =
          await afterPreview.text();

        assert.notEqual(
          afterState.revision.id,
          beforeState.body.data
            .revision.id,
        );
        assert.notEqual(
          afterPreview.headers.get("etag") ?? "" ?? "",
          beforeEtag,
        );
        assert.match(
          afterHtml,
          /Use Case Pipeline Updated/,
        );
      },
      {
        revisionPollIntervalMs: 20,
        minimumRevisionCheckIntervalMs: 0,
      },
    );
  } finally {
    await rm(tempRoot, {
      recursive: true,
      force: true,
    });
  }
});

test("validation route returns an in-memory report", async () => {
  await withServer(
    fixtureWorkspace,
    async (baseUrl: string) => {
      const response = await fetch(
        `${baseUrl}/api/validation`,
        {
          method: "POST",
          headers: {
            "content-type":
              "application/json",
          },
          body: JSON.stringify({
            validateExports: false,
            validateRecipes: true,
          }),
        },
      );
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.ok, true);
      assert.equal(
        body.data.summary.valid,
        true,
      );
      assert.equal(
        body.data.stages.exports.status,
        "skipped",
      );
    },
  );
});

test("event stream emits the current workspace revision", async () => {
  await withServer(
    fixtureWorkspace,
    async (baseUrl: string) => {
      const controller =
        new AbortController();
      const response = await fetch(
        `${baseUrl}/api/events`,
        {
          signal: controller.signal,
        },
      );
      const reader =
        response.body?.getReader();
      if (!reader) {
        throw new Error("Expected an event stream body.");
      }
      const first = await reader.read();
      const text = new TextDecoder().decode(
        first.value,
      );

      controller.abort();

      assert.equal(response.status, 200);
      assert.match(
        response.headers.get("content-type") ?? "",
        /^text\/event-stream/,
      );
      assert.match(
        text,
        /event: workspace-revision/,
      );
    },
  );
});

test("unknown routes and malformed JSON use the error envelope", async () => {
  await withServer(
    fixtureWorkspace,
    async (baseUrl: string) => {
      const missing = await getJson(
        `${baseUrl}/api/not-here`,
      );
      const malformed = await fetch(
        `${baseUrl}/api/validation`,
        {
          method: "POST",
          headers: {
            "content-type":
              "application/json",
          },
          body: "{ invalid",
        },
      );
      const malformedBody =
        await malformed.json();

      assert.equal(
        missing.response.status,
        404,
      );
      assert.equal(
        missing.body.error.code,
        "ROUTE_NOT_FOUND",
      );
      assert.equal(
        malformed.status,
        400,
      );
      assert.equal(
        malformedBody.error.code,
        "INVALID_JSON_BODY",
      );
    },
  );
});

interface ServerOptions {
  revisionPollIntervalMs?: number;
  minimumRevisionCheckIntervalMs?: number;
}

async function withServer(
  workspaceRoot: string,
  callback: (baseUrl: string, logs: unknown[]) => Promise<void>,
  options: ServerOptions = {},
) {
  const logs: unknown[] = [];
  const created =
    await createApplication({
      workspaceRoot,
      logger(record) {
        logs.push(record);
      },
      revisionPollIntervalMs:
        options.revisionPollIntervalMs ??
        50,
      minimumRevisionCheckIntervalMs:
        options.minimumRevisionCheckIntervalMs ??
        0,
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
    await callback(baseUrl, logs);
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

async function getJson(url: string) {
  const response = await fetch(url);
  return {
    response,
    body: await response.json(),
  };
}

async function waitForRevisionChange(
  baseUrl: string,
  previousRevision: string,
) {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const result = await getJson(
      `${baseUrl}/api/state`,
    );

    if (
      result.body.data.revision.id !==
      previousRevision
    ) {
      return result.body.data;
    }

    await new Promise<void>((resolvePromise) =>
      setTimeout(resolvePromise, 25),
    );
  }

  throw new Error(
    "Workspace revision did not change within the test deadline.",
  );
}
