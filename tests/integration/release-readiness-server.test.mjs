import assert from "node:assert/strict";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createApplication } from "../../server/app.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testDirectory, "../..");
const fixtureRoot = resolve(projectRoot, "tests", "fixtures", "export-workspace");

test("readiness endpoint reports validation and optional Git", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "mydash-no-git-"));
  try {
    await cp(fixtureRoot, workspace, { recursive: true });
    await withServer(workspace, async (baseUrl) => {
      const gitResponse = await fetch(`${baseUrl}/api/git/status`);
      const gitBody = await gitResponse.json();
      assert.equal(gitResponse.status, 200);
      assert.equal(gitBody.data.available, false);

      const response = await fetch(`${baseUrl}/api/readiness`);
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(typeof body.data.ready, "boolean");
      assert.equal(body.data.checks.some((item) => item.id === "git" && item.state === "warning"), true);
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

async function withServer(workspaceRoot, callback) {
  const created = await createApplication({ workspaceRoot, logger() {}, revisionPollIntervalMs: 50, minimumRevisionCheckIntervalMs: 0 });
  const server = createServer(created.app);
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolvePromise(); });
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try { await callback(baseUrl); }
  finally {
    server.closeAllConnections?.();
    await new Promise((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
    await created.close();
  }
}
