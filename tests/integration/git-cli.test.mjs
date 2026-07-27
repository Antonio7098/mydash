import assert from "node:assert/strict";
import {
  appendFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  dirname,
  join,
  resolve,
} from "node:path";
import {
  fileURLToPath,
} from "node:url";
import {
  spawnSync,
} from "node:child_process";
import test from "node:test";

const testDirectory = dirname(
  fileURLToPath(import.meta.url),
);
const projectRoot = resolve(
  testDirectory,
  "../..",
);
const fixtureRoot = resolve(
  projectRoot,
  "tests",
  "fixtures",
  "export-workspace",
);
const cliPath = resolve(
  projectRoot,
  "bin",
  "mydash.mjs",
);
const tempParent = resolve(
  projectRoot,
  ".my-dashboards",
  "temp",
  "git-cli-tests",
);

test("git status returns structured repository state", async () => {
  const repository = await createRepository();

  try {
    const result = runCli([
      "git",
      "status",
      "--workspace",
      repository,
      "--json",
    ]);

    assert.equal(result.status, 0, result.stderr);
    const body = JSON.parse(result.stdout);
    assert.equal(body.command, "git status");
    assert.equal(body.data.branch, "main");
    assert.equal(body.data.clean, true);
  } finally {
    await rm(repository, {
      recursive: true,
      force: true,
    });
  }
});

test("checkpoint commits only selected paths and preserves unrelated staging", async () => {
  const repository = await createRepository();

  try {
    const selected =
      "library/dashboards/use-case-pipeline/src/main.js";
    await appendFile(
      resolve(repository, selected),
      "\n// focused checkpoint\n",
    );
    await appendFile(
      resolve(repository, "unrelated.txt"),
      "\nstaged but unrelated\n",
    );
    git(
      repository,
      ["add", "unrelated.txt"],
    );

    const result = runCli([
      "git",
      "checkpoint",
      selected,
      "--message",
      "Update dashboard behaviour",
      "--no-push",
      "--workspace",
      repository,
      "--json",
    ]);

    assert.equal(result.status, 0, result.stderr);
    const body = JSON.parse(result.stdout);
    assert.equal(body.command, "git checkpoint");
    assert.equal(body.data.commit.paths.includes(selected), true);
    assert.equal(
      body.data.commit.paths.includes("unrelated.txt"),
      false,
    );

    const staged = git(
      repository,
      ["diff", "--cached", "--name-only"],
    ).stdout
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);

    assert.deepEqual(staged, ["unrelated.txt"]);
  } finally {
    await rm(repository, {
      recursive: true,
      force: true,
    });
  }
});

test("checkpoint blocks consumed shared changes until impact is acknowledged", async () => {
  const repository = await createRepository();

  try {
    const selected =
      "library/ui/primitives/core/button/primitive.js";
    await appendFile(
      resolve(repository, selected),
      "\n// shared change\n",
    );
    const before = git(
      repository,
      ["rev-parse", "HEAD"],
    ).stdout.trim();

    const blocked = runCli([
      "git",
      "checkpoint",
      selected,
      "--message",
      "Update shared button",
      "--no-push",
      "--workspace",
      repository,
      "--json",
    ]);

    assert.equal(blocked.status, 5);
    assert.equal(
      git(
        repository,
        ["rev-parse", "HEAD"],
      ).stdout.trim(),
      before,
    );

    const accepted = runCli([
      "git",
      "checkpoint",
      selected,
      "--message",
      "Update shared button",
      "--acknowledge-impact",
      "--no-push",
      "--workspace",
      repository,
      "--json",
    ]);

    assert.equal(
      accepted.status,
      0,
      accepted.stderr,
    );
  } finally {
    await rm(repository, {
      recursive: true,
      force: true,
    });
  }
});

test("checkpoint refuses invalid repository content before staging", async () => {
  const repository = await createRepository();

  try {
    const selected =
      "library/dashboards/use-case-pipeline/artifact.json";
    await writeFile(
      resolve(repository, selected),
      "{ invalid json\n",
    );
    const before = git(
      repository,
      ["rev-parse", "HEAD"],
    ).stdout.trim();

    const result = runCli([
      "git",
      "checkpoint",
      selected,
      "--message",
      "Break dashboard manifest",
      "--no-push",
      "--workspace",
      repository,
      "--json",
    ]);

    assert.equal(result.status, 3);
    assert.equal(
      git(
        repository,
        ["rev-parse", "HEAD"],
      ).stdout.trim(),
      before,
    );
    assert.equal(
      git(
        repository,
        ["diff", "--cached", "--name-only"],
      ).stdout.trim(),
      "",
    );
  } finally {
    await rm(repository, {
      recursive: true,
      force: true,
    });
  }
});

async function createRepository() {
  await mkdir(tempParent, {
    recursive: true,
  });
  const repository = await mkdtemp(
    join(tempParent, "repo-"),
  );

  await cp(fixtureRoot, repository, {
    recursive: true,
    filter(path) {
      return !path.includes(
        ".tmp-",
      );
    },
  });
  await writeFile(
    resolve(repository, "unrelated.txt"),
    "baseline\n",
  );

  git(repository, ["init", "-b", "main"]);
  git(repository, [
    "config",
    "user.name",
    "My Dashboards Test",
  ]);
  git(repository, [
    "config",
    "user.email",
    "mydash@example.test",
  ]);
  git(repository, ["add", "."]);
  git(repository, [
    "commit",
    "-m",
    "Initial fixture",
  ]);

  return repository;
}

function runCli(args) {
  return spawnSync(
    process.execPath,
    [cliPath, ...args],
    {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: "pipe",
      shell: false,
      maxBuffer:
        64 * 1024 * 1024,
    },
  );
}

function git(cwd, args) {
  const result = spawnSync(
    "git",
    args,
    {
      cwd,
      encoding: "utf8",
      stdio: "pipe",
      shell: false,
    },
  );

  assert.equal(
    result.status,
    0,
    result.stderr || result.stdout,
  );

  return result;
}
