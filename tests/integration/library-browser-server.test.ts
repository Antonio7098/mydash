import assert from "node:assert/strict";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import { createApplication } from "../../server/app.js";

const projectRoot = resolve(process.cwd());
const workspaceRoot = resolve(projectRoot, "tests", "fixtures", "export-workspace");

test("library listing exposes catalogue summaries", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/library`);
    const body = await response.json();
    const metric = body.data.entries.find((entry: { id: string }) => entry.id === "metric-card");
    assert.equal(response.status, 200);
    assert.equal(metric.reference, "local/metric-card");
    assert.equal(metric.slot, "metric-summary");
    assert.equal(metric.visual.mode, "ui");
  });
});

test("library detail exposes consumers and dependencies", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/library/component/metric-card`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.data.entry.manifest.kind, "component");
    assert.equal(Array.isArray(body.data.consumers), true);
    assert.equal(Array.isArray(body.data.dependencies), true);
    assert.equal(typeof body.data.summary.consumerCount, "number");
  });
});

test("library deep links serve the navigator shell", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/components/component/metric-card`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /id="navigator-nav"/);
  });
});

async function withServer(callback: (baseUrl: string) => Promise<void>) {
  const created = await createApplication({ workspaceRoot, logger() {}, revisionPollIntervalMs: 50, minimumRevisionCheckIntervalMs: 0 });
  const server = createServer(created.app);
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolvePromise(); });
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try { await callback(baseUrl); }
  finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
    await created.close();
  }
}
