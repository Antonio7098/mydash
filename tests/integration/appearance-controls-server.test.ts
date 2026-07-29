import assert from "node:assert/strict";
import {
  cp,
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import {
  createServer,
} from "node:http";
import {
  tmpdir,
} from "node:os";
import { join, resolve } from "node:path";
import {
  spawnSync,
} from "node:child_process";
import test from "node:test";
import {
  createApplication,
} from "../../server/app.js";

const projectRoot = resolve(process.cwd());
const fixtureRoot = resolve(
  projectRoot,
  "tests",
  "fixtures",
  "export-workspace",
);

test("appearance options expose qualified resources and semantic slots", async () => {
  await withServer(fixtureRoot, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/artifacts/dashboard/use-case-pipeline/appearance-options`,
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.current.theme, "core/hsbc-light");
    assert.equal(
      body.data.options.themes.some(
        (item: { reference: string }) => item.reference === "core/hsbc-light",
      ),
      true,
    );
    assert.equal(
      body.data.options.presets.some(
        (item: { reference: string }) => item.reference === "core/default",
      ),
      true,
    );
    assert.equal(
      body.data.slots.components.includes("metric-summary"),
      true,
    );
  });
});

test("temporary appearance changes export without modifying artifact.json", async () => {
  const manifestPath = resolve(
    fixtureRoot,
    "library",
    "dashboards",
    "use-case-pipeline",
    "artifact.json",
  );
  const before = await readFile(manifestPath, "utf8");
  const appearance = encodeURIComponent(
    JSON.stringify({
      theme: "core/hsbc-light",
      preset: "core/default",
      overrides: {
        layout: null,
        components: {
          "metric-summary": "local/metric-card",
        },
        primitives: {},
        assets: {},
      },
    }),
  );

  await withServer(fixtureRoot, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/artifacts/dashboard/use-case-pipeline/export-status?appearance=${appearance}`,
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.export.ready, true);
    assert.equal(
      body.data.requestedAppearance.theme,
      "core/hsbc-light",
    );
  });

  assert.equal(await readFile(manifestPath, "utf8"), before);
});

test("artefact-default save validates, commits and leaves a clean manifest", async () => {
  const workspaceRoot = await mkdtemp(
    join(tmpdir(), "mydash-appearance-"),
  );

  try {
    await cp(fixtureRoot, workspaceRoot, { recursive: true });
    git(workspaceRoot, ["init", "-b", "main"]);
    git(workspaceRoot, ["config", "user.name", "Appearance Test"]);
    git(workspaceRoot, [
      "config",
      "user.email",
      "appearance@example.test",
    ]);
    git(workspaceRoot, ["add", "."]);
    git(workspaceRoot, ["commit", "-m", "fixture"]);

    await withServer(workspaceRoot, async (baseUrl) => {
      const stateResponse = await fetch(`${baseUrl}/api/state`);
      const stateBody = await stateResponse.json();
      const revision = stateBody.data.revision.id;
      const response = await fetch(
        `${baseUrl}/api/artifacts/dashboard/use-case-pipeline/appearance`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Origin: baseUrl,
          },
          body: JSON.stringify({
            expectedRevision: revision,
            appearance: {
              theme: "core/hsbc-light",
              preset: "core/default",
              overrides: {
                layout: null,
                components: {
                  "metric-summary": "local/metric-card",
                },
                primitives: {},
                assets: {},
              },
            },
          }),
        },
      );
      const body = await response.json();

      assert.equal(response.status, 200, JSON.stringify(body));
      assert.equal(body.data.appearance.theme, "core/hsbc-light");
      assert.equal(body.data.export.ready, true);
      assert.match(body.data.checkpoint.commit.hash, /^[a-f0-9]+$/);
    });

    const manifest = JSON.parse(
      await readFile(
        resolve(
          workspaceRoot,
          "library",
          "dashboards",
          "use-case-pipeline",
          "artifact.json",
        ),
        "utf8",
      ),
    );

    assert.equal(manifest.appearance.theme, "core/hsbc-light");
    assert.equal(
      git(workspaceRoot, ["status", "--porcelain"]).stdout.trim(),
      "",
    );
    assert.equal(
      git(workspaceRoot, ["log", "-1", "--pretty=%s"]).stdout.trim(),
      "Update Use Case Pipeline appearance",
    );
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("artefact-default save rejects stale revisions and foreign origins", async () => {
  await withServer(fixtureRoot, async (baseUrl) => {
    const common = {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Origin: baseUrl,
      },
      body: JSON.stringify({
        expectedRevision: "0".repeat(64),
        appearance: {
          theme: "core/hsbc-light",
          preset: "core/default",
          overrides: {},
        },
      }),
    };
    const stale = await fetch(
      `${baseUrl}/api/artifacts/dashboard/use-case-pipeline/appearance`,
      common,
    );
    const staleBody = await stale.json();

    assert.equal(stale.status, 409);
    assert.equal(staleBody.error.code, "APPEARANCE_REVISION_CONFLICT");

    const foreign = await fetch(
      `${baseUrl}/api/artifacts/dashboard/use-case-pipeline/appearance`,
      {
        ...common,
        headers: {
          ...common.headers,
          Origin: "https://example.test",
        },
      },
    );
    const foreignBody = await foreign.json();

    assert.equal(foreign.status, 403);
    assert.equal(foreignBody.error.code, "MUTATION_ORIGIN_FORBIDDEN");
  });
});

function git(cwd: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }

  return result;
}

async function withServer(workspaceRoot: string, callback: (baseUrl: string) => Promise<void>) {
  const created = await createApplication({
    workspaceRoot,
    logger() {},
    revisionPollIntervalMs: 50,
    minimumRevisionCheckIntervalMs: 0,
  });
  const server = createServer(created.app);

  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolvePromise();
    });
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await callback(baseUrl);
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolvePromise, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolvePromise();
      });
    });
    await created.close();
  }
}
