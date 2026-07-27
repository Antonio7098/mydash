import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { findWorkspaceRoot } from "../../src/workspace/find-root.mjs";
import { loadWorkspaceConfig } from "../../src/workspace/load-config.mjs";

export const doctorCommand = {
  name: "doctor",
  summary: "Inspect the workstation and report available capabilities.",
  usage: "mydash doctor [--workspace <path>] [--json]",
  options: [
    "--workspace <path>  Inspect a specific workspace.",
    "--json              Return structured JSON.",
  ],

  async run(invocation, context) {
    const checks = [];
    const warnings = [];
    const requestedRoot = invocation.options.workspace ?? context.cwd;

    checks.push(checkNode());
    checks.push(checkCommand("npm", ["--version"], "npm", true));
    checks.push(checkCommand("git", ["--version"], "Git", true));
    checks.push(checkCommand("python3", ["--version"], "Python", false));
    checks.push(checkLibreOffice());

    const workspace = await inspectWorkspace(requestedRoot);
    checks.push(...workspace.checks);
    warnings.push(...workspace.warnings);

    const blocking = checks.filter(
      (check) => check.required && check.status === "fail",
    );

    const data = {
      healthy: blocking.length === 0,
      workspaceRoot: workspace.root,
      userId: workspace.userId,
      checks,
      capabilities: deriveCapabilities(checks),
    };

    return {
      ok: blocking.length === 0,
      command: "doctor",
      data,
      warnings,
      exitCode: blocking.length === 0 ? 0 : 1,
      text: renderDoctor(data),
    };
  },
};

function checkNode() {
  const major = Number.parseInt(process.versions.node.split(".")[0], 10);
  const ok = Number.isInteger(major) && major >= 20;

  return {
    id: "node",
    label: "Node.js",
    required: true,
    status: ok ? "pass" : "fail",
    value: process.versions.node,
    message: ok
      ? "Node.js is available."
      : "Node.js 20 or later is required.",
  };
}

function checkCommand(command, args, label, required) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "pipe",
    shell: false,
  });

  if (result.error || result.status !== 0) {
    return {
      id: command,
      label,
      required,
      status: required ? "fail" : "unavailable",
      value: null,
      message: required
        ? `${label} is required but was not found.`
        : `${label} is not currently available.`,
    };
  }

  return {
    id: command,
    label,
    required,
    status: "pass",
    value: (result.stdout || result.stderr).trim(),
    message: `${label} is available.`,
  };
}

function checkLibreOffice() {
  for (const command of ["libreoffice", "soffice"]) {
    const result = spawnSync(command, ["--version"], {
      encoding: "utf8",
      stdio: "pipe",
      shell: false,
    });

    if (!result.error && result.status === 0) {
      return {
        id: "libreoffice",
        label: "LibreOffice",
        required: false,
        status: "pass",
        value: (result.stdout || result.stderr).trim(),
        message:
          "Optional Office rendering and recalculation capabilities are available.",
      };
    }
  }

  return {
    id: "libreoffice",
    label: "LibreOffice",
    required: false,
    status: "unavailable",
    value: null,
    message:
      "Optional Office rendering and recalculation capabilities are unavailable.",
  };
}

async function inspectWorkspace(startPath) {
  const checks = [];
  const warnings = [];
  let userId = null;
  const root = await findWorkspaceRoot(startPath);

  if (!root) {
    checks.push({
      id: "workspace",
      label: "Workspace",
      required: true,
      status: "fail",
      value: null,
      message:
        "No My Dashboards workspace was found from the requested path.",
    });

    return { root: null, checks, warnings };
  }

  checks.push({
    id: "workspace",
    label: "Workspace",
    required: true,
    status: "pass",
    value: root,
    message: "My Dashboards workspace was found.",
  });

  try {
    await access(root, fsConstants.W_OK);
    checks.push({
      id: "workspace-write",
      label: "Workspace write access",
      required: true,
      status: "pass",
      value: root,
      message: "The workspace is writable.",
    });
  } catch {
    checks.push({
      id: "workspace-write",
      label: "Workspace write access",
      required: true,
      status: "fail",
      value: root,
      message: "The workspace is not writable.",
    });
  }

  try {
    const config = await loadWorkspaceConfig(root);
    userId = config.userId;
    checks.push({
      id: "workspace-config",
      label: "Workspace configuration",
      required: true,
      status: "pass",
      value: join(root, "config", "workspace.json"),
      message: `Workspace configuration loaded: ${config.name}.`,
    });
    checks.push({
      id: "workspace-user",
      label: "Workspace user",
      required: true,
      status: "pass",
      value: config.userId,
      message: `Artifact commands are scoped to ${config.userId}.`,
    });
  } catch (error) {
    checks.push({
      id: "workspace-config",
      label: "Workspace configuration",
      required: true,
      status: "fail",
      value: join(root, "config", "workspace.json"),
      message:
        error instanceof Error ? error.message : String(error),
    });
  }

  const gitRoot = commandOutput(
    "git",
    ["rev-parse", "--show-toplevel"],
    root,
  );

  if (gitRoot.ok) {
    checks.push({
      id: "git-repository",
      label: "Git repository",
      required: true,
      status: "pass",
      value: gitRoot.output,
      message: "The workspace is inside a Git repository.",
    });
  } else {
    checks.push({
      id: "git-repository",
      label: "Git repository",
      required: true,
      status: "fail",
      value: null,
      message: "The workspace is not inside a Git repository.",
    });
  }

  const gitName = commandOutput("git", ["config", "user.name"], root);
  const gitEmail = commandOutput("git", ["config", "user.email"], root);
  const identityOk =
    gitName.ok &&
    Boolean(gitName.output) &&
    gitEmail.ok &&
    Boolean(gitEmail.output);

  checks.push({
    id: "git-identity",
    label: "Git identity",
    required: true,
    status: identityOk ? "pass" : "fail",
    value: identityOk ? `${gitName.output} <${gitEmail.output}>` : null,
    message: identityOk
      ? "Git user.name and user.email are configured."
      : "Git user.name or user.email is missing.",
  });

  const remotes = commandOutput("git", ["remote"], root);
  const remoteList = remotes.ok
    ? remotes.output.split("\n").map((value) => value.trim()).filter(Boolean)
    : [];

  checks.push({
    id: "git-remote",
    label: "Git remote",
    required: false,
    status: remoteList.length > 0 ? "pass" : "unavailable",
    value: remoteList,
    message:
      remoteList.length > 0
        ? `Configured remotes: ${remoteList.join(", ")}.`
        : "No Git remote is configured; changes can only be committed locally.",
  });

  const status = commandOutput(
    "git",
    ["status", "--porcelain=v1"],
    root,
  );

  if (status.ok && status.output) {
    warnings.push({
      code: "WORKTREE_DIRTY",
      message:
        "The Git working tree contains uncommitted changes. Agents must preserve and isolate them.",
    });
  }

  return { root, userId, checks, warnings };
}

function commandOutput(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
    shell: false,
  });

  return {
    ok: !result.error && result.status === 0,
    output: (result.stdout || result.stderr || "").trim(),
  };
}

function deriveCapabilities(checks) {
  const available = new Set(
    checks
      .filter((check) => check.status === "pass")
      .map((check) => check.id),
  );

  return {
    workspaceOperations:
      available.has("workspace") &&
      available.has("workspace-write") &&
      available.has("workspace-config"),
    gitCheckpoints:
      available.has("git") &&
      available.has("git-repository") &&
      available.has("git-identity"),
    officeInspection: available.has("node"),
    officeRendering: available.has("libreoffice"),
    pythonFallback: available.has("python3"),
  };
}

function renderDoctor(data) {
  const lines = ["My Dashboards environment", ""];

  for (const check of data.checks) {
    const symbol =
      check.status === "pass"
        ? "✓"
        : check.status === "unavailable"
          ? "!"
          : "✗";

    lines.push(`${symbol} ${check.label}: ${check.message}`);
  }

  lines.push("");
  lines.push(
    data.healthy
      ? "Required capabilities are available."
      : "One or more required capabilities are unavailable.",
  );

  return lines.join("\n");
}
